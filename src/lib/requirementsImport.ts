// Bulk import for the Requirements boards (Aboud 2026-11-17) — Phase 2.
//
// ~265 rules collected in a spreadsheet, against a board that could only add
// one rule at a time. This file is the whole decision layer and it is PURE:
// parse a grid, plan what the write would do, apply the plan, undo a batch.
// The modal renders the plan and collects the confirmation; it decides
// nothing. Same split as sfImport/sfReport/ImportModal, for the same reason —
// the interesting parts are testable without a DOM.
//
// Three rules shape everything here:
//   1. Nothing is written until the user confirms. planImport never mutates.
//   2. An import NEVER overwrites. It creates a board or appends to one.
//   3. Every created post carries the batch id, so "Undo this import" can
//      remove exactly what this run added and nothing a human wrote.

import { kindOf, normCategory, normName } from './ahj';
import type { Ahj, AhjPost, RequirementKind, RuleConfidence, RuleStatus } from '../types';

// ---- Columns ---------------------------------------------------------------

/**
 * Accepted header spellings, in the order the export writes them. Matching is
 * case/space-insensitive and accepts a few obvious synonyms, because this file
 * is produced by hand and "Source URL" vs "Source (URL)" is not a real
 * difference worth failing 265 rows over.
 */
export const COLUMNS = {
  name: ['name', 'ahj', 'ahj/utility', 'jurisdiction', 'utility', 'entry'],
  type: ['type', 'board', 'kind'],
  region: ['region'],
  category: ['category', 'section'],
  requirement: ['requirement', 'rule', 'text'],
  details: ['details', 'detail', 'notes', 'note'],
  sourceUrl: ['source', 'source url', 'source (url)', 'url', 'link'],
  sourceDate: ['source date', 'date', 'source_date'],
  origin: ['origin', 'who', 'reported by'],
  confidence: ['confidence'],
  status: ['status'],
  aliases: ['aliases', 'alias'],
} as const;

export type ColumnKey = keyof typeof COLUMNS;

/** The required ones. A file missing any of these is not this kind of file. */
const REQUIRED_COLUMNS: ColumnKey[] = ['name', 'type', 'requirement'];

