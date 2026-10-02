// GET/PUT /api/<token>/users — Phase 9 shared team login roster.
// Same storage + merge contract as records.mts: Netlify Blobs (store
// "sowpost", key "users"), merge by username with newer updatedAt winning,
// tombstones (deletedAt) for removals, etag compare-and-swap on write.
//
// An empty store is seeded with the admin account so the very first visit to a
// fresh deployment can log in. Only the salted hash lives here — the hash
// algorithm is mirrored in src/lib/auth.ts (a test pins the two together).

import { getStore } from '@netlify/blobs';
import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';

const UserSchema = z.object({ username: z.string().min(1), updatedAt: z.string().min(1) }).loose();
const PutSchema = z.object({ users: z.array(UserSchema).max(1000) }).strict();

type AnyUser = z.infer<typeof UserSchema>;

const SEED_ADMIN: Record<string, unknown> = {
  username: 'aboudyousef',
  displayName: 'Aboud Yousef',
  role: 'admin',
  salt: 'fb23fe231a475e9f607a4e88',
  passHash: '71177710bdcead8830900a1c4cb34e3d40f16927e1872e11c11785a40352a5bb',
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  schemaVersion: 1,
};

function merge(current: AnyUser[], incoming: AnyUser[]): AnyUser[] {
  const byName = new Map(current.map((u) => [u.username, u]));
  for (const user of incoming) {
    const existing = byName.get(user.username);
    if (!existing || user.updatedAt > existing.updatedAt) byName.set(user.username, user);
  }
  return [...byName.values()];
}

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;

  const store = getStore('sowpost');

  if (req.method === 'GET') {
    let users = ((await store.get('users', { type: 'json' })) as AnyUser[] | null) ?? [];
    if (users.length === 0) {
      users = [SEED_ADMIN as unknown as AnyUser];
      // Best-effort seed; onlyIfNew so two concurrent first visits cannot race.
      await store.setJSON('users', users, { onlyIfNew: true });
    }
    return jsonResponse(200, { users }, cors);
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = (await store.getWithMetadata('users', { type: 'json' })) as
        | { data: AnyUser[] | null; etag?: string }
        | null;
      const merged = merge(existing?.data ?? [], parsed.data.users);
      const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
      const res = await store.setJSON('users', merged, cond);
      if (res.modified || (existing && !existing.etag)) {
        console.log(
          JSON.stringify({ at: new Date().toISOString(), endpoint: 'users', put: parsed.data.users.length, total: merged.length, attempt }),
        );
        return jsonResponse(200, { users: merged }, cors);
      }
    }
    return jsonResponse(503, { error: 'conflict, retry' }, cors);
  }

  return jsonResponse(405, { error: 'method not allowed' }, cors);
};
