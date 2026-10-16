// POST /api/<token>/updatesearch — natural-language search over the project
// Updates threads.
//
// Aboud 2026-10-17 #3, on why the 4/5-star reason has to be an update:
//   "because I want an AI search along these updates ,, if I am searching for a
//    project that is trenching I just ask the AI and the user had already
//    posted the reason of 4 or 5 star"
//
// The client sends the corpus it already holds (lib/updates.updatesCorpus) and
// a question. The model may ONLY return projectIds it was given — it never
// invents a project, and it never answers from its own knowledge. A keyword
// pass runs client-side regardless, so an exact term match is never missed and
// the feature still works when the key is absent.

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { callOpenAiJson, OpenAiError } from './lib/openai';

const CorpusItem = z
  .object({
    projectId: z.string().min(1).max(120),
    projectName: z.string().max(200),
    by: z.string().max(120),
    at: z.string().max(40),
    kind: z.string().max(40),
    text: z.string().max(2000),
  })
  .strict();

const SearchRequest = z
  .object({
    query: z.string().min(1).max(500),
    updates: z.array(CorpusItem).min(1).max(300),
  })
  .strict();

const SearchResponse = z
  .object({
    hits: z.array(z.object({ projectId: z.string(), why: z.string() }).strict()),
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
        properties: { projectId: { type: 'string' }, why: { type: 'string' } },
        required: ['projectId', 'why'],
      },
    },
  },
  required: ['hits'],
};

const SYSTEM_PROMPT = `You search a solar design team's project UPDATES. Each update is a short note someone wrote on one project — site conditions, what is blocking it, or why it was rated 4 or 5 stars.

You receive the team's updates and one question. Return the projectIds whose updates actually answer it, each with a one-clause reason.

MATCH ON MEANING, not on shared words. The person asking describes a SITUATION and the updates describe the same situation in different words:
- asked "which projects have trenching" → an update saying "this project has trench and external long run" matches; so does "crew needs to dig along the north fence".
- asked "what is waiting on the utility" → "waiting on the interconnection letter" matches.
- asked "hard projects" → updates describing long runs, excavation, difficult roofs, or a 4/5-star reason match.

Two notes sharing a common word like "project", "install", "site" or "date" is NOT a match.

Rules:
- Return ONLY projectIds from the list you were given. NEVER invent one. NEVER return an id you did not receive.
- One entry per project, even if several of its updates matched. Combine the reasons.
- "why" must be ONE short clause, under 15 words, pointing at what the update actually said — e.g. "update says trench and external long run". Do not restate the question.
- If nothing genuinely matches, return an empty list. That is a good answer — a wrong project is worse than none.
- Answer only from the updates given. Never use outside knowledge about solar or about these projects.`;

export default async (req: Request): Promise<Response> => {
  const started = Date.now();
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' }, cors);

  const body = await readJsonBody(req);
  if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
  const parsed = SearchRequest.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

  const apiKey = process.env.OPENAI_API_KEY;
  // 502, not 500: the client reads this as "AI unavailable" and shows its own
  // keyword results instead of an error.
  if (!apiKey) return jsonResponse(502, { error: 'AI unavailable', openai: 'OPENAI_API_KEY not set' }, cors);
  const model = process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  try {
    const raw = await callOpenAiJson({
      apiKey,
      model,
      schemaName: 'update_search',
      schema: JSON_SCHEMA,
      temperature: 0.1,
      maxTokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(parsed.data) },
      ],
    });
    const out = SearchResponse.safeParse(raw);
    if (!out.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);

    // Hard guard: a hallucinated id would render as a result row with no
    // project behind it. Same contract as notecheck.
    const known = new Set(parsed.data.updates.map((u) => u.projectId));
    const seen = new Set<string>();
    const hits = out.data.hits
      .filter((h) => known.has(h.projectId))
      .filter((h) => (seen.has(h.projectId) ? false : (seen.add(h.projectId), true)));

    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        endpoint: 'updatesearch',
        ms: Date.now() - started,
        model,
        corpus: parsed.data.updates.length,
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