const headerKey = (s: string) => (s ?? '').replace(/[*↑↓]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// ---- Value normalisation ---------------------------------------------------

/** "AHJ" / "Utility" / "Funding" / "General" → the stored board kind. */
export function parseKind(raw: string): RequirementKind | null {
  const v = headerKey(raw);
  if (!v) return null;
  if (v === 'ahj' || v === 'jurisdiction' || v === 'city' || v === 'county') return 'ahj';
  if (v === 'utility') return 'utility';
  if (v === 'funding' || v === 'solrite') return 'funding';
  if (v === 'general' || v === 'all' || v === 'all jobs') return 'general';
  return null;
}

export function parseConfidence(raw: string): RuleConfidence | undefined {
  const v = headerKey(raw);
  return v === 'high' || v === 'medium' || v === 'low' ? v : undefined;
}

/**
 * Status. ABSENT or unrecognised becomes `current`, matching the house rule
 * that a rule with no status is current — an unreadable status must not
 * silently drop a rule, it must import as current and be visible.
 */
export function parseStatus(raw: string): RuleStatus {
  const v = headerKey(raw);
  if (v === 'to confirm' || v === 'to-confirm' || v === 'unconfirmed') return 'to-confirm';
  if (v === 'superseded' || v === 'obsolete' || v === 'retired') return 'superseded';
  return 'current';
}

/** Aliases are semicolon-separated; commas are left alone (names contain them). */
export function parseAliases(raw: string): string[] {
  return (raw ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The text a rule contributes: the requirement, with details beneath it. */
export function ruleText(requirement: string, details: string): string {
  const r = (requirement ?? '').trim();
  const d = (details ?? '').trim();
  return d ? `${r}\n${d}` : r;
}

/** Dedupe key for a rule's text — case, whitespace and trailing stops ignored. */
export function normRuleText(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.;:]+$/, '')
    .trim();
}

// ---- CSV -------------------------------------------------------------------

/**
 * A correct-enough CSV reader: quoted fields, embedded commas, doubled quotes
 * and embedded newlines. Written here rather than added as a dependency —
 * this is the whole of what a 265-row hand-made export needs.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = (text ?? '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  // A file not ending in a newline still has one last field.
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Tab-separated paste (what a spreadsheet puts on the clipboard). */
export function parsePasted(text: string): string[][] {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
  // A pasted range is tab-separated; fall back to CSV if there are no tabs.
  if (!lines.some((l) => l.includes('\t'))) return parseCsv(text);
  return lines.filter((l) => l.trim()).map((l) => l.split('\t').map((c) => c.trim()));
}

// ---- Rows ------------------------------------------------------------------

export interface RawRow {
  /** 1-based row number in the SOURCE file, so an error points somewhere real. */
  rowNumber: number;
  name: string;
  kind: RequirementKind | null;
  rawType: string;
  region: string;
  category: string;
  requirement: string;
  details: string;
  sourceUrl: string;
  sourceDate: string;
  origin: string;
  confidence?: RuleConfidence;
  status: RuleStatus;
  aliases: string[];
}

export interface RowError {
  rowNumber: number;
  /** Enough of the row to recognise it in the preview. */
  label: string;
  message: string;
}

export interface ParsedRows {
  rows: RawRow[];
  errors: RowError[];
  /** Columns the file did not have, reported so a mis-shaped file is obvious. */
  missingColumns: ColumnKey[];
  error?: string;
}

/** Grid → rows, with every validation failure collected rather than thrown. */
export function parseRequirementsGrid(grid: string[][]): ParsedRows {
  const empty: ParsedRows = { rows: [], errors: [], missingColumns: [] };
  if (!grid.length) return { ...empty, error: 'That file is empty.' };

  // Find the header row: the first row that carries every required column.
  let headerRow = -1;
  let index: Partial<Record<ColumnKey, number>> = {};
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const keys = grid[r].map(headerKey);
    const candidate: Partial<Record<ColumnKey, number>> = {};
    for (const key of Object.keys(COLUMNS) as ColumnKey[]) {
      const i = keys.findIndex((k) => (COLUMNS[key] as readonly string[]).includes(k));
      if (i !== -1) candidate[key] = i;
    }
    if (REQUIRED_COLUMNS.every((k) => candidate[k] !== undefined)) {
      headerRow = r;
      index = candidate;
      break;
    }
  }
  if (headerRow === -1) {
    return {
      ...empty,
      error: `No header row found. The file needs at least these columns: ${REQUIRED_COLUMNS.join(', ')}.`,
    };
  }

  const missingColumns = (Object.keys(COLUMNS) as ColumnKey[]).filter((k) => index[k] === undefined);
  const cell = (cells: string[], key: ColumnKey) => {
    const i = index[key];
    return i === undefined ? '' : (cells[i] ?? '').replace(/\r\n?/g, '\n').trim();
  };

  const rows: RawRow[] = [];
  const errors: RowError[] = [];

  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells.some((c) => (c ?? '').trim())) continue; // blank spacer row
    const rowNumber = r + 1; // 1-based, as a spreadsheet shows it

    const name = cell(cells, 'name');
    const rawType = cell(cells, 'type');
    const requirement = cell(cells, 'requirement');
    const label = name || requirement.slice(0, 40) || `row ${rowNumber}`;

    const kind = parseKind(rawType);
    if (!name) errors.push({ rowNumber, label, message: 'Name is empty.' });
    if (!requirement) errors.push({ rowNumber, label, message: 'Requirement is empty.' });
    if (!rawType) errors.push({ rowNumber, label, message: 'Type is empty.' });
    else if (!kind) errors.push({ rowNumber, label, message: `Type "${rawType}" is not AHJ, Utility, Funding or General.` });
    if (!name || !requirement || !kind) continue;

    rows.push({
      rowNumber,
      name,
      kind,
      rawType,
      region: cell(cells, 'region'),
      category: cell(cells, 'category'),
      requirement,
      details: cell(cells, 'details'),
      sourceUrl: cell(cells, 'sourceUrl'),
      sourceDate: cell(cells, 'sourceDate'),
      origin: cell(cells, 'origin'),
      confidence: parseConfidence(cell(cells, 'confidence')),
      status: parseStatus(cell(cells, 'status')),
      aliases: parseAliases(cell(cells, 'aliases')),
    });
  }

  return { rows, errors, missingColumns };
}

