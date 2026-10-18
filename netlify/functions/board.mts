// GET/PUT /api/<token>/board — shared Project Board (projects + labels +
// activity + updates). Same architecture as records.mts: Netlify Blobs (store
// "sowpost", key "board"), merge by id/updatedAt so concurrent pushes from
// three designers converge, etag compare-and-swap against lost updates.
//
// Activity is append-only: union by id, newest first, capped — the client
// writes entries alongside each edit and they can never be altered here.
//
// The payload schema and merge live in lib/boardMerge.ts so they can be
// unit-tested. Keep them there: an untested `.strict()` schema that had gone
// out of sync with BoardState rejected every write for 37 hours on
// 2026-10-17 and nothing surfaced it.

import { getStore } from '@netlify/blobs';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { type BoardBlob, PutSchema, mergeBoard } from './lib/boardMerge';

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;

  const store = getStore('sowpost');

  if (req.method === 'GET') {
    const board = ((await store.get('board', { type: 'json' })) as BoardBlob | null) ?? {
      projects: [],
      labels: [],
      activity: [],
      updates: [],
    };
    return jsonResponse(200, { board }, cors);
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = (await store.getWithMetadata('board', { type: 'json' })) as
        | { data: BoardBlob | null; etag?: string }
        | null;
      const merged = mergeBoard(existing?.data ?? null, parsed.data);
      const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
      const res = await store.setJSON('board', merged, cond);
      if (res.modified || (existing && !existing.etag)) {
        console.log(
          JSON.stringify({
            at: new Date().toISOString(),
            endpoint: 'board',
            putProjects: parsed.data.projects.length,
            totalProjects: merged.projects.length,
            putUpdates: parsed.data.updates.length,
            totalUpdates: merged.updates.length,
            attempt,
          }),
        );
        return jsonResponse(200, { board: merged }, cors);
      }
    }
    return jsonResponse(503, { error: 'conflict, retry' }, cors);
  }

  return jsonResponse(405, { error: 'method not allowed' }, cors);
};
