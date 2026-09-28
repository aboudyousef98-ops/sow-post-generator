// POST /api/<token>/region — fallback nearest-metro lookup for locations the
// client's offline Texas-city table doesn't know. Uses the small text model;
// a call is ~100 tokens (fractions of a cent).

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { callOpenAiJson, OpenAiError } from './lib/openai';

const RequestSchema = z.object({ location: z.string().min(2).max(300) }).strict();
const ResponseSchema = z.object({ metro: z.enum(['HOU', 'DFW']) }).strict();

const SYSTEM_PROMPT = `You are a Texas geography assistant for a solar installer with crews based in Houston and Dallas.
Given a location (city, jurisdiction, or address, usually in Texas), answer which crew base is closer by road: Houston ("HOU") or Dallas ("DFW").
Return ONLY the JSON object. If genuinely ambiguous, pick the more likely one — never refuse.`;

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { metro: { type: 'string', enum: ['HOU', 'DFW'] } },
  required: ['metro'],
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
      schemaName: 'nearest_metro',
      schema: JSON_SCHEMA,
      temperature: 0,
      maxTokens: 20,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: parsed.data.location },
      ],
    });
    const result = ResponseSchema.safeParse(raw);
    if (!result.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);
    console.log(JSON.stringify({ at: new Date().toISOString(), endpoint: 'region', ms: Date.now() - started, model }));
    return jsonResponse(200, { metro: result.data.metro, model, ms: Date.now() - started }, cors);
  } catch (err) {
    const msg = err instanceof OpenAiError ? err.openaiMessage : 'AI request failed';
    return jsonResponse(502, { error: 'AI request failed', openai: msg.slice(0, 500) }, cors);
  }
};