// ---- Plan ------------------------------------------------------------------

export interface PlannedRule {
  rowNumber: number;
  text: string;
  category: string;
  region: string;
  sourceUrl: string;
  sourceDate: string;
  origin: string;
  confidence?: RuleConfidence;
  status: RuleStatus;
}

export interface PlannedEntry {
  name: string;
  kind: RequirementKind;
  /** Set when a board with this name+kind already exists — we APPEND to it. */
  existingId?: string;
  /** Aliases in the file that the existing board does not already carry. */
  aliasesToAdd: string[];
  rules: PlannedRule[];
}

export interface DuplicateRow {
  rowNumber: number;
  label: string;
  /** 'file' = the same rule twice in the sheet; 'board' = already on the board. */
  against: 'file' | 'board';
}

export interface CategoryCount {
  label: string;
  count: number;
  /** A category that looks like a near-miss of a bigger one — likely a typo. */
  nearMatch?: string;
}

export interface RequirementsPlan {
  entries: PlannedEntry[];
  errors: RowError[];
  duplicates: DuplicateRow[];
  /** Rows left out because of the status filter, named rather than dropped. */
  skippedByStatus: { rowNumber: number; label: string; status: RuleStatus }[];
  categories: CategoryCount[];
  counts: {
    rows: number;
    newEntries: number;
    existingEntries: number;
    newRules: number;
    duplicates: number;
    skippedByStatus: number;
    errors: number;
  };
}

export interface PlanOptions {
  /** Import "To confirm" rows too. Off by default (Aboud's spec). */
  includeToConfirm?: boolean;
}

/** Edit distance, capped — only used to spot likely category typos. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Plan the import. PURE — reads the boards, writes nothing.
 *
 * Grouping is by name + kind, which is why Region is metadata on a rule and
 * not part of the key: "Harris County / AHJ" is one board whether the rule was
 * collected in Houston or anywhere else.
 */
