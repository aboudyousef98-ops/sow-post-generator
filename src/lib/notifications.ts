// In-app notifications.
//
// Aboud 2026-10-17 #10: "question, what is the best notification system for us
// here?" — then, later: "for the notification part maybe u will decide the best
// for us, do whatever you see good for us".
//
// THE DECISION, and why.
//
// This is 5 people, remote, on a static site: Netlify functions + Blobs, no
// server that can run a job, and a client that syncs by polling. Options:
//
//   Browser push   needs a service worker, VAPID keys and a push service, and
//                  only reaches people who left a tab open and clicked Allow.
//                  Most infrastructure, least reliable delivery here.
//   Email          needs a provider and a sending domain, and the team already
//                  ignores email — the whole tool exists to avoid writing it.
//   Slack          genuinely good: they live in Slack all day, and the tool's
//                  entire output is a Slack post. But an incoming webhook is a
//                  SECRET only Aboud can create, and nothing can post while his
//                  laptop is closed, so it cannot be the baseline.
//   In-app bell    needs NOTHING new. The activity log and the updates are
//                  already synced to every client, so "what changed since I
//                  last looked" is a pure function of data in hand.
//
// So: the bell is the baseline, because it works for everyone today with no
// setup and no secret. Slack is the natural second step and is written up in
// _CHECKPOINT_updates_feature.md — it needs one webhook URL from Aboud.
//
// "Unread" is per-browser (localStorage), not shared. Two people must not be
// able to mark each other's notifications read.

import type { BoardActivity, BoardProject, ProjectUpdate } from '../board/types';

export interface Notification {
  id: string;
  projectId: string;
  projectName: string;
  actor: string;
  at: string;
  text: string;
  /** Updates open the thread; everything else opens the activity log. */
  kind: 'update' | 'activity';
}

const ACTION_TEXT: Record<string, string> = {
  create: 'created this project',
  archive: 'archived it',
  restore: 'restored it',
  delete: 'deleted it',
  'update-post': 'posted an update',
  'update-edit': 'edited an update',
  'update-delete': 'deleted an update',
};

/**
 * Field changes worth interrupting someone for. A coordinator or status move
 * is news; a date nudge or a position drag is not, and a bell that cries every
 * time someone reorders a row gets switched off within a day.
 */
const NOTABLE_FIELDS = new Set(['statusId', 'coordinator', 'rating', 'name']);

function changeText(a: BoardActivity): string | null {
  if (a.action !== 'update') return ACTION_TEXT[a.action] ?? null;
  const entries = Object.entries(a.changes ?? {}).filter(([k]) => NOTABLE_FIELDS.has(k));
  if (!entries.length) return null;
  return entries.map(([k, c]) => `${k === 'statusId' ? 'status' : k === 'coordinator' ? 'coordinator' : k} → ${c.new}`).join(', ');
}

/**
 * Everything that happened since `since`, newest first, excluding the viewer's
 * own actions — you do not need telling what you just did.
 *
 * `updates` are listed from the thread rather than from the activity log, so
 * the notification can carry the actual words someone wrote.
 */
export function buildNotifications(
  activity: BoardActivity[] | undefined,
  updates: ProjectUpdate[] | undefined,
  projects: BoardProject[],
  me: string,
  since: string,
  limit = 50,
): Notification[] {
  const nameById = new Map(projects.filter((p) => !p.deletedAt).map((p) => [p.id, p.name]));
  const out: Notification[] = [];

  for (const u of updates ?? []) {
    if (u.deleted || u.by === me || u.at <= since) continue;
    if (!nameById.has(u.projectId)) continue;
    out.push({
      id: `u:${u.id}`,
      projectId: u.projectId,
      projectName: nameById.get(u.projectId)!,
      actor: u.by,
      at: u.at,
      text: u.text.replace(/\s+/g, ' ').slice(0, 140),
      kind: 'update',
    });
  }

  for (const a of activity ?? []) {
    // The update-* entries are already covered above, with better wording.
    if (a.action.startsWith('update-')) continue;
    if (a.actor === me || a.at <= since) continue;
    if (!nameById.has(a.projectId)) continue;
    const text = changeText(a);
    if (!text) continue;
    out.push({
      id: `a:${a.id}`,
      projectId: a.projectId,
      projectName: nameById.get(a.projectId)!,
      actor: a.actor,
      at: a.at,
      text,
      kind: 'activity',
    });
  }

  return out.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

const KEY_SEEN = 'sowpost.notifications.seen.v1';

/**
 * When this browser last opened the bell. Defaults to NOW on a first run, so
 * a new sign-in is not greeted with a thousand historical entries.
 */
export function loadLastSeen(now: string = new Date().toISOString()): string {
  try {
    const raw = localStorage.getItem(KEY_SEEN);
    if (raw) return raw;
    localStorage.setItem(KEY_SEEN, now);
    return now;
  } catch {
    return now;
  }
}

export function saveLastSeen(at: string = new Date().toISOString()): void {
  try {
    localStorage.setItem(KEY_SEEN, at);
  } catch {
    // Private mode — the bell just stays noisy. Not worth failing over.
  }
}
