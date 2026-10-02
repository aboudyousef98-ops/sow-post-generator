// GET/PUT /api/<token>/board — shared Project Board (projects + labels +
// activity). Same architecture as records.mts: Netlify Blobs (store "sowpost",
// key "board"), merge by id/updatedAt so concurrent pushes from three
// designers converge, etag compare-and-swap against lost updates.
//
// Activity is append-only: union by id, newest first, capped — the client
// writes entries alongside each edit and they can never be altered here.

import { getStore } from '@netlify/blobs';
import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';

// Loose on purpose (same reasoning as records.mts): the client owns the full
// shapes; the server needs only the merge keys.
const Stamped = z.object({ id: z.string().min(1), updatedAt: z.string().min(1) }).loose();
const ActivityRow = z.object({ id: z.string().min(1), at: z.string().min(1) }).loose();
const PutSchema = z
  .object({
    projects: z.array(Stamped).max(10000),
    labels: z.array(Stamped).max(1000),
    activity: z.array(ActivityRow).max(2000),
  })
  .strict();

type Stamped = z.infer<typeof Stamped>;
type ActivityRow = z.infer<typeof ActivityRow>;
interface BoardBlob {
  projects: Stamped[];
  labels: Stamped[];
  activity: ActivityRow[];
}

const ACTIVITY_CAP = 1000;

function mergeStamped(current: Stamped[], incoming: Stamped[]): Stamped[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mergeBoard(current: BoardBlob | null, incoming: BoardBlob): BoardBlob {
  const cur = current ?? { projects: [], labels: [], activity: [] };
  const activityById = new Map(cur.activity.map((a) => [a.id, a]));
  for (const a of incoming.activity) if (!activityById.has(a.id)) activityById.set(a.id, a);
  return {
    projects: mergeStamped(cur.projects, incoming.projects),
    labels: mergeStamped(cur.labels, incoming.labels),
    activity: [...activityById.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, ACTIVITY_CAP),
  };
}

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
