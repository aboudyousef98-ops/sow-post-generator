// GET/PUT /api/<token>/records — Phase 4 shared team history (spec/09).
// Storage: Netlify Blobs (store "sowpost", key "records"). No env vars needed;
// Blobs is wired automatically inside Netlify Functions (and emulated by
// `netlify dev`). localStorage in each browser stays the offline cache.
//
// PUT merges by id (newer `updatedAt` wins) instead of overwriting, so three
// designers can push concurrently; deletions travel as `deletedAt` tombstones.
// A simultaneous PUT can still lose the race on the final write, but with
// merge-on-write and 3 users the next push self-heals.

import { getStore } from '@netlify/blobs';
import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';

// Loose validation on purpose: the client owns the full PostRecord shape and
// it will evolve; the server only needs id + updatedAt to merge correctly.
const RecordSchema = z.object({ id: z.string().min(1), updatedAt: z.string().min(1) }).loose();
const PutSchema = z.object({ records: z.array(RecordSchema).max(10000) }).strict();

type AnyRecord = z.infer<typeof RecordSchema>;

function merge(current: AnyRecord[], incoming: AnyRecord[]): AnyRecord[] {
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const rec of incoming) {
    const existing = byId.get(rec.id);
    if (!existing || rec.updatedAt > existing.updatedAt) byId.set(rec.id, rec);
  }
  return [...byId.values()];
}

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;

  const store = getStore('sowpost');

  if (req.method === 'GET') {
    const records = ((await store.get('records', { type: 'json' })) as AnyRecord[] | null) ?? [];
    return jsonResponse(200, { records }, cors);
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

    const existing = ((await store.get('records', { type: 'json' })) as AnyRecord[] | null) ?? [];
    const merged = merge(existing, parsed.data.records);
    await store.setJSON('records', merged);
    console.log(
      JSON.stringify({ at: new Date().toISOString(), endpoint: 'records', put: parsed.data.records.length, total: merged.length }),
    );
    return jsonResponse(200, { records: merged }, cors);
  }

  return jsonResponse(405, { error: 'method not allowed' }, cors);
};
