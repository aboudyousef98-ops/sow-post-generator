// Regression tests for the 2026-10-17 silent board-save failure.
//
// The Updates feature added a fourth collection to BoardState, but the server
// PutSchema stayed `.strict()` over three keys. Every client PUT carries
// `updates` (emptyBoard() seeds it to []), so zod rejected the whole body and
// the function answered 400 — for 37 hours, with no user-visible error.

import { describe, expect, test } from 'vitest';
import { PutSchema, mergeBoard, mergePrefs } from './boardMerge';

const project = (id: string, updatedAt: string) => ({ id, name: id, updatedAt });
const update = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  projectId: 'p1',
  text: id,
  by: 'Aboud Yousef',
  at: updatedAt,
  kind: 'note',
  updatedAt,
  ...extra,
});

describe('PutSchema', () => {
  test('accepts a body carrying the updates collection', () => {
    const body = { projects: [], labels: [], activity: [], updates: [update('u1', '2026-10-18T10:00:00Z')] };

    const parsed = PutSchema.safeParse(body);

    expect(parsed.success).toBe(true);
  });

  test('accepts a body with no updates key, as pre-2026-10-17 clients send', () => {
    const parsed = PutSchema.safeParse({ projects: [], labels: [], activity: [] });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.updates).toEqual([]);
  });

  test('still rejects a genuinely unknown key', () => {
    const parsed = PutSchema.safeParse({ projects: [], labels: [], activity: [], nonsense: [] });

    expect(parsed.success).toBe(false);
  });
});

describe('mergeBoard', () => {
  test('keeps updates posted by another client', () => {
    const current = { projects: [], labels: [], activity: [], updates: [update('u1', '2026-10-18T10:00:00Z')] };
    const incoming = { projects: [], labels: [], activity: [], updates: [update('u2', '2026-10-18T11:00:00Z')] };

    const merged = mergeBoard(current, incoming);

    expect(merged.updates.map((u) => u.id).sort()).toEqual(['u1', 'u2']);
  });

  test('resolves a conflicting update by updatedAt, newest wins', () => {
    const current = { projects: [], labels: [], activity: [], updates: [update('u1', '2026-10-18T10:00:00Z', { text: 'old' })] };
    const incoming = { projects: [], labels: [], activity: [], updates: [update('u1', '2026-10-18T12:00:00Z', { text: 'new' })] };

    const merged = mergeBoard(current, incoming);

    expect(merged.updates).toHaveLength(1);
    expect(merged.updates[0].text).toBe('new');
  });

  test('does not resurrect an update the newest writer tombstoned', () => {
    const current = { projects: [], labels: [], activity: [], updates: [update('u1', '2026-10-18T10:00:00Z')] };
    const tombstoned = update('u1', '2026-10-18T12:00:00Z', { deleted: { at: '2026-10-18T12:00:00Z', by: 'Aboud Yousef' } });
    const incoming = { projects: [], labels: [], activity: [], updates: [tombstoned] };

    const merged = mergeBoard(current, incoming);

    expect(merged.updates[0].deleted).toBeTruthy();
  });

  test('tolerates a board written before updates existed', () => {
    const legacy = { projects: [project('p1', '2026-10-16T10:00:00Z')], labels: [], activity: [] };
    const incoming = { projects: [], labels: [], activity: [], updates: [update('u1', '2026-10-18T10:00:00Z')] };

    const merged = mergeBoard(legacy as never, incoming);

    expect(merged.updates.map((u) => u.id)).toEqual(['u1']);
    expect(merged.projects.map((p) => p.id)).toEqual(['p1']);
  });

  test('still merges projects by updatedAt', () => {
    const current = { projects: [project('p1', '2026-10-16T10:00:00Z')], labels: [], activity: [], updates: [] };
    const incoming = { projects: [project('p1', '2026-10-18T10:00:00Z')], labels: [], activity: [], updates: [] };

    const merged = mergeBoard(current, incoming);

    expect(merged.projects).toHaveLength(1);
    expect(merged.projects[0].updatedAt).toBe('2026-10-18T10:00:00Z');
  });
});

