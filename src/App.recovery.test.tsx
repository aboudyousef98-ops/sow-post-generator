// @vitest-environment jsdom
// Recovery for the 2026-10-17 silent board-save failure.
//
// App.tsx pushes the merged cache once on mount, so with the server schema
// fixed, every browser uploads whatever the outage stranded the next time its
// owner opens the app. These tests hold that path down.
//
// The second test is the one that would have caught the outage: it feeds the
// REAL client payload to the REAL server schema. The bug was precisely that
// those two drifted apart with nothing comparing them.

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PutSchema } from '../netlify/functions/lib/boardMerge';
import App from './App';

const strandedProject = {
  id: 'stranded-1',
  name: 'Typed during the outage',
  coordinator: 'Aboud Yousef',
  statusId: null,
  phaseId: null,
  designedDate: null,
  rating: null,
  position: 1,
  createdAt: '2026-10-17T09:00:00.000Z',
  createdBy: 'Aboud Yousef',
  updatedAt: '2026-10-17T09:00:00.000Z',
  updatedBy: 'Aboud Yousef',
  schemaVersion: 1,
};

function boardPuts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url).includes('/board') && (init as RequestInit)?.method === 'PUT')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function install() {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/board')) {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ board: JSON.parse(String(init.body)) }), { status: 200 });
      }
      // The server lost nothing, but it never received the outage edits.
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
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('stranded board work is recovered on load', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uploads a cached project the server has never seen', async () => {
    localStorage.setItem(
      'sowpost.board',
      JSON.stringify({ projects: [strandedProject], labels: [], activity: [], updates: [] }),
    );
    const fetchMock = install();

    render(<App />);
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      const ids = boardPuts(fetchMock).flatMap((b) => b.projects.map((p: { id: string }) => p.id));
      expect(ids).toContain('stranded-1');
    });
  });

  it('sends a payload the server schema accepts', async () => {
    localStorage.setItem(
      'sowpost.board',
      JSON.stringify({ projects: [strandedProject], labels: [], activity: [], updates: [] }),
    );
    const fetchMock = install();

    render(<App />);
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => expect(boardPuts(fetchMock).length).toBeGreaterThan(0));
    for (const body of boardPuts(fetchMock)) {
      const parsed = PutSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
    }
  });
});
