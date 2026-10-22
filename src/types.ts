// Data model — spec/02-data-model.md. All persistence is localStorage (`sowpost.` keys).

export type Region = 'HOU' | 'DFW' | 'OTHER';
export type Level = 1 | 2 | 3 | 4;
export type Source = 'text' | 'image' | 'manual';

export type DriverId =
  // Level 2 drivers
  | 'spread_equipment'
  | 'attic_run'
  | 'long_run_25ft'
  | 'generator'
  | 'existing_system_integration'
  // Level 3 drivers
  | 'mpu'
  | 'fsu'
  | 'ftp'
  | 'relocation_le_20ft'
  | 'manual_trench_short'
  // Level 4 drivers
  | 'dirt_trench'
  | 'concrete_trench'
  | 'relocation_gt_20ft'
  | 'difficult_mpu_fsu'
  | 'obstructed_access'
  | 'outside_standard_limits';

export interface SfFields {
  customerName: string;
  recordTitle?: string;
  installScheduledDate: string; // ISO 'YYYY-MM-DD' — authoritative post date
  latestScheduledVisit?: string; // raw text as in SF
  installRegionRaw?: string;
  region: Region;
  /** For region OTHER: which metro the site is closer to (drives the lead tag and "– Near …"). */
  nearMetro?: 'HOU' | 'DFW';
  jurisdiction?: string;
  siteAddress?: string;
  systemSizeKw?: number;
  projectStatus?: string;
  /**
   * Electric utility for the site (CenterPoint, Oncor, TNMP…). Filled by the
   * Salesforce extractor, and from 2026-10-08 also pickable by hand in Compose
   * from Settings.utilities — it is the key Utility requirements match on
   * (AHJ requirements match Jurisdiction; utility rules do not).
   */
  utility?: string;
  lender?: string;
  fundingStage?: string;
  scheduledWorkItems?: string;
  coordinatorNotes?: string;
  sfLinks?: { project?: string; site?: string; jurisdiction?: string };
  source: Source;
}

export interface Notes {
  /** @deprecated Phase 7 — migrated into `installNotes.other`. Kept so pre-Phase-7 JSON still parses. */
  layout: string;
  siteSurvey: string;
  design: string;
  homeowner: string;
}

export type NoteKey = keyof Notes;

// SPEC-GAP: 04-classification.md defines non-driver descriptors for the layout
// sentence but 02-data-model.md does not persist them. Stored optionally here so
// a reopened draft keeps its descriptor choices (schemaVersion unchanged).
export interface Descriptors {
  walls?: '1' | '2' | '3+';
  wallOrientations?: string;
  stories?: '1' | '2' | 'mixed';
  storiesText?: string;
  backToBack?: boolean;
  batteries?: number;
  inverterIndoors?: boolean;
  outsideLimitsReason?: string;
}

// ---- Installation Notes (Phase 7) ----------------------------------------
// spec/10-installation-notes.md §2. Replaces the free-text `Installation
// Layout` note with guided fields. Additive — schemaVersion stays 1.

export type Orientation =
  | 'North'
  | 'North-East'
  | 'East'
  | 'South-East'
  | 'South'
  | 'South-West'
  | 'West'
  | 'North-West'
  /** Not a compass direction — an interior wall inside the garage (Aboud, 2026-09-30). */
  | 'Interior - Garage';

export type ServiceWork = 'MPU' | 'FSU' | 'FTP';

/** Roof Rating System — Mohammed Azizi, design-sow-team, 2026-09-24.
 * 9–10 Prime · 7–8 Good · 5–6 Conditional · 3–4 Poor · 1–2 Unviable. */
export type RoofRating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * One value under a post bullet. A plain string is a single sub-bullet; the
 * object form carries its own points beneath it, which is how a conduit run
 * holding several facts renders (spec/10 §3.2).
 */
export type PostValue = string | { label?: string; text: string; sub: string[] };

/** The free-text boxes inside InstallNotes, i.e. the ones the AI may polish. */
export type InstallTextField =
  | 'batteryLocation'
  | 'mainDisconnectLocation'
  | 'loadRun'
  | 'serviceRun'
  | 'solarRun'
  | 'batteryRun'
  | 'specialCases'
  | 'concretePad'
  | 'other';

