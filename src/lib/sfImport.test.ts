import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BoardLabel, BoardProject } from '../board/types';
import { seedLabels } from './board';
import { planImport } from './sfImport';
import { parseSfReport, type SfReport, type SfReportRow } from './sfReport';

const LABELS: BoardLabel[] = seedLabels();
const SCHEDULE = 'phase-schedule';
const DESIGN = 'phase-design';

function proj(name: string, over: Partial<BoardProject> = {}): BoardProject {
  return {
    id: `id-${name.toLowerCase().replace(/\W+/g, '-')}`,
    name,
    coordinator: 'Omar Rajab',
    statusId: 'status-working',
    phaseId: null,
    designedDate: null,
    rating: null,
    position: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'Aboud Yousef',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: 'Aboud Yousef',
    schemaVersion: 1,
    ...over,
  };
}

function row(name: string, over: Partial<SfReportRow> = {}): SfReportRow {
  return { name, coordinator: 'Aboud Yousef', status: 'AHJ', scheduled: false, cancelled: false, ...over };
}

function report(kind: 'scheduled' | 'design', rows: SfReportRow[], over: Partial<SfReport> = {}): SfReport {
  return {
    kind,
    rows,
    totalRecords: rows.length,
    complete: true,
    unreadable: [],
    skipped: [],
    warnings: [],
    ...over,
  };
}

const find = (plan: ReturnType<typeof planImport>, name: string) => plan.rows.find((r) => r.name === name)!;

describe('planImport — matching against the board', () => {
  it('a name nowhere on the board is new, and carries its coordinator', () => {
    const plan = planImport(report('design', [row('Duane Hallemann')]), [proj('Martha Thompson')], LABELS);
    expect(find(plan, 'Duane Hallemann').match).toBe('new');
    expect(find(plan, 'Duane Hallemann').coordinator).toBe('Aboud Yousef');
    expect(plan.counts.create).toBe(1);
  });

  it('an exact name is matched and nothing is created', () => {
    const plan = planImport(report('design', [row('Martha Thompson')]), [proj('Martha Thompson')], LABELS);
    expect(find(plan, 'Martha Thompson').match).toBe('matched');
    expect(plan.counts.create).toBe(0);
  });

  it('matches through case and spacing, like the board’s own duplicate guard', () => {
    const plan = planImport(report('design', [row('Martha   Thompson')]), [proj('martha thompson')], LABELS);
    expect(plan.rows[0].match).toBe('matched');
  });

  it('a name that is on the board but archived is reported as archived, not created twice', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson')]),
      [proj('Martha Thompson', { archivedAt: '2026-10-05T00:00:00.000Z' })],
      LABELS,
    );
    expect(find(plan, 'Martha Thompson').match).toBe('archived');
    expect(plan.counts.create).toBe(0);
  });

  it('never matches a permanently deleted row', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson')]),
      [proj('Martha Thompson', { deletedAt: '2026-10-05T00:00:00.000Z' })],
      LABELS,
    );
    expect(plan.rows[0].match).toBe('new');
  });
});

