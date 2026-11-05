// Shared Project Board payload schema + merge. Extracted from board.mts so it
// can be unit-tested without a Netlify runtime — same reasoning as guard.ts.
//
// The merge contract: every collection is keyed by `id` and resolved by
// `updatedAt` (newer wins), except `activity`, which is append-only and
// resolved by first-write (an entry is never altered once it exists).

import { z } from 'zod';

// Loose on purpose (same reasoning as records.mts): the client owns the full
// shapes; the server needs only the merge keys.
export const Stamped = z.object({ id: z.string().min(1), updatedAt: z.string().min(1) }).loose();
export const ActivityRow = z.object({ id: z.string().min(1), at: z.string().min(1) }).loose();
/**
 * Team-wide view rules — ONE object, not an id-keyed list, so it is merged by
 * updatedAt alone. `.loose()` like the rest: the client owns the full shape,
 * the server needs only the merge key.
 */
export const Prefs = z.object({ updatedAt: z.string().min(1) }).loose();

// 5000, was 1000 until 2026-10-22 — MUST match ACTIVITY_CAP in src/lib/board.ts.
// The client was raised on 2026-10-21 but this server copy kept truncating every
// merge back to 1000, silently eating the oldest history on each write.
export const ACTIVITY_CAP = 5000;

export const PutSchema = z
  .object({
    projects: z.array(Stamped).max(10000),
    labels: z.array(Stamped).max(1000),
    // Clients PUT the WHOLE board, so this bound must admit a full capped
    // activity list — at 2000 it would have 400-rejected every board save
    // (projects and labels included) once history passed 2000 entries.
    activity: z.array(ActivityRow).max(ACTIVITY_CAP),
    // Added 2026-10-17 with the Updates feature. MUST stay optional with a
    // default: `.strict()` without this key rejected every PUT from the new
    // client (emptyBoard() always seeds `updates: []`), so the board silently
    // took no writes at all for 37 hours. The default also lets an older
    // client, which omits the key entirely, keep saving.
    updates: z.array(Stamped).max(20000).optional().default([]),
    // Added 2026-11-05 with the shared auto-sort switch. OPTIONAL for the same
    // hard-won reason as `updates` above: this schema is `.strict()`, so a key
    // the client sends and the server does not declare 400s EVERY board save —
    // projects and labels included. Optional with no default, because "no
    // prefs" is a real state that must survive a round trip (lib/board reads
    // absent as auto-sort ON).
    prefs: Prefs.optional(),
    // Team-written automations, added 2026-11-05. Optional for the same
    // strict-schema reason as `prefs` and `updates`, and defaulted to [] so an
    // older client that omits the key keeps saving.
    automations: z.array(Stamped).max(500).optional().default([]),
  })
  .strict();

export type Stamped = z.infer<typeof Stamped>;
export type ActivityRow = z.infer<typeof ActivityRow>;
export type Prefs = z.infer<typeof Prefs>;

export interface BoardBlob {
  projects: Stamped[];
  labels: Stamped[];
  activity: ActivityRow[];
  updates: Stamped[];
  prefs?: Prefs;
  automations?: Stamped[];
}

export function mergeStamped(current: Stamped[], incoming: Stamped[]): Stamped[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function mergeBoard(current: BoardBlob | null, incoming: BoardBlob): BoardBlob {
  const cur: BoardBlob = current ?? { projects: [], labels: [], activity: [], updates: [] };
  // Every board written before 2026-10-17 has no `updates` key at all, so both
  // sides are normalised rather than trusted.
  const activityById = new Map((cur.activity ?? []).map((a) => [a.id, a]));
  for (const a of incoming.activity ?? []) if (!activityById.has(a.id)) activityById.set(a.id, a);
  return {
    projects: mergeStamped(cur.projects ?? [], incoming.projects ?? []),
    labels: mergeStamped(cur.labels ?? [], incoming.labels ?? []),
    activity: [...activityById.values()]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, ACTIVITY_CAP),
    // Same id/updatedAt contract as projects and labels: an edit or a delete
    // tombstone carries a newer updatedAt and therefore wins.
    updates: mergeStamped(cur.updates ?? [], incoming.updates ?? []),
    // One object, so there is no id to key on: newer updatedAt wins outright,
    // and a side that HAS prefs beats a side that does not. Must mirror
    // newerPrefs in src/lib/board.ts — if the two disagree, a client and the
    // server converge on different boards.
    prefs: mergePrefs(cur.prefs, incoming.prefs),
    // Same contract as labels and updates — a rule's deletedAt tombstone
    // carries a newer updatedAt and therefore wins.
    automations: mergeStamped(cur.automations ?? [], incoming.automations ?? []),
  };
}

export function mergePrefs(a: Prefs | undefined, b: Prefs | undefined): Prefs | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}
