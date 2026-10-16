// Extra Work tracker — pure functions only (_PLAN_extra_work.md).
// Shared by the client AND netlify/functions/extrawork.mts (the ahjs.mts
// precedent), so the server merge is unit-tested here.

import type { DayType, ExtraWorkEntry, ExtraWorkState } from '../extrawork/types';
import { parseIsoLocal, weekdayName } from './dates';
import { renameLegacyNames } from './renames';

export function emptyExtraWork(): ExtraWorkState {
  return { entries: [] };
}

// ---- day type ---------------------------------------------------------------

/** Sat+Sun → weekend (Aboud 2026-10-06), else weekday; stored override wins. */
export function dayTypeFor(dateIso: string, override: DayType | null): DayType {
  if (override) return override;
  const d = parseIsoLocal(dateIso);
  if (!d) return 'weekday';
  const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday';
}

/** 'Weekend' / 'Weekday' / 'Holiday' — how the sheets and reports print it. */
export function dayTypeLabel(t: DayType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** 'Sun' / 'Mon' — the sheets' Day column. */
export function dayShort(dateIso: string): string {
  return weekdayName(dateIso).slice(0, 3);
}

// ---- validation -------------------------------------------------------------

/** Whole hours 1–24 (design decision 2026-10-06: no half hours). */
export function isValidHours(hours: number): boolean {
  return Number.isInteger(hours) && hours > 0 && hours <= 24;
}

// ---- entries ----------------------------------------------------------------

export interface EntryOwner {
  username: string;
  person: string;
}

export interface EntryFields {
  dateIso: string;
  hours: number;
  description: string;
  dayTypeOverride: DayType | null;
}

export function newEntry(
  owner: EntryOwner,
  fields: EntryFields,
  now: string = new Date().toISOString(),
): ExtraWorkEntry {
  return {
    id: crypto.randomUUID(),
    username: owner.username,
    person: owner.person,
    dateIso: fields.dateIso,
    hours: fields.hours,
    description: fields.description.trim(),
    dayTypeOverride: fields.dayTypeOverride,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

export type EntryPatch = Partial<
  Pick<ExtraWorkEntry, 'dateIso' | 'hours' | 'description' | 'dayTypeOverride' | 'deletedAt'>
>;

export function patchEntry(
  entry: ExtraWorkEntry,
  patch: EntryPatch,
  now: string = new Date().toISOString(),
): ExtraWorkEntry {
  const next = { ...entry, ...patch, updatedAt: now };
  if (patch.description !== undefined) next.description = patch.description.trim();
  return next;
}

/** Visible (non-deleted) entries. */
export function liveEntries(entries: ExtraWorkEntry[]): ExtraWorkEntry[] {
  return entries.filter((e) => !e.deletedAt);
}

/** Owner or admin — the same client-side trust model as the rest of the app. */
export function canEditEntry(entry: ExtraWorkEntry, username: string, isAdmin: boolean): boolean {
  return isAdmin || entry.username === username;
}

// ---- merge ------------------------------------------------------------------

function mergeById<T extends { id: string; updatedAt: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  for (const item of incoming ?? []) {
    if (!item?.id) continue;
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/** Newer `updatedAt` per id wins; tombstones carry the newest stamp so deletes survive sync. */
export function mergeExtraWork(
  current: ExtraWorkState,
  incoming: Partial<ExtraWorkState>,
): ExtraWorkState {
  // `person` is a display name — normalise legacy spellings here, for the same
  // reason as mergeBoard. See lib/renames.ts.
  return {
    entries: mergeById(
      renameLegacyNames(current.entries),
      renameLegacyNames(incoming.entries ?? []),
    ),
  };
}

// ---- months -----------------------------------------------------------------

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-09-28' → '2026-09'. */
export function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** '2026-09' → 'Sep 2026' — the report's file-name style. */
export function monthLabel(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  return `${MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** '2026-09' → 'September 2026' — the on-screen month switcher. */
export function monthLabelLong(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  return `${MONTHS_LONG[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** '2026-12' + 1 → '2027-01'. */
export function shiftMonth(key: string, delta: number): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const y = Math.floor(total / 12);
  return `${y}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Live entries inside the month, sorted by date then person then creation. */
export function entriesForMonth(entries: ExtraWorkEntry[], key: string): ExtraWorkEntry[] {
  return liveEntries(entries)
    .filter((e) => monthKey(e.dateIso) === key)
    .sort(
      (a, b) =>
        a.dateIso.localeCompare(b.dateIso) ||
        a.person.localeCompare(b.person) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

// ---- stats ------------------------------------------------------------------

export interface PersonStats {
  total: number;
  weekday: number;
  weekend: number;
  /** Separate on screen (design 2026-10-06); the company .xlsx folds it into Weekend. */
  holiday: number;
  /** Distinct dates logged. */
  days: number;
}

// ---- overtime pay (Aboud 2026-10-06) ---------------------------------------

export interface OvertimePay {
  daily: number; // salary / 30
  hourly: number; // daily / 8
  pay: number; // 1.5 × extra hours × hourly
}

/** Salary is personal — callers must keep it local, never in the team store. */
export function overtimePay(monthlySalary: number, extraHours: number): OvertimePay {
  if (!Number.isFinite(monthlySalary) || monthlySalary <= 0 || !Number.isFinite(extraHours) || extraHours <= 0) {
    const daily = Number.isFinite(monthlySalary) && monthlySalary > 0 ? monthlySalary / 30 : 0;
    return { daily, hourly: daily / 8, pay: 0 };
  }
  const daily = monthlySalary / 30;
  const hourly = daily / 8;
  return { daily, hourly, pay: 1.5 * extraHours * hourly };
}

export function personStats(entries: ExtraWorkEntry[]): PersonStats {
  const stats = { total: 0, weekday: 0, weekend: 0, holiday: 0 };
  const dates = new Set<string>();
  for (const e of liveEntries(entries)) {
    stats.total += e.hours;
    stats[dayTypeFor(e.dateIso, e.dayTypeOverride)] += e.hours;
    dates.add(e.dateIso);
  }
  return { ...stats, days: dates.size };
}