describe('planImport — near misses become questions, never guesses', () => {
  it('the same words in a different order is a question', () => {
    const plan = planImport(report('design', [row('HARPER JR Walker')]), [proj('Harper Walker Jr')], LABELS);
    const r = find(plan, 'HARPER JR Walker');
    expect(r.match).toBe('maybe');
    expect(r.boardName).toBe('Harper Walker Jr');
  });

  it('one letter out is a question', () => {
    const plan = planImport(report('scheduled', [row('Eric Webber')]), [proj('Eric Weber')], LABELS);
    expect(plan.rows[0].match).toBe('maybe');
  });

  it('an added surname is a question', () => {
    const plan = planImport(report('design', [row('Susan Stone')]), [proj('Susan Stone Jr')], LABELS);
    expect(plan.rows[0].match).toBe('maybe');
  });

  it('merely sharing a first name is NOT a question', () => {
    const plan = planImport(report('design', [row('Adam Hallett')]), [proj('Adam Hall')], LABELS);
    expect(plan.rows[0].match).toBe('new');
  });

  it('two unrelated names are not a question', () => {
    const plan = planImport(report('design', [row('Steven Clifton')]), [proj('Martha Thompson')], LABELS);
    expect(plan.rows[0].match).toBe('new');
  });

  it('answering "same project" turns the question into a match', () => {
    const board = [proj('Harper Walker Jr')];
    const rep = report('design', [row('HARPER JR Walker')]);
    const plan = planImport(rep, board, LABELS, { 'HARPER JR Walker': 'same' });
    expect(plan.rows[0].match).toBe('matched');
    expect(plan.counts.create).toBe(0);
    expect(plan.counts.maybe).toBe(0);
  });

  it('answering "add as new" creates it alongside', () => {
    const plan = planImport(
      report('design', [row('HARPER JR Walker')]),
      [proj('Harper Walker Jr')],
      LABELS,
      { 'HARPER JR Walker': 'new' },
    );
    expect(plan.rows[0].match).toBe('new');
    expect(plan.counts.create).toBe(1);
  });
});

describe('planImport — Design/Schedule', () => {
  it('a new row from the Scheduled report arrives on Schedule', () => {
    const plan = planImport(report('scheduled', [row('Karan Staggers', { scheduled: true })]), [], LABELS);
    expect(plan.rows[0].phaseChange).toEqual({ fromId: null, toId: SCHEDULE });
  });

  it('a new row from the Design report arrives on Design', () => {
    const plan = planImport(report('design', [row('Duane Hallemann')]), [], LABELS);
    expect(plan.rows[0].phaseChange).toEqual({ fromId: null, toId: DESIGN });
  });

  it('a Scheduled paste moves an existing Design row to Schedule', () => {
    const plan = planImport(
      report('scheduled', [row('Martha Thompson', { scheduled: true })]),
      [proj('Martha Thompson', { phaseId: DESIGN })],
      LABELS,
    );
    expect(find(plan, 'Martha Thompson').phaseChange).toEqual({ fromId: DESIGN, toId: SCHEDULE });
    expect(plan.counts.phase).toBe(1);
  });

  it('a Design paste never pulls a Schedule row back, and says so', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson')]),
      [proj('Martha Thompson', { phaseId: SCHEDULE })],
      LABELS,
    );
    expect(find(plan, 'Martha Thompson').phaseChange).toBeUndefined();
    expect(plan.stickySchedule).toEqual(['Martha Thompson']);
  });

  it('a Design-report row that Salesforce already calls Install Scheduled goes to Schedule', () => {
    // Okernithia Shepherd, straight out of the real paste.
    const plan = planImport(
      report('design', [row('Okernithia Shepherd', { scheduled: true })]),
      [proj('Okernithia Shepherd', { phaseId: DESIGN })],
      LABELS,
    );
    expect(plan.rows[0].phaseChange).toEqual({ fromId: DESIGN, toId: SCHEDULE });
  });

  it('a row already on the right phase is left alone', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson')]),
      [proj('Martha Thompson', { phaseId: DESIGN })],
      LABELS,
    );
    expect(plan.rows[0].phaseChange).toBeUndefined();
    expect(plan.counts.phase).toBe(0);
  });
});

