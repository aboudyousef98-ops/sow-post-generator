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
  return [
    mk('status-working', 'status', 'Working on it', '#FDAB3D', 5, false, false),
    mk('status-done', 'status', 'Done', '#00C875', 90, false, true),
    mk('status-new', 'status', 'New project', '#579BFC', 999, true, false),
    mk('phase-design', 'phase', 'Design', '#A25DDC', 10, false, false),
    mk('phase-schedule', 'phase', 'Schedule', '#0086C0', 20, false, false),
  ];
}

/**
 * Status labels that sit OUTSIDE the SOW pipeline unless someone says
 * otherwise — Aboud 2026-10-19. These three already exist on the live board as
 * team-created labels, so there is nothing to seed and nothing to migrate: the
 * names are matched case-insensitively and the result is only a DEFAULT.
 *
 * Tick/untick "out of scope" in Edit labels and the explicit boolean is stored
 * (which bumps updatedAt), so a deliberate choice always beats this list —
 * same contract as a rename beating a re-seed.
 */
const OUT_OF_SCOPE_DEFAULT_NAMES = new Set(['hold', 'sonnen', 'enphase']);

/**
 * True when a status label means "parked, not our scope".
 *
 * `isDone` wins: a label marked both belongs in Completed, because that is the
 * stronger statement about the work. The two are kept mutually exclusive in
 * Edit labels, so this only matters for data written by an older client.
 */
export function isOutOfScopeLabel(label: BoardLabel | undefined): boolean {
  if (!label || label.columnKey !== 'status' || label.isDone) return false;
  if (typeof label.outOfScope === 'boolean') return label.outOfScope;
  return OUT_OF_SCOPE_DEFAULT_NAMES.has(label.name.trim().toLowerCase());
}

/** Ids of every out-of-scope status label — the set BoardTab splits rows with. */
export function outOfScopeStatusIds(labels: BoardLabel[]): Set<string> {
  return new Set(labels.filter(isOutOfScopeLabel).map((l) => l.id));
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
  };
}

function newerPrefs(a: BoardPrefs | undefined, b: BoardPrefs | undefined): BoardPrefs | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
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

export function newProject(
  rawName: string,
  author: string,
  labels: BoardLabel[],
  now: string = new Date().toISOString(),
): BoardProject {
  return {
    id: crypto.randomUUID(),
    name: cleanName(rawName),
    coordinator: author, // Q4 default: the signed-in user
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
    | 'name' | 'coordinator' | 'reviewer' | 'statusId' | 'phaseId' | 'designedDate' | 'rating' | 'position'
    | 'sfNotes' | 'sfNotesAt' | 'archivedAt' | 'deletedAt'
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
  if (key === 'statusId' || key === 'phaseId') return labelById(labels, value as string)?.name ?? '—';
  if (key === 'rating') return `${value} star${value === 1 ? '' : 's'}`;
  return String(value);
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Project name',
  coordinator: 'SOW coordinator',
  reviewer: 'Reviewer',
  statusId: 'Status',
  phaseId: 'Design/Schedule',
  designedDate: 'Designed date',
  rating: 'Rating',
  sfNotes: 'Salesforce notes',
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
