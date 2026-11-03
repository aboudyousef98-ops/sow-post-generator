import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { hasSfNotes } from './sfNotes';
import { parseSfGrid, sheetToGrid } from './sfWorkbook';

const ROSTER = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai', 'Yarob Alnabelsi', 'Anas Yaghmour'];

/** The real "Export → Details Only" file Aboud produced on 2026-10-19. */
let grid: string[][];

beforeAll(async () => {
  const wb = new ExcelJS.Workbook();
  // fileURLToPath, not .pathname — the repo path contains spaces.
  await wb.xlsx.readFile(fileURLToPath(new URL('./__fixtures__/sf-export-design.xlsx', import.meta.url)));
  grid = sheetToGrid(wb.worksheets[0]);
});

describe('sheetToGrid', () => {
  it('flattens the sheet to plain strings, one array per row', () => {
    expect(Array.isArray(grid)).toBe(true);
    expect(grid.length).toBeGreaterThan(60);
    expect(grid.every((r) => r.every((c) => typeof c === 'string'))).toBe(true);
  });
});

describe('parseSfGrid — the exported workbook', () => {
  it('knows it is the Design report', () => {
    expect(parseSfGrid(grid, ROSTER).kind).toBe('design');
  });

  it('reads every project row in the file', () => {
    const r = parseSfGrid(grid, ROSTER);
    expect(r.rows).toHaveLength(62);
    expect(r.unreadable).toEqual([]);
  });

  it('is always complete — a file cannot be half-rendered like the browser copy', () => {
    const r = parseSfGrid(grid, ROSTER);
    expect(r.complete).toBe(true);
    expect(r.totalRecords).toBe(62);
    expect(r.warnings).toEqual([]);
  });

  it('maps the columns by header name, not by position', () => {
    const r = parseSfGrid(grid, ROSTER);
    const webber = r.rows.find((x) => x.name === 'Eric Webber')!;
    expect(webber.coordinator).toBe('Yarob Alnabelsi'); // "Ya'rob" in the file
    expect(webber.status).toBe('Install Scheduled');
    expect(webber.scheduled).toBe(true);
  });

  it('carries the statuses through, Cancel and Hold included', () => {
    const counts: Record<string, number> = {};
    for (const row of parseSfGrid(grid, ROSTER).rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    expect(counts).toEqual({
      AHJ: 40,
      Cancel: 8,
      Hold: 8,
      'Install Scheduled': 4,
      'Install Initiated': 2,
    });
  });

  it('counts an install that has already started as scheduled', () => {
    const started = parseSfGrid(grid, ROSTER).rows.filter((r) => r.status === 'Install Initiated');
    expect(started.length).toBe(2);
    expect(started.every((r) => r.scheduled)).toBe(true);
  });

  it('flags the cancelled rows and never calls them scheduled', () => {
    const cancelled = parseSfGrid(grid, ROSTER).rows.filter((r) => r.cancelled);
    expect(cancelled).toHaveLength(8);
    expect(cancelled.every((r) => !r.scheduled)).toBe(true);
  });

  it('title-cases the shouted names', () => {
    const names = parseSfGrid(grid, ROSTER).rows.map((r) => r.name);
    expect(names).toContain('Johann Lawrence-Brian Dsouza');
    expect(names.every((n) => n !== n.toUpperCase() || n.length < 3)).toBe(true);
  });

  it('skips the Subtotal / Grand Total / footer rows', () => {
    const names = parseSfGrid(grid, ROSTER).rows.map((r) => r.name.toLowerCase());
    for (const junk of ['subtotal', 'grand total', 'total']) expect(names).not.toContain(junk);
    expect(names.some((n) => n.includes('confidential'))).toBe(false);
    expect(names.some((n) => n.includes('copyright'))).toBe(false);
  });
});

describe('parseSfGrid — Salesforce notes (Aboud 2026-10-21)', () => {
  it('carries the Scheduling Alerts! column, CRLF normalised', () => {
    const webber = parseSfGrid(grid, ROSTER).rows.find((x) => x.name === 'Eric Webber')!;
    expect(webber.notes?.alerts).toContain('tree trims');
    expect(webber.notes?.alerts).not.toContain('\r');
  });

  it('carries the AHJ and utility requirement columns', () => {
    const webber = parseSfGrid(grid, ROSTER).rows.find((x) => x.name === 'Eric Webber')!;
    expect(webber.notes?.utilityDesign).toContain('main breaker');
    expect(webber.notes?.utilityBattery).toContain('interconnections@synapticsolar.com');
  });

  it('every exported row gets a notes object — the file is authoritative', () => {
    const r = parseSfGrid(grid, ROSTER);
    expect(r.rows.every((x) => x.notes !== undefined)).toBe(true);
  });

  it('a row with nothing in any note column gets an EMPTY notes object, so clears can mirror', () => {
    const r = parseSfGrid(
      [
        ['Scope of Work Assignments - Design'],
        ['Project Name', 'Project Status', 'Fulfillment: Scheduling Alerts!'],
        ['Jane Doe', 'AHJ', '   '],
      ],
      ROSTER,
    );
    expect(r.rows[0].notes).toEqual({});
    expect(hasSfNotes(r.rows[0].notes)).toBe(false);
  });

  it('an export without the note columns leaves notes undefined — nothing to mirror', () => {
    const r = parseSfGrid(
      [
        ['Scope of Work Assignments - Design'],
        ['Project Name', 'Project Status'],
        ['Jane Doe', 'AHJ'],
      ],
      ROSTER,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].notes).toBeUndefined();
  });
});