describe('planImport — board rows absent from the paste', () => {
  const live = [proj('Martha Thompson'), proj('Patrick Lingwall'), proj('Carla Nunez')];

  it('lists the active rows the paste does not mention', () => {
    const plan = planImport(report('scheduled', [row('Martha Thompson')]), live, LABELS);
    expect(plan.absent.map((p) => p.name).sort()).toEqual(['Carla Nunez', 'Patrick Lingwall']);
  });

  it('stays empty on a partial paste, where the list would be nonsense', () => {
    const partial = report('scheduled', [row('Martha Thompson')], { totalRecords: 15, complete: false });
    expect(planImport(partial, live, LABELS).absent).toEqual([]);
  });

  it('ignores completed and out-of-scope rows — they were never going to be on the report', () => {
    const labels: BoardLabel[] = [
      ...LABELS,
      { ...LABELS[0], id: 'hold', name: 'Hold', isDefault: false, updatedAt: '2026-10-10T00:00:00.000Z' },
    ];
    const board = [
      proj('Martha Thompson'),
      proj('Old Done Job', { statusId: 'status-done' }),
      proj('Parked Job', { statusId: 'hold' }),
    ];
    const plan = planImport(report('scheduled', [row('Martha Thompson')]), board, labels);
    expect(plan.absent).toEqual([]);
  });
});

describe('end to end, through the real pastes', () => {
  const fixture = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
  const ROSTER = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai', 'Yarob Alnabelsi', 'Anas Yaghmour'];

  it('the Scheduled paste onto an empty board: 4 new rows, all on Schedule', () => {
    const plan = planImport(parseSfReport(fixture('sf-report-scheduled-partial.txt'), ROSTER), [], LABELS);
    expect(plan.counts).toMatchObject({ create: 4, matched: 0, maybe: 0 });
    expect(plan.rows.every((r) => r.phaseChange?.toId === SCHEDULE)).toBe(true);
    expect(find(plan, 'Eric Webber').coordinator).toBe('Yarob Alnabelsi');
    // The cut-off Paul Richardson row is reported, not imported.
    expect(plan.rows.map((r) => r.name)).not.toContain('Paul Richardson');
  });

  it('the Design paste over a board that already has two of them scheduled', () => {
    const board = [
      proj('Duane Hallemann', { phaseId: SCHEDULE }), // already scheduled → must stay
      proj('Okernithia Shepherd', { phaseId: DESIGN }), // SF says Install Scheduled → moves
      proj('Harper Walker Jr'), // spelled differently → a question
    ];
    const plan = planImport(parseSfReport(fixture('sf-report-design-partial.txt'), ROSTER), board, LABELS);

    expect(plan.stickySchedule).toEqual(['Duane Hallemann']);
    expect(find(plan, 'Okernithia Shepherd').phaseChange).toEqual({ fromId: DESIGN, toId: SCHEDULE });
    expect(find(plan, 'Harper Jr Walker').match).toBe('maybe');
    expect(find(plan, 'Harper Jr Walker').boardName).toBe('Harper Walker Jr');
    expect(plan.counts.create).toBe(4); // the other four are genuinely new
    // Partial paste (7 of 61), so it must not claim anything is missing.
    expect(plan.absent).toEqual([]);
  });
})

describe('planImport — Salesforce status carried onto NEW rows only', () => {
  const HOLD = { ...LABELS[0], id: 'hold', name: 'Hold', isDefault: false, updatedAt: '2026-10-10T00:00:00.000Z' };
  const labels = [...LABELS, HOLD];

  it('a new row whose Salesforce status is Hold gets the board’s Hold status', () => {
    const plan = planImport(report('design', [row('Randel Love', { status: 'Hold' })]), [], labels);
    expect(plan.rows[0].statusId).toBe('hold');
  });

  it('a status with no matching board label leaves the default alone', () => {
    const plan = planImport(report('design', [row('David Crumrine', { status: 'AHJ' })]), [], labels);
    expect(plan.rows[0].statusId).toBeUndefined();
  });

  it('an EXISTING row’s status is never touched, even by Hold', () => {
    const plan = planImport(
      report('design', [row('Randel Love', { status: 'Hold' })]),
      [proj('Randel Love', { statusId: 'status-working' })],
      labels,
    );
    expect(plan.rows[0].match).toBe('matched');
    expect(plan.rows[0].statusId).toBeUndefined();
  });

  it('matches the board label by name, ignoring case', () => {
    const plan = planImport(report('design', [row('Randel Love', { status: 'hold' })]), [], labels);
    expect(plan.rows[0].statusId).toBe('hold');
  });
});