export interface InstallNotes {
  walls?: 1 | 2 | 3 | 4 | 5;
  /** One entry per wall; index i is wall i. '' = not chosen yet. */
  orientations: (Orientation | '')[];
  stories?: 1 | 2 | 3 | 'other';
  /** Free text, rendered only when `stories === 'other'`. */
  storiesOther: string;
  /** @deprecated Meeting 2026-10-04 — replaced by `services` (multi-tick). Kept so pre-change JSON still parses; `servicesOf()` falls back to it. */
  service?: ServiceWork;
  /** Ticked service work (any combination). Rendered in MPU/FSU/FTP order.
   * Also drives the automatic disconnect-duration line — see
   * `disconnectDurationFor()` (meeting 2026-10-05: hours are never picked). */
  services?: ServiceWork[];
  /** Manual override for the disconnect-duration line; undefined = automatic
   * (derived from services/utility — see disconnectDurationFor). */
  disconnectDuration?: '1-2' | '4-6';
  roofRating?: RoofRating;
  batteryLocation: string;
  /** @deprecated Meeting 2026-10-04 — removed from the form and the post. Kept so stored drafts still parse. */
  mainDisconnectLocation: string;
  // Conduit raceway
  loadRun: string;
  serviceRun: string; // "grid/service run"
  solarRun: string;
  batteryRun: string;
  specialCases: string;
  /**
   * Concrete pad installation feedback → the SF "Site modification notes"
   * field (Aboud 2026-10-22, SF submission restructure). OPTIONAL on purpose —
   * records written before this date have no such field and must not need a
   * migration, same contract as BoardLabel.outOfScope. Read with `?? ''`.
   */
  concretePad?: string;
  /**
   * SF "Panel Facing Front of House" checkbox (Aboud 2026-10-22). OPTIONAL —
   * same no-migration contract as concretePad; undefined renders as "No".
   */
  panelFacesFront?: boolean;
  /** "Anything else" — free-form, rendered with no label. */
  other: string;
}

/**
 * Every free-text box the AI may polish. Dropdown-derived values (walls,
 * orientation, stories, service) are deliberately NOT here — they can never be
 * altered by the model.
 */
export type PolishKey =
  | `install.${InstallTextField}`
  | 'siteSurvey'
  | 'design'
  | 'homeowner';

export type RewriteMode = 'polish' | 'rewrite';

export interface PostRecord {
  id: string; // uuid
  status: 'draft' | 'posted';
  author: string;
  sf: SfFields;
  drivers: DriverId[];
  descriptors?: Descriptors;
  suggestedLevel: Level;
  level: Level; // authoritative (user-selected)
  notes: Notes; // raw drafts (never overwritten by AI)
  /** Guided Installation Notes (Phase 7). Absent on pre-Phase-7 records until `migrateRecord()` seeds it. */
  installNotes?: InstallNotes;
  /** AI results per box; an absent key means "not polished". */
  polished?: Partial<Record<PolishKey, string>>;
  /**
   * Which AI mode produced each polished box. The audit trail for the one
   * real risk of the rewrite mode — text drifting from what the engineer
   * meant. Additive; schemaVersion stays 1.
   */
  polishMode?: Partial<Record<PolishKey, RewriteMode>>;
  /**
   * Per-box "use the polished version?" flags. An ABSENT key means ON — only an
   * explicit `false` (the user clicked "Revert to my draft") turns it off.
   * Always test `usePolished[key] !== false`.
   */
  usePolished: Partial<Record<PolishKey, boolean>>;
  tags: string[];
  designerTag?: string;
  /** CLR agent tagged on the post, same contract as designerTag (meeting 2026-10-04). */
  clrAgentTag?: string;
  /** Project manager (SF "Fulfillment Coordinator") tagged on the post. */
  pmTag?: string;
  /**
   * The coordinator's own scratch notes about this project (Aboud 2026-10-08).
   *
   * Visible to the TEAM (it rides the normal record sync) but NEVER part of the
   * post and NEVER sent to the AI — `internalNotes` is deliberately not a
   * PolishKey, so no AI path can reach it. Both guarantees are pinned by tests.
   */
  internalNotes?: string;
  /**
   * The pre-post note check the coordinator confirmed (_PLAN_note_check.md).
   *
   * `items[].text` is a SNAPSHOT, not a reference: if the AHJ note is edited
   * next month, this record still shows what was actually on screen at the
   * time. That is what makes it an audit trail.
   *
   * `postHash` covers the post text it was confirmed against — edit the post
   * and the confirmation is void, or the gate is defeated by confirming an
   * empty draft and then writing the real post.
   */
  noteCheck?: {
    at: string;
    by: string;
    postHash: string;
    /** 'keyword' means the AI was unavailable and only the local pass ran. */
    source: 'ai' | 'keyword';
    items: { noteId: string; board: string; text: string; why: string }[];
  };
  warnings: string[];
  /**
   * Designer's approval to append AHJ requirements to the post — stores the id
   * of the SPECIFIC AHJ that was approved. The section renders only while the
   * Jurisdiction still matches that AHJ, so switching to a different AHJ
   * automatically un-approves (and switching back restores the approval).
   */
  ahjApprovedId?: string;
  /**
   * Same contract as ahjApprovedId, for the other two postable kinds
   * (Aboud 2026-10-08). Each stores the id of the SPECIFIC board approved, so
   * changing Utility away from it un-approves automatically, and changing back
   * restores it. Three explicit fields rather than one map, because a map
   * would have forced a migration of the existing ahjApprovedId.
   */
  utilityApprovedId?: string;
  fundingApprovedId?: string;
  /**
   * The post, typed by hand in the preview (Aboud, 2026-09-30).
   *
   * Set only by the preview's "Edit" button. While it is set it REPLACES the
   * generated post everywhere — preview, both clipboards, and what gets frozen
   * at Mark as posted — and the form stops driving the text. That is
   * deliberate: silently regenerating over someone's manual wording would lose
   * work, so detaching is announced in the UI and undone with "Revert to
   * generated", which clears this field.
   */
  manualText?: string;
  finalText?: string; // frozen at "Mark as posted"
  /** Rich-clipboard version frozen alongside finalText, so later AHJ board edits never change what History copies. */
  finalHtml?: string;
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
  /**
   * Tombstone for shared-history sync (Phase 4): deleted records keep their id
   * so the deletion propagates to every browser instead of resurrecting on the
   * next merge. Filtered out of all lists.
   */
  deletedAt?: string;
  /**
   * Board link (one-way: the board controls Compose, never the opposite).
   * Set when a draft is launched from a board row, or when the designer
   * accepts the customer-name match in Compose. The board only READS it —
   * the Post column reflects the latest linked draft/post. Additive;
   * schemaVersion stays 1.
   */
  projectId?: string;
  schemaVersion: 1;
}

