// Board view logic — grouping, aging, install-date mirroring and view presets
// (_STUDY_board_benchmark.md Tier 1). Pure functions only: BoardTab owns the
// state, this file owns the rules so they can be tested without a DOM.

import type { BoardLabel, BoardProject } from '../board/types';
import {
  labelById,
  labelsFor,
  outOfScopeStatusIds,
  positionForMove,
  predesignStatusIds,
  reviewStatusIds,
  type LinkedPosts,
} from './board';

// ---- filters ----------------------------------------------------------------
// Lives here (not in BoardTab) so the presets below can be unit-tested.

export interface Filters {
  search: string;
  coordinators: string[];
  statusIds: string[];
  phaseIds: string[];
  mine: boolean;
  showArchived: boolean;
  /** Designed-date range, ISO 'YYYY-MM-DD' ('' = no bound). */
  dateFrom: string;
  dateTo: string;
  /** Only rows the aging rule flags — pairs with the Needs-attention preset. */
  staleOnly: boolean;
}

export const NO_FILTERS: Filters = {
  search: '',
  coordinators: [],
  statusIds: [],
  phaseIds: [],
  mine: false,
  showArchived: false,
  dateFrom: '',
  dateTo: '',
  staleOnly: false,
};

// ---- install date (READ-ONLY mirror of the linked post) ---------------------

/**
 * The install date the board SHOWS for a project, mirrored from its linked
 * post — posted beats draft, exactly the precedence Daily Progress uses
 * (lib/dailyProgress.ts).
 *
 * The board never writes this back: "the board controls Compose, never the
 * opposite" is Aboud's locked rule (2026-10-02), so the column is display-only.
 */
export function installDateOf(lp: LinkedPosts | undefined): string | null {
  // `sf?.` on purpose — old/partial records in the wild may not carry it.
  const iso = lp?.posted?.sf?.installScheduledDate || lp?.draft?.sf?.installScheduledDate || '';
  return iso || null;
}

// ---- aging ------------------------------------------------------------------

export type AgingState = 'none' | 'stale' | 'overdue';

export const STALE_DAYS = 14;