describe('planImport — cancelled projects', () => {
  it('imports them (Aboud’s call) but counts them separately', () => {
    const plan = planImport(
      report('design', [row('Gloria Davis', { status: 'Cancel', cancelled: true }), row('David Crumrine')]),
      [],
      LABELS,
    );
    expect(plan.counts.create).toBe(2);
    expect(plan.counts.cancelled).toBe(1);
    expect(plan.rows.find((r) => r.name === 'Gloria Davis')?.cancelled).toBe(true);
  });

  it('flags a board row Salesforce now shows as cancelled, so it can be archived by hand', () => {
    const plan = planImport(
      report('design', [row('Gloria Davis', { status: 'Cancel', cancelled: true })]),
      [proj('Gloria Davis')],
      LABELS,
    );
    expect(plan.cancelledOnBoard.map((p) => p.name)).toEqual(['Gloria Davis']);
    // Still only flagged — the import never archives or edits it.
    expect(plan.rows[0].match).toBe('matched');
  });

  it('a cancelled row never counts as scheduled, so it cannot drag a row onto Schedule', () => {
    const plan = planImport(
      report('design', [row('Gloria Davis', { status: 'Cancel', cancelled: true })]),
      [proj('Gloria Davis', { phaseId: DESIGN })],
      LABELS,
    );
    expect(plan.rows[0].phaseChange).toBeUndefined();
  });
})
;

describe('planImport — Salesforce notes (Aboud 2026-10-21)', () => {
  const NOTES = { alerts: '4x tree trims.', utilityDesign: 'Main breaker required.' };

  it('a new row carries its notes', () => {
    const plan = planImport(report('design', [row('Duane Hallemann', { notes: NOTES })]), [], LABELS);
    expect(find(plan, 'Duane Hallemann').notes).toEqual(NOTES);
  });

  it('a new row with an empty notes object carries none', () => {
    const plan = planImport(report('design', [row('Duane Hallemann', { notes: {} })]), [], LABELS);
    expect(find(plan, 'Duane Hallemann').notes).toBeUndefined();
    expect(plan.counts.notes).toBe(0);
  });

  it('a matched row gets the notes when the board has none yet', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson', { notes: NOTES })]),
      [proj('Martha Thompson', { phaseId: DESIGN })],
      LABELS,
    );
    expect(find(plan, 'Martha Thompson').notes).toEqual(NOTES);
    expect(plan.counts.notes).toBe(1);
  });

  it('identical notes are not a change', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson', { notes: NOTES })]),
      [proj('Martha Thompson', { phaseId: DESIGN, sfNotes: { ...NOTES } })],
      LABELS,
    );
    expect(find(plan, 'Martha Thompson').notes).toBeUndefined();
    expect(plan.counts.notes).toBe(0);
  });

  it('notes cleared in Salesforce clear on the board — the export is the truth', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson', { notes: {} })]),
      [proj('Martha Thompson', { phaseId: DESIGN, sfNotes: NOTES })],
      LABELS,
    );
    expect(find(plan, 'Martha Thompson').notes).toEqual({});
    expect(plan.counts.notes).toBe(1);
  });

  it('a paste (no notes in the report) never touches board notes', () => {
    const plan = planImport(
      report('design', [row('Martha Thompson')]),
      [proj('Martha Thompson', { phaseId: DESIGN, sfNotes: NOTES })],
      LABELS,
    );
    expect(find(plan, 'Martha Thompson').notes).toBeUndefined();
    expect(plan.counts.notes).toBe(0);
  });

  it('an unanswered near miss gets no notes — nothing is guessed', () => {
    const plan = planImport(
      report('design', [row('Moises Negrette', { notes: NOTES })]),
      [proj('Moises Negrete', { phaseId: DESIGN })],
      LABELS,
    );
    expect(find(plan, 'Moises Negrette').match).toBe('maybe');
    expect(find(plan, 'Moises Negrette').notes).toBeUndefined();
    expect(plan.counts.notes).toBe(0);
  });
});

