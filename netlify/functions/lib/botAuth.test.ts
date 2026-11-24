import { describe, it, expect } from 'vitest';
import {
  TOKEN_PREFIX,
  authenticate,
  displayPrefix,
  generateTokenValue,
  hashToken,
  mergeTokens,
  newTokenRecord,
  parseBearer,
  type TokenRecord,
} from './botAuth';

describe('botAuth — token values', () => {
  it('mints a prefixed, unique token and hashes it stably', () => {
    const a = generateTokenValue();
    const b = generateTokenValue();
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('display prefix hides all but the last 4 chars', () => {
    expect(displayPrefix('sow_live_abcdef1234')).toBe('sow_live_…1234');
  });

  it('parses a Bearer header', () => {
    expect(parseBearer('Bearer sow_live_x')).toBe('sow_live_x');
    expect(parseBearer('bearer   sow_live_y')).toBe('sow_live_y');
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer('Basic abc')).toBeNull();
  });
});

describe('botAuth — authenticate (live role re-check)', () => {
  const now = '2026-11-23T00:00:00.000Z';
  const token = 'sow_live_secret';
  const rec = newTokenRecord(token, 'sow_bot', 'aboudyousef', 'bot', now);
  const users = [
    { username: 'sow_bot', displayName: 'SOW Bot - Aboud', role: 'admin' },
    { username: 'gone', displayName: 'Gone', role: 'member', deletedAt: now },
  ];

  it('resolves a valid token to the live identity', () => {
    const id = authenticate(token, [rec], users);
    expect(id?.username).toBe('sow_bot');
    expect(id?.displayName).toBe('SOW Bot - Aboud');
    expect(id?.role).toBe('admin');
  });

  it('rejects a wrong, revoked, or orphaned token', () => {
    expect(authenticate('sow_live_wrong', [rec], users)).toBeNull();
    expect(authenticate(token, [{ ...rec, revokedAt: now }], users)).toBeNull();
    expect(authenticate(token, [rec], [])).toBeNull(); // user not found
  });

  it('dies with the user — a deleted user cannot act', () => {
    const t2 = newTokenRecord('sow_live_two', 'gone', 'aboudyousef', undefined, now);
    expect(authenticate('sow_live_two', [t2], users)).toBeNull();
  });

  it('a member keeps member role (no privilege baked into the token)', () => {
    const t = newTokenRecord('sow_live_m', 'refai', 'aboudyousef', undefined, now);
    const id = authenticate('sow_live_m', [t], [{ username: 'refai', displayName: 'Refai', role: 'member' }]);
    expect(id?.role).toBe('member');
  });
});

describe('botAuth — mergeTokens', () => {
  it('newer updatedAt wins, keyed by id', () => {
    const base: TokenRecord = newTokenRecord('sow_live_a', 'u', 'a', undefined, '2026-11-23T00:00:00.000Z');
    const revoked: TokenRecord = { ...base, revokedAt: '2026-11-24T00:00:00.000Z', updatedAt: '2026-11-24T00:00:00.000Z' };
    const merged = mergeTokens([base], [revoked]);
    expect(merged).toHaveLength(1);
    expect(merged[0].revokedAt).toBeTruthy();
  });
});
