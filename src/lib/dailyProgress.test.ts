// Daily Progress report (Admin › Daily Progress) — pure logic.
// Section 1: Design-phase projects designed on the picked date.
// Section 2: Schedule-phase projects whose linked post's install date falls in
// the next 7 days (today..today+7), plus a flagged "no date yet" bucket.

import { describe, expect, it } from 'vitest';
import type { BoardProject, BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { emptyBoard, newProject, seedLabels } from './board';
import { makeRecord } from './__fixtures__/makeRecord';
import { addDaysIso, designedOn, formatDailyReport, scheduledNext7 } from './dailyProgress';

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

describe('addDaysIso', () => {
  it('adds days within a month', () => {
    expect(addDaysIso('2026-10-04', 7)).toBe('2026-10-11');
  });
  it('rolls over month and year boundaries', () => {
    expect(addDaysIso('2026-10-28', 7)).toBe('2026-11-04');
    expect(addDaysIso('2026-12-29', 7)).toBe('2027-01-05');
  });
});

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

describe('scheduledNext7', () => {
  const TODAY = '2026-10-04';

  it('includes Schedule projects whose linked post installs within today..today+7, sorted by date', () => {
    const b = board([
      proj({ id: 'p1', name: 'Lavon Grier', phaseId: 'phase-schedule' }),
      proj({ id: 'p2', name: 'Early Bird', phaseId: 'phase-schedule' }),
    ]);
    const records = [postedFor('p1', '2026-10-07'), postedFor('p2', '2026-10-05')];
    const { scheduled, noDate } = scheduledNext7(b, records, TODAY);
    expect(scheduled.map((s) => [s.project.name, s.dateIso])).toEqual([
      ['Early Bird', '2026-10-05'],
      ['Lavon Grier', '2026-10-07'],
    ]);
    expect(noDate).toEqual([]);
  });

  it('window is inclusive on both ends and excludes past/far dates', () => {
    const b = board([
      proj({ id: 'p1', phaseId: 'phase-schedule' }), // today — in
      proj({ id: 'p2', phaseId: 'phase-schedule' }), // today+7 — in
      proj({ id: 'p3', phaseId: 'phase-schedule' }), // yesterday — out
      proj({ id: 'p4', phaseId: 'phase-schedule' }), // today+8 — out
    ]);
    const records = [
      postedFor('p1', '2026-10-04'),
      postedFor('p2', '2026-10-11'),
      postedFor('p3', '2026-10-03'),
      postedFor('p4', '2026-10-12'),
    ];
    const { scheduled, noDate } = scheduledNext7(b, records, TODAY);
    expect(scheduled.map((s) => s.project.id)).toEqual(['p1', 'p2']);
    // Out-of-window projects HAVE a date — they are not flagged as missing one.
    expect(noDate).toEqual([]);
  });

  it('a posted record beats a draft; a draft is used when nothing is posted', () => {
    const b = board([
      proj({ id: 'p1', phaseId: 'phase-schedule' }),
      proj({ id: 'p2', phaseId: 'phase-schedule' }),
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
    const { scheduled } = scheduledNext7(b, records, TODAY);
    expect(scheduled.map((s) => [s.project.id, s.dateIso])).toEqual([
      ['p1', '2026-10-06'],
      ['p2', '2026-10-08'],
    ]);
  });

  it('flags Schedule projects with no linked post or no install date; ignores other phases', () => {
    const b = board([
      proj({ id: 'p1', name: 'No Link', phaseId: 'phase-schedule' }),
      proj({ id: 'p2', name: 'Blank Date', phaseId: 'phase-schedule' }),
      proj({ id: 'p3', name: 'Designing', phaseId: 'phase-design' }),
      proj({ id: 'p4', name: 'Gone', phaseId: 'phase-schedule', archivedAt: T0 }),
    ]);
    const records = [postedFor('p2', '')];
    const { scheduled, noDate } = scheduledNext7(b, records, TODAY);
    expect(scheduled).toEqual([]);
    expect(noDate.map((p) => p.name)).toEqual(['Blank Date', 'No Link']);
  });
});

describe('formatDailyReport', () => {
  it('renders the full report in the Slack format', () => {
    const designed = [proj({ id: 'p1', name: 'Norca Garcia' })];
    const scheduled = [
      { project: proj({ id: 'p2', name: 'Lavon Grier' }), dateIso: '2026-10-07' },
    ];
    const noDate = [proj({ id: 'p3', name: 'Jane Smith' })];
    expect(formatDailyReport('2026-10-04', designed, scheduled, noDate)).toBe(
      [
        'Daily SOW Projects Progress — Sunday, 10/04/2026',
        '',
        'Projects from Design:',
        '- Norca Garcia',
        '',
        'Projects scheduled for the next 7 days:',
        '- Lavon Grier - Scheduled Wednesday, 10/07/2026',
        '- Jane Smith - No installation date yet',
      ].join('\n'),
    );
  });

  it('shows "- None" for empty sections', () => {
    expect(formatDailyReport('2026-10-04', [], [], [])).toBe(
      [
        'Daily SOW Projects Progress — Sunday, 10/04/2026',
        '',
        'Projects from Design:',
        '- None',
        '',
        'Projects scheduled for the next 7 days:',
        '- None',
      ].join('\n'),
    );
  });
});
