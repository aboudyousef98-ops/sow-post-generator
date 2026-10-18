// Per-column value filters and column reordering — Aboud, 2026-10-18:
// "we can move the columns between each other, so we can have one of them
// closer" and "can we have a filter for each column? to filter everything by
// that value?"

import { describe, expect, test } from 'vitest';
import type { BoardLabel, BoardProject } from '../board/types';
import {
  PINNED_COLUMNS,
  columnDisplayValue,
  distinctColumnValues,
  matchesColumnFilters,
  normalizeColumnOrder,
  moveColumn,
  EMPTY_VALUE,
} from './boardColumns';

const label = (id: string, name: string, columnKey: 'status' | 'phase'): BoardLabel => ({
  id,
  columnKey,
  name,
  color: '#000000',
  sortOrder: 0,
  isDefault: false,
  isDone: false,
  isSystem: false,
  archived: false,
  updatedAt: '2026-10-01T00:00:00Z',
});

const LABELS = [label('s1', 'Working on it', 'status'), label('s2', 'Hold', 'status'), label('p1', 'Design', 'phase')];

const project = (over: Partial<BoardProject>): BoardProject => ({
  id: 'p',
  name: 'Someone',
  coordinator: '',
  statusId: null,
  phaseId: null,
  designedDate: null,
  rating: null,
  position: 0,
  createdAt: '2026-10-01T00:00:00Z',
  createdBy: 'Aboud Yousef',
  updatedAt: '2026-10-01T00:00:00Z',
  updatedBy: 'Aboud Yousef',
  schemaVersion: 1,
  ...over,
});

const CTX = { labels: LABELS, installByProject: new Map<string, string | null>(), updateCountById: new Map<string, number>() };

describe('columnDisplayValue', () => {
  test('reads the label NAME for status, not the internal id', () => {
    const p = project({ statusId: 's1' });

    expect(columnDisplayValue(p, 'status', CTX)).toBe('Working on it');
  });

  test('reads the label name for Design/Schedule', () => {
    expect(columnDisplayValue(project({ phaseId: 'p1' }), 'phase', CTX)).toBe('Design');
  });

  test('reads the project name as typed, not lowercased for sorting', () => {
    expect(columnDisplayValue(project({ name: 'ANITA JAY PRASIFKA' }), 'name', CTX)).toBe('ANITA JAY PRASIFKA');
  });

  test('an unset coordinator reads as the empty marker, so it can be filtered for', () => {
    expect(columnDisplayValue(project({ coordinator: '' }), 'coordinator', CTX)).toBe(EMPTY_VALUE);
  });

  test('rating reads as a star count', () => {
    expect(columnDisplayValue(project({ rating: 4 }), 'rating', CTX)).toBe('4★');
  });

  test('install date comes from the linked post, not the project', () => {
    const ctx = { ...CTX, installByProject: new Map<string, string | null>([['pj', '2026-10-27']]) };

    expect(columnDisplayValue(project({ id: 'pj' }), 'installDate', ctx)).toBe('2026-10-27');
  });
});

describe('distinctColumnValues', () => {
  test('lists each value once, sorted, with the empty marker last', () => {
    const rows = [
      project({ id: 'a', coordinator: 'Omar Rajab' }),
      project({ id: 'b', coordinator: 'Anas Yaghmour' }),
      project({ id: 'c', coordinator: 'Omar Rajab' }),
      project({ id: 'd', coordinator: '' }),
    ];

    expect(distinctColumnValues(rows, 'coordinator', CTX)).toEqual(['Anas Yaghmour', 'Omar Rajab', EMPTY_VALUE]);
  });
});

describe('matchesColumnFilters', () => {
  const rows = [
    project({ id: 'a', coordinator: 'Omar Rajab', statusId: 's1' }),
    project({ id: 'b', coordinator: 'Anas Yaghmour', statusId: 's2' }),
    project({ id: 'c', coordinator: 'Omar Rajab', statusId: 's2' }),
  ];

  test('no filters keeps every row', () => {
    expect(rows.filter((p) => matchesColumnFilters(p, {}, CTX))).toHaveLength(3);
  });

  test('a filter on one column keeps only the chosen values', () => {
    const kept = rows.filter((p) => matchesColumnFilters(p, { coordinator: ['Omar Rajab'] }, CTX));

    expect(kept.map((p) => p.id)).toEqual(['a', 'c']);
  });

  test('two columns filter together, not separately', () => {
    const kept = rows.filter((p) => matchesColumnFilters(p, { coordinator: ['Omar Rajab'], status: ['Hold'] }, CTX));

    expect(kept.map((p) => p.id)).toEqual(['c']);
  });

  test('an empty value list on a column is ignored rather than hiding everything', () => {
    expect(rows.filter((p) => matchesColumnFilters(p, { coordinator: [] }, CTX))).toHaveLength(3);
  });
});

describe('normalizeColumnOrder', () => {
  const ALL = ['select', 'name', 'coordinator', 'status', 'rating'];

  test('keeps the pinned columns first whatever was saved', () => {
    const order = normalizeColumnOrder(['rating', 'name', 'select', 'coordinator', 'status'], ALL);

    expect(order.slice(0, PINNED_COLUMNS.length)).toEqual([...PINNED_COLUMNS]);
  });

  test('honours a saved order for the rest', () => {
    expect(normalizeColumnOrder(['rating', 'status', 'coordinator'], ALL)).toEqual([
      'select',
      'name',
      'rating',
      'status',
      'coordinator',
    ]);
  });

  test('appends a column added in a later release rather than dropping it', () => {
    const order = normalizeColumnOrder(['rating', 'coordinator'], [...ALL, 'updates']);

    expect(order).toContain('updates');
    expect(order).toHaveLength(6);
  });

  test('drops a saved column that no longer exists', () => {
    expect(normalizeColumnOrder(['rating', 'removedCol', 'status'], ALL)).not.toContain('removedCol');
  });

  test('a first run with nothing saved returns the natural order', () => {
    expect(normalizeColumnOrder([], ALL)).toEqual(ALL);
  });
});

describe('moveColumn', () => {
  const ALL = ['select', 'name', 'coordinator', 'status', 'rating'];

  test('moves a column to sit where the target was', () => {
    expect(moveColumn(ALL, 'rating', 'coordinator')).toEqual(['select', 'name', 'rating', 'coordinator', 'status']);
  });

  test('moving a column onto itself changes nothing', () => {
    expect(moveColumn(ALL, 'status', 'status')).toEqual(ALL);
  });

  test('refuses to move a pinned column', () => {
    expect(moveColumn(ALL, 'name', 'rating')).toEqual(ALL);
  });

  test('refuses to move a column onto a pinned slot', () => {
    expect(moveColumn(ALL, 'rating', 'name')).toEqual(ALL);
  });
});
