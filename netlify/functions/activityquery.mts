// POST /api/<token>/activityquery — turn an English question about the board's
// ACTIVITY LOG into a filter the client applies locally.
//
// Aboud 2026-11-05: "the 'Ask the updates' feature looks into updates, but can
// we also make it look at activity log? for example I ask, what was the
// projects that I interacted with yesterday?"
//
// QUERY EXTRACTION, NOT RETRIEVAL — and that is the whole design.
//
// updatesearch.mts sends the model a corpus and asks which items match,
// because "which projects have trenching" is a question about meaning. This
// one is not: "what did I touch yesterday" is a filter, and the honest answer
// comes from applying it exactly. So nothing from the log is uploaded — the
// request carries only the question, today's date, the roster, and the names
// of the fields and actions that exist. The live log is 2,589 entries and
// capped at 5,000; sending it every time would be slow, expensive, and would
// still let the model be approximately right about a date, which for
// "yesterday" is the same as wrong.
//
// The client sanitises everything that comes back (lib/activityQuery
// .sanitizeFilter): an invented actor or field would narrow the answer to
// nothing and read as "you did nothing yesterday".

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { callOpenAiJson, OpenAiError } from './lib/openai';

const QueryRequest = z
  .object({
    query: z.string().min(1).max(500),
    me: z.string().max(120),
    /** Local 'YYYY-MM-DD' — the client's own today, so "yesterday" is theirs. */
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    roster: z.array(z.string().max(120)).max(50),
    fields: z.array(z.string().max(60)).max(50),
    actions: z.array(z.string().max(60)).max(50),
  })
  .strict();

const FilterResponse = z
  .object({
    filter: z
      .object({
        actors: z.array(z.string()).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        actions: z.array(z.string()).optional(),
        fields: z.array(z.string()).optional(),
        projectNameContains: z.string().optional(),
      })
      .loose(),
    /** Empty when the question is not about the activity log at all. */
    understood: z.boolean(),
  })
  .strict();

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    understood: { type: 'boolean' },
    filter: {
      type: 'object',
      additionalProperties: false,
      properties: {
        actors: { type: 'array', items: { type: 'string' } },
        from: { type: 'string' },
        to: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' } },
        fields: { type: 'array', items: { type: 'string' } },
        projectNameContains: { type: 'string' },
      },
      required: ['actors', 'from', 'to', 'actions', 'fields', 'projectNameContains'],
    },
  },
  required: ['filter', 'understood'],
};

const SYSTEM_PROMPT = `You turn a question about a solar design team's project board into a FILTER over its activity log. You never see the log. You only translate the question.

The activity log records, per project: who did it (actor), when (a timestamp), what kind of event (action), and for a field edit, which fields changed.

Return a filter with these keys, using "" or [] for anything the question does not constrain:
- actors: display names from the roster you were given. NEVER a name that is not in that roster. "I", "me", "my" mean the "me" value you were given.
- from, to: 'YYYY-MM-DD', inclusive, resolved against the "today" you were given. A single day means from == to.
- actions: from the actions list you were given. Only when the question is about a KIND of event ("what did I archive", "where did I post updates").
- fields: from the fields list you were given. Only when the question names a field ("who changed the status of…", "what got re-rated").
- projectNameContains: a fragment of a project name, only when the question names a customer.

Resolve dates arithmetically against "today". Weeks run Monday to Sunday.
- "yesterday" → the single day before today.
- "this week" → Monday of today's week, through today.
- "last week" → the whole previous Monday through Sunday.
- "last 7 days" → includes today, so six days back through today.
- "this month" → the 1st of today's month through today.

Set understood=false, and return an empty filter, when the question is not about who-did-what-when on the board — for example "which projects have trenching?", which is about the content of people's notes, not the activity log. A wrong filter is worse than none: it would answer "nothing happened", which the person would believe.

Never invent an actor, a field or an action. Never guess a date you cannot derive from "today".`;

export default async (req: Request): Promise<Response> => {
  const started = Date.now();
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' }, cors);

  const body = await readJsonBody(req);
  if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
  const parsed = QueryRequest.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

  const apiKey = process.env.OPENAI_API_KEY;
  // 502, not 500: the client reads this as "AI unavailable" and falls back to
  // its own parser, same contract as updatesearch.
  if (!apiKey) return jsonResponse(502, { error: 'AI unavailable', openai: 'OPENAI_API_KEY not set' }, cors);
  const model = process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  try {
    const raw = await callOpenAiJson({
      apiKey,
      model,
      schemaName: 'activity_query',
      schema: JSON_SCHEMA,
      temperature: 0,
      maxTokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(parsed.data) },
      ],
    });
    const out = FilterResponse.safeParse(raw);
    if (!out.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);

    // Server-side guard as well as the client's: an actor the roster does not
    // contain can only ever narrow the answer to nothing. Same belt-and-braces
    // as updatesearch's known-id check.
    const roster = new Set(parsed.data.roster);
    const known = (list: string[] | undefined, allowed: Set<string>) =>
      (list ?? []).filter((x) => allowed.has(x));
    const filter = {
      ...out.data.filter,
      actors: known(out.data.filter.actors, roster),
      actions: known(out.data.filter.actions, new Set(parsed.data.actions)),
      fields: known(out.data.filter.fields, new Set(parsed.data.fields)),
    };

    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        endpoint: 'activityquery',
        ms: Date.now() - started,
        model,
        understood: out.data.understood,
        // The question itself is NOT logged: it can name a customer.
        constrains: Object.entries(filter)
          .filter(([, v]) => (Array.isArray(v) ? v.length : Boolean(v)))
          .map(([k]) => k),
      }),
    );
    return jsonResponse(200, { filter, understood: out.data.understood, model, ms: Date.now() - started }, cors);
  } catch (err) {
    const msg = err instanceof OpenAiError ? err.openaiMessage : 'AI request failed';
    return jsonResponse(502, { error: 'AI request failed', openai: msg.slice(0, 500) }, cors);
  }
};
