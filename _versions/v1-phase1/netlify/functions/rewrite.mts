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

// System prompt — verbatim from spec/05-ai-prompts.md §B.
const SYSTEM_PROMPT = `You are an editor for a solar installation design team. You will receive up to four short notes written by an engineer for a Slack handoff post to the installation crew. Polish each note into clear, concise, professional English.

Rules:
- Preserve every fact, number, unit, size, brand, wire type, conduit type and direction exactly (e.g. 2" PVC, #3 AWG Cu THWN, 200A, 1.5 ft, South-West).
- Do not add information, assumptions, recommendations or pleasantries. Do not remove any point.
- Keep each note as prose sentences (1–4 sentences). No bullet lists, no headings, no emojis.
- Keep engineering terms as written: MPU, FSU, FTP, BOS, AHJ, MDP, SER, THHN, THWN, EMT, PVC, AC disconnect, one-line diagram, attic run, back-to-back.
- Questions to the team stay questions. @mentions stay exactly as written.
- If a note is empty or only whitespace, return an empty string for it.
- Translate Arabic or mixed-language input into English with the same meaning.
- Match the tone of the examples.

Examples of the target style:
[layout] "Standard exterior placement, with the equipment installed back-to-back and direct grid, load, and PV routing."
[layout] "The conduits will be routed from the meter wall through the attic to reach the porch. From there, we will drill through the porch attic to access the garage, then route the conduits through the garage attic to the exterior West wall of the garage. The installation will be carried out on two walls: one on the garage and one on the main house."
[design] "The solar tag, currently listed as #3 AWG Cu THWN in 1-1/4\\" EMT conduit, should instead read 1-1/4\\" PVC conduit."
[design] "The elevation drawing indicates the use of an expansion unit for the garage case; however, this is not reflected in the one-line diagram."
[design] "The cables will require three bends within a small area. Therefore, we suggest using Cu instead of AL, as it will be easier for the installers to work with, especially since this is not a long run."
[siteSurvey] "All good. However, some of the uploaded photos in Salesforce appear to belong to another project."
[siteSurvey] "Please take sufficient measurements of all walls, and wide-angle photos of each wall to provide a better understanding of the site conditions."
[homeowner] "Homeowner confirmation is required before proceeding with drilling through the porch from both sides, and confirmation that all affected areas will be properly restored after the installation."
[homeowner] "The wood fence/door will need to be drilled to accommodate the conduit routing."
[homeowner] "The proposed equipment location will be in front of the swimming pool."`;

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
      temperature: 0.2,
      maxTokens: 600,
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
