// Project Board logic — pure functions only, mirrored contracts with
// mergeRecords()/mergeAhjs(). The server (netlify/functions/board.mts) and the
// localStorage cache both merge with the same rules, so any two copies of the
// board converge no matter the push order.

import type { BoardActivity, BoardLabel, BoardProject, BoardState, LabelColumnKey } from '../board/types';

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
  return [
    mk('status-new', 'status', 'New project', '#579BFC', 10, true, false),
    mk('status-working', 'status', 'Working on it', '#FDAB3D', 20, false, false),
    mk('status-done', 'status', 'Done', '#00C875', 90, false, true),
    mk('phase-design', 'phase', 'Design', '#A25DDC', 10, false, false),
    mk('phase-schedule', 'phase', 'Schedule', '#0086C0', 20, false, false),
  ];
}

export function emptyBoard(): BoardState {
  return { projects: [], labels: seedLabels(), activity: [] };
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

const ACTIVITY_CAP = 1000;

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
export function mergeBoard(current: BoardState, incoming: Partial<BoardState>): BoardState {
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
  };
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
  Pick<BoardProject, 'name' | 'coordinator' | 'statusId' | 'phaseId' | 'designedDate' | 'rating' | 'archivedAt' | 'deletedAt'>
>;

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
  statusId: 'Status',
  phaseId: 'Design/Schedule',
  designedDate: 'Designed date',
  rating: 'Rating',
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
    if (before[key] === patch[key]) continue;
    changes[key] = {
      old: displayValue(key, before[key], labels),
      new: displayValue(key, patch[key], labels),
    };
  }
  if (Object.keys(changes).length === 0) return null;
  return { id: crypto.randomUUID(), projectId: before.id, actor, action: 'update', changes, at: now };
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
