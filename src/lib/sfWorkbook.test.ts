import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
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
