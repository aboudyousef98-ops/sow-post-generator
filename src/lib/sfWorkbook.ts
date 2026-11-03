// Salesforce report EXPORT reader — "Export → Details Only" (.xlsx).
//
// Why this exists alongside lib/sfReport.ts: the browser copy can only ever
// contain the rows Salesforce has rendered, so Ctrl+A on a 62-record report
// yields a different ~9-row window each time (Aboud, 2026-10-19). The export
// always contains every record.
//
// It is also the easier thing to parse. The export has a real header row, so
// columns are matched BY NAME and the "feature not included" anchor — a quirk
// of an unsupported field type in the Lightning viewer — is not needed at all.
// Add a column in Salesforce, move one, and this keeps working.
//
// The output is the same SfReport the paste parser produces, so the preview,
// the reconciler and the write are shared and know nothing about the source.

import { nameKey } from './board';
import type { SfNotes } from './sfNotes';
import {
  CANCELLED_STATUS_RE,
  SCHEDULED_STATUS_RE,
  cleanProjectName,
  projectNameKey,
  type SfReport, type SfReportKind, type SfReportRow } from './sfReport';

/** Column headers, as Salesforce writes them in the export. */
const COL_NAME = 'Project Name';
const COL_COORDINATOR = 'Scope Of Work Assignment: Full Name';
const COL_STATUS = 'Project Status';
const COL_DOCUMENT = 'Fulfillment: Current Design: Document Name';
/** Reviews report only — the lender this project is financed by. */
const COL_LENDER = 'Lender';

/**
 * The only lender we take off a Reviews report (Aboud 2026-11-03: "we need to
 * import only solrite projects, dont include cash or any other lender").
 * Substring + case-insensitive, because Salesforce writes SOLRITE / Solrite.
 */
const SOLRITE_RE = /solrite/i;

/** The note columns — alerts + AHJ/utility requirements (Aboud 2026-10-21). */
const NOTE_COLS: { key: keyof SfNotes; header: string }[] = [
  { key: 'alerts', header: 'Fulfillment: Scheduling Alerts!' },
  { key: 'ahjDesign', header: 'Fulfillment: Jurisdiction: Design/City Requirements' },
  { key: 'ahjBattery', header: 'Fulfillment: Jurisdiction: Battery Requirements' },
  { key: 'utilityDesign', header: 'Fulfillment: Utility Company: Requirements - Design' },
  { key: 'utilityBattery', header: 'Fulfillment: Utility Company: Battery Requirements' },
];


/** Rows that are report furniture rather than projects. */
const JUNK_ROW_RE = /^(subtotal|grand total|total|confidential|copyright)\b/i;

/** Minimal shape of an exceljs worksheet — typed here so callers need no import. */
interface SheetLike {
  rowCount: number;
  getRow(index: number): { values: unknown };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if (typeof v.text === 'string') return v.text.trim();
    if (v.result !== undefined && v.result !== null) return String(v.result).trim();
    return '';
  }
  return String(value).trim();
}

/** An exceljs worksheet → a plain string grid, so the parser stays pure. */
export function sheetToGrid(sheet: unknown): string[][] {
  const ws = sheet as SheetLike;
  const grid: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    // exceljs row.values is 1-based with a leading hole.
    const raw = ws.getRow(r).values;
    const cells = Array.isArray(raw) ? raw.slice(1) : [];
    grid.push(cells.map(cellText));
  }
  return grid;
}

function detectKind(grid: string[][]): SfReportKind {
  for (const row of grid) {
    for (const cell of row) {
      if (/scope of work assignments\s*[-–]\s*scheduled/i.test(cell)) return 'scheduled';
      if (/scope of work assignments\s*[-–]\s*design/i.test(cell)) return 'design';
      if (/scope of work reviews/i.test(cell)) return 'review';
    }
  }
  return 'unknown';
}

/** Headers carry a sort marker ("… ↑"), so compare on the text alone. */
const headerKey = (s: string) => s.replace(/[↑↓]/g, '').trim().toLowerCase();

function findHeaderRow(grid: string[][]): number {
  const want = headerKey(COL_NAME);
  return grid.findIndex((row) => row.some((c) => headerKey(c) === want));
}

/** "Redesign [Nº 2] - Eric Webber | FF | Rooftop Solar" → "Eric Webber". */
function nameFromDocument(line: string): string {
  const title = line.split('|')[0].trim();
  const cut = title.lastIndexOf(' - ');
  return cut === -1 ? title : title.slice(cut + 3).trim();
}

/** Roster lookup that ignores punctuation — SF writes "Ya'rob", the roster "Yarob". */
function matchRoster(raw: string, roster: string[]): string | null {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const want = key(raw);
  if (!want) return null;
  return roster.find((r) => key(r) === want) ?? null;
}