// The server cap was left at 1000 when the client went to 5000 (2026-10-21) —
// every merge silently re-truncated history the client thought it had kept.
describe('ACTIVITY_CAP parity (2026-10-22)', () => {
  test('a merge holds well past the old 1000 cap', () => {
    const activity = Array.from({ length: 1500 }, (_, i) => ({
      id: `a${i}`,
      projectId: 'p1',
      actor: 'Aboud Yousef',
      action: 'update',
      at: new Date(1700000000000 + i * 1000).toISOString(),
    }));
    const merged = mergeBoard({ projects: [], labels: [], activity, updates: [] }, {
      projects: [],
      labels: [],
      activity: [],
      updates: [],
    });
    expect(merged.activity).toHaveLength(1500);
  });
});

// Finding from the 2026-10-22 pre-deploy audit: PutSchema kept max(2000) when
// the cap went to 5000. Clients PUT the whole board, so past 2000 entries EVERY
// board save (projects included) would 400 — total silent write failure.
describe('PutSchema admits a full capped activity list', () => {
  test('a board PUT carrying 5000 activity entries parses', () => {
    const activity = Array.from({ length: 5000 }, (_, i) => ({ id: `a${i}`, at: '2026-10-22T00:00:00Z' }));
    const parsed = PutSchema.safeParse({ projects: [], labels: [], activity, updates: [] });
    expect(parsed.success).toBe(true);
  });
});

// Same shape of hazard as the 2026-10-17 outage above, one key later: the
// shared auto-sort switch (Aboud 2026-11-05) adds `prefs` to BoardState, and
// api.putSharedBoard sends JSON.stringify(board) — the WHOLE object. A strict
// schema that did not declare it would 400 every board save again.
describe('PutSchema admits the shared prefs object', () => {
  const prefs = { autoSortByStatus: true, updatedAt: '2026-11-05T10:00:00.000Z', updatedBy: 'Aboud Yousef' };

  test('a body carrying prefs is accepted', () => {
    const parsed = PutSchema.safeParse({ projects: [], labels: [], activity: [], updates: [], prefs });
    expect(parsed.success).toBe(true);
  });

  test('a body without prefs is still accepted — absent is a real state', () => {
    const parsed = PutSchema.safeParse({ projects: [], labels: [], activity: [], updates: [] });
    expect(parsed.success).toBe(true);
    // No default: "no prefs" must survive the round trip, because the client
    // reads absent as auto-sort ON.
    expect(parsed.success && parsed.data.prefs).toBeUndefined();
  });

  test('prefs without an updatedAt is rejected — the merge could not resolve it', () => {
    const parsed = PutSchema.safeParse({
      projects: [],
      labels: [],
      activity: [],
      updates: [],
      prefs: { autoSortByStatus: true },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('mergePrefs mirrors the client', () => {
  const older = { autoSortByStatus: false, updatedAt: '2026-11-05T10:00:00.000Z' };
  const newer = { autoSortByStatus: true, updatedAt: '2026-11-05T11:00:00.000Z' };

  test('newer updatedAt wins, whichever side it arrives on', () => {
    expect(mergePrefs(older, newer)).toEqual(newer);
    expect(mergePrefs(newer, older)).toEqual(newer);
  });

  test('a side that has prefs beats a side that does not', () => {
    expect(mergePrefs(undefined, older)).toEqual(older);
    expect(mergePrefs(older, undefined)).toEqual(older);
  });

  test('neither side having prefs invents nothing', () => {
    expect(mergePrefs(undefined, undefined)).toBeUndefined();
  });

  test('a board merge carries prefs through without touching the collections', () => {
    const merged = mergeBoard(
      { projects: [project('p1', '2026-11-01T00:00:00.000Z')], labels: [], activity: [], updates: [] },
      { projects: [], labels: [], activity: [], updates: [], prefs: newer },
    );
    expect(merged.prefs).toEqual(newer);
    expect(merged.projects).toHaveLength(1);
  });
});
