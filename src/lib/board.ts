// Project Board logic — pure functions only, mirrored contracts with
// mergeRecords()/mergeAhjs(). The server (netlify/functions/board.mts) and the
// localStorage cache both merge with the same rules, so any two copies of the
// board converge no matter the push order.

import type {
  BoardActivity,
  BoardLabel,
  BoardPrefs,
  BoardProject,
  BoardState,
  LabelColumnKey,
} from '../board/types';
import { renameLegacyNames } from './renames';
import { sfNotesEqual, sfNotesSummary } from './sfNotes';

// ---- labels -----------------------------------------------------------------

/** The 16-swatch monday-like palette offered in "Edit labels" (spec §5.3). */
export const LABEL_PALETTE = [
  '#00C875', '#FDAB3D', '#E2445C', '#579BFC', '#A25DDC', '#0086C0', '#037F4C', '#9CD326',
  '#FFCB00', '#FF642E', '#FF158A', '#BB3354', '#784BD1', '#66CCFF', '#808080', '#C4C4C4',
] as const;

/**
 * White or dark ink per swatch via relative luminance, so label text stays
 * readable on light colors like #FFCB00 — never hard-code white (spec §5.3).
 */
export function labelTextColor(hex: string): string {
  const m = hex.match(/^#([0-9A-Fa-f]{6})$/);
  if (!m) return '#323338';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#323338' : '#ffffff';
}

/**
 * Seeded system labels. FIXED ids + epoch updatedAt: two browsers seeding
 * concurrently merge into one copy, and any user rename/recolor (which bumps
 * updatedAt) wins over a re-seed forever.
 */
const SEED_STAMP = '1970-01-01T00:00:00.000Z';
export function seedLabels(): BoardLabel[] {
  const mk = (
    id: string, columnKey: LabelColumnKey, name: string, color: string,
    sortOrder: number, isDefault: boolean, isDone: boolean,
  ): BoardLabel => ({
    id, columnKey, name, color, sortOrder, isDefault, isDone,
    isSystem: true, archived: false, updatedAt: SEED_STAMP,
  });
  // Status sortOrder is now a PIPELINE RANK, not just a list order: it is what
  // the always-ordered board sorts by (Aboud 2026-11-05 — "Working on it" at
  // the top, "New project" at the bottom, everything else between).
  //
  // 5 and 999 bracket the team's own labels, which live at 30–180. Both of
  // these two still carry SEED_STAMP on the live board (verified against the
  // 2026-11-03 backup), so this re-seed reaches them: mergeById only lets a
  // stored copy win when it is strictly NEWER, and 1970 == 1970. "Done" was
  // edited on 2026-10-05 and therefore keeps its own 30, which is fine — done
  // rows live in the Completed section, so their rank never orders the board.
  //
  // Anyone can override this forever with the ↑/↓ in Edit labels: that bumps
  // updatedAt, and a deliberate choice always beats a re-seed.
  // The Pre-Design seeds (Aboud 2026-11-15, the SVT collab taskforce) are NOT
  // system labels: if the taskforce is ever retired the team must be able to
  // archive them, and the merge keeps an archive forever (it bumps updatedAt,
  // which beats the epoch-stamped re-seed).
  const soft = (
    id: string, columnKey: LabelColumnKey, name: string, color: string,
    sortOrder: number, isDefault: boolean,
  ): BoardLabel => ({
    id, columnKey, name, color, sortOrder, isDefault, isDone: false,
    isSystem: false, archived: false, updatedAt: SEED_STAMP,
  });
  return [
    mk('status-working', 'status', 'Working on it', '#FDAB3D', 5, false, false),
    mk('status-done', 'status', 'Done', '#00C875', 90, false, true),
    // Ranked 175, just before the live board's "Installation Review" (180) —
    // deliberately INSIDE the team's 30–180 range: it is a pipeline stage of
    // theirs, not a bracket. The section flag rides the name default
    // (isPredesignLabel), so there is no boolean to migrate.
    soft('status-predesign', 'status', 'Pre-Design', '#66CCFF', 175, false),
    // Cancelled (Aboud 2026-11-24): a terminal, out-of-scope state. Unlike
    // Hold/Sonnen/ENPHASE it ships as a seed so it exists on fresh installs,
    // in neutral grey (#808080, from LABEL_PALETTE). It routes to Out of SOW
    // scope on its NAME default (OUT_OF_SCOPE_DEFAULT_NAMES), the same contract
    // as the team-created parked statuses — no stored boolean to migrate.
    // Ranked 950: a terminal state trails the pipeline but still before the
    // "New project" bracket; cancelled rows live in their own section, so the
    // rank only orders Group-by-Status, never the active board.
    mk('status-cancelled', 'status', 'Cancelled', '#808080', 950, false, false),
    mk('status-new', 'status', 'New project', '#579BFC', 999, true, false),
    mk('phase-design', 'phase', 'Design', '#A25DDC', 10, false, false),
    mk('phase-schedule', 'phase', 'Schedule', '#0086C0', 20, false, false),
    // The Pre-Design sub-status column — the four states Aboud named, colored
    // like their status-column namesakes where one exists.
    soft('predesign-working', 'predesign', 'Working on it', '#FDAB3D', 10, true),
    soft('predesign-done', 'predesign', 'Done', '#00C875', 20, false),
    soft('predesign-pending-info', 'predesign', 'Pending Additional Information', '#784BD1', 30, false),
    soft('predesign-pending-updates', 'predesign', 'Pending Updates', '#FF642E', 40, false),
  ];
}

/**
 * Status labels that sit OUTSIDE the SOW pipeline unless someone says
 * otherwise — Aboud 2026-10-19. These already exist on the live board as
 * team-created labels, so there is nothing to seed and nothing to migrate: the
 * names are matched case-insensitively and the result is only a DEFAULT.
 *
 * Tick/untick "out of scope" in Edit labels and the explicit boolean is stored
 * (which bumps updatedAt), so a deliberate choice always beats this list —
 * same contract as a rename beating a re-seed. Cancelled is NOT in this list —
 * see `isCancelledLabel`, which it is hardened against instead.
 */
const OUT_OF_SCOPE_DEFAULT_NAMES = new Set(['hold', 'sonnen', 'enphase']);

/**
 * True when a status label means "parked, not our scope".
 *
 * `isDone` wins: a label marked both belongs in Completed, because that is the
 * stronger statement about the work. The two are kept mutually exclusive in
 * Edit labels, so this only matters for data written by an older client.
 *
 * Cancelled wins next, and UNCONDITIONALLY — a cancelled project must never
 * count toward coordinator loads, active-project totals, or assignment
 * suggestions (Aboud 2026-11-26), the same guarantee `isDone` already has.
 * Hold/Sonnen/ENPHASE stay admin-overridable via the stored boolean; Cancelled
 * does not, because there is no legitimate case for a cancelled project to
 * still read as active work.
 */
export function isOutOfScopeLabel(label: BoardLabel | undefined): boolean {
  if (!label || label.columnKey !== 'status' || label.isDone) return false;
  if (isCancelledLabel(label)) return true;
  if (typeof label.outOfScope === 'boolean') return label.outOfScope;
  return OUT_OF_SCOPE_DEFAULT_NAMES.has(label.name.trim().toLowerCase());
}

/** Ids of every out-of-scope status label — the set BoardTab splits rows with. */
export function outOfScopeStatusIds(labels: BoardLabel[]): Set<string> {
  return new Set(labels.filter(isOutOfScopeLabel).map((l) => l.id));
}

/**
 * "Cancelled" status labels (Aboud 2026-11-24, hardened 2026-11-26). Matches
 * any status named "Cancelled"/"Canceled" or a variant that starts with
 * "cancel" ("Cancelled — duplicate", "Project Canceled by HO", …), so a
 * team's own wording still counts. Drives BOTH the attention-nudge mute
 * (install-soon / 0★ / stale aging dot) AND, via `isOutOfScopeLabel` above,
 * the section split — so it is excluded from coordinator loads and
 * active-project counts the same way Hold/Sonnen/ENPHASE are.
 */
export function isCancelledLabel(label: BoardLabel | undefined): boolean {
  if (!label || label.columnKey !== 'status') return false;
  return label.name.trim().toLowerCase().startsWith('cancel');
}

/** Ids of every cancelled status label — the set that mutes the attention flags. */
export function cancelledStatusIds(labels: BoardLabel[]): Set<string> {
  return new Set(labels.filter(isCancelledLabel).map((l) => l.id));
}

/**
 * Status labels that mean "waiting on an installation review" (Aboud
 * 2026-11-03). Same shape as isOutOfScopeLabel: an explicit tick wins, and the
 * name default makes the status he had already created work immediately.
 *
 * `isDone` beats this for the same reason it beats out-of-scope — finished is
 * the stronger statement — and this in turn beats out-of-scope, so a label
 * flagged both lands in the more specific of the two.
 */
const REVIEW_DEFAULT_NAMES = new Set(['installation review']);

export function isReviewLabel(label: BoardLabel | undefined): boolean {
  if (!label || label.columnKey !== 'status' || label.isDone) return false;
  if (typeof label.review === 'boolean') return label.review;
  return REVIEW_DEFAULT_NAMES.has(label.name.trim().toLowerCase());
}

/** Ids of every installation-review status label. */
export function reviewStatusIds(labels: BoardLabel[]): Set<string> {
  return new Set(labels.filter(isReviewLabel).map((l) => l.id));
}

/**
 * Status labels that mean "pre-design analysis in progress" (Aboud 2026-11-15,
 * the SVT collab taskforce). Same shape as isReviewLabel: an explicit tick
 * wins, and the name default makes the seeded "Pre-Design" status work with
 * no migration. `isDone` beats it, same reasoning as the other two sections;
 * splitSections puts review before this and this before out-of-scope.
 */
const PREDESIGN_DEFAULT_NAMES = new Set(['pre-design', 'predesign', 'pre design']);

export function isPredesignLabel(label: BoardLabel | undefined): boolean {
  if (!label || label.columnKey !== 'status' || label.isDone) return false;
  if (typeof label.predesign === 'boolean') return label.predesign;
  return PREDESIGN_DEFAULT_NAMES.has(label.name.trim().toLowerCase());
}

/** Ids of every pre-design status label. */
export function predesignStatusIds(labels: BoardLabel[]): Set<string> {
  return new Set(labels.filter(isPredesignLabel).map((l) => l.id));
}

export function emptyBoard(): BoardState {
  return { projects: [], labels: seedLabels(), activity: [], updates: [] };
}

/**
 * Is the board always ordered by status? Absent prefs mean YES — it is the
 * default as of 2026-11-05, and a board written before that date must not need
 * a migration to behave. Read through this, never off `prefs` directly.
 */
export function autoSortOn(board: Pick<BoardState, 'prefs'>): boolean {
  return board.prefs?.autoSortByStatus ?? true;
}

/** The pref object to store for a toggle, stamped so the merge can resolve it. */
export function nextPrefs(on: boolean, actor: string, now: string = new Date().toISOString()): BoardPrefs {
  return { autoSortByStatus: on, updatedAt: now, updatedBy: actor };
}

export function labelsFor(labels: BoardLabel[], columnKey: LabelColumnKey): BoardLabel[] {
  return labels
    .filter((l) => l.columnKey === columnKey && !l.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function defaultLabel(labels: BoardLabel[], columnKey: LabelColumnKey): BoardLabel | undefined {
  return labelsFor(labels, columnKey).find((l) => l.isDefault) ?? labelsFor(labels, columnKey)[0];
}

export function labelById(labels: BoardLabel[], id: string | null): BoardLabel | undefined {
  return id ? labels.find((l) => l.id === id) : undefined;
}

// ---- merge ------------------------------------------------------------------

// 5000, was 1000 until 2026-10-21: prod sat at exactly 1000 while a full
// 62-row Salesforce import spends ~62 entries per run — history was being
// truncated on every write. ~200 bytes an entry keeps the blob well under 2 MB.
const ACTIVITY_CAP = 5000;

function mergeById<T extends { id: string; updatedAt: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  for (const item of incoming ?? []) {
    if (!item?.id) continue;
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/**
 * Merge two board snapshots. Projects/labels: newer `updatedAt` per id wins.
 * Activity: append-only union by id, newest first, capped so the store can
 * never grow without bound.
 */
export function mergeBoard(rawCurrent: BoardState, rawIncoming: Partial<BoardState>): BoardState {
  // Legacy display names are normalised on the way in, on BOTH sides. Every
  // load — cache and server alike — passes through here, and a rename does not
  // move `updatedAt`, so without this the merge would keep returning the old
  // spelling forever. See lib/renames.ts.
  const current = renameLegacyNames(rawCurrent);
  const incoming = renameLegacyNames(rawIncoming);
  const activityById = new Map(current.activity.map((a) => [a.id, a]));
  for (const a of incoming.activity ?? []) {
    if (a?.id && !activityById.has(a.id)) activityById.set(a.id, a);
  }
  const activity = [...activityById.values()]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, ACTIVITY_CAP);

  // Seeds are merged in last-loses: any stored copy of a system label carries
  // a newer updatedAt than the epoch stamp, so edits survive re-seeding.
  const labels = mergeById(mergeById(seedLabels(), current.labels), incoming.labels ?? []);

  return {
    projects: mergeById(current.projects, incoming.projects ?? []),
    labels,
    activity,
    // `updates` post-dates the first boards, so both sides may be undefined.
    // Newer `updatedAt` per id wins, exactly like projects — that is what lets
    // an edit or a delete tombstone propagate between people.
    updates: mergeById(current.updates ?? [], incoming.updates ?? []),
    // `prefs` is ONE object, not an id-keyed list, so mergeById cannot carry
    // it: newer updatedAt wins outright. Either side may be undefined (every
    // board written before 2026-11-05 has no prefs), and a side that HAS one
    // beats a side that does not — otherwise the person who switched auto-sort
    // on would have it switched back by the next sync from a stale cache.
    prefs: newerPrefs(current.prefs, incoming.prefs),
    // Same id/updatedAt contract as labels and updates, tombstones included —
    // a hard delete would be resurrected by the next sync from a cache that
    // still has the rule.
    automations: mergeById(current.automations ?? [], incoming.automations ?? []),
    // Slack-captured requests (2026-11-15) — same contract again; a
    // resolution or delete tombstone carries a newer updatedAt and wins.
    requests: mergeById(current.requests ?? [], incoming.requests ?? []),
    // Per-column permissions (2026-11-15) — merged by columnKey (the id).
    columnPerms: mergeById(current.columnPerms ?? [], incoming.columnPerms ?? []),
  };
}

function newerPrefs(a: BoardPrefs | undefined, b: BoardPrefs | undefined): BoardPrefs | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

/**
 * A cheap content fingerprint of a board: every id with its updatedAt, plus
 * the prefs stamp and the activity head/length. Two boards with equal
 * signatures are identical under the LWW merge, so a poll that brings nothing
 * new can be dropped WITHOUT a re-render — which is what stops the 15 s poll
 * resetting scroll and closing an open dropdown mid-edit (Aboud 2026-11-23,
 * item 11). Order-independent (ids are sorted).
 */
export function boardSignature(b: BoardState): string {
  const ids = (xs?: { id: string; updatedAt: string }[]) =>
    (xs ?? [])
      .map((x) => `${x.id}@${x.updatedAt}`)
      .sort()
      .join(',');
  return [
    ids(b.projects),
    ids(b.labels),
    ids(b.updates),
    ids(b.automations),
    ids(b.requests),
    ids(b.columnPerms),
    `act:${b.activity.length}:${b.activity[0]?.id ?? ''}`,
    `prefs:${b.prefs?.updatedAt ?? ''}`,
  ].join('|');
}

// ---- projects ---------------------------------------------------------------

/** Trim + collapse inner whitespace — what actually gets saved as the name. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Case/space-insensitive key for the duplicate guard (spec §6.5). */
export function nameKey(name: string): string {
  return cleanName(name).toLowerCase();
}

/** Visible (non-archived, non-deleted) rows. */
export function liveProjects(projects: BoardProject[]): BoardProject[] {
  return projects.filter((p) => !p.deletedAt && !p.archivedAt);
}

/** A non-archived row with the same normalized name, for the inline warning. */
export function findDuplicate(projects: BoardProject[], name: string): BoardProject | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return liveProjects(projects).find((p) => nameKey(p.name) === key);
}

// ---- fuzzy duplicate detection (Aboud 2026-11-23) ---------------------------
// `findDuplicate` only catches an exact normalized match; "antony torres" vs
// "Anthony S Torres" slips through and the team ends up with two rows for one
// job. This is a token-set similarity: normalize, split into word tokens, and
// score each token of the shorter name against its best counterpart in the
// longer one — so a dropped middle initial does not penalize, and a one-letter
// variant ("antony"≈"anthony") still reads as the same person. Pure JS, no
// dependency. ADVISORY only: a warning with an "add anyway", never a block
// (house rule: no Required).

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(s: string): string[] {
  return normalizeName(s).split(' ').filter(Boolean);
}

/** Levenshtein distance — short strings (names) only. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 0..1 similarity of two tokens (1 = identical). */
function tokenSim(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  return len ? 1 - editDistance(a, b) / len : 1;
}

/**
 * 0..1 similarity of two names. Each token of the shorter name is matched to
 * its best counterpart in the longer name and the scores averaged, so order
 * and a dropped middle initial do not matter.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let sum = 0;
  for (const t of short) {
    let best = 0;
    for (const u of long) best = Math.max(best, tokenSim(t, u));
    sum += best;
  }
  return sum / short.length;
}

export interface NameMatch {
  project: BoardProject;
  score: number;
}

/** Below this, two names are treated as different people. Tuned on the
 * antony/Anthony pair (≈0.93) staying in, John Smith/Jane Doe staying out. */
export const DUPLICATE_THRESHOLD = 0.82;

/**
 * Live rows whose name is similar enough to warn on, best match first. An
 * exact normalized match scores 1 and is included. Advisory only.
 */
export function findSimilarProjects(
  projects: BoardProject[],
  name: string,
  threshold: number = DUPLICATE_THRESHOLD,
): NameMatch[] {
  if (!nameTokens(name).length) return [];
  return liveProjects(projects)
    .map((project) => ({ project, score: nameSimilarity(name, project.name) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

export function newProject(
  rawName: string,
  author: string,
  labels: BoardLabel[],
  now: string = new Date().toISOString(),
): BoardProject {
  return {
    id: crypto.randomUUID(),
    name: cleanName(rawName),
    coordinator: '', // unassigned — adding a project is not claiming it (Aboud 2026-11-26)
    statusId: defaultLabel(labels, 'status')?.id ?? null,
    phaseId: null,
    designedDate: null,
    rating: null,
    position: Date.parse(now), // newest on top
    createdAt: now,
    createdBy: author,
    updatedAt: now,
    updatedBy: author,
    schemaVersion: 1,
  };
}

export type ProjectPatch = Partial<
  Pick<
    BoardProject,
    | 'name' | 'coordinator' | 'reviewer' | 'statusId' | 'phaseId' | 'preDesignStatusId' | 'designedDate'
    | 'rating' | 'position' | 'sfNotes' | 'sfNotesAt' | 'sourceUrl' | 'requestedBy' | 'archivedAt' | 'deletedAt'
  >
>;

/**
 * New `position` for a row dragged from index `from` to before index `to`,
 * both in the DISPLAYED position-desc order (`to` may equal length = bottom).
 * Midpoint between the new neighbours keeps every other row untouched — one
 * row changes, one updatedAt bumps, and the merge stays conflict-free.
 * Null = dropped where it already was.
 */
export function positionForMove(ordered: BoardProject[], from: number, to: number): number | null {
  if (from < 0 || from >= ordered.length) return null;
  const insertAt = to > from ? to - 1 : to;
  if (insertAt === from) return null;
  const without = ordered.filter((_, i) => i !== from);
  const above = without[insertAt - 1];
  const below = without[insertAt];
  if (above && below) return (above.position + below.position) / 2;
  if (below) return below.position + 60_000; // dropped on top
  if (above) return above.position - 60_000; // dropped at the bottom
  return null;
}

/**
 * The patch, plus the Pre-Design sub-status DEFAULT when this change moves
 * the row into a pre-design status and it has none yet (Aboud 2026-11-15:
 * the new column must never start blank). Pure, and applied by EVERY write
 * path — the cell pick, bulk "Set status", a gate resolution, an automation
 * follow-up — so no entry route can leave the column empty. A row that
 * already carries a sub-status keeps it.
 */
export function withPredesignDefault(
  project: BoardProject,
  patch: ProjectPatch,
  labels: BoardLabel[],
): ProjectPatch {
  if (!('statusId' in patch)) return patch;
  if (!isPredesignLabel(labelById(labels, patch.statusId ?? null))) return patch;
  if (project.preDesignStatusId) return patch;
  const def = defaultLabel(labels, 'predesign');
  return def ? { ...patch, preDesignStatusId: def.id } : patch;
}

/** Apply a patch and stamp updatedAt/updatedBy. Never mutates. */
export function patchProject(
  project: BoardProject,
  patch: ProjectPatch,
  actor: string,
  now: string = new Date().toISOString(),
): BoardProject {
  return { ...project, ...patch, updatedAt: now, updatedBy: actor };
}

// ---- activity ---------------------------------------------------------------

/** Human-readable value of one field, for the activity log and side panel. */
function displayValue(key: keyof ProjectPatch, value: unknown, labels: BoardLabel[]): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'statusId' || key === 'phaseId' || key === 'preDesignStatusId')
    return labelById(labels, value as string)?.name ?? '—';
  if (key === 'rating') return `${value} star${value === 1 ? '' : 's'}`;
  return String(value);
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Project name',
  coordinator: 'SOW coordinator',
  reviewer: 'Reviewer',
  statusId: 'Status',
  phaseId: 'Design/Schedule',
  preDesignStatusId: 'Pre-Design status',
  designedDate: 'Designed date',
  rating: 'Rating',
  sfNotes: 'Salesforce notes',
  sourceUrl: 'Source',
  requestedBy: 'Requested by',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** Build the activity entry for an edit — only the fields that changed. */
export function activityForPatch(
  before: BoardProject,
  patch: ProjectPatch,
  actor: string,
  labels: BoardLabel[],
  now: string = new Date().toISOString(),
): BoardActivity | null {
  const changes: BoardActivity['changes'] = {};
  for (const key of Object.keys(patch) as (keyof ProjectPatch)[]) {
    if (key === 'archivedAt' || key === 'deletedAt') continue; // logged as their own actions
    if (key === 'position') continue; // drag-reorders are not activity noise
    if (key === 'sfNotesAt') continue; // rides along with sfNotes — not its own event
    if (key === 'sfNotes') {
      // Object compare, and the log carries section names, never the text.
      if (sfNotesEqual(before.sfNotes, patch.sfNotes)) continue;
      changes.sfNotes = { old: sfNotesSummary(before.sfNotes), new: sfNotesSummary(patch.sfNotes) };
      continue;
    }
    if (before[key] === patch[key]) continue;
    changes[key] = {
      old: displayValue(key, before[key], labels),
      new: displayValue(key, patch[key], labels),
    };
  }
  if (Object.keys(changes).length === 0) return null;
  return { id: crypto.randomUUID(), projectId: before.id, actor, action: 'update', changes, at: now };
}

// ---- one-click undo of a logged change (Aboud 2026-11-23, item 7) -----------

const DASH = '—';

/** Resolve a field's logged DISPLAY value back to a storable value, or
 * `undefined` when it can't be (a renamed/archived label, an sfNotes summary). */
function resolveFieldValue(key: string, display: string, labels: BoardLabel[]): { value: unknown } | undefined {
  if (key === 'statusId' || key === 'phaseId' || key === 'preDesignStatusId') {
    if (display === DASH) return { value: null };
    const col: LabelColumnKey = key === 'statusId' ? 'status' : key === 'phaseId' ? 'phase' : 'predesign';
    const match = labels.find((l) => l.columnKey === col && l.name === display);
    return match ? { value: match.id } : undefined; // a rename makes it unresolvable → skipped
  }
  if (key === 'rating') {
    if (display === DASH) return { value: null };
    const n = parseInt(display, 10);
    return n >= 1 && n <= 5 ? { value: n } : undefined;
  }
  if (key === 'coordinator' || key === 'reviewer') return { value: display === DASH ? '' : display };
  if (key === 'name' || key === 'requestedBy' || key === 'sourceUrl') return { value: display === DASH ? '' : display };
  if (key === 'designedDate') return { value: display === DASH ? null : display };
  return undefined; // sfNotes (summary only) and anything a newer client logs
}

export interface ReverseResult {
  patch: ProjectPatch;
  /** Fields the row has moved on from since (not reverted — would clobber a newer edit). */
  conflicts: string[];
  /** Fields whose old value could not be rebuilt (e.g. a label renamed since). */
  skipped: string[];
}

/**
 * Build the patch that undoes one logged `update` entry — field by field,
 * conflict-safe: a field is only reverted when the row still shows the value
 * the entry set (`new`), so an undo never clobbers a later edit by someone
 * else. A multi-field (bulk) entry reverts every field it still can.
 */
export function reversePatch(entry: BoardActivity, project: BoardProject, labels: BoardLabel[]): ReverseResult {
  const patch: ProjectPatch = {};
  const conflicts: string[] = [];
  const skipped: string[] = [];
  if (entry.action !== 'update' || !entry.changes) return { patch, conflicts, skipped };
  for (const [key, { old, new: nw }] of Object.entries(entry.changes)) {
    const curDisplay = displayValue(key as keyof ProjectPatch, (project as unknown as Record<string, unknown>)[key], labels);
    if (curDisplay !== nw) {
      conflicts.push(key);
      continue;
    }
    const resolved = resolveFieldValue(key, old, labels);
    if (!resolved) {
      skipped.push(key);
      continue;
    }
    (patch as Record<string, unknown>)[key] = resolved.value;
  }
  return { patch, conflicts, skipped };
}

// ---- Compose ↔ Board link (read-only from the board's side) -----------------

import type { PostRecord } from '../types';

export interface LinkedPosts {
  /** Most recently edited draft linked to the project. */
  draft?: PostRecord;
  /** Most recently posted record linked to the project. */
  posted?: PostRecord;
}

/** What the board's Post column shows for one project. */
export function linkedPosts(records: PostRecord[], projectId: string): LinkedPosts {
  const out: LinkedPosts = {};
  for (const r of records) {
    if (r.projectId !== projectId || r.deletedAt) continue;
    if (r.status === 'draft') {
      if (!out.draft || r.updatedAt > out.draft.updatedAt) out.draft = r;
    } else if (!out.posted || (r.postedAt ?? '') > (out.posted.postedAt ?? '')) {
      out.posted = r;
    }
  }
  return out;
}

/**
 * The board row a Compose customer name matches — same normalization as the
 * duplicate guard. Used only to SUGGEST a link; nothing links silently.
 */
export function matchProjectByCustomer(
  projects: BoardProject[],
  customerName: string,
): BoardProject | undefined {
  return findDuplicate(projects, customerName);
}

export function activityEntry(
  projectId: string,
  actor: string,
  action: BoardActivity['action'],
  changes?: BoardActivity['changes'],
  now: string = new Date().toISOString(),
): BoardActivity {
  return { id: crypto.randomUUID(), projectId, actor, action, changes, at: now };
}