export function planRequirementsImport(
  parsed: ParsedRows,
  boards: Ahj[],
  opts: PlanOptions = {},
): RequirementsPlan {
  const entries = new Map<string, PlannedEntry>();
  const duplicates: DuplicateRow[] = [];
  const skippedByStatus: RequirementsPlan['skippedByStatus'] = [];
  const seenInFile = new Set<string>();

  // Existing rule text per board, so an import cannot re-add what is there.
  const existingText = new Map<string, Set<string>>();
  for (const b of boards) {
    const key = `${normName(b.name)}|${kindOf(b)}`;
    existingText.set(key, new Set(b.posts.filter((p) => !p.deleted).map((p) => normRuleText(p.text))));
  }

  // Aliases are collected from EVERY valid row, before the status filter.
  //
  // An alias describes the BOARD, not the rule, and a sheet naturally carries
  // it on the entry's first row. If that row happened to be "To confirm" the
  // status gate would drop it and the board would silently lose its alias —
  // which is how "CNP" stops matching CenterPoint. Found by the real-.xlsx
  // test, 2026-11-17.
  const aliasesByKey = new Map<string, string[]>();
  for (const row of parsed.rows) {
    if (!row.aliases.length) continue;
    const key = `${normName(row.name)}|${row.kind as RequirementKind}`;
    const list = aliasesByKey.get(key) ?? [];
    for (const a of row.aliases) if (!list.some((x) => normName(x) === normName(a))) list.push(a);
    aliasesByKey.set(key, list);
  }

  for (const row of parsed.rows) {
    const label = row.name;
    // Superseded never imports; to-confirm only when asked for.
    if (row.status === 'superseded' || (row.status === 'to-confirm' && !opts.includeToConfirm)) {
      skippedByStatus.push({ rowNumber: row.rowNumber, label, status: row.status });
      continue;
    }

    const kind = row.kind as RequirementKind;
    const key = `${normName(row.name)}|${kind}`;
    const text = ruleText(row.requirement, row.details);
    const textKey = normRuleText(text);

    // Same rule twice in the sheet.
    const fileKey = `${key}|${textKey}`;
    if (seenInFile.has(fileKey)) {
      duplicates.push({ rowNumber: row.rowNumber, label, against: 'file' });
      continue;
    }
    seenInFile.add(fileKey);

    // Already on the board.
    if (existingText.get(key)?.has(textKey)) {
      duplicates.push({ rowNumber: row.rowNumber, label, against: 'board' });
      continue;
    }

    let entry = entries.get(key);
    if (!entry) {
      const existing = boards.find((b) => normName(b.name) === normName(row.name) && kindOf(b) === kind);
      entry = {
        name: existing?.name ?? row.name,
        kind,
        ...(existing ? { existingId: existing.id } : {}),
        aliasesToAdd: [],
        rules: [],
      };
      entries.set(key, entry);
    }

    entry.rules.push({
      rowNumber: row.rowNumber,
      text,
      category: row.category,
      region: row.region,
      sourceUrl: row.sourceUrl,
      sourceDate: row.sourceDate,
      origin: row.origin,
      ...(row.confidence ? { confidence: row.confidence } : {}),
      status: row.status,
    });
  }

  // Attach the aliases, now that we know which entries actually exist.
  // Union, never a replacement: an import must not drop an alias a human
  // added, nor re-add one the board already carries, nor restate the name.
  for (const [key, entry] of entries) {
    const existingBoard = entry.existingId ? boards.find((b) => b.id === entry.existingId) : undefined;
    for (const a of aliasesByKey.get(key) ?? []) {
      const already =
        existingBoard?.aliases.some((x) => normName(x) === normName(a)) ||
        entry.aliasesToAdd.some((x) => normName(x) === normName(a)) ||
        normName(a) === normName(entry.name);
      if (!already) entry.aliasesToAdd.push(a);
    }
  }

  // Category census, with near-miss detection so a typo is caught BEFORE the
  // write rather than discovered as a stray group afterwards.
  const catCounts = new Map<string, { label: string; count: number }>();
  for (const e of entries.values()) {
    for (const r of e.rules) {
      const k = normCategory(r.category);
      if (!k) continue;
      const c = catCounts.get(k);
      if (c) c.count++;
      else catCounts.set(k, { label: r.category.trim(), count: 1 });
    }
  }
  const cats = [...catCounts.entries()].sort((a, b) => b[1].count - a[1].count);
  const categories: CategoryCount[] = cats.map(([key, v]) => {
    // Only a SMALL category can be a typo of a bigger one — the big one is
    // the intended spelling by weight of numbers.
    const near = cats.find(
      ([otherKey, other]) => otherKey !== key && other.count > v.count * 3 && editDistance(key, otherKey) <= 2,
    );
    return { label: v.label, count: v.count, ...(near ? { nearMatch: near[1].label } : {}) };
  });

  const list = [...entries.values()].filter((e) => e.rules.length);
  return {
    entries: list,
    errors: parsed.errors,
    duplicates,
    skippedByStatus,
    categories,
    counts: {
      rows: parsed.rows.length,
      newEntries: list.filter((e) => !e.existingId).length,
      existingEntries: list.filter((e) => e.existingId).length,
      newRules: list.reduce((n, e) => n + e.rules.length, 0),
      duplicates: duplicates.length,
      skippedByStatus: skippedByStatus.length,
      errors: parsed.errors.length,
    },
  };
}

// ---- Apply / undo ----------------------------------------------------------

export interface ApplyMeta {
  /** Who the imported posts are attributed to. */
  by: string;
  /** ISO timestamp for every post this run creates. */
  now: string;
  batchId: string;
  newId: () => string;
}

/**
 * Apply a plan. Creates a board when there is none and APPENDS when there is —
 * an existing post is never touched, which is what "never overwrite" means.
 */
