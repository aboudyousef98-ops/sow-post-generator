// Reconciler: a parsed Salesforce report + the board → a plan of what an
// import would do. Pure, so the preview screen and the write read the same
// answer, and the whole thing is testable without a DOM.
//
// Two rules carry the weight here:
//   - a near miss is never resolved automatically. It becomes a question, and
//     the import stays blocked until it is answered. Guessing "same" can lose
//     a real project; guessing "new" is how you end up writing a de-dupe
//     script (scripts/dedupe-projects.mjs already exists).
//   - Schedule beats Design, per row. A Scheduled paste always moves a row to
//     Schedule; a Design paste only fills in a row that has no phase at all,
//     so it can never pull a scheduled job backwards. Aboud, 2026-10-19.

import type { BoardLabel, BoardProject } from '../board/types';
import { nameKey } from './board';
import { splitSections } from './boardViews';
import { hasSfNotes, sfNotesEqual, type SfNotes } from './sfNotes';
import type { SfReport, SfReportKind } from './sfReport';

export type ImportMatch = 'new' | 'matched' | 'maybe' | 'archived';
export type MaybeAnswer = 'same' | 'new';

export interface ImportRow {
  /** Name as the report spells it — also the key for an answer. */
  name: string;
  coordinator: string;
  match: ImportMatch;
  /** The board row this hit (matched / maybe / archived). */
  projectId?: string;
  /** The board's own spelling, so a question can show both. */
  boardName?: string;
  /** The phase this row would end up on, when that differs from today's. */
  phaseChange?: { fromId: string | null; toId: string };
  /**
   * Status label for a NEW row, when Salesforce's own status names one of the
   * board's (today that is "Hold", which lands it in Out of SOW scope).
   * Never set for an existing row — an import does not touch a status someone
   * chose by hand.
   */
  statusId?: string;
  /** Salesforce says this project is cancelled. */
  cancelled?: boolean;
  /**
   * Notes to write (Scheduling Alerts! + AHJ/utility requirements). Set on a
   * NEW row that carries any, or on an existing row whose board copy differs —
   * {} there means "Salesforce cleared them, clear the board's". Never set
   * from a paste (the report has no notes), so a paste cannot wipe them.
   */
  notes?: SfNotes;
}

export interface ImportPlan {
  kind: SfReportKind;
  rows: ImportRow[];
  counts: {
    create: number;
    matched: number;
    maybe: number;
    archived: number;
    phase: number;
    cancelled: number;
    /** EXISTING rows whose Salesforce notes will change (new rows ride on `create`). */
    notes: number;
  };
  /** Rows a Design paste left on Schedule — reported, never silent. */
  stickySchedule: string[];
  /**
   * Rows already on the board that Salesforce now shows as cancelled. Flagged
   * only — Aboud's call (2026-10-19) is that an import never archives.
   */
  cancelledOnBoard: BoardProject[];
  /** Active-section rows the paste does not mention. Empty on a partial paste. */
  absent: BoardProject[];
  warnings: string[];
}

/** Lowercased word tokens with punctuation stripped: "Ya'rob Jr." → [yarob, jr]. */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/** True when the two strings differ by at most one insert, delete or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let slack = 1;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (slack-- === 0) return false;
    if (short.length === long.length) i++; // substitution
    j++; // insertion in `long`
  }
  return true;
}

/**
 * Is this board row close enough to ask about? Three explainable rules, no
 * scoring: same words in any order, one name being the other plus a word, or
 * one character out. Single-word names are excluded from the word rules —
 * "Stone" vs "Stone Jr" is far too thin to raise.
 */
function isNearMiss(reportName: string, boardName: string): boolean {
  const a = tokens(reportName);
  const b = tokens(boardName);
  if (a.length === 0 || b.length === 0) return false;

  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === setB.size && [...setA].every((t) => setB.has(t))) return true;

  if (a.length >= 2 && b.length >= 2) {
    const shared = [...setA].filter((t) => setB.has(t)).length;
    const subset = shared === Math.min(setA.size, setB.size);
    if (subset && shared >= 2) return true;
  }

  return withinOneEdit(a.join(' '), b.join(' '));
}

/** The phase label ids, by seeded id first and by name if someone renamed them. */
function phaseIds(labels: BoardLabel[]): { schedule: string | null; design: string | null } {
  const phases = labels.filter((l) => l.columnKey === 'phase' && !l.archived);
  const pick = (id: string, re: RegExp) =>
    phases.find((l) => l.id === id)?.id ?? phases.find((l) => re.test(l.name))?.id ?? null;
  return { schedule: pick('phase-schedule', /schedul/i), design: pick('phase-design', /design/i) };
}

