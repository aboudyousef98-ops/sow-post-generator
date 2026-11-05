// Browser-side login (Phase 9). See the TeamUser comment in types.ts for the
// threat model: this is identity, not hard security. The hash algorithm here
// MUST stay in sync with the seeded admin in netlify/functions/users.mts.

import type { Session, TeamUser, UserRole } from '../types';
import { renameValue } from './renames';

const KEY_SESSION = 'sowpost.session';
const KEY_USERS = 'sowpost.users';

// ---- hashing ---------------------------------------------------------------

export function newSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** hex sha256(`${salt}:${password}`) — mirrored by the seed in users.mts. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(user: TeamUser, password: string): Promise<boolean> {
  return (await hashPassword(password, user.salt)) === user.passHash;
}

export async function makeUser(
  username: string,
  displayName: string,
  role: UserRole,
  password: string,
): Promise<TeamUser> {
  const salt = newSalt();
  const now = new Date().toISOString();
  return {
    username: username.trim().toLowerCase(),
    displayName: displayName.trim(),
    role,
    salt,
    passHash: await hashPassword(password, salt),
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

// ---- user list -------------------------------------------------------------

/** Merge by username, newer updatedAt wins — same contract as mergeRecords(). */
export function mergeUsers(current: TeamUser[], incoming: TeamUser[]): TeamUser[] {
  const byName = new Map(current.map((u) => [u.username, u]));
  for (const user of incoming ?? []) {
    if (!user?.username) continue;
    const existing = byName.get(user.username);
    if (!existing || user.updatedAt > existing.updatedAt) byName.set(user.username, user);
  }
  return [...byName.values()];
}

export function activeUsers(users: TeamUser[]): TeamUser[] {
  return users.filter((u) => !u.deletedAt);
}

/** Case-insensitive lookup among non-deleted users. */
export function findUser(users: TeamUser[], username: string): TeamUser | undefined {
  const needle = username.trim().toLowerCase();
  return activeUsers(users).find((u) => u.username === needle);
}

/**
 * True when removing (or demoting) this user would leave the team with no
 * admin at all — the UI must refuse, or nobody can manage users again.
 */
export function isLastAdmin(users: TeamUser[], username: string): boolean {
  const user = findUser(users, username);
  if (!user || user.role !== 'admin') return false;
  return activeUsers(users).filter((u) => u.role === 'admin' && u.username !== user.username).length === 0;
}

// ---- session + offline cache (localStorage) --------------------------------

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY_SESSION);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    if (!s || typeof s.username !== 'string' || typeof s.displayName !== 'string') return null;
    // The session is written ONCE at login and sessions never expire, so a
    // browser that signed in before the 2026-10-17 rename still carries the
    // old spelling — which is what made Yarob see himself twice in every
    // people picker, and made `me` fail an exact match against his own renamed
    // rows. Normalising here fixes it on the very first paint, before any
    // network. reconcileSession() below is the general case.
    const displayName = renameValue(s.displayName);
    if (displayName === s.displayName) return s;
    // Write the normalised form back, rather than re-deriving it on every
    // load forever. Without this the old spelling sits in localStorage
    // permanently, and deleting its LEGACY_NAMES entry — which renames.ts
    // says to do once no cache holds the old value — would silently bring
    // the duplicate back.
    const fixed = { ...s, displayName };
    saveSession(fixed);
    return fixed;
  } catch {
    return null;
  }
}

/**
 * Bring a signed-in session back in line with the shared user list.
 *
 * The users blob is the only authoritative source for who someone is, and the
 * session is a copy taken at login that nothing ever refreshed. Any rename or
 * role change in Admin → Users therefore never reached a browser that stayed
 * signed in — and nobody signs out, so "never" meant weeks.
 *
 * Returns the SAME session object when nothing changed, so a caller can store
 * it unconditionally without causing a re-render every poll.
 *
 * Deliberately does NOT sign anyone out when their record is missing or
 * deleted: a stale or half-fetched cache must never be the thing that locks
 * someone out of the tool mid-shift.
 */
export function reconcileSession(session: Session | null, users: TeamUser[]): Session | null {
  if (!session) return null;
  const record = findUser(users, session.username);
  if (!record) return session;
  const displayName = renameValue((record.displayName ?? '').trim());
  if (!displayName) return session;
  if (displayName === session.displayName && record.role === session.role) return session;
  return { ...session, displayName, role: record.role };
}

export function saveSession(session: Session): void {
  localStorage.setItem(KEY_SESSION, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEY_SESSION);
}

/** Offline cache of the shared user list, so login works when Netlify is unreachable. */
export function loadCachedUsers(): TeamUser[] {
  try {
    const raw = localStorage.getItem(KEY_USERS);
    const arr = raw ? (JSON.parse(raw) as TeamUser[]) : null;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCachedUsers(users: TeamUser[]): void {
  localStorage.setItem(KEY_USERS, JSON.stringify(users));
}

/**
 * The Extra Work roster: display names of everyone who has an account.
 *
 * Do NOT source this from Settings.authors — Settings lives in localStorage and
 * is never synced, so the shipped 3-name default ('Aboud Yousef', 'Omar Rajab',
 * 'Mohammad Refai') was all that Anas and Ya'rob ever saw on their own devices,
 * leaving them absent from their own hours screen (found 2026-10-08). The users
 * blob is the real, synced team list.
 *
 * `me` is always present even if the cache missed them; `fallback` covers the
 * offline/first-run case where no user list has been received yet.
 */
export function extraWorkRoster(me?: string, fallback: string[] = []): string[] {
  // Normalised BEFORE the Set, not after: a Set collapses exact strings only,
  // so "Ya'rob Alnabelsi" and "Yarob Alnabelsi" both survived it and the same
  // person appeared twice in every picker (reported by Yarob, 2026-11-05).
  const clean = (n: string) => renameValue(n.trim());
  const cached = activeUsers(loadCachedUsers())
    .map((u) => clean(u.displayName ?? ''))
    .filter(Boolean);
  const names = new Set(cached.length > 0 ? cached : fallback.map(clean).filter(Boolean));
  const mine = clean(me ?? '');
  if (mine) names.add(mine);
  return [...names].sort((a, b) => a.localeCompare(b));
}
