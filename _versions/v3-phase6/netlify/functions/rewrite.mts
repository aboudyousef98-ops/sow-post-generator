// POST /api/<token>/rewrite — polish the four notes (spec/05 §B, spec/07).
// STRICT policy: grammar/clarity only; every fact, number, unit and brand kept.

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { callOpenAiJson, OpenAiError } from './lib/openai';

const noteField = z.string().max(3000);
const RequestSchema = z
  .object({
    layout: noteField,
    siteSurvey: noteField,
    design: noteField,
    homeowner: noteField,
  })
  .strict();

const ResponseSchema = z
  .object({
    layout: z.string(),
    siteSurvey: z.string(),
    design: z.string(),
    homeowner: z.string(),
  })
  .strict();

// System prompt — spec/05-ai-prompts.md §B, revised per Aboud (2026-09-28):
// the team writes these notes as BULLET POINTS, one per line. The old prompt
// ordered prose and merged the bullets into a paragraph. This one is a
// line-preserving, minimal-edit copy-edit: same lines, same order, same words
// wherever they were already correct.
const SYSTEM_PROMPT = `You are a copy editor for a solar installation design team. You will receive up to four short notes written by an engineer for a Slack handoff post to the installation crew. Each note is written as BULLET POINTS, one bullet per line.

Your job is a light copy-edit, NOT a rewrite. Stay as close to the engineer's own wording as possible.

Line rules (most important):
- Treat every line as a separate bullet. Return exactly the same number of lines, in exactly the same order, separated by "\\n".
- NEVER merge two lines into one. NEVER split one line into two. NEVER reorder lines. NEVER turn the note into a paragraph.
- If a line is already correct English, return it UNCHANGED, character for character.
- Keep each bullet short — a single sentence or clause, the way it was written. Do not expand a bullet into several sentences.

Editing rules:
- Fix only: spelling, grammar, verb tense, articles, plurals, word order that is wrong, and missing punctuation.
- Keep the engineer's own vocabulary and phrasing. Do not upgrade the register, do not make it more formal, do not add connectives like "however", "therefore", "additionally", "please note".
- Preserve every fact, number, unit, size, brand, wire type, conduit type and direction exactly (e.g. 2" PVC, #3 AWG Cu THWN, 200A, 1.5 ft, South-West).
- Do not add information, assumptions, recommendations or pleasantries. Do not remove any point.
- Keep engineering terms as written: MPU, FSU, FTP, BOS, AHJ, MDP, SER, THHN, THWN, EMT, PVC, AC disconnect, one-line diagram, attic run, back-to-back.
- No headings, no emojis. Do not add bullet characters ("-", "*", "•") — the app adds those.
- Questions to the team stay questions. @mentions stay exactly as written.
- If a note is empty or only whitespace, return an empty string for it.
- Translate Arabic or mixed-language input into English with the same meaning and the same line breaks.

Examples (input line -> output line):
"solar tag say #3 AWG Cu THWN in 1-1/4\\" EMT, it should be 1-1/4\\" PVC" -> "Solar tag says #3 AWG Cu THWN in 1-1/4\\" EMT; it should be 1-1/4\\" PVC."
"elevation show expansion unit for garage but not in one line" -> "Elevation shows an expansion unit for the garage but not in the one-line."
"conduit routed from meter wall through attic to porch" -> "Conduit routed from the meter wall through the attic to the porch."
"All good." -> "All good."
"need HO confirmation before drilling the porch from both side" -> "Need HO confirmation before drilling the porch from both sides."
"some photos in SF belong to another project" -> "Some photos in SF belong to another project."

Example of a whole note (2 lines in, 2 lines out — NOT merged into a paragraph):
IN:  "tag wrong on sheet PV-2\\nmissing expansion unit in one line"
OUT: "Tag wrong on sheet PV-2.\\nMissing expansion unit in the one-line."`;

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    layout: { type: 'string' },
    siteSurvey: { type: 'string' },
    design: { type: 'string' },
    homeowner: { type: 'string' },
  },
  required: ['layout', 'siteSurvey', 'design', 'homeowner'],
};

export default async (req: Request): Promise<Response> => {
  const started = Date.now();
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' }, cors);

  const body = await readJsonBody(req);
  if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonResponse(502, { error: 'AI unavailable', openai: 'OPENAI_API_KEY not set' }, cors);
  const model = process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  try {
    const raw = await callOpenAiJson({
      apiKey,
      model,
      schemaName: 'polished_notes',
      schema: JSON_SCHEMA,
      // Low temperature + generous ceiling: bulleted notes are longer than the
      // old one-paragraph output, and a truncated response fails the schema.
      temperature: 0.1,
      maxTokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(parsed.data) },
      ],
    });
    const polished = ResponseSchema.safeParse(raw);
    // Non-conforming JSON → 502 so the UI keeps the raw drafts untouched (07).
    if (!polished.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);
    console.log(JSON.stringify({ at: new Date().toISOString(), endpoint: 'rewrite', ms: Date.now() - started, model }));
    return jsonResponse(200, { polished: polished.data, model, ms: Date.now() - started }, cors);
  } catch (err) {
    const msg = err instanceof OpenAiError ? err.openaiMessage : 'AI request failed';
    return jsonResponse(502, { error: 'AI request failed', openai: msg.slice(0, 500) }, cors);
  }
};
