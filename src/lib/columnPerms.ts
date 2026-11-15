// Per-column board permissions — pure logic (Aboud 2026-11-15: "refai to
// edit the stars column but khaled mattar view only … hide columns from some
// users"). Rules are keyed by USERNAME, not display name, so a rename can
// never flip someone's access. Absent anything = today's behavior; admins
// are never restricted. Client-side enforcement by design — the same
// honest-team threat model as the login itself.

import type { ColumnPerm } from '../board/types';

/** The board columns an admin can close for editing. `name` is the rename. */
export const MANAGEABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'name', label: 'Project name (rename)' },
  { key: 'coordinator', label: 'SOW coordinator' },
  { key: 'reviewer', label: 'Reviewer' },
  { key: 'status', label: 'Status' },
  { key: 'predesignStatus', label: 'Pre-Design status' },
  { key: 'designedDate', label: 'Designed date' },
  { key: 'phase', label: 'Design/Schedule' },
  { key: 'rating', label: 'Rating' },
];

/** The subset that can also be hidden — the name is pinned, so never it. */
export const HIDEABLE_COLUMNS = MANAGEABLE_COLUMNS.filter((c) => c.key !== 'name');

function live(perms: ColumnPerm[] | undefined): ColumnPerm[] {
  return (perms ?? []).filter((p) => !p.deletedAt);
}

export function permFor(perms: ColumnPerm[] | undefined, columnKey: string): ColumnPerm | undefined {
  return live(perms).find((p) => p.columnKey === columnKey);
}

/** Absent rule or absent editors list = EVERYONE; admins always edit. */
export function canEditColumn(
  perms: ColumnPerm[] | undefined,
  columnKey: string,
  username: string,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const editors = permFor(perms, columnKey)?.editors;
  if (!editors || editors.length === 0) return true;
  return editors.includes(username);
}

/** Hidden only for the named usernames; admins always see everything. */
export function isColumnHidden(
  perms: ColumnPerm[] | undefined,
  columnKey: string,
  username: string,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return false;
  return permFor(perms, columnKey)?.hiddenFor?.includes(username) ?? false;
}

/** Upsert one column's rule — the patch MERGES into the existing rule. */
export function setPerm(
  perms: ColumnPerm[] | undefined,
  columnKey: string,
  patch: Partial<Pick<ColumnPerm, 'editors' | 'hiddenFor'>>,
  by: string,
  now: string = new Date().toISOString(),
): ColumnPerm[] {
  const list = perms ?? [];
  const existing = list.find((p) => p.columnKey === columnKey);
  const base: ColumnPerm = existing ?? { id: columnKey, columnKey, updatedAt: now, updatedBy: by };
  const next: ColumnPerm = { ...base, ...patch, updatedAt: now, updatedBy: by };
  delete next.deletedAt; // writing a rule revives a tombstoned one
  return existing ? list.map((p) => (p.columnKey === columnKey ? next : p)) : [...list, next];
}
