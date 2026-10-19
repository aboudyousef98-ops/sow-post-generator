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
  /**
   * "Not our pipeline" meaning (status only) — the row leaves the active table
   * for the "Out of SOW scope" section, which sits between active and
   * Completed (Aboud 2026-10-19: Hold / Sonnen / ENPHASE "are not on our
   * pipeline but we need to have them there").
   *
   * OPTIONAL on purpose: every label written before 2026-10-19 has no such
   * field, and a board must not need a migration to behave. `undefined` falls
   * back to the by-name default in lib/board.isOutOfScopeLabel.
   */
  outOfScope?: boolean;
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
  /**
   * `update` is a FIELD change (the original meaning). The `update-*` actions
   * are posts on the Updates thread — added 2026-10-17 for Aboud's #5, "I want
   * detailed activity log, whatever action we take on a project it must be
   * recorded". Readers must tolerate an unknown action from a newer client.
   */
  action: 'create' | 'update' | 'archive' | 'restore' | 'delete' | 'update-post' | 'update-edit' | 'update-delete';
  /** key → old/new. Label/person values are stored as display strings. */
  changes?: Record<string, { old: string; new: string }>;
  at: string;
}

/**
 * Why an update was written. `note` is someone typing; the other two are
 * written by a gate that REQUIRES an explanation before an edit is allowed,
 * and are tagged so they can be found later without reading every thread.
 */
export type UpdateKind = 'note' | 'rating' | 'pending-info';

/**
 * One post on a project's Updates thread (Aboud 2026-10-17 #2: "I want to have
 * notes or updates tab for each project where I can post as much updates as I
 * want like Monday.com").
 *
 * Separate from BoardActivity on purpose: activity is machine-written field
 * history, this is human prose. Both are merged the same way.
 */
export interface ProjectUpdate {
  id: string; // uuid — merge/dedup key
  projectId: string;
  /** Slack-native light markup, same format as the notes composers. */
  text: string;
  by: string;
  at: string;
  kind: UpdateKind;
  /** For kind 'rating', the star count that forced the note. */
  rating?: 1 | 2 | 3 | 4 | 5;
  editedAt?: string;
  editedBy?: string;
  deleted?: { at: string; by: string };
  /** Merge key — newer wins, same contract as everything else here. */
  updatedAt: string;
}

/** What the shared store holds (Blobs key "board") and the client caches. */
export interface BoardState {
  projects: BoardProject[];
  labels: BoardLabel[];
  activity: BoardActivity[];
  /**
   * Added 2026-10-17. Absent in every board written before that date, so every
   * reader must tolerate `undefined` — mergeBoard normalises it to [].
   */
  updates: ProjectUpdate[];
}
