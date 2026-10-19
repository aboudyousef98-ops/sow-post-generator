import { describe, expect, it } from 'vitest';
import type { BoardProject } from '../board/types';
import { seedLabels } from './board';
import type { LinkedPosts } from './board';
import {
  NO_FILTERS,
  agingState,
  daysSince,
  groupProjects,
  installDateOf,
  isPresetActive,
  selectedRows,
  splitSections,
  viewPresets,
} from './boardViews';
import type { PostRecord } from '../types';

const LABELS = seedLabels();
const TODAY = '2026-10-08';

function p(over: Partial<BoardProject> = {}): BoardProject {
  return {
    id: over.id ?? 'p1',
    name: 'Smith Residence',
    coordinator: '',
    statusId: null,
    phaseId: null,
    designedDate: null,
    rating: null,
    position: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'Aboud Yousef',
    updatedAt: '2026-10-08T00:00:00.000Z',
    updatedBy: 'Aboud Yousef',
    schemaVersion: 1,
    ...over,
  };
}

function post(installIso: string, over: Partial<PostRecord> = {}): PostRecord {
  return { sf: { installScheduledDate: installIso }, ...over } as unknown as PostRecord;
}

describe('installDateOf', () => {
  it('prefers the posted record over the draft (same rule as Daily Progress)', () => {
    const lp: LinkedPosts = { draft: post('2026-11-01'), posted: post('2026-10-20') };
    expect(installDateOf(lp)).toBe('2026-10-20');
  });

  it('falls back to the draft when nothing is posted', () => {
    expect(installDateOf({ draft: post('2026-11-01') })).toBe('2026-11-01');
  });

  it('is null when there is no link, or the date is blank', () => {
    expect(installDateOf(undefined)).toBeNull();
    expect(installDateOf({})).toBeNull();
    expect(installDateOf({ draft: post('') })).toBeNull();
  });
});

