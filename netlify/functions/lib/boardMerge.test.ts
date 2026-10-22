// Regression tests for the 2026-10-17 silent board-save failure.
//
// The Updates feature added a fourth collection to BoardState, but the server
// PutSchema stayed `.strict()` over three keys. Every client PUT carries
// `updates` (emptyBoard() seeds it to []), so zod rejected the whole body and
// the function answered 400 — for 37 hours, with no user-visible error.

import { describe, expect, test } from 'vitest';
import { PutSchema, mergeBoard } from './boardMerge';

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
