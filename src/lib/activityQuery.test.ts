import { describe, expect, it } from 'vitest';
import type { BoardActivity, BoardProject } from '../board/types';
import { newProject, seedLabels } from './board';
import {
  applyActivityFilter,
  describeFilter,
  hasActivityFilter,
  parseLocalFilter,
  queryContext,
  sanitizeFilter,
  type ActivityFilter,
} from './activityQuery';

const ME = 'Aboud Yousef';
const ROSTER = [ME, 'Omar Rajab', 'Anas Yaghmour'];
const TODAY = '2026-11-05';

const projects: BoardProject[] = [
  { ...newProject('Martha Thompson', ME, seedLabels(), '2026-10-01T00:00:00.000Z'), id: 'p1' },
  { ...newProject('Karan Staggers', ME, seedLabels(), '2026-10-01T00:00:00.000Z'), id: 'p2' },
];

/**
 * `at` is given as a LOCAL wall-clock string so the tests mean what they say
 * whatever timezone they run in — the production code compares local days.
 */
const act = (over: Partial<BoardActivity> & { at: string }): BoardActivity => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  projectId: 'p1',
  actor: ME,
  action: 'update',
  ...over,
  at: new Date(over.at).toISOString(),
});

describe('hasActivityFilter', () => {
  it('an empty filter narrows nothing', () => {
    expect(hasActivityFilter({})).toBe(false);
    expect(hasActivityFilter(null)).toBe(false);
    expect(hasActivityFilter({ actors: [] })).toBe(false);
  });

  it('any one field is enough', () => {
    expect(hasActivityFilter({ from: TODAY })).toBe(true);
    expect(hasActivityFilter({ actors: [ME] })).toBe(true);
    expect(hasActivityFilter({ projectNameContains: 'martha' })).toBe(true);
  });
});

