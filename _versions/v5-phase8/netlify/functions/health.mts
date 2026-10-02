// GET /api/<token>/health → { ok, hasKey } — never the key (spec/07).

import { guardRequest, jsonResponse, readGuardConfig } from './lib/guard';

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  if (req.method !== 'GET') return jsonResponse(405, { error: 'method not allowed' }, guard.corsOrigin);
  return jsonResponse(
    200,
    { ok: true, hasKey: Boolean(process.env.OPENAI_API_KEY) },
    guard.corsOrigin,
  );
};
