import { describe, expect, it } from 'vitest';
import type { BoardProject } from '../board/types';
import { seedLabels } from './board';
import type { LinkedPosts } from './board';
import {
  GROUP_OPTIONS,
  NO_FILTERS,
  agingState,
  daysSince,
  groupProjects,
  installDateOf,
  idsBetween,
  isPresetActive,
  selectedRows,
  sortByStatus,
  statusBand,
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
    // Grouping inherits the pipeline rank for free, which is the reason the
    // always-ordered board reuses label order instead of its own list.
    expect(groups.map((g) => g.title)).toEqual(['Done', 'New project', 'Not set']);
    expect(groups[1].color).toBe('#579BFC');
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
  it('offers All active, Mine, Needs scheduling, Scheduled and Needs attention', () => {
    expect(viewPresets(LABELS).map((v) => v.id)).toEqual(['all', 'mine', 'needs-schedule', 'scheduled', 'attention']);
  });

  it('hides Needs scheduling when the Design label is gone', () => {
    const without = LABELS.filter((l) => l.id !== 'phase-design');
    expect(viewPresets(without).map((v) => v.id)).not.toContain('needs-schedule');
  });

  it('Scheduled filters to the Schedule phase and sorts by install date, soonest first', () => {
    const scheduled = viewPresets(LABELS).find((v) => v.id === 'scheduled')!;
    expect(scheduled.patch).toEqual({ phaseIds: ['phase-schedule'] });
    expect(scheduled.sort).toEqual([{ id: 'installDate', desc: false }]);
  });

  it('hides Scheduled when the Schedule label is gone', () => {
    const without = LABELS.filter((l) => l.id !== 'phase-schedule');
    expect(viewPresets(without).map((v) => v.id)).not.toContain('scheduled');
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

// ---- Installation Review section (Aboud 2026-11-03) ------------------------
// A fourth section, driven by a label flag exactly like out-of-scope, so the
// section can be pointed at a different status later without a code change.

describe('splitSections — Installation Review', () => {
  const review = { ...LABELS[0], id: 'rev', name: 'Installation Review', isDefault: false, review: true };
  const hold = { ...LABELS[0], id: 'hold', name: 'Hold', isDefault: false, outOfScope: undefined };
  const labels = [...LABELS, review, hold];

  it('gives review rows their own section, out of the active table', () => {
    const rows = [
      p({ id: 'a', statusId: 'status-working' }),
      p({ id: 'b', statusId: 'rev' }),
      p({ id: 'c', statusId: 'hold' }),
      p({ id: 'd', statusId: 'status-done' }),
    ];
    const { active, installReview, outOfScope, completed } = splitSections(rows, labels);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(installReview.map((r) => r.id)).toEqual(['b']);
    expect(outOfScope.map((r) => r.id)).toEqual(['c']);
    expect(completed.map((r) => r.id)).toEqual(['d']);
  });

  it('matches by name when no flag is stored, so the label works out of the box', () => {
    const unflagged = [{ ...LABELS[0], id: 'r2', name: 'Installation Review', isDefault: false }];
    const { active, installReview } = splitSections([p({ id: 'a', statusId: 'r2' })], [...LABELS, ...unflagged]);
    expect(active).toHaveLength(0);
    expect(installReview.map((r) => r.id)).toEqual(['a']);
  });

  it('an explicit review:false beats the name default', () => {
    const kept = [{ ...LABELS[0], id: 'r3', name: 'Installation Review', isDefault: false, review: false }];
    const { active, installReview } = splitSections([p({ id: 'a', statusId: 'r3' })], [...LABELS, ...kept]);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(installReview).toHaveLength(0);
  });

  it('works on any label name once the flag is ticked', () => {
    const custom = [{ ...LABELS[0], id: 'qa', name: 'QA pass', isDefault: false, review: true }];
    const { active, installReview } = splitSections([p({ id: 'a', statusId: 'qa' })], [...LABELS, ...custom]);
    expect(active).toHaveLength(0);
    expect(installReview.map((r) => r.id)).toEqual(['a']);
  });

  it('Done still wins over Review, and Review wins over out-of-scope', () => {
    const both = [{ ...LABELS[0], id: 'x', name: 'Odd', isDefault: false, isDone: true, review: true }];
    const rev = [{ ...LABELS[0], id: 'y', name: 'Odd2', isDefault: false, review: true, outOfScope: true }];
    const s = splitSections([p({ id: 'a', statusId: 'x' }), p({ id: 'b', statusId: 'y' })], [...LABELS, ...both, ...rev]);
    expect(s.completed.map((r) => r.id)).toEqual(['a']);
    expect(s.installReview.map((r) => r.id)).toEqual(['b']);
    expect(s.outOfScope).toHaveLength(0);
  });

  it('a board with no review label leaves the section empty and the table untouched', () => {
    const { active, installReview } = splitSections([p({ id: 'a', statusId: 'status-working' })], LABELS);
    expect(active.map((r) => r.id)).toEqual(['a']);
    expect(installReview).toEqual([]);
  });
});

describe('Group by reviewer', () => {
  it('is offered as a grouping option', () => {
    expect(GROUP_OPTIONS.map((g) => g.key)).toContain('reviewer');
  });
});

// Aboud 2026-11-05: "my coworkers wanted a always ordered board" — Working on
// it first, New project last. The rank is the team's own label order, so this
// is about reading sortOrder correctly, not about a list baked into the code.
describe('sortByStatus', () => {
  const statuses = [
    { ...LABELS.find((l) => l.id === 'status-working')!, sortOrder: 10 },
    { ...LABELS.find((l) => l.id === 'status-done')!, sortOrder: 20 },
    { ...LABELS.find((l) => l.id === 'status-new')!, sortOrder: 30 },
  ];

  it('follows the label order, whatever that order happens to be', () => {
    const rows = [
      p({ id: 'new', statusId: 'status-new' }),
      p({ id: 'done', statusId: 'status-done' }),
      p({ id: 'working', statusId: 'status-working' }),
    ];
    expect(sortByStatus(rows, statuses).map((r) => r.id)).toEqual(['working', 'done', 'new']);
  });

  it('re-ranks when the team reorders the labels — nothing is hardcoded', () => {
    const flipped = statuses.map((l) => ({ ...l, sortOrder: 40 - l.sortOrder }));
    const rows = [p({ id: 'working', statusId: 'status-working' }), p({ id: 'new', statusId: 'status-new' })];
    expect(sortByStatus(rows, flipped).map((r) => r.id)).toEqual(['new', 'working']);
  });

  it('manual drag order still decides inside one status', () => {
    const rows = [
      p({ id: 'low', statusId: 'status-working', position: 1 }),
      p({ id: 'high', statusId: 'status-working', position: 9 }),
      p({ id: 'mid', statusId: 'status-working', position: 5 }),
    ];
    expect(sortByStatus(rows, statuses).map((r) => r.id)).toEqual(['high', 'mid', 'low']);
  });

  it('a row with no status, or an unknown one, sorts last rather than first', () => {
    const rows = [
      p({ id: 'none', statusId: null, position: 9 }),
      p({ id: 'ghost', statusId: 'status-archived-long-ago', position: 9 }),
      p({ id: 'new', statusId: 'status-new', position: 1 }),
    ];
    const ids = sortByStatus(rows, statuses).map((r) => r.id);
    expect(ids[0]).toBe('new');
    expect(ids.slice(1).sort()).toEqual(['ghost', 'none']);
  });

  it('never mutates the array it was given', () => {
    const rows = [p({ id: 'new', statusId: 'status-new' }), p({ id: 'working', statusId: 'status-working' })];
    const before = rows.map((r) => r.id);
    sortByStatus(rows, statuses);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it('phase labels never rank a row — only status does', () => {
    const rows = [p({ id: 'a', statusId: 'phase-design' })];
    // phase-design is in LABELS but is not a status, so it cannot be a rank.
    expect(sortByStatus(rows, LABELS).map((r) => r.id)).toEqual(['a']);
  });
});

// Aboud 2026-11-05: "ctrl + select to select multi row, shift and select to
// select the first row and last row and then everything will be selected".
describe('idsBetween — what Shift-click selects', () => {
  const rows = [p({ id: 'a' }), p({ id: 'b' }), p({ id: 'c' }), p({ id: 'd' }), p({ id: 'e' })];

  it('takes everything from the anchor to the target, inclusive', () => {
    expect(idsBetween(rows, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('works upwards as well as downwards', () => {
    // Clicking ABOVE the anchor must select upwards, like every file list.
    expect(idsBetween(rows, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('anchor === target selects just that row', () => {
    expect(idsBetween(rows, 'c', 'c')).toEqual(['c']);
  });

  it('spans the whole list', () => {
    expect(idsBetween(rows, 'a', 'e')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('with no anchor yet, selects only the clicked row', () => {
    expect(idsBetween(rows, null, 'c')).toEqual(['c']);
  });

  it('an anchor a filter has since hidden falls back to the clicked row', () => {
    // Silently selecting nothing would read as a broken Shift-click.
    expect(idsBetween(rows, 'gone', 'c')).toEqual(['c']);
  });

  it('a target that is not on screen selects nothing', () => {
    expect(idsBetween(rows, 'a', 'gone')).toEqual([]);
  });

  it('follows DISPLAYED order, not id order', () => {
    const reordered = [p({ id: 'e' }), p({ id: 'a' }), p({ id: 'c' })];
    expect(idsBetween(reordered, 'e', 'c')).toEqual(['e', 'a', 'c']);
  });
});

// Auto-sort stays ON and a drag may only reorder rows inside their own status
// (Aboud 2026-11-05). The band is what a drop is measured against.
describe('statusBand', () => {
  const rows = [
    p({ id: 'w1', statusId: 'working' }),
    p({ id: 'w2', statusId: 'working' }),
    p({ id: 'n1', statusId: 'new' }),
    p({ id: 'n2', statusId: 'new' }),
  ];

  it('returns only the rows of that status, in displayed order', () => {
    expect(statusBand(rows, 'working').map((r) => r.id)).toEqual(['w1', 'w2']);
    expect(statusBand(rows, 'new').map((r) => r.id)).toEqual(['n1', 'n2']);
  });

  it('a status with no rows is an empty band, not an error', () => {
    expect(statusBand(rows, 'done')).toEqual([]);
  });

  it('rows with no status form their own band', () => {
    const withNull = [...rows, p({ id: 'x', statusId: null })];
    expect(statusBand(withNull, null).map((r) => r.id)).toEqual(['x']);
  });
});
