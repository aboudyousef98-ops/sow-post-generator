// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { TeamUser } from '../types';
import {
  activeUsers,
  clearSession,
  extraWorkRoster,
  findUser,
  hashPassword,
  isLastAdmin,
  loadCachedUsers,
  loadSession,
  makeUser,
  mergeUsers,
  newSalt,
  reconcileSession,
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

// Settings.authors is device-local and shipped with only 3 of the 5 real
// people in it, so Anas and Ya'rob were absent from the Extra Work roster on
// their own devices (2026-10-08). The roster must come from the synced users
// blob instead — these tests pin that.
describe('extraWorkRoster', () => {
  beforeEach(() => localStorage.clear());

  it('lists every account by display name, alphabetically', () => {
    saveCachedUsers([
      // Stored under the pre-2026-10-17 spelling on purpose: a cached roster
      // can still hold it, and the roster is expected to normalise rather
      // than pass it through. Was asserted as "Ya'rob Alnabelsi" until
      // 2026-11-05, when that turned out to be how he saw himself twice.
      user('yalnabelsi', { displayName: "Ya'rob Alnabelsi" }),
      user('aboudyousef', { displayName: 'Aboud Yousef', role: 'admin' }),
      user('ayaghmour', { displayName: 'Anas Yaghmour' }),
    ]);
    expect(extraWorkRoster()).toEqual(['Aboud Yousef', 'Anas Yaghmour', 'Yarob Alnabelsi']);
  });

  it('excludes deleted users', () => {
    saveCachedUsers([
      user('a', { displayName: 'Active One' }),
      user('b', { displayName: 'Gone', deletedAt: '2026-10-08T00:00:00.000Z' }),
    ]);
    expect(extraWorkRoster()).toEqual(['Active One']);
  });

  it('always includes the signed-in user, even if the cache missed them', () => {
    saveCachedUsers([user('a', { displayName: 'Active One' })]);
    expect(extraWorkRoster('Anas Yaghmour')).toEqual(['Active One', 'Anas Yaghmour']);
  });

  it('never duplicates the signed-in user', () => {
    saveCachedUsers([user('ayaghmour', { displayName: 'Anas Yaghmour' })]);
    expect(extraWorkRoster('Anas Yaghmour')).toEqual(['Anas Yaghmour']);
  });

  it('falls back to the given roster when no users are cached (offline/first run)', () => {
    expect(extraWorkRoster('', ['Aboud Yousef', 'Omar Rajab'])).toEqual(['Aboud Yousef', 'Omar Rajab']);
  });

  it('prefers the users blob over the fallback once it exists', () => {
    saveCachedUsers([user('ayaghmour', { displayName: 'Anas Yaghmour' })]);
    expect(extraWorkRoster('', ['Aboud Yousef'])).toEqual(['Anas Yaghmour']);
  });

  it('ignores blank display names and trims', () => {
    saveCachedUsers([
      user('a', { displayName: '  Padded Name  ' }),
      user('b', { displayName: '   ' }),
    ]);
    expect(extraWorkRoster()).toEqual(['Padded Name']);
  });
});

// Yarob reported seeing his own name twice, and only he saw it (2026-11-05).
//
// The session is written ONCE at login (main.tsx) and never refreshed, and
// sessions do not expire. He last signed in before the 2026-10-17 rename, so
// his browser still held displayName "Ya'rob Alnabelsi" while the shared users
// blob — checked against the live backup — correctly held "Yarob Alnabelsi".
// extraWorkRoster dedupes with a Set, which only collapses EXACT strings, so
// both spellings survived into every people picker on his screen.
//
// Worse than cosmetic: `me` is the actor stamped on everything he writes, and
// it is matched exactly when filtering by coordinator or asking the activity
// log "what did I touch yesterday".
describe('a stale session cannot resurrect a renamed person', () => {
  beforeEach(() => localStorage.clear());

  const roster: TeamUser[] = [
    user('aboudyousef', { displayName: 'Aboud Yousef' }),
    user('yalnabelsi', { displayName: 'Yarob Alnabelsi' }),
  ];

  it('loadSession normalises a legacy display name', () => {
    localStorage.setItem(
      'sowpost.session',
      JSON.stringify({ username: 'yalnabelsi', displayName: "Ya'rob Alnabelsi", role: 'member' }),
    );
    expect(loadSession()?.displayName).toBe('Yarob Alnabelsi');
  });

  it('the roster shows one Yarob, not two, even from a legacy session name', () => {
    saveCachedUsers(roster);
    const names = extraWorkRoster("Ya'rob Alnabelsi");
    expect(names.filter((n) => n.toLowerCase().includes('nabelsi'))).toEqual(['Yarob Alnabelsi']);
  });

  it('a legacy name inside the cached user list is collapsed too', () => {
    saveCachedUsers([user('yalnabelsi', { displayName: "Ya'rob Alnabelsi" })]);
    expect(extraWorkRoster('Yarob Alnabelsi')).toEqual(['Yarob Alnabelsi']);
  });

  it('the curly-apostrophe spelling collapses as well', () => {
    saveCachedUsers(roster);
    expect(extraWorkRoster('Ya’rob Alnabelsi')).toEqual(['Aboud Yousef', 'Yarob Alnabelsi']);
  });

  // The general fix: the users blob is authoritative, so ANY rename reaches a
  // signed-in browser on the next roster pull — not just the one in the
  // legacy map.
  describe('reconcileSession', () => {
    it('adopts the display name the team list holds', () => {
      const stale = { username: 'yalnabelsi', displayName: 'Old Spelling', role: 'member' as const };
      expect(reconcileSession(stale, roster)?.displayName).toBe('Yarob Alnabelsi');
    });

    it('adopts a role change too — a demotion must not need a re-login', () => {
      const stale = { username: 'yalnabelsi', displayName: 'Yarob Alnabelsi', role: 'admin' as const };
      expect(reconcileSession(stale, roster)?.role).toBe('member');
    });

    it('returns the SAME object when nothing changed, so React does not churn', () => {
      const good = { username: 'yalnabelsi', displayName: 'Yarob Alnabelsi', role: 'member' as const };
      expect(reconcileSession(good, roster)).toBe(good);
    });

    it('leaves the session alone when the roster has not arrived', () => {
      const s = { username: 'yalnabelsi', displayName: 'Yarob Alnabelsi', role: 'member' as const };
      expect(reconcileSession(s, [])).toBe(s);
    });

    it('does NOT sign out a user the roster no longer lists', () => {
      // Deleting someone is an admin action with its own consequences; having
      // a stale cache must never be the thing that logs a person out.
      const s = { username: 'ghost', displayName: 'Ghost', role: 'member' as const };
      expect(reconcileSession(s, roster)).toBe(s);
    });

    it('ignores a deleted record rather than adopting its name', () => {
      const dead = [user('yalnabelsi', { displayName: 'Deleted Name', deletedAt: '2026-11-01T00:00:00.000Z' })];
      const s = { username: 'yalnabelsi', displayName: 'Yarob Alnabelsi', role: 'member' as const };
      expect(reconcileSession(s, dead)).toBe(s);
    });

    it('no session is nothing to reconcile', () => {
      expect(reconcileSession(null, roster)).toBeNull();
    });
  });
});

describe('the normalised session is written back, not just re-derived', () => {
  beforeEach(() => localStorage.clear());

  it('persists the corrected name so the legacy entry can be retired', () => {
    localStorage.setItem(
      'sowpost.session',
      JSON.stringify({ username: 'yalnabelsi', displayName: "Ya'rob Alnabelsi", role: 'member' }),
    );
    loadSession();
    const stored = JSON.parse(localStorage.getItem('sowpost.session') as string);
    expect(stored.displayName).toBe('Yarob Alnabelsi');
    expect(stored.username).toBe('yalnabelsi');
    expect(stored.role).toBe('member');
  });

  it('does not touch storage when there was nothing to normalise', () => {
    const good = JSON.stringify({ username: 'orajab', displayName: 'Omar Rajab', role: 'member' });
    localStorage.setItem('sowpost.session', good);
    loadSession();
    expect(localStorage.getItem('sowpost.session')).toBe(good);
  });
});