describe('splitSections', () => {
  // The live board's own labels (ids from the real store), plus the seeds.
  const hold = { ...LABELS[0], id: 'hold', name: 'Hold', isDefault: false, outOfScope: undefined };
  const sonnen = { ...LABELS[0], id: 'sonnen', name: 'Sonnen', isDefault: false, outOfScope: undefined };
  const enphase = { ...LABELS[0], id: 'enphase', name: 'ENPHASE', isDefault: false, outOfScope: undefined };
  const labels = [...LABELS, hold, sonnen, enphase];

  it('puts Hold / Sonnen / ENPHASE in their own section, with no stored flag', () => {
    const rows = [
      p({ id: 'a', statusId: 'status-working' }),
      p({ id: 'b', statusId: 'hold' }),
      p({ id: 'c', statusId: 'sonnen' }),
      p({ id: 'd', statusId: 'enphase' }),
      p({ id: 'e', statusId: 'status-done' }),
    ];
    const { active, outOfScope, completed } = splitSections(rows, labels);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(outOfScope.map((r) => r.id).sort()).toEqual(['b', 'c', 'd']);
    expect(completed.map((r) => r.id)).toEqual(['e']);
  });

  it('matches the default names case- and space-insensitively', () => {
    const odd = [{ ...hold, id: 'x', name: '  hOlD ' }];
    const { active, outOfScope } = splitSections([p({ id: 'a', statusId: 'x' })], [...labels, ...odd]);
    expect(active).toHaveLength(0);
    expect(outOfScope.map((r) => r.id)).toEqual(['a']);
  });

  it('an explicit outOfScope:false beats the name default', () => {
    const kept = [{ ...hold, outOfScope: false }];
    const { active, outOfScope } = splitSections([p({ id: 'a', statusId: 'hold' })], [...LABELS, ...kept]);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(outOfScope).toHaveLength(0);
  });

  it('out-of-scope works on any label name once the flag is ticked', () => {
    const custom = [{ ...LABELS[0], id: 'ot', name: 'OVERTIME', isDefault: false, outOfScope: true }];
    const { active, outOfScope } = splitSections([p({ id: 'a', statusId: 'ot' })], [...LABELS, ...custom]);
    expect(active).toHaveLength(0);
    expect(outOfScope.map((r) => r.id)).toEqual(['a']);
  });

  it('done wins when a label somehow claims both', () => {
    const both = [{ ...hold, isDone: true, outOfScope: true }];
    const { outOfScope, completed } = splitSections([p({ id: 'a', statusId: 'hold' })], [...LABELS, ...both]);
    expect(outOfScope).toHaveLength(0);
    expect(completed.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps the incoming order in active, and sorts the other two newest-first', () => {
    const rows = [
      p({ id: 'a2', statusId: 'status-working', position: 2 }),
      p({ id: 'a1', statusId: 'status-working', position: 1 }),
      p({ id: 's-old', statusId: 'hold', updatedAt: '2026-10-01T00:00:00.000Z' }),
      p({ id: 's-new', statusId: 'hold', updatedAt: '2026-10-18T00:00:00.000Z' }),
    ];
    const { active, outOfScope } = splitSections(rows, labels);
    expect(active.map((r) => r.id)).toEqual(['a2', 'a1']);
    expect(outOfScope.map((r) => r.id)).toEqual(['s-new', 's-old']);
  });

  it('a row with no status, or an unknown one, stays active', () => {
    const { active } = splitSections([p({ id: 'a' }), p({ id: 'b', statusId: 'gone' })], labels);
    expect(active.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('daysSince', () => {
  it('counts whole days and ignores the time part', () => {
    expect(daysSince('2026-10-01T23:59:00.000Z', TODAY)).toBe(7);
    expect(daysSince('2026-10-08T00:00:00.000Z', TODAY)).toBe(0);
  });

  it('is negative for the future', () => {
    expect(daysSince('2026-10-10', TODAY)).toBe(-2);
  });

  it('returns 0 rather than NaN on junk', () => {
    expect(daysSince('not-a-date', TODAY)).toBe(0);
  });
});

describe('agingState', () => {
  it('flags a project whose install date has already passed as overdue', () => {
    expect(agingState(p(), '2026-10-01', TODAY)).toBe('overdue');
  });

  it('does not flag an install date that is today or still ahead', () => {
    expect(agingState(p(), TODAY, TODAY)).toBe('none');
    expect(agingState(p(), '2026-10-20', TODAY)).toBe('none');
  });

  it('flags a row nobody has touched for 14 days as stale', () => {
    expect(agingState(p({ updatedAt: '2026-09-24T00:00:00.000Z' }), null, TODAY)).toBe('stale');
  });

  it('leaves a freshly-touched row alone', () => {
    expect(agingState(p({ updatedAt: '2026-10-07T00:00:00.000Z' }), null, TODAY)).toBe('none');
  });

  it('overdue beats stale — a missed install is the louder problem', () => {
    expect(agingState(p({ updatedAt: '2026-01-01T00:00:00.000Z' }), '2026-02-01', TODAY)).toBe('overdue');
  });

  it('honours a custom threshold', () => {
    expect(agingState(p({ updatedAt: '2026-10-05T00:00:00.000Z' }), null, TODAY, 3)).toBe('stale');
  });
});

describe('groupProjects', () => {
  it('none → one unnamed group holding every row, order untouched', () => {
    const rows = [p({ id: 'a' }), p({ id: 'b' })];
    const groups = groupProjects(rows, 'none', LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('status → label order, with the colour, "Not set" last', () => {
    const rows = [
      p({ id: 'none' }),
      p({ id: 'done', statusId: 'status-done' }),
      p({ id: 'new', statusId: 'status-new' }),
    ];
    const groups = groupProjects(rows, 'status', LABELS);
    expect(groups.map((g) => g.title)).toEqual(['New project', 'Done', 'Not set']);
    expect(groups[0].color).toBe('#579BFC');
    expect(groups[2].rows.map((r) => r.id)).toEqual(['none']);
  });

  it('drops groups that have no rows', () => {
    const groups = groupProjects([p({ statusId: 'status-new' })], 'status', LABELS);
    expect(groups.map((g) => g.title)).toEqual(['New project']);
  });

  it('coordinator → alphabetical, Unassigned last', () => {
    const rows = [
      p({ id: 'o', coordinator: 'Omar Rajab' }),
      p({ id: 'x', coordinator: '' }),
      p({ id: 'a', coordinator: 'Anas Yaghmour' }),
    ];
    const groups = groupProjects(rows, 'coordinator', LABELS);
    expect(groups.map((g) => g.title)).toEqual(['Anas Yaghmour', 'Omar Rajab', 'Unassigned']);
  });

  it('keeps the incoming row order inside each group', () => {
    const rows = [
      p({ id: 'b', statusId: 'status-new' }),
      p({ id: 'a', statusId: 'status-new' }),
    ];
    expect(groupProjects(rows, 'status', LABELS)[0].rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('a row carrying an unknown/archived label still shows, after the known ones', () => {
    const rows = [p({ id: 'ghost', statusId: 'status-retired' }), p({ id: 'new', statusId: 'status-new' })];
    const groups = groupProjects(rows, 'status', LABELS);
    expect(groups.map((g) => g.title)).toEqual(['New project', 'Unknown']);
  });

  it('every row survives grouping — nothing is silently dropped', () => {
    const rows = [p({ id: 'a' }), p({ id: 'b', statusId: 'status-new' }), p({ id: 'c', coordinator: 'Omar Rajab' })];
    for (const by of ['none', 'status', 'coordinator', 'phase'] as const) {
      const total = groupProjects(rows, by, LABELS).reduce((n, g) => n + g.rows.length, 0);
      expect(total).toBe(3);
    }
  });
});

describe('viewPresets', () => {
  it('offers All active, Mine, Needs scheduling and Needs attention', () => {
    expect(viewPresets(LABELS).map((v) => v.id)).toEqual(['all', 'mine', 'needs-schedule', 'attention']);
  });

  it('hides Needs scheduling when the Design label is gone', () => {
    const without = LABELS.filter((l) => l.id !== 'phase-design');
    expect(viewPresets(without).map((v) => v.id)).not.toContain('needs-schedule');
  });

  it('uses the team’s own label name in the Needs-scheduling title', () => {
    const renamed = LABELS.map((l) => (l.id === 'phase-design' ? { ...l, name: 'Drafting' } : l));
    expect(viewPresets(renamed).find((v) => v.id === 'needs-schedule')?.title).toContain('Drafting');
  });
});

describe('isPresetActive', () => {
  it('matches the preset it came from, and only that one', () => {
    const presets = viewPresets(LABELS);
    const mine = presets.find((v) => v.id === 'mine')!;
    const filters = { ...NO_FILTERS, ...mine.patch };
    expect(isPresetActive(filters, mine)).toBe(true);
    expect(isPresetActive(filters, presets.find((v) => v.id === 'all')!)).toBe(false);
  });

  it('All active matches a clean slate', () => {
    expect(isPresetActive(NO_FILTERS, viewPresets(LABELS)[0])).toBe(true);
  });

  it('stops matching once anything else is filtered', () => {
    const mine = viewPresets(LABELS).find((v) => v.id === 'mine')!;
    expect(isPresetActive({ ...NO_FILTERS, mine: true, search: 'smith' }, mine)).toBe(false);
  });

  it('ignores array order', () => {
    const preset = { id: 'x', label: 'x', title: 'x', patch: { statusIds: ['a', 'b'] } };
    expect(isPresetActive({ ...NO_FILTERS, statusIds: ['b', 'a'] }, preset)).toBe(true);
  });
});

describe('selectedRows', () => {
  it('returns only selected rows that are still on screen', () => {
    const rows = [p({ id: 'a' }), p({ id: 'b' })];
    expect(selectedRows(rows, { a: true, gone: true }).map((r) => r.id)).toEqual(['a']);
  });

  it('ignores ids explicitly set to false', () => {
    expect(selectedRows([p({ id: 'a' })], { a: false })).toEqual([]);
  });
});
