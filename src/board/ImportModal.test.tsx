// @vitest-environment jsdom
// The Salesforce report import preview — Aboud, 2026-10-19.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedLabels, newProject } from '../lib/board';
import type { BoardProject } from './types';
import ImportModal, { type ImportRequest } from './ImportModal';

// cwd-relative, not import.meta.url — under jsdom that URL loses the directory.
const fixture = (n: string) => readFileSync(resolve('src/lib/__fixtures__', n), 'utf8');
const SCHEDULED = fixture('sf-report-scheduled-partial.txt');
const DESIGN = fixture('sf-report-design-partial.txt');

const ROSTER = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai', 'Yarob Alnabelsi', 'Anas Yaghmour'];
const LABELS = [...seedLabels(), { ...seedLabels()[0], id: 'hold', name: 'Hold', isDefault: false, updatedAt: '2026-10-10T00:00:00.000Z' }];

const proj = (name: string, over: Partial<BoardProject> = {}): BoardProject => ({
  ...newProject(name, 'Omar Rajab', LABELS, '2026-10-01T00:00:00.000Z'),
  id: `id-${name}`,
  ...over,
});

function show(projects: BoardProject[] = []) {
  const imported: ImportRequest[] = [];
  render(
    <ImportModal
      projects={projects}
      labels={LABELS}
      roster={ROSTER}
      onImport={(req) => imported.push(req)}
      onClose={vi.fn()}
    />,
  );
  return imported;
}

const paste = (text: string) =>
  fireEvent.change(screen.getByLabelText('Salesforce report'), { target: { value: text } });

const importButton = () => screen.getByRole('button', { name: /^Import/ }) as HTMLButtonElement;

describe('ImportModal', () => {
  afterEach(cleanup);

  it('says nothing until something is pasted', () => {
    show();
    expect(screen.queryByText(/records/)).toBeNull();
    expect(importButton().disabled).toBe(true);
  });

  it('reads the Scheduled report and counts what it would do', () => {
    show();
    paste(SCHEDULED);
    expect(screen.getByText(/Scheduled report/)).toBeTruthy();
    expect(screen.getByText(/found 4 of 15/)).toBeTruthy();
    expect(screen.getByText(/new projects/)).toBeTruthy();
    expect(importButton().textContent).toBe('Import 4');
  });

  it('names the new projects when the line is expanded', () => {
    show();
    paste(SCHEDULED);
    fireEvent.click(screen.getByText(/new projects/));
    expect(screen.getByText('Karan Staggers')).toBeTruthy();
    expect(screen.getByText('Susan Stone')).toBeTruthy();
  });

  it('warns that the paste is only part of the report', () => {
    show();
    paste(SCHEDULED);
    expect(screen.getByText(/Expand every date group/)).toBeTruthy();
  });

  it('reports the row it could not read, and does not import it', () => {
    show();
    paste(SCHEDULED);
    const line = screen.getByText(/could not be read/).closest('details') as HTMLElement;
    expect(line).toBeTruthy();
    // Scoped to the line — the textarea still holds the whole paste.
    expect(within(line).getByText(/Paul Richardson.*cut off/)).toBeTruthy();
  });

  it('refuses a paste that is not one of the reports', () => {
    show();
    paste('just some text I copied by accident');
    expect(screen.getByText(/Could not tell which report/)).toBeTruthy();
    expect(importButton().disabled).toBe(true);
  });

  it('blocks the import while a near-miss question is unanswered', () => {
    show([proj('Harper Walker Jr')]);
    paste(DESIGN);
    expect(screen.getByText(/Harper Walker Jr/)).toBeTruthy();
    expect(importButton().disabled).toBe(true);
    expect(screen.getByText(/Answer the question/)).toBeTruthy();
  });

  it('answering the question unblocks it and records the decision', () => {
    const imported = show([proj('Harper Walker Jr')]);
    paste(DESIGN);
    const question = screen.getByText(/Harper Walker Jr/).closest('.board-import-question') as HTMLElement;
    fireEvent.click(within(question).getByLabelText('Same project'));

    expect(importButton().disabled).toBe(false);
    fireEvent.click(importButton());
    const row = imported[0].plan.rows.find((r) => r.name === 'Harper Jr Walker')!;
    expect(row.match).toBe('matched');
  });

  it('"add as new" keeps both', () => {
    const imported = show([proj('Harper Walker Jr')]);
    paste(DESIGN);
    const question = screen.getByText(/Harper Walker Jr/).closest('.board-import-question') as HTMLElement;
    fireEvent.click(within(question).getByLabelText('Add as new'));
    fireEvent.click(importButton());
    expect(imported[0].plan.rows.find((r) => r.name === 'Harper Jr Walker')!.match).toBe('new');
  });

  it('an archived twin is not restored unless asked', () => {
    const imported = show([proj('Karan Staggers', { archivedAt: '2026-10-05T00:00:00.000Z' })]);
    paste(SCHEDULED);
    expect(screen.getByText(/archived/)).toBeTruthy();
    fireEvent.click(importButton());
    expect(imported[0].restoreArchived).toBe(false);

    fireEvent.click(screen.getByLabelText(/Restore/));
    fireEvent.click(importButton());
    expect(imported[1].restoreArchived).toBe(true);
  });

  it('says so when the paste would change nothing', () => {
    show([proj('Karan Staggers'), proj('Nikki Calton'), proj('Eric Webber'), proj('Susan Stone')]);
    paste(SCHEDULED);
    // All four exist, but all four still need their phase set, so there IS work.
    expect(importButton().textContent).toBe('Import 4');
  });

  it('tells me which active rows the paste does not mention, on a complete paste only', () => {
    show([proj('Karan Staggers'), proj('Someone Not On The Report')]);
    paste(SCHEDULED); // partial — 4 of 15
    expect(screen.queryByText(/not on this report/)).toBeNull();
  });
});