// ---- Scope of Work Reviews, imported daily (Aboud 2026-11-03) --------------
// Two rules exist only because this one runs EVERY morning:
//   - phase is set on NEW rows only, so a daily run never drags a row someone
//     deliberately moved to Design back onto Schedule.
//   - lender-skipped names count as seen, so 30 live non-Solrite projects do
//     not appear as "not on this report" every single day.

function reviewReport(rows: SfReportRow[], skipped: string[] = []): SfReport {
  return {
    kind: 'review',
    rows,
    totalRecords: rows.length,
    complete: true,
    unreadable: [],
    skipped,
    warnings: [],
  };
}

/** The Reviews report has no Project Status column: '' status, always scheduled. */
const reviewRow = (name: string, over: Partial<SfReportRow> = {}): SfReportRow =>
  row(name, { status: '', scheduled: true, ...over });

describe('planImport — review report', () => {
  it('puts a NEW row on Schedule', () => {
    const plan = planImport(reviewReport([reviewRow('Jane Doe')]), [], LABELS);
    expect(find(plan, 'Jane Doe').match).toBe('new');
    expect(find(plan, 'Jane Doe').phaseChange).toEqual({ fromId: null, toId: SCHEDULE });
  });

  it('leaves an existing row on Design alone — no daily tug-of-war', () => {
    const board = [proj('Jane Doe', { phaseId: DESIGN })];
    const plan = planImport(reviewReport([reviewRow('Jane Doe')]), board, LABELS);
    expect(find(plan, 'Jane Doe').match).toBe('matched');
    expect(find(plan, 'Jane Doe').phaseChange).toBeUndefined();
    expect(plan.counts.phase).toBe(0);
    expect(plan.stickySchedule).toEqual([]);
  });

  it('leaves an existing row with NO phase alone too', () => {
    const board = [proj('Jane Doe', { phaseId: null })];
    const plan = planImport(reviewReport([reviewRow('Jane Doe')]), board, LABELS);
    expect(find(plan, 'Jane Doe').phaseChange).toBeUndefined();
    expect(plan.counts.phase).toBe(0);
  });

  it('a lender-skipped project is NOT reported as missing from the board', () => {
    const board = [proj('Jane Doe'), proj('Cash Carl')];
    const plan = planImport(reviewReport([reviewRow('Jane Doe')], ['Cash Carl']), board, LABELS);
    expect(plan.absent.map((p) => p.name)).toEqual([]);
  });

  it('a board row on neither the report nor the skip list is still reported missing', () => {
    const board = [proj('Jane Doe'), proj('Cash Carl'), proj('Forgotten Fred')];
    const plan = planImport(reviewReport([reviewRow('Jane Doe')], ['Cash Carl']), board, LABELS);
    expect(plan.absent.map((p) => p.name)).toEqual(['Forgotten Fred']);
  });

  it('still mirrors notes onto an existing row, like the other reports', () => {
    const board = [proj('Jane Doe')];
    const rows = [reviewRow('Jane Doe', { notes: { alerts: 'Two attics' } })];
    const plan = planImport(reviewReport(rows), board, LABELS);
    expect(find(plan, 'Jane Doe').notes).toEqual({ alerts: 'Two attics' });
    expect(plan.counts.notes).toBe(1);
  });

  it('the scheduled report still forces Schedule on existing rows — unchanged', () => {
    const board = [proj('Jane Doe', { phaseId: DESIGN })];
    const scheduled: SfReport = {
      ...reviewReport([row('Jane Doe', { status: 'Install Scheduled', scheduled: true })]),
      kind: 'scheduled',
    };
    const plan = planImport(scheduled, board, LABELS);
    expect(find(plan, 'Jane Doe').phaseChange).toEqual({ fromId: DESIGN, toId: SCHEDULE });
    expect(plan.counts.phase).toBe(1);
  });
});
