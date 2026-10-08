// Project Board data model — 10-project-board.md §5, re-based onto the app's
// existing architecture by Aboud's decision (2026-10-02): NO Supabase, no new
// login. The board lives in the same Netlify Blobs + localStorage-cache +
// merge-by-updatedAt world as records/ahjs, and identity is the Phase 9
// session. "Live updates" are polling, which is plenty for 3 users.

export type LabelColumnKey = 'status' | 'phase';

/** A status / Design-Schedule option — data, not an enum (D6: custom labels). */
export interface BoardLabel {
  id: string;
  columnKey: LabelColumnKey;
  name: string;
  color: string; // '#RRGGBB' from the 16-swatch palette
  sortOrder: number;
  /** Applied to new rows (one non-archived default per column). */
  isDefault: boolean;
  /** "Finished" meaning, for automations and filters (status only). */
  isDone: boolean;
  /** Seeded label: rename/recolor OK, archive not allowed. */
  isSystem: boolean;
  archived: boolean;
  /** Merge key — newer wins, same contract as PostRecord. */
  updatedAt: string;
}

/** One board row. */
export interface BoardProject {
  id: string; // uuid
  name: string;
  /**
   * SOW coordinator as a roster display name ('' = unassigned) — the same
   * convention as PostRecord.author. // SPEC-GAP: a rename in Admin → Users
   * does not retag old rows; acceptable for a 3-person roster.
   */
  coordinator: string;
  statusId: string | null;
  phaseId: string | null;
  designedDate: string | null; // 'YYYY-MM-DD' — parse with lib/dates only
  rating: 1 | 2 | 3 | 4 | 5 | null; // null = not rated
  /** Manual order key; defaults to creation epoch ms → newest on top. */
  position: number;
  archivedAt?: string;
  /** Admin "Delete permanently" tombstone — hidden everywhere, wins merges. */
  deletedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  schemaVersion: 1;
}

/** Field-level change history, written by the client alongside each edit. */
export interface BoardActivity {
  id: string; // uuid — merge/dedup key
  projectId: string;
  actor: string;
  action: 'create' | 'update' | 'archive' | 'restore' | 'delete';
  /** key → old/new. Label/person values are stored as display strings. */
  changes?: Record<string, { old: string; new: string }>;
  at: string;
}

/** What the shared store holds (Blobs key "board") and the client caches. */
export interface BoardState {
  projects: BoardProject[];
  labels: BoardLabel[];
  activity: BoardActivity[];
}
