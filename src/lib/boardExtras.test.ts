// Pure-logic tests for the 2026-11-23 board features (items 5,6,8,9,10,11).

import { describe, it, expect } from 'vitest';
import {
  boardSignature,
  findSimilarProjects,
  nameSimilarity,
  newProject,
  reversePatch,
  seedLabels,
} from './board';
import {
  anyFilterActive,
  coordinatorLoads,
  daysInStatus,
  isUnratedInstallSoon,
  NO_FILTERS,
  statusChangedAt,
} from './boardViews';
import type { BoardActivity, BoardProject, BoardState } from '../board/types';

const labels = seedLabels();
const mk = (over: Partial<BoardProject>): BoardProject => ({
  ...newProject('X', 'Me', labels, '2026-11-01T00:00:00.000Z'),
  ...over,
});

describe('findSimilarProjects — fuzzy duplicate (item 5)', () => {
  const rows = [mk({ name: 'Anthony S Torres' }), mk({ name: 'Maria Acevedo' })];

  it('flags a near-miss name a dropped initial and a typo apart', () => {
    const hits = findSimilarProjects(rows, 'antony torres');
    expect(hits.map((h) => h.project.name)).toEqual(['Anthony S Torres']);
    expect(hits[0].score).toBeGreaterThan(0.85);
  });

  it('does not flag a genuinely different name', () => {
    expect(findSimilarProjects(rows, 'John Smith')).toEqual([]);
  });

  it('an exact name scores 1', () => {
    expect(nameSimilarity('Maria Acevedo', 'maria   acevedo')).toBe(1);
  });

  it('ignores archived/deleted rows', () => {
    const gone = [mk({ name: 'Anthony Torres', archivedAt: '2026-11-02T00:00:00.000Z' })];
    expect(findSimilarProjects(gone, 'Anthony Torres')).toEqual([]);
  });
});

describe('isUnratedInstallSoon (item 6)', () => {
  const today = '2026-11-23';
  const base = mk({ rating: null });
  it('flags an unrated row installing within 7 days', () => {
    expect(isUnratedInstallSoon(base, '2026-11-25', today)).toBe(true);
    expect(isUnratedInstallSoon(base, today, today)).toBe(true);
  });
  it('does not flag a rated row', () => {
    expect(isUnratedInstallSoon(mk({ rating: 3 }), '2026-11-25', today)).toBe(false);
  });
  it('does not flag an install further out, in the past, or missing', () => {
    expect(isUnratedInstallSoon(base, '2026-12-10', today)).toBe(false);
    expect(isUnratedInstallSoon(base, '2026-11-20', today)).toBe(false); // past = overdue, not "soon"
    expect(isUnratedInstallSoon(base, null, today)).toBe(false);
  });
});

describe('coordinatorLoads (item 8)', () => {
  it('counts active + Pre-Design-not-Done per coordinator, cap 3', () => {
    const rows = [
      mk({ coordinator: 'Anas', statusId: 'status-working' }), // active
      mk({ coordinator: 'Anas', statusId: 'status-predesign', preDesignStatusId: 'predesign-working' }), // pre-design, not done
      mk({ coordinator: 'Anas', statusId: 'status-predesign', preDesignStatusId: 'predesign-done' }), // pre-design DONE → not counted
      mk({ coordinator: 'Anas', statusId: 'status-done' }), // completed → not counted
      mk({ coordinator: '', statusId: 'status-working' }), // unassigned → skipped
    ];
    const loads = coordinatorLoads(rows, labels);
    expect(loads.get('Anas')).toEqual({ load: 2, cap: 3 });
    expect(loads.has('')).toBe(false);
  });

  it('does not count cancelled projects (out of scope, like Hold/Sonnen)', () => {
    const rows = [
      mk({ coordinator: 'Dana', statusId: 'status-working' }), // active → counted
      mk({ coordinator: 'Dana', statusId: 'status-cancelled' }), // cancelled → not counted
      mk({ coordinator: 'Dana', statusId: 'status-cancelled' }), // cancelled → not counted
    ];
    const loads = coordinatorLoads(rows, labels);
    expect(loads.get('Dana')).toEqual({ load: 1, cap: 3 });
  });
});