export function parseSfGrid(grid: string[][], roster: string[]): SfReport {
  const kind = detectKind(grid);
  const base: SfReport = { kind, rows: [], totalRecords: null, complete: false, unreadable: [], skipped: [], warnings: [] };

  if (kind === 'unknown') {
    return {
      ...base,
      error:
        'Could not tell which report this is. Export the "Scope of Work Assignments" report itself (Export → Details Only).',
    };
  }

  const headerRow = findHeaderRow(grid);
  if (headerRow === -1) {
    return { ...base, error: `No "${COL_NAME}" column in this file. Export it with Details Only, not Formatted Report.` };
  }

  const header = grid[headerRow].map(headerKey);
  const col = (name: string) => header.indexOf(headerKey(name));
  const iName = col(COL_NAME);
  const iCoordinator = col(COL_COORDINATOR);
  const iStatus = col(COL_STATUS);
  const iDocument = col(COL_DOCUMENT);
  // Solrite-only, and ONLY on the Reviews report. The other two reports are
  // left exactly as they were, even if a Lender column ever appears on them —
  // narrowing an existing import silently is how rows go missing.
  const iLender = kind === 'review' ? col(COL_LENDER) : -1;
  // Only columns this file actually has. None at all → an older export layout;
  // notes stays undefined so the import cannot wipe what another file wrote.
  const noteCols = NOTE_COLS.map((n) => ({ key: n.key, i: col(n.header) })).filter((n) => n.i !== -1);

  const rows: SfReportRow[] = [];
  const unreadable: string[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r];
    const rawName = cells[iName] ?? '';
    if (!rawName || JUNK_ROW_RE.test(rawName)) continue;

    const name = cleanProjectName(rawName);

    // Lender gate FIRST, so a skipped row never consumes the de-dup slot of a
    // Solrite row with the same name. A blank lender is skipped too — on a
    // Solrite-only import, "unknown" must not be read as "ours".
    if (iLender !== -1 && !SOLRITE_RE.test(cells[iLender] ?? '')) {
      if (!skipped.includes(name)) skipped.push(name);
      continue;
    }

    const key = nameKey(name);
    if (seen.has(key)) continue; // a project listed under two groups is one project
    seen.add(key);

    // The document name repeats the project name — same self-check the paste
    // parser does. Only applied when the column is present and filled.
    const document = iDocument === -1 ? '' : (cells[iDocument] ?? '');
    if (document && projectNameKey(nameFromDocument(document)) !== projectNameKey(rawName)) {
      unreadable.push(`${name} — does not match its design document "${document}".`);
      continue;
    }

    const rawCoordinator = iCoordinator === -1 ? '' : (cells[iCoordinator] ?? '');
    let coordinator = '';
    if (rawCoordinator && rawCoordinator !== '-') {
      const matched = matchRoster(rawCoordinator, roster);
      if (matched) coordinator = matched;
      else warnings.push(`${name}: "${rawCoordinator}" is not on the roster — left unassigned.`);
    }

    const status = iStatus === -1 ? '' : (cells[iStatus] ?? '');
    const cancelled = CANCELLED_STATUS_RE.test(status);

    // Excel keeps CRLF inside multi-line cells; the app is \n everywhere.
    let notes: SfNotes | undefined;
    if (noteCols.length > 0) {
      notes = {};
      for (const n of noteCols) {
        const value = (cells[n.i] ?? '').replace(/\r\n?/g, '\n').trim();
        if (value) notes[n.key] = value;
      }
    }

    rows.push({
      name,
      coordinator,
      status,
      // The Reviews report has no Project Status column at all, but it is
      // filtered on Install Scheduled Date, so every row on it is scheduled by
      // construction. `status` stays '' on purpose — a new row then falls to
      // the board's default label instead of one invented here.
      scheduled: kind === 'review' ? true : !cancelled && SCHEDULED_STATUS_RE.test(status),
      cancelled,
      ...(notes !== undefined ? { notes } : {}),
    });
  }

  // Six projects on the 2026-11-03 export carry TWO lender rows — one GoodLeap
  // (or FCC Finance) and one SOLRITE. The Solrite row imports them, so naming
  // them as "skipped" would be a lie in the preview. Only report a skip when
  // the project did not make it in by some other row.
  const reallySkipped = skipped.filter((n) => !seen.has(nameKey(n)));

  // A file holds every record by definition — there is no half-rendered export,
  // so the paste parser's "found N of M" warning has nothing to warn about.
  return { ...base, rows, totalRecords: rows.length, complete: true, unreadable, skipped: reallySkipped, warnings };
}
