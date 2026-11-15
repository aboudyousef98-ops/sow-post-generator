import { describe, expect, it } from 'vitest';
import { emptyBoard, mergeBoard } from './board';
import {
  canEditColumn,
  HIDEABLE_COLUMNS,
  isColumnHidden,
  MANAGEABLE_COLUMNS,
  permFor,
  setPerm,
} from './columnPerms';
import type { ColumnPerm } from '../board/types';

const T0 = '2026-11-15T10:00:00.000Z';
const T1 = '2026-11-15T11:00:00.000Z';

const perm = (over: Partial<ColumnPerm>): ColumnPerm => ({
  id: 'rating',
  columnKey: 'rating',
  updatedAt: T0,
  updatedBy: 'aboudyousef',
  ...over,
});

describe('canEditColumn', () => {
  it('absent rule or absent editors list means EVERYONE edits — the no-migration default', () => {
    expect(canEditColumn(undefined, 'rating', 'khaled', false)).toBe(true);
    expect(canEditColumn([], 'rating', 'khaled', false)).toBe(true);
    expect(canEditColumn([perm({})], 'rating', 'khaled', false)).toBe(true);
  });

  it('a named editors list closes the column to everyone else', () => {
    const perms = [perm({ editors: ['mrefai'] })];
    expect(canEditColumn(perms, 'rating', 'mrefai', false)).toBe(true);
    expect(canEditColumn(perms, 'rating', 'khaled', false)).toBe(false);
    // Other columns stay open.
    expect(canEditColumn(perms, 'status', 'khaled', false)).toBe(true);
  });

  it('admins always edit, and a tombstoned rule resets to everyone', () => {
    const perms = [perm({ editors: ['mrefai'] })];
    expect(canEditColumn(perms, 'rating', 'aboudyousef', true)).toBe(true);
    const reset = [perm({ editors: ['mrefai'], deletedAt: T1, updatedAt: T1 })];
    expect(canEditColumn(reset, 'rating', 'khaled', false)).toBe(true);
  });
});

describe('isColumnHidden', () => {
  it('hidden only for the named usernames; admins always see everything', () => {
    const perms = [perm({ hiddenFor: ['khaled'] })];
    expect(isColumnHidden(perms, 'rating', 'khaled', false)).toBe(true);
    expect(isColumnHidden(perms, 'rating', 'mrefai', false)).toBe(false);
    expect(isColumnHidden(perms, 'rating', 'khaled', true)).toBe(false);
    expect(isColumnHidden(undefined, 'rating', 'khaled', false)).toBe(false);
  });
});

describe('setPerm', () => {
  it('upserts by columnKey with a fresh merge stamp', () => {
    const one = setPerm([], 'rating', { editors: ['mrefai'] }, 'aboudyousef', T0);
    expect(permFor(one, 'rating')?.editors).toEqual(['mrefai']);
    const two = setPerm(one, 'rating', { hiddenFor: ['khaled'] }, 'aboudyousef', T1);
    expect(two).toHaveLength(1);
    expect(permFor(two, 'rating')?.editors).toEqual(['mrefai']); // patch merges, not replaces
    expect(permFor(two, 'rating')?.hiddenFor).toEqual(['khaled']);
    expect(permFor(two, 'rating')?.updatedAt).toBe(T1);
  });
});

describe('column registry', () => {
  it('covers the editable board columns; name is editable but never hideable', () => {
    const keys = MANAGEABLE_COLUMNS.map((c) => c.key);
    for (const k of ['name', 'coordinator', 'reviewer', 'status', 'predesignStatus', 'phase', 'designedDate', 'rating']) {
      expect(keys).toContain(k);
    }
    expect(HIDEABLE_COLUMNS.map((c) => c.key)).not.toContain('name');
  });
});

describe('mergeBoard carries columnPerms', () => {
  it('newer updatedAt wins per column, absent key tolerated', () => {
    const a = perm({ editors: ['mrefai'] });
    const b = perm({ editors: ['mrefai', 'khaled'], updatedAt: T1 });
    expect(mergeBoard({ ...emptyBoard(), columnPerms: [a] }, { columnPerms: [b] }).columnPerms).toEqual([b]);
    expect(mergeBoard(emptyBoard(), {}).columnPerms).toEqual([]);
  });
});
