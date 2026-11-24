// Server-side identity for the bot API (Aboud 2026-11-23, items 14–17).
//
// A NEW auth lane alongside the Origin+path-token one in guard.ts — it does not
// replace it. A machine client (SOW Bot) has no Origin header and cannot carry
// a browser session, so it authenticates with a bearer token:
//
//   Authorization: Bearer sow_live_<token>
//
// The token VALUE is shown once at creation and never stored — only its SHA-256
// digest lives in the `tokens` blob, with a display prefix (`sow_live_…ab4c`).
// A token carries no permissions of its own: the user's role is re-checked LIVE
// against the `users` blob on every request, so archiving or demoting the user
// kills every token they hold. Pure + Node-crypto only, so it unit-tests
// without a Netlify runtime.

import { createHash, randomBytes } from 'node:crypto';

export const TOKEN_PREFIX = 'sow_live_';

/** A freshly minted token value — shown to the human ONCE, never persisted. */
export function generateTokenValue(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/** SHA-256 hex of the token — what the `tokens` blob stores as the key. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `sow_live_…ab4c` — enough to recognise a token in a list, not enough to use it. */
export function displayPrefix(token: string): string {
  return `${TOKEN_PREFIX}…${token.slice(-4)}`;
}

/** One stored token record. `hash` is the lookup key; the value is never stored. */
export interface TokenRecord {
  id: string; // === hash, doubles as the merge id (id/updatedAt contract)
  hash: string;
  prefix: string; // display only
  username: string; // the user this token acts as
  label?: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  revokedAt?: string;
  updatedAt: string; // merge key
}

/** What a browser may see — NEVER the hash. */
export interface TokenDisplay {
  id: string;
  prefix: string;
  username: string;
  label?: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export function toDisplay(r: TokenRecord): TokenDisplay {
  return {
    id: r.id,
    prefix: r.prefix,
    username: r.username,
    label: r.label,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  };
}

export function newTokenRecord(
  token: string,
  username: string,
  createdBy: string,
  label: string | undefined,
  now: string,
): TokenRecord {
  const hash = hashToken(token);
  return {
    id: hash,
    hash,
    prefix: displayPrefix(token),
    username,
    label: label?.trim() || undefined,
    createdAt: now,
    createdBy,
    updatedAt: now,
  };
}

/** Merge token records by id, newer updatedAt wins — the house id/updatedAt contract. */
export function mergeTokens(current: TokenRecord[], incoming: TokenRecord[]): TokenRecord[] {
  const byId = new Map(current.map((t) => [t.id, t]));
  for (const t of incoming) {
    const ex = byId.get(t.id);
    if (!ex || t.updatedAt > ex.updatedAt) byId.set(t.id, t);
  }
  return [...byId.values()];
}

/** The `Bearer <token>` value, or null when the header is absent/malformed. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export interface BotIdentity {
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  /** The token record that authenticated the request (for lastUsedAt touch). */
  token: TokenRecord;
}

interface AnyUser {
  username: string;
  displayName?: string;
  role?: string;
  deletedAt?: string;
}

/**
 * Resolve a bearer token to a live identity, or null. The role comes from the
 * `users` blob RIGHT NOW — not from anything baked into the token — so a user
 * who has been demoted or archived can no longer act, token or not.
 */
export function authenticate(
  token: string | null,
  tokens: TokenRecord[],
  users: AnyUser[],
): BotIdentity | null {
  if (!token) return null;
  const hash = hashToken(token);
  const rec = tokens.find((t) => t.hash === hash && !t.revokedAt);
  if (!rec) return null;
  const user = users.find((u) => u.username === rec.username && !u.deletedAt);
  if (!user) return null;
  const role = user.role === 'admin' ? 'admin' : 'member';
  return { username: user.username, displayName: user.displayName || user.username, role, token: rec };
}
