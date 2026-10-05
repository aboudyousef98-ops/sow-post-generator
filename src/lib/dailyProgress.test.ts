// Daily Progress report (Admin › Daily Progress) — pure logic.
// Section 1: Design-phase projects designed on the picked date.
// Section 2: Schedule-phase projects designed on that SAME picked date, each
// showing its linked post's install date, plus a flagged "no date yet" bucket.

import { describe, expect, it } from 'vitest';
import type { BoardProject, BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { emptyBoard, newProject, seedLabels } from './board';
import { makeRecord } from './__fixtures__/makeRecord';
import { designedOn, formatDailyReport, parseUpdates, scheduledOn, shortDate } from './dailyProgress';

const T0 = '2026-10-02T10:00:00.000Z';

function proj(over: Partial<BoardProject> = {}): BoardProject {
  return { ...newProject('Martha Thompson', 'Aboud Yousef', seedLabels(), T0), id: 'p1', ...over };
}

function board(projects: BoardProject[]): BoardState {
  return { ...emptyBoard(), projects };
}

/** A posted record linked to a project, installing on `date`. */
function postedFor(projectId: string, date: string, over: Partial<PostRecord> = {}): PostRecord {
  return makeRecord({
    id: `rec-${projectId}-${date}`,
    status: 'posted',
    postedAt: T0,
    projectId,
    sf: { ...makeRecord().sf, installScheduledDate: date },
    ...over,
  });
}

describe('designedOn', () => {
  it('returns Design-phase projects designed on the given date, sorted by name', () => {
    const b = board([
      proj({ id: 'p1', name: 'Zoe Adams', phaseId: 'phase-design', designedDate: '2026-10-04' }),
      proj({ id: 'p2', name: 'Al Brown', phaseId: 'phase-design', designedDate: '2026-10-04' }),
    ]);
    expect(designedOn(b, '2026-10-04').map((p) => p.name)).toEqual(['Al Brown', 'Zoe Adams']);
  });

  it('excludes other dates, other phases, archived and deleted rows', () => {
    const b = board([
      proj({ id: 'p1', phaseId: 'phase-design', designedDate: '2026-10-03' }), // wrong day
      proj({ id: 'p2', phaseId: 'phase-schedule', designedDate: '2026-10-04' }), // wrong phase
      proj({ id: 'p3', phaseId: null, designedDate: '2026-10-04' }), // no phase
      proj({ id: 'p4', phaseId: 'phase-design', designedDate: '2026-10-04', archivedAt: T0 }),
      proj({ id: 'p5', phaseId: 'phase-design', designedDate: '2026-10-04', deletedAt: T0 }),
      proj({ id: 'p6', phaseId: 'phase-design', designedDate: null }), // no date
    ]);
    expect(designedOn(b, '2026-10-04')).toEqual([]);
  });
});

describe('scheduledOn', () => {
  const DAY = '2026-10-04';

  it('includes Schedule projects designed on the picked date, with their install date, sorted by date', () => {
    const b = board([
      proj({ id: 'p1', name: 'Lavon Grier', phaseId: 'phase-schedule', designedDate: DAY }),
      proj({ id: 'p2', name: 'Early Bird', phaseId: 'phase-schedule', designedDate: DAY }),
    ]);
    const records = [postedFor('p1', '2026-10-21'), postedFor('p2', '2026-10-05')];
    const { scheduled, noDate } = scheduledOn(b, records, DAY);
    expect(scheduled.map((s) => [s.project.name, s.dateIso])).toEqual([
      ['Early Bird', '2026-10-05'],
      ['Lavon Grier', '2026-10-21'],
    ]);
    expect(noDate).toEqual([]);
  });

  it('excludes Schedule projects designed on a different date or with no designed date', () => {
    const b = board([
      proj({ id: 'p1', phaseId: 'phase-schedule', designedDate: '2026-10-03' }),
      proj({ id: 'p2', phaseId: 'phase-schedule', designedDate: null }),
    ]);
    const records = [postedFor('p1', '2026-10-06'), postedFor('p2', '2026-10-06')];
    const { scheduled, noDate } = scheduledOn(b, records, DAY);
    expect(scheduled).toEqual([]);
    // Wrong-design-date rows are simply out of scope — not flagged as missing a date.
    expect(noDate).toEqual([]);
  });

  it('a posted record beats a draft; a draft is used when nothing is posted', () => {
    const b = board([
      proj({ id: 'p1', phaseId: 'phase-schedule', designedDate: DAY }),
      proj({ id: 'p2', phaseId: 'phase-schedule', designedDate: DAY }),
    ]);
    const records = [
      // p1: posted says 10/06, a newer draft says 10/20 — posted wins.
      postedFor('p1', '2026-10-06'),
      makeRecord({
        id: 'draft-p1',
        status: 'draft',
        projectId: 'p1',
        updatedAt: '2026-10-03T00:00:00.000Z',
        sf: { ...makeRecord().sf, installScheduledDate: '2026-10-20' },
      }),
      // p2: only a draft.
      makeRecord({
        id: 'draft-p2',
        status: 'draft',
        projectId: 'p2',
        sf: { ...makeRecord().sf, installScheduledDate: '2026-10-08' },
      }),
    ];
    const { scheduled } = scheduledOn(b, records, DAY);
    expect(scheduled.map((s) => [s.project.id, s.dateIso])).toEqual([
      ['p1', '2026-10-06'],
      ['p2', '2026-10-08'],
    ]);
  });

  it('flags Schedule projects with no linked post or no install date; ignores other phases', () => {
    const b = board([
      proj({ id: 'p1', name: 'No Link', phaseId: 'phase-schedule', designedDate: DAY }),
      proj({ id: 'p2', name: 'Blank Date', phaseId: 'phase-schedule', designedDate: DAY }),
      proj({ id: 'p3', name: 'Designing', phaseId: 'phase-design', designedDate: DAY }),
      proj({ id: 'p4', name: 'Gone', phaseId: 'phase-schedule', designedDate: DAY, archivedAt: T0 }),
    ]);
    const records = [postedFor('p2', '')];
    const { scheduled, noDate } = scheduledOn(b, records, DAY);
    expect(scheduled).toEqual([]);
    expect(noDate.map((p) => p.name)).toEqual(['Blank Date', 'No Link']);
  });
});

describe('shortDate', () => {
  it("renders 'Wed 10/07' — short weekday, no year", () => {
    expect(shortDate('2026-10-07')).toBe('Wed 10/07');
    expect(shortDate('2026-10-04')).toBe('Sun 10/04');
  });
});

describe('parseUpdates', () => {
  it('splits textarea lines, trims, drops empties', () => {
    expect(parseUpdates('Lucille Rivas\n  Nathan Hart  \n\n\nLindsay K cooper\n')).toEqual([
      'Lucille Rivas',
      'Nathan Hart',
      'Lindsay K cooper',
    ]);
  });
  it('returns [] for blank input', () => {
    expect(parseUpdates('')).toEqual([]);
    expect(parseUpdates('  \n \n')).toEqual([]);
  });
});

describe('formatDailyReport', () => {
  it('renders the full report in the Slack format', () => {
    const designed = [proj({ id: 'p1', name: 'Norca Garcia' })];
    const scheduled = [
      { project: proj({ id: 'p2', name: 'Lavon Grier' }), dateIso: '2026-10-07' },
    ];
    const noDate = [proj({ id: 'p3', name: 'Jane Smith' })];
    const updates = ['Lucille Rivas', 'Nathan Hart'];
    expect(formatDailyReport('2026-10-04', designed, scheduled, noDate, updates)).toBe(
      [
        'Daily SOW Projects Progress — Sunday, 10/04/2026',
        '',
        'Projects from Design:',
        '• Norca Garcia',
        '',
        'Projects scheduled (installation date):',
        '• Lavon Grier - Wed 10/07',
        '• Jane Smith - No installation date yet',
        '',
        'Updates:',
        '• Lucille Rivas',
        '• Nathan Hart',
      ].join('\n'),
    );
  });

  it('shows "• None" for empty project sections; empty Updates is OMITTED entirely', () => {
    expect(formatDailyReport('2026-10-04', [], [], [], [])).toBe(
      [
        'Daily SOW Projects Progress — Sunday, 10/04/2026',
        '',
        'Projects from Design:',
        '• None',
        '',
        'Projects scheduled (installation date):',
        '• None',
      ].join('\n'),
    );
  });
});
