// Salesforce REPORT paste parser — the "Scope of Work Assignments" reports,
// as copied out of the browser. Deterministic, no AI, same house rule as
// lib/parser.ts (which reads a single RECORD page — a different shape).
//
// The reports have DIFFERENT columns (Scheduled carries Street Address, Design
// carries Fulfillment Coordinator), so this parser never counts columns. It
// anchors on two structural facts that hold in both:
//
//   1. every row contains the line "feature not included" exactly once — it is
//      the broken "Scope of Work Complete" column. The line before it is the
//      SOW coordinator, the line after it is the project name.
//   2. every row ENDS with a document name containing "| FF |" (or "| PA |"),
//      which repeats the project name — so each row is cross-checked against
//      itself, and a row that fails is reported rather than imported.
//
// Everything else in the paste — the header block, the "Sorted by …" lines,
// the date-group headers, Subtotal/Total — is ignored by construction, because
// it carries no anchor.

import { cleanName, nameKey } from './board';
import { titleCaseName } from './nameCase';
import type { SfNotes } from './sfNotes';

/**
 * `review` is the "Scope of Work Reviews" export (Aboud 2026-11-03), imported
 * daily and filtered to Solrite. Unlike the other two it has no Project Status
 * column — see parseSfGrid for what that means for `status`/`scheduled`.
 */
export type SfReportKind = 'scheduled' | 'design' | 'review' | 'unknown';

export interface SfReportRow {
  /** Project/customer name, cleaned and title-cased. */
  name: string;
  /** Roster display name; '' when the report says '-' or the name is unknown. */
  coordinator: string;
  /**
   * Salesforce's own Project Status, verbatim — "Install Scheduled", "AHJ",
   * "Cancel", "Hold". Kept raw because the board may have a status label of
   * the same name, and a new row should land on it (Aboud, 2026-10-19).
   */
  status: string;
  /**
   * Salesforce's own Project Status says this job is already scheduled. True
   * even on the Design report — "Okernithia Shepherd" is exactly that case —
   * and it is what makes Schedule win over Design per row, not just per paste.
   */
  scheduled: boolean;
  /** Status is Cancel. Imported like any other row, but counted separately. */
  cancelled: boolean;
  /**
   * Scheduling Alerts! + AHJ/utility requirements. ONLY the .xlsx export sets
   * this (the browser paste has no such columns) — undefined means "this
   * source cannot see notes", so an import leaves the board's copy alone,
   * while {} from an export means Salesforce really has none.
   */
  notes?: SfNotes;
}

export interface SfReport {
  kind: SfReportKind;
  rows: SfReportRow[];
  /** The report's own record count, when the header was included. */
  totalRecords: number | null;
  /** Every row the report claims was read. Gates the "not on this report" list. */
  complete: boolean;
  /** One human-readable line per row that could not be trusted. */
  unreadable: string[];
  /**
   * Project names this source deliberately left out — today, the non-Solrite
   * rows of a `review` report (Aboud 2026-11-03). Reported rather than
   * silently dropped: the reconciler needs to tell "we chose to skip this"
   * from "this was not on the report", or 36 perfectly live projects would be
   * listed as missing every single morning. Always [] for the other kinds.
   */
  skipped: string[];
  warnings: string[];
  /** Set → nothing can be imported from this paste. */
  error?: string;
}

/**
 * Salesforce decorates some project names with a tag emoji — the export has
 * "MEWELDE J Moore 🏷️" while its own design document says "MEWELDE J Moore".
 * Left in, it fails the document cross-check AND poisons name matching against
 * the board forever, so it comes off before anything else happens.
 */
// Alternation rather than a character class: a class mixing pictographs with
// variation selectors splits a grapheme and is flagged by
// no-misleading-character-class — correctly, since 🏷️ is U+1F3F7 U+FE0F.
const DECORATION_RE = /\p{Extended_Pictographic}|\p{Variation_Selector}|\u200D/gu;

/** Suffixes title-casing would otherwise mangle into "Iii" / "Jr". */
const SUFFIXES: Record<string, string> = {
  ii: 'II', iii: 'III', iv: 'IV', vi: 'VI', vii: 'VII', jr: 'Jr', sr: 'Sr',
};

/** The name as it should appear on the board: undecorated, cleaned, title-cased. */
export function cleanProjectName(raw: string): string {
  const titled = titleCaseName(cleanName(raw.replace(DECORATION_RE, ' ')));
  return titled
    .split(' ')
    .map((word) => SUFFIXES[word.toLowerCase()] ?? word)
    .join(' ');
}

/** Comparison key that ignores the decorations above. */
export function projectNameKey(raw: string): string {
  return nameKey(raw.replace(DECORATION_RE, ' '));
}

const ANCHOR = 'feature not included';
/** The document-name line, e.g. "Design Request - Susan Stone | FF | Rooftop Solar". */
const DOC_NAME_RE = /\|\s*(?:FF|PA)\s*\|/;
/**
 * Salesforce Project Status values meaning the job is at or past scheduling.
 * "Install Initiated" means the install has already started, so it is
 * certainly not design work. Shared with lib/sfWorkbook.ts so the paste and
 * the export can never disagree about what a status means.
 */
