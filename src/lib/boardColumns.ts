// Per-column value filters and column reordering for the Project Board.
// Aboud, 2026-10-18: "we can move the columns between each other, so we can
// have one of them closer", and "can we have a filter for each column? to
// filter everything by that value?"
//
// Kept pure and separate from BoardTab so the value each filter offers is
// testable. It has to be: the table's own accessors are SORT keys — `name`
// lowercases, `status` returns a sort value, `rating` returns a number — so
// reading a filter list off them would show the user sort keys and internal
// ids instead of the words in front of them.

import type { BoardLabel, BoardProject } from '../board/types';

/** Shown, and filterable, when a cell is blank. */
export const EMPTY_VALUE = '—';

/**
 * Never reordered. `select` is the checkbox gutter, and `name` is the sticky
 * first column — the sticky CSS positions it by being first, so letting it
 * move would detach the header from the rows under it.
 */
export const PINNED_COLUMNS: readonly string[] = ['select', 'name'];

/** The checkbox gutter holds no value worth filtering on. */
export const UNFILTERABLE_COLUMNS: readonly string[] = ['select'];

export interface ColumnCtx {
  labels: BoardLabel[];
  /** projectId -> install date, which lives on the linked post, not the row. */
  installByProject: Map<string, string | null>;
  updateCountById: Map<string, number>;
}

function labelName(labels: BoardLabel[], id: string | null): string {
  if (!id) return EMPTY_VALUE;
  return labels.find((l) => l.id === id)?.name ?? EMPTY_VALUE;
}

/**
 * What the cell reads as to a human — the string the filter list offers and
 * compares against. Always non-empty, so a blank cell is still selectable.
 */
export function columnDisplayValue(p: BoardProject, columnId: string, ctx: ColumnCtx): string {
  switch (columnId) {
    case 'name':
      return p.name.trim() || EMPTY_VALUE;
    case 'coordinator':
      return p.coordinator.trim() || EMPTY_VALUE;
    case 'status':
      return labelName(ctx.labels, p.statusId);
    case 'phase':
      return labelName(ctx.labels, p.phaseId);
    case 'designedDate':
      return p.designedDate ?? EMPTY_VALUE;
    case 'installDate':
      return ctx.installByProject.get(p.id) ?? EMPTY_VALUE;
    case 'rating':
      return p.rating == null ? EMPTY_VALUE : `${p.rating}★`;
    case 'updates': {
      const n = ctx.updateCountById.get(p.id) ?? 0;
      return n === 0 ? EMPTY_VALUE : String(n);
    }
    case 'updated':
      // Group by day: a to-the-millisecond timestamp is never a useful filter.
      return p.updatedAt.slice(0, 10);
    default:
      return EMPTY_VALUE;
  }
}

/** Every value present in a column, once each, sorted, blanks last. */
export function distinctColumnValues(rows: BoardProject[], columnId: string, ctx: ColumnCtx): string[] {
  const seen = new Set<string>();
  for (const p of rows) seen.add(columnDisplayValue(p, columnId, ctx));
  const hasEmpty = seen.delete(EMPTY_VALUE);
  const out = [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (hasEmpty) out.push(EMPTY_VALUE);
  return out;
}

/**
 * Columns narrow each other (AND); values inside one column widen it (OR).
 * A column whose list is empty is not a filter at all — otherwise clearing the
 * last checkbox would blank the board, which is exactly the "where did my
 * projects go" failure this board has had enough of.
 */
export function matchesColumnFilters(
  p: BoardProject,
  filters: Record<string, string[]>,
  ctx: ColumnCtx,
): boolean {
  for (const [columnId, values] of Object.entries(filters)) {
    if (!values?.length) continue;
    if (!values.includes(columnDisplayValue(p, columnId, ctx))) return false;
  }
  return true;
}

/** True when any column filter would actually hide something. */
export function hasColumnFilters(filters: Record<string, string[]>): boolean {
  return Object.values(filters).some((v) => v?.length);
}

/**
 * A saved order reconciled against the columns that exist now: pinned first,
 * then the saved order, then anything the saved order never knew about. A
 * column added in a later release must appear rather than vanish.
 */
export function normalizeColumnOrder(saved: string[], allIds: string[]): string[] {
  const all = new Set(allIds);
  const pinned = allIds.filter((id) => PINNED_COLUMNS.includes(id));
  const out = [...pinned];
  for (const id of saved) {
    if (all.has(id) && !out.includes(id)) out.push(id);
  }
  for (const id of allIds) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Drop `dragId` into `targetId`'s slot. Pinned columns never move. */
export function moveColumn(order: string[], dragId: string, targetId: string): string[] {
  if (dragId === targetId) return order;
  if (PINNED_COLUMNS.includes(dragId) || PINNED_COLUMNS.includes(targetId)) return order;
  const from = order.indexOf(dragId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(next.indexOf(targetId) + (from < to ? 1 : 0), 0, dragId);
  return next;
}