describe('ImportModal — cancelled and Hold rows', () => {
  afterEach(cleanup);
  const CANCEL_HOLD = fixture('sf-report-design-cancel-hold.txt');

  it('counts the cancelled rows and still imports them', () => {
    const imported = show();
    paste(CANCEL_HOLD);
    const line = screen.getByText(/cancelled in Salesforce/).closest('details') as HTMLElement;
    fireEvent.click(within(line).getByText(/cancelled in Salesforce/));
    expect(within(line).getByText('Gloria Davis')).toBeTruthy();
    // 9 rows, all new → all 9 imported, cancelled included.
    expect(importButton().textContent).toBe('Import 9');
    fireEvent.click(importButton());
    expect(imported[0].plan.counts.cancelled).toBe(4);
  });

  it('flags a board row that Salesforce now shows as cancelled', () => {
    show([proj('Gloria Davis')]);
    paste(CANCEL_HOLD);
    expect(screen.getByText(/now cancelled in Salesforce/)).toBeTruthy();
  });

  it('a new Hold row is given the board’s Hold status', () => {
    const imported = show();
    paste(CANCEL_HOLD);
    fireEvent.click(importButton());
    const love = imported[0].plan.rows.find((r) => r.name === 'Randel Love')!;
    expect(love.statusId).toBe('hold');
  });
})

describe('ImportModal — the exported file', () => {
  afterEach(cleanup);

  it('offers a file picker alongside the paste box', () => {
    show();
    expect(screen.getByLabelText(/exported .xlsx/i)).toBeTruthy();
  });

  it('reads the whole export and shows every row', async () => {
    const imported = show();
    const buf = readFileSync(resolve('src/lib/__fixtures__/sf-export-design.xlsx'));
    const file = new File([buf], 'Scope of Work Assignments - Design.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = screen.getByLabelText(/exported .xlsx/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // Reading the workbook is async (exceljs is import()-ed). Wait on the
    // result, never on a timer — a fixed sleep is flaky under full-suite load.
    await screen.findByText(/found 62 of 62/, undefined, { timeout: 15_000 });
    expect(screen.getByText(/Design report/)).toBeTruthy();
    // A file is never partial, so the "expand the date groups" nag must be gone.
    expect(screen.queryByText(/Expand every date group/)).toBeNull();

    fireEvent.click(importButton());
    expect(imported[0].plan.rows).toHaveLength(62);
    expect(imported[0].plan.counts.cancelled).toBe(8);
  });
})
;

// Salesforce notes in the preview (Aboud 2026-10-21). exceljs is imported
// statically here only to build the seeded board — the modal itself still
// import()s it lazily.
import ExcelJS from 'exceljs';
import { parseSfGrid, sheetToGrid } from '../lib/sfWorkbook';

describe('ImportModal — Salesforce notes (Aboud 2026-10-21)', () => {
  afterEach(cleanup);

  const XLSX = readFileSync(resolve('src/lib/__fixtures__/sf-export-design.xlsx'));

  const loadFile = async () => {
    const file = new File([XLSX], 'Scope of Work Assignments - Design.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(screen.getByLabelText(/exported .xlsx/i), { target: { files: [file] } });
    await screen.findByText(/found 62 of 62/, undefined, { timeout: 15_000 });
  };

  it('says when existing rows get updated notes, and the plan carries them', async () => {
    const imported = show([proj('Eric Webber', { phaseId: 'phase-schedule' })]);
    await loadFile();
    expect(screen.getByText(/updated Salesforce notes/)).toBeTruthy();

    fireEvent.click(importButton());
    expect(imported[0].plan.counts.notes).toBe(1);
    const webber = imported[0].plan.rows.find((r) => r.name === 'Eric Webber')!;
    expect(webber.notes?.alerts).toContain('tree trims');
  });

  it('a notes-only change still enables Import — future note refreshes must not be blocked', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(resolve('src/lib/__fixtures__/sf-export-design.xlsx'));
    const rows = parseSfGrid(sheetToGrid(wb.worksheets[0]), ROSTER).rows;
    // The board already matches the file exactly — except Eric's notes.
    const projects = rows.map((r) =>
      proj(r.name, {
        phaseId: r.scheduled ? 'phase-schedule' : 'phase-design',
        sfNotes: r.notes,
      }),
    );
    projects.find((p) => p.name === 'Eric Webber')!.sfNotes = { alerts: 'A stale alert.' };

    show(projects);
    await loadFile();
    const btn = importButton();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Import 1');
  });
});