export const SCHEDULED_STATUS_RE = /install\s*(scheduled|initiated)/i;
/** …and the one that means the job is dead. */
export const CANCELLED_STATUS_RE = /^cancel/i;

function detectKind(lines: string[]): SfReportKind {
  for (const line of lines) {
    if (/scope of work assignments\s*[-–]\s*scheduled/i.test(line)) return 'scheduled';
    if (/scope of work assignments\s*[-–]\s*design/i.test(line)) return 'design';
  }
  // Fallback: the column the report is grouped by differs between the two.
  for (const line of lines) {
    if (/^install scheduled date$/i.test(line)) return 'scheduled';
    if (/^fulfillment:\s*ahj start date$/i.test(line)) return 'design';
  }
  return 'unknown';
}

function readTotalRecords(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i].match(/^Total Records\s+(\d+)$/i);
    if (inline) return Number(inline[1]);
    // The header also renders it across two lines.
    if (/^Total Records$/i.test(lines[i]) && /^\d+$/.test(lines[i + 1] ?? '')) return Number(lines[i + 1]);
    const total = lines[i].match(/^Total\((\d+)\)$/i);
    if (total) return Number(total[1]);
  }
  return null;
}

/** Nearest non-empty line before/after `from`, exclusive. '' when there is none. */
function prevNonEmpty(lines: string[], from: number, stop = 0): string {
  for (let i = from - 1; i >= stop; i--) if (lines[i]) return lines[i];
  return '';
}
function nextNonEmpty(lines: string[], from: number, stop: number): string {
  for (let i = from + 1; i < stop; i++) if (lines[i]) return lines[i];
  return '';
}

/** "Redesign [Nº 1] - Karan Staggers | FF | Rooftop Solar" → "Karan Staggers". */
function nameFromDocument(line: string): string {
  const title = line.split('|')[0].trim();
  const cut = title.lastIndexOf(' - ');
  return cut === -1 ? title : title.slice(cut + 3).trim();
}

/** Roster lookup that tolerates punctuation — SF writes "Ya'rob", the roster "Yarob". */
function matchRoster(raw: string, roster: string[]): string | null {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const want = key(raw);
  if (!want) return null;
  return roster.find((r) => key(r) === want) ?? null;
}

export function parseSfReport(input: string, roster: string[]): SfReport {
  // Blank lines are NOT dropped — the installer-notes column contains them, and
  // they are what keeps one row's notes from running into the next row's data.
  const lines = input.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());

  const kind = detectKind(lines);
  const totalRecords = readTotalRecords(lines);
  const base: SfReport = { kind, rows: [], totalRecords, complete: false, unreadable: [], skipped: [], warnings: [] };

  if (kind === 'unknown') {
    return {
      ...base,
      error:
        'Could not tell which report this is. Copy the whole "Scope of Work Assignments" report, including its header.',
    };
  }

  const anchors: number[] = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].toLowerCase() === ANCHOR) anchors.push(i);

  if (anchors.length === 0) {
    return {
      ...base,
      error: 'No project rows found in this paste. Select the report table itself and copy it again.',
    };
  }

  const rows: SfReportRow[] = [];
  const unreadable: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (let a = 0; a < anchors.length; a++) {
    const at = anchors[a];
    const end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;
    const start = a === 0 ? 0 : anchors[a - 1];

    const rawName = nextNonEmpty(lines, at, end);
    const label = rawName || `row ${a + 1}`;

    // The document name both terminates the row and repeats the project name.
    let doc = -1;
    for (let i = at + 1; i < end; i++) {
      if (DOC_NAME_RE.test(lines[i])) {
        doc = i;
        break;
      }
    }
    if (doc === -1) {
      unreadable.push(`${label} — the row is cut off (no design document name). Copy the report again.`);
      continue;
    }
    if (projectNameKey(nameFromDocument(lines[doc])) !== projectNameKey(rawName)) {
      unreadable.push(`${label} — does not match its design document "${lines[doc]}".`);
      continue;
    }

    const name = titleCaseName(cleanName(rawName));
    const key = nameKey(name);
    if (seen.has(key)) continue; // listed under two dates — one project
    seen.add(key);

    const rawCoordinator = prevNonEmpty(lines, at, start);
    let coordinator = '';
    if (rawCoordinator && rawCoordinator !== '-') {
      const matched = matchRoster(rawCoordinator, roster);
      if (matched) coordinator = matched;
      else warnings.push(`${name}: "${rawCoordinator}" is not on the roster — left unassigned.`);
    }

    // Project Status is the line immediately before the document name.
    const status = prevNonEmpty(lines, doc, at);
    const cancelled = CANCELLED_STATUS_RE.test(status);
    rows.push({
      name,
      coordinator,
      status,
      // A cancelled job is never "scheduled", whatever else the row says.
      scheduled: !cancelled && SCHEDULED_STATUS_RE.test(status),
      cancelled,
    });
  }

  const complete = totalRecords !== null && rows.length === totalRecords;
  if (totalRecords !== null && rows.length < totalRecords) {
    warnings.push(
      `Found ${rows.length} of the ${totalRecords} records this report says it has. Expand every date group in Salesforce before copying, or import these ${rows.length} now.`,
    );
  }

  return { ...base, rows, complete, unreadable, warnings };
}
