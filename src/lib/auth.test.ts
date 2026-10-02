// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { TeamUser } from '../types';
import {
  activeUsers,
  clearSession,
  findUser,
  hashPassword,
  isLastAdmin,
  loadCachedUsers,
  loadSession,
  makeUser,
  mergeUsers,
  newSalt,
  saveCachedUsers,
  saveSession,
  verifyPassword,
} from './auth';

describe('password hashing', () => {
  it('same password + salt → same hash; different salt → different hash', async () => {
    const a = await hashPassword('secret', 'salt1');
    expect(a).toBe(await hashPassword('secret', 'salt1'));
    expect(a).not.toBe(await hashPassword('secret', 'salt2'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the seeded admin constant in users.mts', async () => {
    // If this fails, the seed in netlify/functions/users.mts and auth.ts have
    // drifted apart and the admin cannot log in on a fresh store.
    expect(await hashPassword('Dynamic+951', 'fb23fe231a475e9f607a4e88')).toBe(
      '71177710bdcead8830900a1c4cb34e3d40f16927e1872e11c11785a40352a5bb',
    );
  });

  it('verifyPassword accepts the right password and rejects the wrong one', async () => {
    const user = await makeUser('Omar', 'Omar Rajab', 'member', 'pw-123');
    expect(user.username).toBe('omar'); // lowercased handle
    expect(await verifyPassword(user, 'pw-123')).toBe(true);
    expect(await verifyPassword(user, 'pw-124')).toBe(false);
  });

  it('salts are random per call', () => {
    expect(newSalt()).not.toBe(newSalt());
  });
});

function user(username: string, over: Partial<TeamUser> = {}): TeamUser {
  return {
    username,
    displayName: username,
    role: 'member',
    salt: 's',
    passHash: 'h',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    schemaVersion: 1,
    ...over,
  };
}

describe('user list', () => {
  it('mergeUsers: newer updatedAt wins, unknown users are added', () => {
    const current = [user('a', { displayName: 'Old' })];
    const incoming = [user('a', { displayName: 'New', updatedAt: '2026-10-02T00:00:00.000Z' }), user('b')];
    const merged = mergeUsers(current, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.find((u) => u.username === 'a')?.displayName).toBe('New');
  });

  it('findUser is case-insensitive and skips deleted users', () => {
    const users = [user('aboudyousef'), user('gone', { deletedAt: '2026-10-02T00:00:00.000Z' })];
    expect(findUser(users, '  AboudYousef ')?.username).toBe('aboudyousef');
    expect(findUser(users, 'gone')).toBeUndefined();
    expect(activeUsers(users)).toHaveLength(1);
  });

  it('isLastAdmin: true only for the one remaining admin', () => {
    const users = [user('boss', { role: 'admin' }), user('worker')];
    expect(isLastAdmin(users, 'boss')).toBe(true);
    expect(isLastAdmin(users, 'worker')).toBe(false);
    const twoAdmins = [...users, user('boss2', { role: 'admin' })];
    expect(isLastAdmin(twoAdmins, 'boss')).toBe(false);
    // A deleted second admin does not count as cover.
    const deadCover = [...users, user('boss2', { role: 'admin', deletedAt: '2026-10-02T00:00:00.000Z' })];
    expect(isLastAdmin(deadCover, 'boss')).toBe(true);
  });
});

describe('session + cache storage', () => {
  beforeEach(() => localStorage.clear());

  it('session round-trips and clears', () => {
    expect(loadSession()).toBeNull();
    saveSession({ username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin' });
    expect(loadSession()?.displayName).toBe('Aboud Yousef');
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('garbage in the session key reads as logged-out, not a crash', () => {
    localStorage.setItem('sowpost.session', '{not json');
    expect(loadSession()).toBeNull();
  });

  it('cached users round-trip', () => {
    expect(loadCachedUsers()).toEqual([]);
    saveCachedUsers([user('a')]);
    expect(loadCachedUsers()).toHaveLength(1);
  });
});