describe('parseSfGrid — refusals', () => {
  it('refuses a sheet that is not one of the two reports', () => {
    const r = parseSfGrid([['Some other spreadsheet'], ['a', 'b']], ROSTER);
    expect(r.kind).toBe('unknown');
    expect(r.error).toMatch(/which report/i);
  });

  it('refuses a sheet with no Project Name column', () => {
    const r = parseSfGrid([['Scope of Work Assignments - Design'], ['Lender', 'Project Status']], ROSTER);
    expect(r.error).toMatch(/Project Name/i);
    expect(r.rows).toEqual([]);
  });
});

// ---- Scope of Work Reviews report (Aboud 2026-11-03) ------------------------
// A third report kind, imported DAILY. Solrite only: every other lender is
// skipped, and the skipped names are reported rather than silently dropped so
// the reconciler can tell "we chose to skip this" from "not on the report".

const REVIEW_TITLE = 'Scope of Work Reviews';

/** A minimal Reviews grid: title, header row, then the given data rows. */
function reviewGrid(rows: string[][]): string[][] {
  return [
    [REVIEW_TITLE],
    ['Project Name', 'Scope Of Work Assignment: Full Name', 'Lender', 'Fulfillment: Scheduling Alerts!'],
    ...rows,
  ];
}

describe('parseSfGrid — Scope of Work Reviews', () => {
  it('recognises the report by its title', () => {
    expect(parseSfGrid(reviewGrid([['Jane Doe', 'Aboud Yousef', 'SOLRITE', '']]), ROSTER).kind).toBe('review');
  });

  it('keeps Solrite rows and skips every other lender, by name', () => {
    const r = parseSfGrid(
      reviewGrid([
        ['Jane Doe', 'Aboud Yousef', 'SOLRITE', ''],
        ['Cash Carl', 'Aboud Yousef', 'Cash', ''],
        ['Goody Leap', 'Aboud Yousef', 'GoodLeap', ''],
        ['Light Reach', 'Aboud Yousef', 'LightReach', ''],
      ]),
      ROSTER,
    );
    expect(r.rows.map((x) => x.name)).toEqual(['Jane Doe']);
    expect(r.skipped).toEqual(['Cash Carl', 'Goody Leap', 'Light Reach']);
  });

  it('matches the lender case-insensitively', () => {
    const r = parseSfGrid(
      reviewGrid([
        ['Lower Case', 'Aboud Yousef', 'solrite', ''],
        ['Mixed Case', 'Aboud Yousef', 'Solrite', ''],
      ]),
      ROSTER,
    );
    expect(r.rows.map((x) => x.name)).toEqual(['Lower Case', 'Mixed Case']);
    expect(r.skipped).toEqual([]);
  });

  it('skips a blank lender rather than guessing it is ours', () => {
    const r = parseSfGrid(reviewGrid([['No Lender', 'Aboud Yousef', '', '']]), ROSTER);
    expect(r.rows).toEqual([]);
    expect(r.skipped).toEqual(['No Lender']);
  });

  it('has no Project Status column, so rows carry no status but count as scheduled', () => {
    const r = parseSfGrid(reviewGrid([['Jane Doe', 'Aboud Yousef', 'SOLRITE', '']]), ROSTER);
    expect(r.rows[0].status).toBe('');
    expect(r.rows[0].scheduled).toBe(true);
    expect(r.rows[0].cancelled).toBe(false);
  });

  it('still mirrors the Salesforce note columns', () => {
    const r = parseSfGrid(reviewGrid([['Jane Doe', 'Aboud Yousef', 'SOLRITE', 'Two attics']]), ROSTER);
    expect(r.rows[0].notes).toEqual({ alerts: 'Two attics' });
  });

  it('the other two report kinds are unaffected and never carry skipped names', () => {
    const r = parseSfGrid(
      [['Scope of Work Assignments - Design'], ['Project Name', 'Lender'], ['Jane Doe', 'Cash']],
      ROSTER,
    );
    expect(r.kind).toBe('design');
    expect(r.rows.map((x) => x.name)).toEqual(['Jane Doe']);
    expect(r.skipped).toEqual([]);
  });
});

