// Export + match report for the Requirements boards (Aboud 2026-11-17) —
// Phase 3.
//
// Export writes the SAME columns the importer reads, so a board round-trips:
// export it, edit it in Excel, import it back. requirementsImport.xlsx.test
// proves that loop rather than assuming it.
//
// The match report answers the question the boards cannot: which jobs have a
// jurisdiction or utility that no board matches, i.e. where a Compose draft
// is silently getting no requirements at all.

import { kindOf, matchAhj, normName, ruleStatus } from './ahj';
import { boardsOfKind } from './ahj';
import type { Ahj, PostRecord, RequirementKind } from '../types';

/** The export header — byte-identical to what the importer accepts. */
export const EXPORT_HEADER = [
  'Name',
  'Type',
  'Region',
  'Category',
  'Requirement',
  'Details',
  'Source',
  'Source date',
  'Origin',
  'Confidence',
  'Status',
  'Aliases',
] as const;

const TYPE_LABEL: Record<RequirementKind, string> = {
  ahj: 'AHJ',
  utility: 'Utility',
  funding: 'Funding',
  general: 'General',
};

const STATUS_LABEL = { current: 'Current', 'to-confirm': 'To confirm', superseded: 'Superseded' } as const;

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Every live rule on every board, one row each.
 *
 * `Requirement` and `Details` are rejoined from the stored text: the importer
 * put details on a second line, so the first line is the requirement and the
 * rest are the details. A rule written by hand with several lines exports
 * with line 1 as the requirement and the remainder as details, which is the
 * same shape it would re-import as.
 *
 * Aliases ride on the FIRST row of each board only — repeating them on all
 * 35 of a board's rules would be noise, and the importer unions them anyway.
 */
export function toExportRows(boards: Ahj[]): string[][] {
  const rows: string[][] = [EXPORT_HEADER.slice() as string[]];

  for (const b of boards) {
    if (b.deleted) continue;
    const live = b.posts.filter((p) => !p.deleted);
    let first = true;
    for (const p of live) {
      const lines = p.text.split('\n');
      const requirement = (lines[0] ?? '').trim();
      const details = lines.slice(1).join('\n').trim();
      rows.push([
        b.name,
        TYPE_LABEL[kindOf(b)],
        p.region ?? '',
        p.category ?? '',
        requirement,
        details,
        p.sourceUrl ?? '',
        p.sourceDate ?? '',
        p.origin ?? '',
        p.confidence ? titleCase(p.confidence) : '',
        STATUS_LABEL[ruleStatus(p)],
        first ? b.aliases.join('; ') : '',
      ]);
      first = false;
    }
    // A board with no rules still exports one row, so an entry someone
    // created is not lost by a round trip through the spreadsheet.
    if (!live.length) {
      rows.push([b.name, TYPE_LABEL[kindOf(b)], '', '', '', '', '', '', '', '', '', b.aliases.join('; ')]);
    }
  }

  return rows;
}

/** One CSV field: quoted when it has to be, doubled quotes inside. */
function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV text. A leading BOM so Excel opens UTF-8 correctly on Windows — without
 * it "Ya'rob" and any non-ASCII jurisdiction name arrive mangled.
 */
/** U+FEFF, written as an escape — the literal character is invisible in a diff. */
export const CSV_BOM = '\uFEFF';

export function toCsv(rows: string[][]): string {
  return `${CSV_BOM}${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

/** `requirements-2026-11-17` — dated so two exports never collide. */
export function exportFileName(now = new Date()): string {
  return `requirements-${now.toISOString().slice(0, 10)}`;
}

function handToBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download every board as .csv, in the importer's columns. */
export function downloadRequirementsCsv(boards: Ahj[], fileName = exportFileName()): void {
  handToBrowser(new Blob([toCsv(toExportRows(boards))], { type: 'text/csv;charset=utf-8' }), `${fileName}.csv`);
}

/**
 * Download every board as .xlsx. exceljs is import()-ed so it never lands in
 * the main bundle — the same rule the importer and the board export follow.
 */
export async function downloadRequirementsXlsx(boards: Ahj[], fileName = exportFileName()): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Requirements');
  const rows = toExportRows(boards);
  for (const r of rows) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  // Enough width to read without unwrapping; the long two are the rule text.
  ws.columns.forEach((c, i) => {
    c.width = i === 4 || i === 5 ? 60 : 18;
  });
  const buffer = await wb.xlsx.writeBuffer();
  handToBrowser(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileName}.xlsx`,
  );
}

// ---- Match report ----------------------------------------------------------

export interface MatchGap {
  /** The value that matched nothing — a jurisdiction or a utility name. */
  value: string;
  kind: 'ahj' | 'utility';
  /** Customer names using it, so the gap is concrete rather than abstract. */
  customers: string[];
  count: number;
}

export interface MatchReport {
  gaps: MatchGap[];
  /** Records carrying no jurisdiction/utility at all — nothing to match. */
  blank: { kind: 'ahj' | 'utility'; count: number }[];
  checked: number;
}

/**
 * Which jurisdictions and utilities in the drafts have no board.
 *
 * Grouped by VALUE, not by record: "Montgomery County has no board, used by 7
 * jobs" is one thing to fix, where seven separate rows would read as seven.
 * Matching uses matchAhj, so an alias already counts as a match — the report
 * only lists what genuinely has nowhere to land.
 */
export function matchReport(records: PostRecord[], boards: Ahj[]): MatchReport {
  const ahjBoards = boardsOfKind(boards, 'ahj');
  const utilBoards = boardsOfKind(boards, 'utility');

  const gaps = new Map<string, MatchGap>();
  let blankAhj = 0;
  let blankUtil = 0;

  const note = (kind: 'ahj' | 'utility', value: string, customer: string) => {
    const key = `${kind}|${normName(value)}`;
    const g = gaps.get(key);
    if (g) {
      g.count++;
      if (customer && !g.customers.includes(customer)) g.customers.push(customer);
    } else {
      gaps.set(key, { value: value.trim(), kind, customers: customer ? [customer] : [], count: 1 });
    }
  };

  for (const r of records) {
    const customer = r.sf.customerName.trim();
    const j = (r.sf.jurisdiction ?? '').trim();
    const u = (r.sf.utility ?? '').trim();

    if (!j) blankAhj++;
    else if (!matchAhj(j, ahjBoards)) note('ahj', j, customer);

    if (!u) blankUtil++;
    else if (!matchAhj(u, utilBoards)) note('utility', u, customer);
  }

  const blank: MatchReport['blank'] = [];
  if (blankAhj) blank.push({ kind: 'ahj', count: blankAhj });
  if (blankUtil) blank.push({ kind: 'utility', count: blankUtil });

  return {
    // Worst first: the value blocking the most jobs is the one to fix.
    gaps: [...gaps.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    blank,
    checked: records.length,
  };
}
