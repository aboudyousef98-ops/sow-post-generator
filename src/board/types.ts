// Project Board data model — 10-project-board.md §5, re-based onto the app's
// existing architecture by Aboud's decision (2026-10-02): NO Supabase, no new
// login. The board lives in the same Netlify Blobs + localStorage-cache +
// merge-by-updatedAt world as records/ahjs, and identity is the Phase 9
// session. "Live updates" are polling, which is plenty for 3 users.

import type { SfNotes } from '../lib/sfNotes';

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
  /**
   * "Waiting on an installation review" meaning (status only) — the row leaves
   * the active table for its own "Installation Review" section, which sits
   * directly under it (Aboud 2026-11-03).
   *
   * OPTIONAL, same contract as `outOfScope`: boards written before this date
   * have no such field, so `undefined` falls back to the by-name default in
   * lib/board.isReviewLabel. That is what makes the existing
   * "Installation Review" status work with no migration and no re-tick.
   */
  review?: boolean;
  /**
   * "Moving a row to this status obliges an explanation" (status only) —
   * Aboud 2026-11-05: "the 'Pending Update' label, I want to force the user to
   * write an update when it is pending updates".
   *
   * Same OPTIONAL contract as `outOfScope` and `review`: an explicit tick wins
   * and `undefined` falls back to the by-name default in
   * lib/updates.labelRequiresNote, which is what makes both "Pending
   * Additional Information" (gated since 2026-10-17) and "Pending Update" work
   * with no migration and no re-tick.
   *
   * Unlike the three section flags this one is NOT mutually exclusive with
   * them: a label can demand a note and still be out of scope.
   */
  requiresNote?: boolean;
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
  /**
   * Who is reviewing the installation (Aboud 2026-11-03). Same contract as
   * `coordinator` — a roster display name, '' = unassigned — but OPTIONAL,
   * because rows written before this date have no such field. Read with
   * `?? ''`. Salesforce has no reviewer column, so this is only ever set by
   * hand on the board; an import never touches it.
   */
  reviewer?: string;
  statusId: string | null;
  phaseId: string | null;
  designedDate: string | null; // 'YYYY-MM-DD' — parse with lib/dates only
  rating: 1 | 2 | 3 | 4 | 5 | null; // null = not rated
  /** Manual order key; defaults to creation epoch ms → newest on top. */
  position: number;
  /**
   * Salesforce notes (Scheduling Alerts! + AHJ/utility requirements), mirrored
   * from the .xlsx export by Import from Salesforce and shown read-only on
   * Compose (Aboud 2026-10-21). OPTIONAL on purpose — rows written before this
   * date have no such field and must not need a migration, same contract as
   * BoardLabel.outOfScope.
   */
  sfNotes?: SfNotes;
  /** When sfNotes was last mirrored — the banner's "as of" line. */
  sfNotesAt?: string;
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
 * Why an update was written. `note` is someone typing; the rest are written by
 * a gate that REQUIRES an explanation before an edit is allowed, and are
 * tagged so they can be found later without reading every thread.
 *
 * `pending-info` was the only status gate until 2026-11-05, when any status
 * label could be told to require a note (BoardLabel.requiresNote) — `status`
 * covers those. The old value stays valid: updates already on the live board
 * carry it, and readers must tolerate an unknown kind from a newer client.
 */
export type UpdateKind = 'note' | 'rating' | 'pending-info' | 'status';

/**
 * The copy for one "you cannot do this without explaining it" modal. Lives
 * here rather than in RequireNoteModal so lib/ can build a gate without a
 * component importing backwards into it.
 */
export interface NoteGate {
  title: string;
  prompt: string;
  placeholder: string;
  confirmLabel: string;
}

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

/**
 * Team-wide view rules — shared, not per-browser.
 *
 * Aboud 2026-11-05, on the always-ordered board: "yess auto-sort, but when it
 * is on it is on for everybody not only the user using it." Column widths,
 * visibility and grouping stay in localStorage because they are one person's
 * preference; this is a decision about how the board reads for the whole team,
 * so it lives in the blob with the data.
 *
 * Merged newer-`updatedAt`-wins as a single object, NOT by id — see mergeBoard.
 */
export interface BoardPrefs {
  /**
   * Order the active table by status (the team's own label order), with manual
   * drag position as the tie-break inside each status. Absent means ON: it is
   * the new default, and a board written before 2026-11-05 must not need a
   * migration to get it.
   */
  autoSortByStatus: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** What the shared store holds (Blobs key "board") and the client caches. */
export interface BoardState {
  projects: BoardProject[];
  labels: BoardLabel[];
  activity: BoardActivity[];
  /**
   * Added 2026-11-05. Absent in every board written before that date, so every
   * reader must tolerate `undefined` — read it through lib/board.autoSortOn.
   */
  prefs?: BoardPrefs;
  /**
   * Added 2026-10-17. Absent in every board written before that date, so every
   * reader must tolerate `undefined` — mergeBoard normalises it to [].
   */
  updates: ProjectUpdate[];
}
