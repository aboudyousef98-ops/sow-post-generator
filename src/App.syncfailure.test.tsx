// @vitest-environment jsdom
// Regression test for the 2026-10-17 silent board-save failure.
//
// The board endpoint answered 400 to every PUT for 37 hours. The only signal
// was a status dot turning grey while the label beside it still read
// "Synced" — so nobody noticed, and three people's work accumulated in
// localStorage alone. A rejected save must now say so in words.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

function mockFetch(boardStatus: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/board')) {
        if (init?.method === 'PUT') {
          return new Response(JSON.stringify({ error: 'bad payload' }), { status: boardStatus });
        }
        return new Response(
          JSON.stringify({ board: { projects: [], labels: [], activity: [], updates: [] } }),
          { status: 200 },
        );
      }
      if (u.includes('/records')) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (u.includes('/ahjs')) return new Response(JSON.stringify({ ahjs: [] }), { status: 200 });
      if (u.includes('/extrawork')) return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      if (u.includes('/users')) return new Response(JSON.stringify({ users: [] }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 });
    }),
  );
}

describe('save failure is visible', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('never labels the app "Synced" while a store is failing to save', async () => {
    mockFetch(400);

    render(<App />);

    await waitFor(() => expect(screen.getByTitle(/not saved/i)).toBeTruthy());
    expect(screen.queryByText('Synced')).toBeNull();
  });

  it('says the work is unsaved, not merely local', async () => {
    mockFetch(400);

    render(<App />);

    await waitFor(() => expect(screen.getByText(/not saved/i)).toBeTruthy());
  });

  it('still reads "Synced" when every store saves cleanly', async () => {
    mockFetch(200);

    render(<App />);

    await waitFor(() => expect(screen.getByTitle('Team synced')).toBeTruthy());
    expect(screen.getByText('Synced')).toBeTruthy();
  });
});