describe('daysInStatus (item 9)', () => {
  const today = '2026-11-23';
  const p = mk({ id: 'p1', createdAt: '2026-11-01T00:00:00.000Z' });
  const activity: BoardActivity[] = [
    { id: 'a1', projectId: 'p1', actor: 'Me', action: 'update', changes: { statusId: { old: 'A', new: 'B' } }, at: '2026-11-20T00:00:00.000Z' },
    { id: 'a2', projectId: 'p1', actor: 'Me', action: 'update', changes: { rating: { old: '—', new: '3 stars' } }, at: '2026-11-22T00:00:00.000Z' },
  ];
  it('measures from the newest status change, not any edit', () => {
    expect(statusChangedAt(activity, 'p1')).toBe('2026-11-20T00:00:00.000Z');
    expect(daysInStatus(activity, p, today)).toBe(3);
  });
  it('falls back to creation date when the log has no status change', () => {
    expect(daysInStatus([], p, today)).toBe(22);
  });
});

describe('reversePatch — one-click undo (item 7)', () => {
  const entry = (changes: Record<string, { old: string; new: string }>) => ({
    id: 'e1',
    projectId: 'p1',
    actor: 'Me',
    action: 'update' as const,
    changes,
    at: '2026-11-20T00:00:00.000Z',
  });

  it('reverses a status change back to its old label id', () => {
    const p = mk({ statusId: 'status-done' }); // row currently shows "Done"
    const { patch, conflicts } = reversePatch(
      entry({ statusId: { old: 'Working on it', new: 'Done' } }),
      p,
      labels,
    );
    expect(patch).toEqual({ statusId: 'status-working' });
    expect(conflicts).toEqual([]);
  });

  it('reverses rating and coordinator, with "—" → null / empty', () => {
    const rated = mk({ rating: 5 });
    expect(reversePatch(entry({ rating: { old: '—', new: '5 stars' } }), rated, labels).patch).toEqual({ rating: null });
    const assigned = mk({ coordinator: 'Anas' });
    expect(reversePatch(entry({ coordinator: { old: 'Omar', new: 'Anas' } }), assigned, labels).patch).toEqual({ coordinator: 'Omar' });
  });

  it('skips a field the row has moved on from (conflict-safe)', () => {
    const p = mk({ statusId: 'status-working' }); // NOT "Done" any more
    const { patch, conflicts } = reversePatch(
      entry({ statusId: { old: 'New project', new: 'Done' } }),
      p,
      labels,
    );
    expect(patch).toEqual({});
    expect(conflicts).toEqual(['statusId']);
  });

  it('reverts every still-valid field of a multi-field (bulk) entry', () => {
    const p = mk({ statusId: 'status-done', coordinator: 'Anas' });
    const { patch } = reversePatch(
      entry({
        statusId: { old: 'Working on it', new: 'Done' },
        coordinator: { old: 'Omar', new: 'Anas' },
      }),
      p,
      labels,
    );
    expect(patch).toEqual({ statusId: 'status-working', coordinator: 'Omar' });
  });
});

describe('anyFilterActive (item 10)', () => {
  it('is false for the clean slate, true once anything narrows', () => {
    expect(anyFilterActive(NO_FILTERS)).toBe(false);
    expect(anyFilterActive({ ...NO_FILTERS, mine: true })).toBe(true);
    expect(anyFilterActive({ ...NO_FILTERS, coordinators: ['Anas'] })).toBe(true);
    expect(anyFilterActive({ ...NO_FILTERS, unratedInstallSoon: true })).toBe(true);
    expect(anyFilterActive({ ...NO_FILTERS, hideCancelled: true })).toBe(true);
    expect(anyFilterActive({ ...NO_FILTERS, search: '  ' })).toBe(false); // blank search is not a filter
  });
});

describe('boardSignature (item 11 stability)', () => {
  const state: BoardState = {
    projects: [mk({ id: 'p1', updatedAt: '2026-11-20T00:00:00.000Z' })],
    labels,
    activity: [{ id: 'a1', projectId: 'p1', actor: 'Me', action: 'create', at: '2026-11-20T00:00:00.000Z' }],
    updates: [],
  };
  it('is stable for the same content and changes when a row moves', () => {
    const same: BoardState = { ...state, projects: [...state.projects] };
    expect(boardSignature(state)).toBe(boardSignature(same));
    const moved: BoardState = {
      ...state,
      projects: [{ ...state.projects[0], updatedAt: '2026-11-21T00:00:00.000Z' }],
    };
    expect(boardSignature(moved)).not.toBe(boardSignature(state));
  });
  it('changes when an activity entry is appended', () => {
    const more: BoardState = {
      ...state,
      activity: [{ id: 'a2', projectId: 'p1', actor: 'Me', action: 'update', at: '2026-11-21T00:00:00.000Z' }, ...state.activity],
    };
    expect(boardSignature(more)).not.toBe(boardSignature(state));
  });
});
