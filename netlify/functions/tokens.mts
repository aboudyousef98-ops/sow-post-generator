// GET/POST /api/<token>/tokens — API-token management for the Users screen
// (Aboud 2026-11-23, item 14). Browser-facing, so it rides the EXISTING
// Origin + path-token guard (not the bearer lane — that is for machine clients).
//
// GET    → list every token, display-safe (prefix/username/dates). Never a hash.
// POST   { username, label? }  → mint a token, store its hash, return the VALUE
//          exactly once (`{ token }`). The value is never retrievable again.
// POST   { action:'revoke', id } → tombstone a token (revokedAt).
//
// Honest-team caveat (same as the whole app): with no server-verified session
// this endpoint cannot PROVE the caller is an admin — the Users screen only
// shows it to admins, and every mint/revoke is logged. The long-term fix is a
// real login (see _PLAN_bot_api_and_team_scale.md §2F).

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { getSowpostStore, getSowpostStoreStrong } from './lib/store';
import {
  type TokenRecord,
  generateTokenValue,
  mergeTokens,
  newTokenRecord,
  toDisplay,
} from './lib/botAuth';

const GenerateSchema = z.object({ username: z.string().min(1), label: z.string().max(80).optional() }).strict();
const RevokeSchema = z.object({ action: z.literal('revoke'), id: z.string().min(1) }).strict();

async function readTokens(store: ReturnType<typeof getSowpostStore>) {
  return ((await store.get('tokens', { type: 'json' })) as TokenRecord[] | null) ?? [];
}

/** Read-merge-CAS write, mirroring board.mts. Returns the merged list or null on conflict. */
async function writeTokens(
  store: ReturnType<typeof getSowpostStore>,
  incoming: TokenRecord[],
): Promise<TokenRecord[] | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = (await store.getWithMetadata('tokens', { type: 'json' })) as
      | { data: TokenRecord[] | null; etag?: string }
      | null;
    const merged = mergeTokens(existing?.data ?? [], incoming);
    const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
    const res = await store.setJSON('tokens', merged, cond);
    if (res.modified || (existing && !existing.etag)) return merged;
  }
  return null;
}

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  const store = getSowpostStoreStrong();

  if (req.method === 'GET') {
    const tokens = await readTokens(store);
    return jsonResponse(200, { tokens: tokens.map(toDisplay) }, cors);
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);

    const revoke = RevokeSchema.safeParse(body);
    if (revoke.success) {
      const existing = await readTokens(store);
      const rec = existing.find((t) => t.id === revoke.data.id);
      if (!rec) return jsonResponse(404, { error: 'no such token' }, cors);
      const now = new Date().toISOString();
      const merged = await writeTokens(store, [{ ...rec, revokedAt: now, updatedAt: now }]);
      if (!merged) return jsonResponse(503, { error: 'conflict, retry' }, cors);
      console.log(JSON.stringify({ at: now, endpoint: 'tokens', op: 'revoke', id: revoke.data.id.slice(0, 8) }));
      const out = merged.find((t) => t.id === revoke.data.id);
      return jsonResponse(200, { record: out ? toDisplay(out) : null }, cors);
    }

    const gen = GenerateSchema.safeParse(body);
    if (!gen.success) return jsonResponse(400, { error: 'bad payload' }, cors);
    const now = new Date().toISOString();
    const token = generateTokenValue();
    const record = newTokenRecord(token, gen.data.username, gen.data.username, gen.data.label, now);
    const merged = await writeTokens(store, [record]);
    if (!merged) return jsonResponse(503, { error: 'conflict, retry' }, cors);
    // The token VALUE is logged NOWHERE — only its prefix, and who it is for.
    console.log(JSON.stringify({ at: now, endpoint: 'tokens', op: 'generate', username: gen.data.username, prefix: record.prefix }));
    return jsonResponse(200, { token, record: toDisplay(record) }, cors);
  }

  return jsonResponse(405, { error: 'method not allowed' }, cors);
};