// ---- AHJ Requirements (Phase 5) ------------------------------------------
// Each AHJ is a board of requirement posts. Deletions are tombstones (same
// rationale as PostRecord.deletedAt); every post keeps its full edit history.

export interface AhjPostVersion {
  text: string;
  at: string; // ISO — when this text stopped being current
  by: string;
}

export interface AhjPost {
  id: string; // uuid
  text: string;
  by: string; // author name (from Settings.authors)
  at: string; // ISO — posted
  editedAt?: string;
  editedBy?: string;
  history: AhjPostVersion[]; // newest first
  pinned: boolean;
  deleted?: { at: string; by: string };
  /** Bumped on ANY post change (edit/pin/delete/restore) — per-post merge key. */
  updatedAt: string;
}

/**
 * Which kind of requirement board this is (Aboud 2026-10-08). Each kind is
 * matched on a DIFFERENT key, which is why they are not all keyed by
 * Jurisdiction — see `_PLAN_requirements_split.md`:
 *   ahj      → matched against sf.jurisdiction
 *   utility  → matched against sf.utility
 *   funding  → global (Solrite / funding), no matching
 *   general  → SOW general notes: team reference, NEVER posted
 */
export type RequirementKind = 'ahj' | 'utility' | 'funding' | 'general';

export interface Ahj {
  id: string; // uuid
  name: string;
  aliases: string[]; // alternate jurisdiction spellings, e.g. "City of Corpus Christi"
  posts: AhjPost[];
  deleted?: { at: string; by: string };
  /**
   * ABSENT means 'ahj' — every board that existed before 2026-10-08 has no
   * kind, and must keep behaving exactly as it did. Read it via kindOf().
   */
  kind?: RequirementKind;
  /** Meta merge key — bumped on name/aliases/deleted changes only. Posts merge individually. */
  updatedAt: string;
  schemaVersion: 1;
}

// ---- Team login (Phase 9) --------------------------------------------------
// Browser-checked identity, NOT hard security (Aboud's explicit choice,
// 2026-10-02): it stops people posting under each other's names, it does not
// stop a determined technical user. The user list lives in the shared Blobs
// store (same sync as records) so a user added on one machine can log in on
// another with no redeploy. Passwords are stored salted+hashed, never plain.

export type UserRole = 'admin' | 'member';

export interface TeamUser {
  /** Lowercase, unique — the login handle. */
  username: string;
  /** What appears as the post author. */
  displayName: string;
  role: UserRole;
  salt: string;
  /** hex sha256(`${salt}:${password}`) — see auth.ts. */
  passHash: string;
  createdAt: string;
  updatedAt: string;
  /** Tombstone, same rationale as PostRecord.deletedAt. */
  deletedAt?: string;
  schemaVersion: 1;
}

/** What a signed-in browser remembers. No password material, ever. */
export interface Session {
  username: string;
  displayName: string;
  role: UserRole;
}

export interface Settings {
  authors: string[];
  fixedTags: string[];
  regionLead: Record<Region, string | null>;
  designers: string[];
  /** CLR agent roster for the Compose dropdown (meeting 2026-10-04). */
  clrAgents: string[];
  /** Project manager roster (SF "Fulfillment Coordinator"). */
  projectManagers: string[];
  /** Electric utilities offered in the Compose "Utility" dropdown. */
  utilities: string[];
  defaults: { siteSurvey: string; design: string; homeowner: string };
  chips: Partial<Record<PolishKey, string[]>>;
  lastAuthor?: string;
  schemaVersion: 1;
}

export interface ExportFile {
  exportedAt: string;
  schemaVersion: 1;
  settings: Settings;
  records: PostRecord[];
  ahjs?: Ahj[]; // absent in pre-Phase-5 backups
}
