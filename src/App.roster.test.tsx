// @vitest-environment jsdom
// The Board must list everyone who has an ACCOUNT, not Settings.authors.
//
// Settings lives in localStorage and is never synced, and its shipped default
// is three names: Aboud Yousef, Omar Rajab, Mohammad Refai. App.tsx appends
// only the signed-in user. So on Anas's laptop the board's coordinator lists
// held Aboud, Omar, Refai and Anas — and no Ya'rob, who therefore could not be
// filtered for or assigned. Refai saw neither Anas nor Ya'rob.
//
// The identical bug was found on the Extra Work screen on 2026-10-08 and fixed
// there with extraWorkRoster(); the desktop Board never got that fix.
// Reported by Anas via Aboud, 2026-10-18.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Session } from './types';

const ANAS: Session = { username: 'ayaghmour', displayName: 'Anas Yaghmour', role: 'member' };

const TEAM = [
  { username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin', updatedAt: '2026-10-01T00:00:00Z' },
  { username: 'orajab', displayName: 'Omar Rajab', role: 'member', updatedAt: '2026-10-01T00:00:00Z' },
  { username: 'mrefai', displayName: 'Mohammad Refai', role: 'member', updatedAt: '2026-10-01T00:00:00Z' },
  { username: 'yalnabelsi', displayName: 'Yarob Alnabelsi', role: 'member', updatedAt: '2026-10-01T00:00:00Z' },
  { username: 'ayaghmour', displayName: 'Anas Yaghmour', role: 'member', updatedAt: '2026-10-01T00:00:00Z' },
];

describe('board people lists come from the account roster', () => {
  beforeEach(() => {
    localStorage.clear();
    // What Anas's laptop actually had: the shipped 3-name Settings default,
    // and the synced user list with all five accounts.
    localStorage.setItem('sowpost.users', JSON.stringify(TEAM));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/users')) return new Response(JSON.stringify({ users: TEAM }), { status: 200 });
        if (u.includes('/board'))
          return new Response(
            JSON.stringify({ board: { projects: [], labels: [], activity: [], updates: [] } }),
            { status: 200 },
          );
        if (u.includes('/records')) return new Response(JSON.stringify({ records: [] }), { status: 200 });
        if (u.includes('/ahjs')) return new Response(JSON.stringify({ ahjs: [] }), { status: 200 });
        if (u.includes('/extrawork')) return new Response(JSON.stringify({ entries: [] }), { status: 200 });
        return new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers Yarob in the Coordinator filter when Anas is signed in', async () => {
    render(<App session={ANAS} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Coordinator/ }));

    expect(await screen.findByLabelText('Yarob Alnabelsi')).toBeTruthy();
  });

  it('offers every teammate, not just the three shipped defaults', async () => {
    render(<App session={ANAS} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Coordinator/ }));

    await screen.findByLabelText('Aboud Yousef');
    for (const u of TEAM) {
      expect(screen.getByLabelText(u.displayName)).toBeTruthy();
    }
  });
});
