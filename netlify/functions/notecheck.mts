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

const RequestLine = z.object({ lineId: z.string().min(1).max(120), text: z.string().max(600) }).strict();

const NoteCheckRequest = z
  .object({
    post: z.string().min(1).max(8000),
    lines: z.array(RequestLine).min(1).max(250),
  })
  .strict();

const NoteCheckResponse = z
  .object({
    hits: z.array(z.object({ lineId: z.string(), why: z.string(), trigger: z.string() }).strict()),
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
        properties: { lineId: { type: 'string' }, why: { type: 'string' }, trigger: { type: 'string' } },
        required: ['lineId', 'why', 'trigger'],
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
const SYSTEM_PROMPT = `You are a checklist assistant for a solar installation design team. You receive a finished Slack handoff post for one project, plus a list of INDIVIDUAL RULE LINES taken from the team's standing notes (jurisdiction rules, utility rules, funding rules and general notes) that already apply to that project.

Each line is its own rule and is judged on its own. The team's notes are long reference documents — a single note may cover trenches, conduits, roof types and disconnect heights — so you must pick out the SPECIFIC LINES that matter for this project, never a whole document. Returning one precise line is far more useful than returning ten.

Your ONLY job: decide which rule LINES the coordinator should double-check before sending this post. Return their lineIds with a short reason.

REASON ABOUT THE ENGINEERING, not about shared words. You are matching meaning:
- the post says "4/0 AL in a straight exterior run" and a line says "4/0 AL for straight exterior conduit runs" → the line governs exactly that choice.
- the post says "attic run to the array" and a line says "no J-box under the soffit on clay tile / metal roof / no attic run" → relevant only if the roof or attic facts in the post actually line up.
- the post says "service is 200 A" and a line says "150/200 A → always two conduits" → the numbers match, so the rule binds.
Two lines sharing a word like "exterior", "elevation", "install" or "conduit" is NOT a reason by itself.

Be STRICT. Returning an empty list is a perfectly good answer and is often the right one. A coordinator shown three lines reads them; one shown fifteen stops reading, and then the check is worthless. Only include a line when the post gives a CONCRETE engineering reason to think it binds THIS project. Aim for at most 5 lines.

THE MOST IMPORTANT TEST — apply it to every note before including it:
"Would this note fire on EVERY post this team writes?"
If yes, LEAVE IT OUT. Every post has an install date, a jurisdiction, a site address, a classification level and standard installation work — those are the template, not a signal. A note about filing paperwork before scheduling, or posting a permit before work starts, is true of every single job; surfacing it every time teaches the coordinator to ignore the whole list, which destroys the feature. Such a note belongs in the list ONLY when the post says something unusual about that specific topic — for example the post mentions the permit is still pending, or that scheduling is being rushed.

What you are looking for is the NON-ROUTINE: something in this post that is not true of a standard job.

Include a LINE when:
- the post describes work that line governs (the post mentions trenching, the line is about trench depth), OR
- the post states a value or condition the line keys on (a wire size, a service amperage, a roof type, a run location), OR
- the post describes something unusual the line forbids or constrains.

Do NOT include a LINE when:
- it is generic good practice with nothing in the post pointing at it,
- it is a heading or a section label rather than an actual rule,
- it merely shares a common word with the post ("install", "project", "site", "date", "crew"),
- it is about a different scope of work than the post describes,
- you are only guessing. If in doubt, leave it out.

REAL EXAMPLES OF WRONG ANSWERS — never produce these:

1. Post line: "Installation on one wall."
   Line: "Permit card must be posted on site before any work starts."
   WRONG. Describing ordinary installation work does not trigger a permit note.
   EVERY job has work starting, so this would appear on every post forever.

2. Post line: "Expected power disconnect duration: 1-2 hours."
   Line: "Upload the signed NTP before scheduling."
   WRONG. That line is printed on every post. Having an install date is not
   news; it is the template.

3. Post line: "Level 1 – Standard Installation."
   Line: anything at all.
   WRONG. A standard classification is the absence of a signal, not a signal.

A RIGHT ANSWER looks like this:

   Post line: "Crew will need excavation along the north fence to reach the array."
   Line: "Trench depth minimum 24 inches..."
   CORRECT — the post describes digging, which is exactly what the note governs,
   and this is NOT true of a standard job.

Rules:
- Return ONLY lineIds from the list you were given. NEVER invent an id. NEVER return an id you did not receive.
- Return the SPECIFIC line. Never return every line of a note just because one of them matched.
- "trigger" MUST be a VERBATIM quote, copied character for character from the post, of the specific words that made you include this note — e.g. "excavation along the north fence". It must be 3 to 12 words of the post's own project-specific wording. Do NOT quote the template headings ("Installation Date & Day", "Site Survey Feedback", "Project Classification", "Clearance"), and do NOT paraphrase. If you cannot point at specific words in the post, that note does NOT belong in the list — leave it out.
- "why" must be ONE short clause, under 12 words — e.g. "post mentions trenching along the fence". Never restate the note back.
- Do not rewrite, correct or comment on the post itself. You are not editing it.
- Never add a line that is not in the list, even if you believe the post needs one.`;

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
    const known = new Set(parsed.data.lines.map((n) => n.lineId));
    const hits = out.data.hits.filter((h) => known.has(h.lineId));

    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        endpoint: 'notecheck',
        ms: Date.now() - started,
        model,
        notes: parsed.data.lines.length,
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
