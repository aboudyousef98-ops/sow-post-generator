// GET/PUT /api/<token>/extrawork — shared Extra Work tracker entries.
// Same architecture as records.mts/board.mts: Netlify Blobs (store "sowpost",
// key "extrawork"), merge by id/updatedAt so concurrent pushes converge, etag
// compare-and-swap against lost updates. The merge itself is imported from
// src/lib/extraWork.ts (the ahjs.mts precedent) so it is unit-tested.

import { getStore } from '@netlify/blobs';
import { z } from 'zod';
import type { ExtraWorkState } from '../../src/extrawork/types';
import { mergeExtraWork } from '../../src/lib/extraWork';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';

// Loose on purpose (same reasoning as records.mts): the client owns the full
// shape; the server needs only the merge keys.
const Stamped = z.object({ id: z.string().min(1), updatedAt: z.string().min(1) }).loose();
const PutSchema = z.object({ entries: z.array(Stamped).max(20000) }).strict();

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;

  const store = getStore('sowpost');

  if (req.method === 'GET') {
    const state = ((await store.get('extrawork', { type: 'json' })) as ExtraWorkState | null) ?? {
      entries: [],
    };
    return jsonResponse(200, { entries: state.entries }, cors);
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);
    const incoming = parsed.data as unknown as ExtraWorkState;

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = (await store.getWithMetadata('extrawork', { type: 'json' })) as
        | { data: ExtraWorkState | null; etag?: string }
        | null;
      const merged = mergeExtraWork(existing?.data ?? { entries: [] }, incoming);
      const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
      const res = await store.setJSON('extrawork', merged, cond);
      if (res.modified || (existing && !existing.etag)) {
        console.log(
          JSON.stringify({
            at: new Date().toISOString(),
            endpoint: 'extrawork',
            put: incoming.entries.length,
            total: merged.entries.length,
            attempt,
          }),
        );
        return jsonResponse(200, { entries: merged.entries }, cors);
      }
    }
    return jsonResponse(503, { error: 'conflict, retry' }, cors);
  }

  return jsonResponse(405, { error: 'method not allowed' }, cors);
};
