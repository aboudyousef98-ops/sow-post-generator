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
  linkedPosts,
  matchProjectByCustomer,
  mergeBoard,
  nameKey,
  newProject,
  patchProject,
  positionForMove,
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
  it('ignores position — reorders are not activity noise', () => {
    const p = proj();
    expect(activityForPatch(p, { position: 42 }, 'X', seedLabels(), T2)).toBeNull();
  });
});

describe('positionForMove', () => {
  // Displayed order is position-DESC: a (top) … c (bottom).
  const rows = [
    proj({ id: 'a', position: 3000 }),
    proj({ id: 'b', position: 2000 }),
    proj({ id: 'c', position: 1000 }),
  ];

  it('midpoint between the new neighbours', () => {
    expect(positionForMove(rows, 2, 1)).toBe(2500); // c dropped between a and b
  });
  it('dropped on top: lands above the current max', () => {
    expect(positionForMove(rows, 2, 0)!).toBeGreaterThan(3000);
  });
  it('dropped at the bottom: lands below the current min', () => {
    expect(positionForMove(rows, 0, 3)!).toBeLessThan(1000);
  });
  it('dropping a row where it already sits is a no-op', () => {
    expect(positionForMove(rows, 1, 1)).toBeNull(); // before itself
    expect(positionForMove(rows, 1, 2)).toBeNull(); // right after itself
  });
});

describe('linkedPosts', () => {
  const rec = (over: Record<string, unknown>) =>
    ({ id: 'r', status: 'draft', updatedAt: T0, projectId: 'p1', ...over }) as never;

  it('picks the newest draft and the newest posted, ignoring other projects and deleted', () => {
    const result = linkedPosts(
      [
        rec({ id: 'd1', updatedAt: T0 }),
        rec({ id: 'd2', updatedAt: T1 }),
        rec({ id: 'dead', updatedAt: T2, deletedAt: T2 }),
        rec({ id: 'other', updatedAt: T2, projectId: 'p2' }),
        rec({ id: 'po1', status: 'posted', postedAt: T0 }),
        rec({ id: 'po2', status: 'posted', postedAt: T1 }),
      ],
      'p1',
    );
    expect(result.draft?.id).toBe('d2');
    expect(result.posted?.id).toBe('po2');
  });

  it('returns empty for an unlinked project', () => {
    expect(linkedPosts([rec({})], 'p9')).toEqual({});
  });
});

describe('matchProjectByCustomer', () => {
  it('matches case/space-insensitively, skips archived rows', () => {
    const row = proj({ name: 'Martha Thompson' });
    expect(matchProjectByCustomer([row], ' martha  THOMPSON ')?.id).toBe('p1');
    expect(matchProjectByCustomer([proj({ archivedAt: T1 })], 'Martha Thompson')).toBeUndefined();
    expect(matchProjectByCustomer([row], '')).toBeUndefined();
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

describe('Salesforce notes on the board (Aboud 2026-10-21)', () => {
  const NOTES = { alerts: 'Tree trims.', utilityDesign: 'Main breaker.' };

  it('activityForPatch logs a notes change as a section summary, not the full text', () => {
    const entry = activityForPatch(
      proj(),
      { sfNotes: NOTES, sfNotesAt: T2 },
      'Omar Rajab',
      seedLabels(),
      T2,
    )!;
    expect(entry.changes!.sfNotes).toEqual({
      old: '—',
      new: 'Scheduling alerts · Utility — design requirements',
    });
    expect(entry.changes!.sfNotesAt).toBeUndefined(); // timestamp is not activity noise
  });

  it('clearing the notes logs back to the em dash', () => {
    const entry = activityForPatch(
      proj({ sfNotes: NOTES }),
      { sfNotes: undefined, sfNotesAt: T2 },
      'Omar Rajab',
      seedLabels(),
      T2,
    )!;
    expect(entry.changes!.sfNotes.old).toBe('Scheduling alerts · Utility — design requirements');
    expect(entry.changes!.sfNotes.new).toBe('—');
  });

  it('equal notes are not a change, even as different objects', () => {
    const entry = activityForPatch(
      proj({ sfNotes: NOTES }),
      { sfNotes: { ...NOTES }, sfNotesAt: T2 },
      'Omar Rajab',
      seedLabels(),
      T2,
    );
    expect(entry).toBeNull();
  });

  it('patchProject can clear the notes with an explicit undefined', () => {
    const cleared = patchProject(proj({ sfNotes: NOTES, sfNotesAt: T1 }), { sfNotes: undefined }, 'X', T2);
    expect(cleared.sfNotes).toBeUndefined();
  });
});

describe('activity cap', () => {
  it('holds 5000 entries — a 62-row import must not truncate real history (was 1000)', () => {
    const activity = Array.from({ length: 5100 }, (_, i) => ({
      id: `a${i}`,
      projectId: 'p1',
      actor: 'X',
      action: 'update' as const,
      at: new Date(1700000000000 + i * 1000).toISOString(),
    }));
    const merged = mergeBoard({ ...emptyBoard(), activity }, {});
    expect(merged.activity).toHaveLength(5000);
  });
});