/** Whole days from an ISO date (or timestamp) to `todayIso`. Negative = future. */
export function daysSince(iso: string, todayIso: string): number {
  const then = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  const now = Date.parse(todayIso.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  return Math.round((now - then) / 86_400_000);
}

/**
 * Why a row deserves a second look.
 * - `overdue`: its install date has already passed and it is still active.
 * - `stale`: nobody has touched it in STALE_DAYS.
 * `overdue` wins — a missed install is the louder problem.
 */
export function agingState(
  project: BoardProject,
  installIso: string | null,
  todayIso: string,
  staleDays: number = STALE_DAYS,
): AgingState {
  if (installIso && daysSince(installIso, todayIso) > 0) return 'overdue';
  if (daysSince(project.updatedAt, todayIso) >= staleDays) return 'stale';
  return 'none';
}

export function agingTitle(state: AgingState, project: BoardProject, installIso: string | null, todayIso: string): string {
  if (state === 'overdue') return `Install date passed ${daysSince(installIso ?? '', todayIso)} day(s) ago`;
  if (state === 'stale') return `No change in ${daysSince(project.updatedAt, todayIso)} days`;
  return '';
}

// ---- board sections ---------------------------------------------------------

export interface BoardSections {
  /** The pipeline — the main table, in the order it came in. */
  active: BoardProject[];
  /**
   * Parked, not our scope (Hold / Sonnen / ENPHASE by default). Its own
   * section between active and Completed: on the board, but out of the way.
   */
  outOfScope: BoardProject[];
  /**
   * Waiting on an installation review — its own section directly under the
   * active table, so work in review stays close to work in progress
   * (Aboud 2026-11-03).
   */
  installReview: BoardProject[];
  /**
   * Pre-design analysis in progress (Aboud 2026-11-15, the SVT collab
   * taskforce) — its own section between the active table and Installation
   * Review, carrying the per-project sub-status column.
   */
  preDesign: BoardProject[];
  /** Status counts as done. */
  completed: BoardProject[];
}

/**
 * Split the visible rows into the board's three sections (Aboud 2026-10-19:
 * the out-of-scope statuses "are disturbing our board").
 *
 * `active` keeps the incoming order — whatever sort or manual drag produced it.
 * The other two sections are most-recently-touched first, because `updatedAt`
 * moves when the status flips, so the row that just left the pipeline is on top.
 */
export function splitSections(projects: BoardProject[], labels: BoardLabel[]): BoardSections {
  const doneIds = new Set(labels.filter((l) => l.isDone).map((l) => l.id));
  const scopeIds = outOfScopeStatusIds(labels);
  const reviewIds = reviewStatusIds(labels);
  const predesignIds = predesignStatusIds(labels);
  const active: BoardProject[] = [];
  const outOfScope: BoardProject[] = [];
  const installReview: BoardProject[] = [];
  const preDesign: BoardProject[] = [];
  const completed: BoardProject[] = [];
  for (const p of projects) {
    // Done is checked first — see isOutOfScopeLabel for why it wins. Review
    // then beats pre-design, and both beat out-of-scope: each is the more
    // specific statement about a row.
    if (p.statusId && doneIds.has(p.statusId)) completed.push(p);
    else if (p.statusId && reviewIds.has(p.statusId)) installReview.push(p);
    else if (p.statusId && predesignIds.has(p.statusId)) preDesign.push(p);
    else if (p.statusId && scopeIds.has(p.statusId)) outOfScope.push(p);
    else active.push(p);
  }
  const recentFirst = (a: BoardProject, b: BoardProject) => b.updatedAt.localeCompare(a.updatedAt);
  completed.sort(recentFirst);
  outOfScope.sort(recentFirst);
  installReview.sort(recentFirst);
  preDesign.sort(recentFirst);
  return { active, installReview, preDesign, outOfScope, completed };
}

// ---- always-ordered board ---------------------------------------------------

/**
 * Order rows by status, newest-manual-order first inside each status.
 *
 * Aboud 2026-11-05: "I know I can sort them by clicking on the sort feature on
 * the status column, but my coworkers wanted a always ordered board." So the
 * board arrives ordered rather than waiting for a click.
 *
 * The rank is the team's OWN label order (`sortOrder`, editable with the ↑/↓
 * in Edit labels) — not a list hardcoded here. Putting "Working on it" at the
 * top and "New project" at the bottom is therefore a thing Aboud does once in
 * the UI, and Group-by-Status inherits the same order for free.
 *
 * `position` descending is the tie-break, so the manual drag order still
 * decides WITHIN a status band — the same value the ungrouped board uses.
 * A row with no status, or one carrying an archived/unknown label, sorts last:
 * it cannot be ranked, and silently ranking it first would be a lie.
 */
export function sortByStatus(projects: BoardProject[], labels: BoardLabel[]): BoardProject[] {
  const rank = new Map(labels.filter((l) => l.columnKey === 'status').map((l) => [l.id, l.sortOrder]));
  const rankOf = (p: BoardProject) =>
    p.statusId && rank.has(p.statusId) ? (rank.get(p.statusId) as number) : Number.POSITIVE_INFINITY;
  // Copy first: this is handed straight to the table, and sorting the caller's
  // array in place would mutate a memo's input.
  return [...projects].sort((a, b) => rankOf(a) - rankOf(b) || b.position - a.position);
}

// ---- grouping ---------------------------------------------------------------

export type GroupKey = 'none' | 'status' | 'coordinator' | 'reviewer' | 'phase';

export const GROUP_OPTIONS: { key: GroupKey; label: string }[] = [
  { key: 'none', label: 'No grouping' },
  { key: 'status', label: 'Status' },
  { key: 'coordinator', label: 'SOW coordinator' },
  { key: 'reviewer', label: 'Reviewer' },
  { key: 'phase', label: 'Design/Schedule' },
];

export interface BoardGroup {
  /** Stable key for React and for the collapse set. */
  key: string;
  title: string;
  /** Label swatch colour, for status/phase groups. */
  color?: string;
  rows: BoardProject[];
}

const UNSET = '__unset__';

/**
 * Split rows into ordered groups. Row order WITHIN a group is preserved, so
 * whatever sort or manual order came in still holds.
 *
 * Label groups follow the label sortOrder; coordinator groups are alphabetical.
 * The "not set" bucket is always last, and empty groups are dropped.
 */
export function groupProjects(projects: BoardProject[], by: GroupKey, labels: BoardLabel[]): BoardGroup[] {
  if (by === 'none') return [{ key: 'all', title: '', rows: projects }];

  const buckets = new Map<string, BoardProject[]>();
  const push = (k: string, p: BoardProject) => {
    const cur = buckets.get(k);
    if (cur) cur.push(p);
    else buckets.set(k, [p]);
  };

  // The two people columns group the same way: by display name, Unassigned last.
  const isPerson = by === 'coordinator' || by === 'reviewer';
  for (const p of projects) {
    if (isPerson) push((by === 'coordinator' ? p.coordinator : (p.reviewer ?? '')).trim() || UNSET, p);
    else push((by === 'status' ? p.statusId : p.phaseId) || UNSET, p);
  }

  const out: BoardGroup[] = [];
  if (isPerson) {
    for (const name of [...buckets.keys()].filter((k) => k !== UNSET).sort((a, b) => a.localeCompare(b))) {
      out.push({ key: name, title: name, rows: buckets.get(name)! });
    }
    const none = buckets.get(UNSET);
    if (none) out.push({ key: UNSET, title: 'Unassigned', rows: none });
    return out;
  }

  // status / phase — in the team's own label order, archived labels included
  // (a row can still carry one) but ordered after the live ones.
  const columnKey = by === 'status' ? 'status' : 'phase';
  const ordered = labelsFor(labels, columnKey).map((l) => l.id);
  const extras = [...buckets.keys()].filter((k) => k !== UNSET && !ordered.includes(k));
  for (const id of [...ordered, ...extras]) {
    const rows = buckets.get(id);
    if (!rows) continue;
    const label = labelById(labels, id);
    out.push({ key: id, title: label?.name ?? 'Unknown', color: label?.color, rows });
  }
  const none = buckets.get(UNSET);
  if (none) out.push({ key: UNSET, title: 'Not set', rows: none });
  return out;
}

// ---- view presets -----------------------------------------------------------

export interface ViewPreset {
  id: string;
  label: string;
  title: string;
  /** Applied on top of NO_FILTERS — a preset always starts from a clean slate. */
  patch: Partial<Filters>;
  /**
   * Column sort to apply alongside the filters (TanStack SortingState shape).
   * Presets without one leave whatever sort is already on the table alone.
   */
  sort?: { id: string; desc: boolean }[];
}

/**
 * The handful of one-click views worth having. Deliberately NOT a saved-views
 * engine — Aboud's standing preference is simple and manual
 * (see memory `aboud-prefers-simple-ui`).
 */
export function viewPresets(labels: BoardLabel[]): ViewPreset[] {
  const presets: ViewPreset[] = [
    { id: 'all', label: 'All active', title: 'Clear every filter', patch: {} },
    { id: 'mine', label: 'Mine', title: 'Only projects I coordinate', patch: { mine: true } },
  ];
  const design = labelsFor(labels, 'phase').find((l) => l.id === 'phase-design');
  if (design) {
    presets.push({
      id: 'needs-schedule',
      label: `Needs scheduling`,
      title: `Still in ${design.name} — no schedule yet`,
      patch: { phaseIds: [design.id] },
    });
  }
  const schedule = labelsFor(labels, 'phase').find((l) => l.id === 'phase-schedule');
  if (schedule) {
    presets.push({
      id: 'scheduled',
      label: 'Scheduled',
      title: `In ${schedule.name} — soonest install first`,
      patch: { phaseIds: [schedule.id] },
      // Rows with no install date yet sort last (the column's sortUndefined).
      sort: [{ id: 'installDate', desc: false }],
    });
  }
  presets.push({
    id: 'attention',
    label: 'Needs attention',
    title: `Install date passed, or untouched for ${STALE_DAYS} days`,
    patch: { staleOnly: true },
  });
  return presets;
}

/** True when the current filters are exactly this preset — drives the "on" pill. */
export function isPresetActive(filters: Filters, preset: ViewPreset): boolean {
  const target: Filters = { ...NO_FILTERS, ...preset.patch };
  return (
    filters.search.trim() === target.search &&
    filters.mine === target.mine &&
    filters.showArchived === target.showArchived &&
    filters.staleOnly === target.staleOnly &&
    filters.dateFrom === target.dateFrom &&
    filters.dateTo === target.dateTo &&
    same(filters.coordinators, target.coordinators) &&
    same(filters.statusIds, target.statusIds) &&
    same(filters.phaseIds, target.phaseIds)
  );
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}

// ---- bulk edit --------------------------------------------------------------

/** Rows a bulk action will touch: selected ids that are still on screen. */
export function selectedRows(rows: BoardProject[], selected: Record<string, boolean>): BoardProject[] {
  return rows.filter((p) => selected[p.id]);
}

/**
 * The ids from `anchorId` to `targetId` inclusive, in DISPLAYED order — what
 * Shift-click selects (Aboud 2026-11-05).
 *
 * Order-agnostic: clicking above the anchor selects upwards just as clicking
 * below selects downwards, which is what every file list does.
 *
 * Returns just the target when there is no anchor yet (the first click of a
 * session) or when the anchor has since scrolled out of the filtered set —
 * a Shift-click that silently selects nothing would read as broken.
 */
export function idsBetween(rows: BoardProject[], anchorId: string | null, targetId: string): string[] {
  const to = rows.findIndex((p) => p.id === targetId);
  if (to < 0) return [];
  const from = anchorId ? rows.findIndex((p) => p.id === anchorId) : -1;
  if (from < 0) return [targetId];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return rows.slice(lo, hi + 1).map((p) => p.id);
}

/**
 * Rows sharing one status, in displayed order — the band a drag is allowed to
 * move within while auto-sort is on (Aboud 2026-11-05: keep auto-sort, drag
 * inside the band).
 *
 * Auto-sort groups by status rank first, so a band is always contiguous; this
 * returns the slice rather than a filter so the caller can reason about
 * neighbours without re-deriving the order.
 */
export function statusBand(rows: BoardProject[], statusId: string | null): BoardProject[] {
  return rows.filter((p) => p.statusId === statusId);
}

/**
 * The new `position` for a row dragged onto another row, or null when the move
 * is not allowed.
 *
 * Auto-sort ranks by status first, so a row can only be reordered WITHIN its
 * own status. A drop onto a different band is refused outright rather than
 * approximated — dnd-kit then springs the row back, which is the honest
 * outcome: the status decides where it lives, and dragging does not change
 * the status.
 *
 * The midpoint is computed against the BAND, not the whole table. Measuring
 * against the full list would put the row between neighbours from other
 * status groups, whose positions say nothing about this one.
 */
export function bandMove(rows: BoardProject[], activeId: string, overId: string): number | null {
  const from = rows.find((p) => p.id === activeId);
  const to = rows.find((p) => p.id === overId);
  if (!from || !to || from.id === to.id) return null;
  if (from.statusId !== to.statusId) return null;
  const band = statusBand(rows, from.statusId);
  const oldIndex = band.indexOf(from);
  const newIndex = band.indexOf(to);
  // positionForMove takes an INSERT-BEFORE index ("the drop line sits here"),
  // which is what the old hand-rolled pointer drag produced. dnd-kit's
  // sortable instead reports the row you are hovering, i.e. arrayMove
  // semantics: the dragged row ends up AT that index. Dragging downwards
  // therefore needs one more, or the row lands a slot short of where it was
  // dropped.
  return positionForMove(band, oldIndex, newIndex > oldIndex ? newIndex + 1 : newIndex);
}