export function applyRequirementsImport(boards: Ahj[], plan: RequirementsPlan, meta: ApplyMeta): Ahj[] {
  const out = boards.slice();

  for (const entry of plan.entries) {
    const posts: AhjPost[] = entry.rules.map((r) => ({
      id: meta.newId(),
      text: r.text,
      by: meta.by,
      at: meta.now,
      history: [],
      pinned: false,
      updatedAt: meta.now,
      ...(r.category ? { category: r.category } : {}),
      ...(r.region ? { region: r.region } : {}),
      ...(r.confidence ? { confidence: r.confidence } : {}),
      // `current` is the default everywhere, so storing it would be noise.
      ...(r.status !== 'current' ? { status: r.status } : {}),
      ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}),
      ...(r.sourceDate ? { sourceDate: r.sourceDate } : {}),
      ...(r.origin ? { origin: r.origin } : {}),
      importBatchId: meta.batchId,
    }));

    const i = entry.existingId ? out.findIndex((b) => b.id === entry.existingId) : -1;
    if (i === -1) {
      out.push({
        id: meta.newId(),
        name: entry.name,
        aliases: entry.aliasesToAdd.slice(),
        posts,
        kind: entry.kind,
        updatedAt: meta.now,
        schemaVersion: 1,
      });
    } else {
      const b = out[i];
      out[i] = {
        ...b,
        // Append, never replace. New posts first matches the board's own
        // newest-first reading order.
        posts: [...posts, ...b.posts],
        aliases: [...b.aliases, ...entry.aliasesToAdd],
        // Meta bumped only when the aliases actually changed — updatedAt is
        // the meta merge key, and bumping it for nothing would beat a
        // concurrent rename from another machine.
        ...(entry.aliasesToAdd.length ? { updatedAt: meta.now } : {}),
      };
    }
  }

  return out;
}

export interface ImportBatch {
  batchId: string;
  /** Posts still carrying this batch id. */
  count: number;
  /** When the batch was written (the earliest post in it). */
  at: string;
  by: string;
  /** Board names this batch touched, for the undo confirm. */
  boards: string[];
}

/**
 * Every import batch still present in the data, newest first.
 *
 * Derived by scanning the posts rather than stored anywhere: a batch has no
 * existence of its own once its posts are gone, so there is no list to keep
 * in sync and no orphan record to clean up.
 */
export function listImportBatches(boards: Ahj[]): ImportBatch[] {
  const map = new Map<string, ImportBatch>();
  for (const b of boards) {
    for (const p of b.posts) {
      if (!p.importBatchId) continue;
      const e = map.get(p.importBatchId);
      if (!e) {
        map.set(p.importBatchId, { batchId: p.importBatchId, count: 1, at: p.at, by: p.by, boards: [b.name] });
      } else {
        e.count++;
        if (p.at < e.at) e.at = p.at;
        if (!e.boards.includes(b.name)) e.boards.push(b.name);
      }
    }
  }
  return [...map.values()].sort((x, y) => y.at.localeCompare(x.at));
}

/** How many posts an undo would remove — for the confirm step. */
export function countImportBatch(boards: Ahj[], batchId: string): number {
  return boards.reduce((n, b) => n + b.posts.filter((p) => p.importBatchId === batchId).length, 0);
}

/**
 * Remove exactly the posts one import created.
 *
 * A post a human EDITED since the import is kept — `editedAt` is the signal
 * that it is no longer purely imported content, and silently discarding
 * someone's edit is the one thing an undo must never do. A board the import
 * created, left with no posts at all, is removed too.
 */
export function undoImportBatch(boards: Ahj[], batchId: string): { boards: Ahj[]; removed: number; keptEdited: number } {
  let removed = 0;
  let keptEdited = 0;
  const out: Ahj[] = [];

  for (const b of boards) {
    const createdByThisBatch = b.posts.length > 0 && b.posts.every((p) => p.importBatchId === batchId);
    const posts = b.posts.filter((p) => {
      if (p.importBatchId !== batchId) return true;
      if (p.editedAt) { keptEdited++; return true; }
      removed++;
      return false;
    });
    // A board this import created, now empty again, goes with it.
    if (createdByThisBatch && posts.length === 0) continue;
    out.push(posts.length === b.posts.length ? b : { ...b, posts });
  }

  return { boards: out, removed, keptEdited };
}
