// Extra Work tracker data model — _PLAN_extra_work.md. Replaces the team's
// "Extra Work Tracker.xlsx". Same world as the board: Netlify Blobs key
// 'extrawork' + localStorage cache + merge-by-updatedAt, identity from the
// Phase 9 session. Day name and day type are COMPUTED from the date (Sat+Sun
// = Weekend, Aboud 2026-10-06), never stored — only the override is stored.

export type DayType = 'weekday' | 'weekend' | 'holiday';

/** One logged block of extra hours. */
export interface ExtraWorkEntry {
  id: string; // uuid
  /** Owner — TeamUser.username; edit/delete is owner-or-admin. */
  username: string;
  /**
   * Display name at entry time — what lists and the company report print.
   * Same rename caveat as BoardProject.coordinator; fine for a 5-person team.
   */
  person: string;
  dateIso: string; // 'YYYY-MM-DD' — parse with lib/dates only
  /** Extra hours worked that day, > 0, half-hour steps. */
  hours: number;
  description: string;
  /** null = derive from the date (Sat/Sun → weekend, else weekday). */
  dayTypeOverride: DayType | null;
  /** Tombstone — hidden everywhere, wins merges. */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string; // merge key — newer wins, same contract as PostRecord
  schemaVersion: 1;
}

/** What the shared store holds (Blobs key "extrawork") and the client caches. */
export interface ExtraWorkState {
  entries: ExtraWorkEntry[];
}