describe('parseSfGrid — the real Reviews export (2026-11-03)', () => {
  let reviews: string[][];

  beforeAll(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(fileURLToPath(new URL('./__fixtures__/sf-export-reviews.xlsx', import.meta.url)));
    reviews = sheetToGrid(wb.worksheets[0]);
  });

  it('reads 240 Solrite projects from 242 rows and reports 30 genuinely skipped', () => {
    // 242 Solrite ROWS, but "Anthony Mcdowell" and "Carlos Flores Sr" each
    // appear under two install-date groups — one project apiece, not two.
    // 36 non-Solrite rows, less the 6 dual-lender ones that imported anyway.
    const r = parseSfGrid(reviews, ROSTER);
    expect(r.kind).toBe('review');
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(240);
    expect(r.skipped).toHaveLength(30);
  });

  it('a skipped lender never consumes the de-dup slot of a Solrite row', () => {
    // Regression: with the lender gate after the de-dup bookkeeping, 6 Solrite
    // projects vanished because a non-Solrite row had claimed their name key.
    // These six carry TWO lender rows on the real export (GoodLeap or FCC
    // Finance AND Solrite) and must import on the strength of the Solrite one.
    const r = parseSfGrid(reviews, ROSTER);
    const names = new Set(r.rows.map((x) => x.name));
    for (const dual of ['Ada Delgadillo', 'Glenda Hodge', 'Sylvester Hernandez', 'Deborah Hueber', 'Donna Luce', 'Sherry Miles']) {
      expect(names.has(dual)).toBe(true);
    }
  });

  it('never reports a project as skipped when another row imported it', () => {
    const r = parseSfGrid(reviews, ROSTER);
    const names = new Set(r.rows.map((x) => x.name));
    for (const s of r.skipped) expect(names.has(s)).toBe(false);
    // 36 non-Solrite rows, 6 of which are dual-lender and did import.
    expect(r.skipped).toHaveLength(30);
  });

  it('drops the grouped report subtotal/count furniture', () => {
    const r = parseSfGrid(reviews, ROSTER);
    expect(r.rows.some((x) => /^(subtotal|count|sum|grand total)/i.test(x.name))).toBe(false);
  });

  it('mirrors the note columns from the real file', () => {
    const r = parseSfGrid(reviews, ROSTER);
    expect(r.rows.some((x) => (x.notes?.alerts ?? '').length > 0)).toBe(true);
    expect(r.rows.some((x) => (x.notes?.utilityBattery ?? '').length > 0)).toBe(true);
  });
});