export function planImport(
  report: SfReport,
  projects: BoardProject[],
  labels: BoardLabel[],
  answers: Record<string, MaybeAnswer> = {},
): ImportPlan {
  const { schedule, design } = phaseIds(labels);
  const counts = { create: 0, matched: 0, maybe: 0, archived: 0, phase: 0, cancelled: 0, notes: 0 };
  const stickySchedule: string[] = [];
  const cancelledOnBoard: BoardProject[] = [];
  /** Board status labels by lowercased name — for the Hold carry-over. */
  const statusByName = new Map(
    labels.filter((l) => l.columnKey === 'status' && !l.archived).map((l) => [l.name.trim().toLowerCase(), l.id]),
  );
  const rows: ImportRow[] = [];
  const warnings = [...report.warnings];

  // A permanently deleted row is gone for everyone — it must never be matched,
  // or the import would resurrect a tombstone.
  const candidates = projects.filter((p) => !p.deletedAt);
  const byKey = new Map(candidates.map((p) => [nameKey(p.name), p]));
  const hitKeys = new Set<string>();

  for (const r of report.rows) {
    const key = nameKey(r.name);
    const exact = byKey.get(key);
    const near = exact ? undefined : candidates.find((p) => isNearMiss(r.name, p.name));
    const answer = answers[r.name];

    let hit: BoardProject | undefined;
    let match: ImportMatch;
    if (exact) {
      hit = exact;
      match = exact.archivedAt ? 'archived' : 'matched';
    } else if (near && answer !== 'new') {
      hit = answer === 'same' ? near : undefined;
      match = answer === 'same' ? (near.archivedAt ? 'archived' : 'matched') : 'maybe';
    } else {
      match = 'new';
    }

    const row: ImportRow = { name: r.name, coordinator: r.coordinator, match };
    if (r.cancelled) {
      row.cancelled = true;
      counts.cancelled++;
      // Already on the board and now dead in Salesforce — worth seeing, but
      // the import does not act on it.
      if ((match === 'matched' || match === 'archived') && hit) cancelledOnBoard.push(hit);
    }
    // Salesforce's status names a board status → a NEW row starts there.
    if (match === 'new') {
      const mapped = statusByName.get(r.status.trim().toLowerCase());
      if (mapped) row.statusId = mapped;
    }
    // Notes: only a source that can see them (the .xlsx) ever sets r.notes.
    if (r.notes !== undefined) {
      if (match === 'new') {
        if (hasSfNotes(r.notes)) row.notes = r.notes;
      } else if (hit && !sfNotesEqual(r.notes, hit.sfNotes)) {
        row.notes = r.notes; // {} here means: Salesforce cleared them
        counts.notes++;
      }
    }
    if (match === 'maybe') {
      row.boardName = near!.name;
      row.projectId = near!.id;
    } else if (hit) {
      row.boardName = hit.name;
      row.projectId = hit.id;
      hitKeys.add(nameKey(hit.name));
    }

    // Which phase this row belongs on. Salesforce's own per-row status wins
    // over the report it was copied from, which is how a Design-report row
    // that is already scheduled lands on Schedule.
    //
    // The Reviews report is the exception: it is imported EVERY morning, so it
    // only ever seeds the phase of a row it creates. Letting it set the phase
    // of existing rows would drag anything a coordinator moved to Design back
    // onto Schedule overnight, every night (Aboud 2026-11-03).
    const seedsPhaseOnly = report.kind === 'review' && match !== 'new';
    const toId = seedsPhaseOnly ? null : r.scheduled || report.kind === 'scheduled' ? schedule : design;
    if (toId) {
      const fromId = match === 'new' ? null : (hit?.phaseId ?? null);
      if (fromId !== toId) {
        if (toId === schedule || fromId === null) {
          row.phaseChange = { fromId, toId };
          if (match !== 'new') counts.phase++;
        } else if (fromId === schedule) {
          stickySchedule.push(r.name);
        }
      }
    }

    counts[match === 'new' ? 'create' : match]++;
    rows.push(row);
  }

  if (!schedule || !design) {
    warnings.push('The Design/Schedule labels could not be found, so no phase will be set.');
  }

  // Only worth saying on a complete paste, and only about rows that could have
  // been on the report at all — completed and out-of-scope rows could not.
  //
  // A project the SOURCE deliberately left out (a non-Solrite row on a Reviews
  // import) was never a candidate either, so it counts as seen. Without this,
  // 30 perfectly live projects would be listed as "not on this report" every
  // morning and the real misses would be lost in the noise.
  let absent: BoardProject[] = [];
  if (report.complete) {
    const skippedKeys = new Set(report.skipped.map(nameKey));
    const { active } = splitSections(
      candidates.filter((p) => !p.archivedAt),
      labels,
    );
    absent = active.filter((p) => {
      const k = nameKey(p.name);
      return !hitKeys.has(k) && !skippedKeys.has(k);
    });
  }

  return { kind: report.kind, rows, counts, stickySchedule, cancelledOnBoard, absent, warnings };
}