describe('applyActivityFilter', () => {
  const log = [
    act({ id: 'a', at: '2026-11-04T09:00:00', changes: { statusId: { old: 'New project', new: 'Working on it' } } }),
    act({ id: 'b', at: '2026-11-04T10:00:00', changes: { rating: { old: '—', new: '5 stars' } } }),
    act({ id: 'c', at: '2026-11-04T11:00:00', action: 'update-post' }),
    act({ id: 'd', at: '2026-11-04T12:00:00', projectId: 'p2', actor: 'Omar Rajab', action: 'create' }),
    act({ id: 'e', at: '2026-11-05T09:00:00', projectId: 'p2' }),
  ];

  it('an empty filter answers with nothing, not with everything', () => {
    // Returning all 387 projects would look like a result while being useless.
    expect(applyActivityFilter(log, projects, {})).toEqual([]);
    expect(applyActivityFilter(log, projects, null)).toEqual([]);
  });

  it('one calendar day, by the asker\'s own clock', () => {
    const hits = applyActivityFilter(log, projects, { from: '2026-11-04', to: '2026-11-04' });
    expect(hits.map((h) => h.projectId).sort()).toEqual(['p1', 'p2']);
    expect(hits.find((h) => h.projectId === 'p1')!.count).toBe(3);
  });

  it('narrows by actor', () => {
    const hits = applyActivityFilter(log, projects, { actors: ['Omar Rajab'], from: '2026-11-04', to: '2026-11-04' });
    expect(hits.map((h) => h.projectId)).toEqual(['p2']);
  });

  it('narrows by the field that changed', () => {
    const hits = applyActivityFilter(log, projects, { fields: ['statusId'], from: '2026-11-01', to: TODAY });
    expect(hits.map((h) => h.projectId)).toEqual(['p1']);
    expect(hits[0].count).toBe(1);
  });

  it('narrows by action', () => {
    const hits = applyActivityFilter(log, projects, { actions: ['create'], from: '2026-11-01', to: TODAY });
    expect(hits.map((h) => h.projectId)).toEqual(['p2']);
  });

  it('narrows by project name, case-insensitively', () => {
    const hits = applyActivityFilter(log, projects, { projectNameContains: 'MARTHA' });
    expect(hits.map((h) => h.projectId)).toEqual(['p1']);
  });

  it('fields AND dates AND actors all narrow together', () => {
    const hits = applyActivityFilter(log, projects, {
      actors: [ME],
      fields: ['statusId'],
      from: '2026-11-04',
      to: '2026-11-04',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].projectId).toBe('p1');
  });

  it('says what happened, not just that something did', () => {
    const hits = applyActivityFilter(log, projects, { from: '2026-11-04', to: '2026-11-04', actors: [ME] });
    const p1 = hits.find((h) => h.projectId === 'p1')!;
    expect(p1.summary).toContain('changed Status');
    expect(p1.summary).toContain('changed Rating');
    expect(p1.summary).toContain('posted an update');
  });

  it('counts a repeated change rather than listing it twice', () => {
    const repeated = [
      act({ id: 'x', at: '2026-11-04T09:00:00', changes: { statusId: { old: 'a', new: 'b' } } }),
      act({ id: 'y', at: '2026-11-04T10:00:00', changes: { statusId: { old: 'b', new: 'c' } } }),
      act({ id: 'z', at: '2026-11-04T11:00:00', changes: { statusId: { old: 'c', new: 'd' } } }),
    ];
    const hits = applyActivityFilter(repeated, projects, { from: '2026-11-04', to: '2026-11-04' });
    expect(hits[0].summary).toBe('changed Status 3×');
  });

  it('busiest project first, then most recent', () => {
    const hits = applyActivityFilter(log, projects, { from: '2026-11-01', to: TODAY });
    expect(hits[0].projectId).toBe('p1'); // 3 entries vs 2
  });

  it('reports the most recent matching entry, not the first', () => {
    const hits = applyActivityFilter(log, projects, { from: '2026-11-04', to: '2026-11-04', actors: [ME] });
    const p1 = hits.find((h) => h.projectId === 'p1')!;
    expect(p1.lastAt).toBe(new Date('2026-11-04T11:00:00').toISOString());
  });

  it('drops activity for a project that no longer exists', () => {
    const orphan = [act({ id: 'o', at: '2026-11-04T09:00:00', projectId: 'deleted-long-ago' })];
    expect(applyActivityFilter(orphan, projects, { from: '2026-11-04', to: '2026-11-04' })).toEqual([]);
  });

  it('tolerates an absent log', () => {
    expect(applyActivityFilter(undefined, projects, { from: TODAY })).toEqual([]);
  });

  // The whole reason localDateOf exists: an evening edit in the Americas is
  // stamped the NEXT day in UTC, so slicing the timestamp files it wrong.
  it('files an entry under its LOCAL day, not its UTC day', () => {
    const evening = new Date('2026-11-04T21:30:00'); // local
    const log2 = [act({ id: 'late', at: evening.toISOString() })];
    const hits = applyActivityFilter(log2, projects, { from: '2026-11-04', to: '2026-11-04' });
    expect(hits).toHaveLength(1);
  });
});

