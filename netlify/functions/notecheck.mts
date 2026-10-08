// POST /api/<token>/notecheck — the semantic half of the pre-post note check
// (_PLAN_note_check.md).
//
// Takes the finished Slack post plus ONLY the notes already eligible for this
// project (the client scopes that — see lib/noteMatch.eligibleNotes), and
// returns the ids of the notes a coordinator should confirm, each with a short
// reason. It never rewrites the post and never invents a note: the only thing
// it may return is an id it was given.
//
// The caller unions this with a local keyword pass, so an exact term match can
// never be missed even if the model overlooks it.

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { callOpenAiJson, OpenAiError } from './lib/openai';

const RequestNote = z.object({ noteId: z.string().min(1).max(100), text: z.string().max(2000) }).strict();

const NoteCheckRequest = z
  .object({
    post: z.string().min(1).max(8000),
    notes: z.array(RequestNote).min(1).max(60),
  })
  .strict();

const NoteCheckResponse = z
  .object({
    hits: z.array(z.object({ noteId: z.string(), why: z.string(), trigger: z.string() }).strict()),
  })
  .strict();

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { noteId: { type: 'string' }, why: { type: 'string' }, trigger: { type: 'string' } },
        required: ['noteId', 'why', 'trigger'],
      },
    },
  },
  required: ['hits'],
};

/**
 * The prompt is deliberately strict. A long list trains people to click
 * through without reading, which is worse than no check at all — so the model
 * is told, repeatedly, that returning nothing is a good answer.
 */
const SYSTEM_PROMPT = `You are a checklist assistant for a solar installation design team. You receive a finished Slack handoff post for one project, plus a list of standing notes (jurisdiction rules, utility rules, funding rules and the team's own general notes) that already apply to that project.

Your ONLY job: decide which of those notes the coordinator should double-check before sending this post. Return their ids with a short reason.

Be STRICT. Returning an empty list is a perfectly good answer and is often the right one. A coordinator who is shown five notes reads them; one shown fifteen stops reading, and then the check is worthless. Only include a note when the post gives a CONCRETE reason to think it applies to THIS project.

THE MOST IMPORTANT TEST — apply it to every note before including it:
"Would this note fire on EVERY post this team writes?"
If yes, LEAVE IT OUT. Every post has an install date, a jurisdiction, a site address, a classification level and standard installation work — those are the template, not a signal. A note about filing paperwork before scheduling, or posting a permit before work starts, is true of every single job; surfacing it every time teaches the coordinator to ignore the whole list, which destroys the feature. Such a note belongs in the list ONLY when the post says something unusual about that specific topic — for example the post mentions the permit is still pending, or that scheduling is being rushed.

What you are looking for is the NON-ROUTINE: something in this post that is not true of a standard job.

Include a note when:
- the post describes work the note governs (the post mentions trenching and the note is about trench depth), OR
- the post describes something unusual that the note forbids or constrains.

Do NOT include a note when:
- it is generic good practice with nothing in the post pointing at it,
- it merely shares a common word with the post ("install", "project", "site", "date", "crew"),
- it is about a different scope of work than the post describes,
- you are only guessing. If in doubt, leave it out.

REAL EXAMPLES OF WRONG ANSWERS — never produce these:

1. Post line: "Installation on one wall."
   Note: "Permit card must be posted on site before any work starts."
   WRONG. Describing ordinary installation work does not trigger a permit note.
   EVERY job has work starting, so this would appear on every post forever.

2. Post line: "Expected power disconnect duration: 1-2 hours."
   Note: "Upload the signed NTP before scheduling."
   WRONG. That line is printed on every post. Having an install date is not
   news; it is the template.

3. Post line: "Level 1 – Standard Installation."
   Note: anything at all.
   WRONG. A standard classification is the absence of a signal, not a signal.

A RIGHT ANSWER looks like this:

   Post line: "Crew will need excavation along the north fence to reach the array."
   Note: "Trench depth minimum 24 inches..."
   CORRECT — the post describes digging, which is exactly what the note governs,
   and this is NOT true of a standard job.

Rules:
- Return ONLY noteIds from the list you were given. NEVER invent an id. NEVER return an id you did not receive.
- "trigger" MUST be a VERBATIM quote, copied character for character from the post, of the specific words that made you include this note — e.g. "excavation along the north fence". It must be 3 to 12 words of the post's own project-specific wording. Do NOT quote the template headings ("Installation Date & Day", "Site Survey Feedback", "Project Classification", "Clearance"), and do NOT paraphrase. If you cannot point at specific words in the post, that note does NOT belong in the list — leave it out.
- "why" must be ONE short clause, under 12 words — e.g. "post mentions trenching along the fence". Never restate the note back.
- Do not rewrite, correct or comment on the post itself. You are not editing it.
- Never add a note that is not in the list, even if you believe the post needs one.`;

export default async (req: Request): Promise<Response> => {
  const started = Date.now();
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' }, cors);

  const body = await readJsonBody(req);
  if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
  const parsed = NoteCheckRequest.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

  const apiKey = process.env.OPENAI_API_KEY;
  // 502 (not 500): the client treats this as "AI unavailable" and falls back
  // to its local keyword pass rather than blocking the post.
  if (!apiKey) return jsonResponse(502, { error: 'AI unavailable', openai: 'OPENAI_API_KEY not set' }, cors);
  const model = process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  try {
    const raw = await callOpenAiJson({
      apiKey,
      model,
      schemaName: 'note_check',
      schema: JSON_SCHEMA,
      // Low: this is a judgement call that should be stable, not creative.
      temperature: 0.1,
      maxTokens: 700,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(parsed.data) },
      ],
    });
    const out = NoteCheckResponse.safeParse(raw);
    if (!out.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);

    // Hard guard: drop anything whose id was not in the request. A hallucinated
    // id would otherwise render as a checklist row with no note behind it.
    const known = new Set(parsed.data.notes.map((n) => n.noteId));
    const hits = out.data.hits.filter((h) => known.has(h.noteId));

    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        endpoint: 'notecheck',
        ms: Date.now() - started,
        model,
        notes: parsed.data.notes.length,
        hits: hits.length,
        dropped: out.data.hits.length - hits.length,
      }),
    );
    return jsonResponse(200, { hits, model, ms: Date.now() - started }, cors);
  } catch (err) {
    const msg = err instanceof OpenAiError ? err.openaiMessage : 'AI request failed';
    return jsonResponse(502, { error: 'AI request failed', openai: msg.slice(0, 500) }, cors);
  }
};
