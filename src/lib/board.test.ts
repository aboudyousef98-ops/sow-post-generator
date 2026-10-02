import { describe, expect, it } from 'vitest';
import type { BoardProject, BoardState } from '../board/types';
import {
  activityForPatch,
  cleanName,
  defaultLabel,
  emptyBoard,
  findDuplicate,
  labelTextColor,
  labelsFor,
  mergeBoard,
  nameKey,
  newProject,
  patchProject,
  seedLabels,
} from './board';

const T0 = '2026-10-02T10:00:00.000Z';
const T1 = '2026-10-02T11:00:00.000Z';
const T2 = '2026-10-02T12:00:00.000Z';

function proj(over: Partial<BoardProject> = {}): BoardProject {
  return { ...newProject('Martha Thompson', 'Aboud Yousef', seedLabels(), T0), id: over.id ?? 'p1', ...over };
}

describe('labelTextColor', () => {
  it('dark ink on light swatches, white on dark ones', () => {
    expect(labelTextColor('#FFCB00')).toBe('#323338'); // yellow
    expect(labelTextColor('#C4C4C4')).toBe('#323338'); // light grey
    expect(labelTextColor('#BB3354')).toBe('#ffffff'); // dark red
    expect(labelTextColor('#043d4f')).toBe('#ffffff'); // brand navy
  });
  it('falls back to ink on malformed input', () => {
    expect(labelTextColor('red')).toBe('#323338');
  });
});

describe('seed labels', () => {
  it('seeds 3 status + 2 phase, New project is the default', () => {
    const labels = seedLabels();
    expect(labelsFor(labels, 'status').map((l) => l.name)).toEqual(['New project', 'Working on it', 'Done']);
    expect(labelsFor(labels, 'phase').map((l) => l.name)).toEqual(['Design', 'Schedule']);
    expect(defaultLabel(labels, 'status')?.name).toBe('New project');
    expect(labels.find((l) => l.name === 'Done')?.isDone).toBe(true);
  });

  it('a user rename survives merging with a fresh seed (fixed ids, epoch stamp)', () => {
    const base = emptyBoard();
    const renamed = base.labels.map((l) =>
      l.id === 'status-done' ? { ...l, name: 'Shipped', updatedAt: T1 } : l,
    );
    const merged = mergeBoard({ ...base, labels: renamed }, emptyBoard());
    expect(merged.labels.find((l) => l.id === 'status-done')?.name).toBe('Shipped');
    expect(merged.labels.filter((l) => l.columnKey === 'status')).toHaveLength(3);
  });
});

describe('mergeBoard', () => {
  it('newer updatedAt wins per project; unknown rows are added', () => {
    const a = proj({ name: 'Old', updatedAt: T0 });
    const b = { ...a, name: 'New', updatedAt: T1 };
    const other = proj({ id: 'p2', name: 'Second' });
    const merged = mergeBoard(
      { ...emptyBoard(), projects: [a] },
      { projects: [b, other] },
    );
    expect(merged.projects.find((p) => p.id === 'p1')?.name).toBe('New');
    expect(merged.projects).toHaveLength(2);
  });

  it('a tombstone with a newer stamp wins the merge (delete propagates)', () => {
    const alive = proj({ updatedAt: T0 });
    const dead = { ...alive, deletedAt: T1, updatedAt: T1 };
    const merged = mergeBoard({ ...emptyBoard(), projects: [dead] }, { projects: [alive] });
    expect(merged.projects[0].deletedAt).toBe(T1);
  });

  it('activity is a union by id, newest first, never duplicated', () => {
    const e1 = { id: 'a1', projectId: 'p1', actor: 'A', action: 'create' as const, at: T0 };
    const e2 = { id: 'a2', projectId: 'p1', actor: 'B', action: 'update' as const, at: T1 };
    const merged = mergeBoard(
      { ...emptyBoard(), activity: [e1] },
      { activity: [e1, e2] },
    );
    expect(merged.activity.map((a) => a.id)).toEqual(['a2', 'a1']);
  });
});

describe('duplicate guard', () => {
  it('collapses case and repeated spaces (T6)', () => {
    expect(nameKey('martha  thompson ')).toBe('martha thompson');
    expect(cleanName('  martha  thompson ')).toBe('martha thompson');
    const existing = proj({ name: 'Martha Thompson' });
    expect(findDuplicate([existing], 'martha  thompson')?.id).toBe('p1');
  });
  it('ignores archived and deleted rows', () => {
    const archived = proj({ archivedAt: T1 });
    expect(findDuplicate([archived], 'Martha Thompson')).toBeUndefined();
  });
});

describe('newProject / patchProject', () => {
  it('defaults: status = default label, coordinator = author, newest on top', () => {
    const p = newProject('  Test   Project ', 'Omar Rajab', seedLabels(), T1);
    expect(p.name).toBe('Test Project');
    expect(p.statusId).toBe('status-new');
    expect(p.coordinator).toBe('Omar Rajab');
    expect(p.position).toBe(Date.parse(T1));
    expect(p.rating).toBeNull();
  });
  it('patch stamps updatedAt/updatedBy and never mutates', () => {
    const p = proj();
    const next = patchProject(p, { rating: 2 }, 'Omar Rajab', T2);
    expect(next.rating).toBe(2);
    expect(next.updatedBy).toBe('Omar Rajab');
    expect(next.updatedAt).toBe(T2);
    expect(p.rating).toBeNull();
  });
});

describe('activityForPatch', () => {
  it('records only changed fields, with label names resolved', () => {
    const labels = seedLabels();
    const p = proj();
    const entry = activityForPatch(p, { statusId: 'status-working', rating: null }, 'Omar Rajab', labels, T2);
    expect(entry).not.toBeNull();
    expect(entry!.changes).toEqual({
      statusId: { old: 'New project', new: 'Working on it' },
    });
    expect(entry!.actor).toBe('Omar Rajab');
  });
  it('returns null when nothing actually changed', () => {
    const p = proj();
    expect(activityForPatch(p, { rating: null }, 'X', seedLabels(), T2)).toBeNull();
  });
});

describe('BoardState shape', () => {
  it('emptyBoard matches the store contract', () => {
    const b: BoardState = emptyBoard();
    expect(b.projects).toEqual([]);
    expect(b.activity).toEqual([]);
    expect(b.labels.length).toBe(5);
  });
});
