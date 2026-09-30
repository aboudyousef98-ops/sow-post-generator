// GET/PUT /api/<token>/ahjs — shared AHJ requirements boards (Phase 5).
// Storage: Netlify Blobs (store "sowpost", key "ahjs"), same pattern as
// records.mts. Unlike records, the merge is DEEP: AHJ meta merges by
// `updatedAt`, but posts inside each AHJ merge individually by post id, so
// two designers posting to the same board concurrently never lose a post.
// The merge implementation is shared with the client (src/lib/ahj.ts).
//
// PUT uses etag compare-and-swap (onlyIfMatch/onlyIfNew) so two simultaneous
// PUTs cannot overwrite each other's read-merge-write; on repeated conflict we
// return 503 and the client keeps its data locally and re-pushes later.

import { getStore } from '@netlify/blobs';
import { z } from 'zod';
import { mergeAhjs } from '../../src/lib/ahj';
import type { Ahj } from '../../src/types';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';

// Loose on purpose (same rationale as records.mts): the client owns the full
// shape; the server only needs the merge keys to be present.
const PostSchema = z.object({ id: z.string().min(1), updatedAt: z.string().min(1) }).loose();
const AhjSchema = z
  .object({ id: z.string().min(1), updatedAt: z.string().min(1), posts: z.array(PostSchema).max(2000) })
  .loose();
const PutSchema = z.object({ ahjs: z.array(AhjSchema).max(2000) }).strict();

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;

  const store = getStore('sowpost');

  if (req.method === 'GET') {
    const ahjs = ((await store.get('ahjs', { type: 'json' })) as Ahj[] | null) ?? [];
    return jsonResponse(200, { ahjs }, cors);
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);
    const incoming = parsed.data.ahjs as unknown as Ahj[];

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = (await store.getWithMetadata('ahjs', { type: 'json' })) as
        | { data: Ahj[] | null; etag?: string }
        | null;
      const merged = mergeAhjs(existing?.data ?? [], incoming);
      // No etag (e.g. local emulator) → best-effort unconditional write.
      const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
      const res = await store.setJSON('ahjs', merged, cond);
      if (res.modified || (existing && !existing.etag)) {
        console.log(
          JSON.stringify({ at: new Date().toISOString(), endpoint: 'ahjs', put: incoming.length, total: merged.length, attempt }),
        );
        return jsonResponse(200, { ahjs: merged }, cors);
      }
    }
    return jsonResponse(503, { error: 'conflict, retry' }, cors);
  }

  return jsonResponse(405, { error: 'method not allowed' }, cors);
};