describe('parseLocalFilter — answering with no model at all', () => {
  const parse = (q: string) => parseLocalFilter(q, ME, ROSTER, TODAY);

  it('yesterday is one day, and it is me', () => {
    expect(parse('what were the projects I interacted with yesterday?')).toEqual({
      from: '2026-11-04',
      to: '2026-11-04',
      actors: [ME],
    });
  });

  it('today', () => {
    expect(parse('what did I do today')).toEqual({ from: TODAY, to: TODAY, actors: [ME] });
  });

  it('this week runs Monday to today', () => {
    // 2026-11-05 is a Thursday, so Monday is the 2nd.
    expect(parse('what have I touched this week')).toEqual({ from: '2026-11-02', to: TODAY, actors: [ME] });
  });

  it('last week is the whole previous Monday-to-Sunday', () => {
    expect(parse('what happened last week')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('"last 7 days" includes today', () => {
    expect(parse('projects changed in the last 7 days')).toEqual({ from: '2026-10-30', to: TODAY });
  });

  it('a named teammate beats "I" — the question is about them', () => {
    expect(parse('what did Omar change yesterday')).toEqual({
      from: '2026-11-04',
      to: '2026-11-04',
      actors: ['Omar Rajab'],
    });
  });

  it('matches a first name on a word boundary, not inside another word', () => {
    // "Anas" must not be found inside a longer word.
    expect(parse('anasarca yesterday')?.actors).toBeUndefined();
    expect(parse('anas yesterday')?.actors).toEqual(['Anas Yaghmour']);
  });

  it('an actor with no date is not an answer — it is "everything, ever"', () => {
    expect(parse('what has Omar been doing')).toBeNull();
  });

  it('returns null when nothing is recognised, rather than guessing', () => {
    expect(parse('which projects have trenching?')).toBeNull();
  });
});

describe('sanitizeFilter — nothing the model invented gets through', () => {
  const ctx = queryContext(ME, ROSTER, TODAY);

  it('drops an actor who is not on the roster', () => {
    // A hallucinated name would narrow to nothing and read as "you did
    // nothing yesterday" — confidently wrong, the worst answer available.
    expect(sanitizeFilter({ actors: ['Someone Invented'] }, ROSTER, ctx).actors).toBeUndefined();
    expect(sanitizeFilter({ actors: [ME, 'Nope'] }, ROSTER, ctx).actors).toEqual([ME]);
  });

  it('drops an unknown field or action', () => {
    expect(sanitizeFilter({ fields: ['vibes'] }, ROSTER, ctx).fields).toBeUndefined();
    expect(sanitizeFilter({ actions: ['explode'] }, ROSTER, ctx).actions).toBeUndefined();
    expect(sanitizeFilter({ fields: ['statusId', 'vibes'] }, ROSTER, ctx).fields).toEqual(['statusId']);
  });

  it('drops a date that is not a date', () => {
    expect(sanitizeFilter({ from: 'yesterday' } as ActivityFilter, ROSTER, ctx).from).toBeUndefined();
    expect(sanitizeFilter({ from: '2026-11-04' }, ROSTER, ctx).from).toBe('2026-11-04');
  });

  it('swaps a backwards range instead of matching nothing', () => {
    const f = sanitizeFilter({ from: '2026-11-05', to: '2026-11-01' }, ROSTER, ctx);
    expect([f.from, f.to]).toEqual(['2026-11-01', '2026-11-05']);
  });

  it('trims a blank project name away entirely', () => {
    expect(sanitizeFilter({ projectNameContains: '   ' }, ROSTER, ctx).projectNameContains).toBeUndefined();
  });

  it('a null or empty filter sanitises to an empty one, which matches nothing', () => {
    expect(sanitizeFilter(null, ROSTER, ctx)).toEqual({});
    expect(hasActivityFilter(sanitizeFilter(undefined, ROSTER, ctx))).toBe(false);
  });
});

describe('queryContext is deliberately tiny', () => {
  it('carries no activity, no updates and no project list', () => {
    const ctx = queryContext(ME, ROSTER, TODAY) as unknown as Record<string, unknown>;
    expect(Object.keys(ctx).sort()).toEqual(['actions', 'fields', 'me', 'roster', 'today']);
  });
});

describe('describeFilter', () => {
  it('says who, when and how many in one line', () => {
    expect(describeFilter({ actors: [ME], from: '2026-11-04', to: '2026-11-04' }, ME, 12)).toBe(
      '12 projects you touched on 2026-11-04.',
    );
  });

  it('names a teammate rather than calling them "you"', () => {
    expect(describeFilter({ actors: ['Omar Rajab'], from: '2026-11-04', to: '2026-11-04' }, ME, 1)).toBe(
      '1 project Omar Rajab touched on 2026-11-04.',
    );
  });

  it('reads a range as a range', () => {
    expect(describeFilter({ from: '2026-11-01', to: '2026-11-04' }, ME, 3)).toContain(
      'between 2026-11-01 and 2026-11-04',
    );
  });

  it('handles an open-ended range and no actor', () => {
    expect(describeFilter({ from: '2026-11-01' }, ME, 2)).toBe('2 projects anyone touched since 2026-11-01.');
  });
});
