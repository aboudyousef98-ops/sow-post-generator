// Browser-side login (Phase 9). See the TeamUser comment in types.ts for the
// threat model: this is identity, not hard security. The hash algorithm here
// MUST stay in sync with the seeded admin in netlify/functions/users.mts.

import type { Session, TeamUser, UserRole } from '../types';

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
    return s && typeof s.username === 'string' && typeof s.displayName === 'string' ? s : null;
  } catch {
    return null;
  }
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
