// GET /api/<token>/health → { ok, hasKey, store, context, deploy }
// — never the key, and never a secret (spec/07).
//
// `store` was added 2026-11-17 so "which board is this deploy talking to" is
// answerable from outside. A draft deploy quietly reading and writing the
// production store is otherwise invisible until somebody notices the damage,
// which is exactly the bug this field exists to catch.

import { guardRequest, jsonResponse, readGuardConfig } from './lib/guard';
import { sowpostStoreName } from './lib/store';

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  if (req.method !== 'GET') return jsonResponse(405, { error: 'method not allowed' }, guard.corsOrigin);
  return jsonResponse(
    200,
    {
      ok: true,
      hasKey: Boolean(process.env.OPENAI_API_KEY),
      // Neither is a secret: a store NAME and a build context, both of which
      // the deploy URL already implies.
      store: sowpostStoreName(process.env),
      context: process.env.CONTEXT ?? null,
      deploy: process.env.DEPLOY_ID ?? null,
    },
    guard.corsOrigin,
  );
};
