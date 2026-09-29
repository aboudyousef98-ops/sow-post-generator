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
  | 'North-West';

export type ServiceWork = 'MPU' | 'FSU' | 'FTP';

/** The free-text boxes inside InstallNotes, i.e. the ones the AI may polish. */
export type InstallTextField =
  | 'batteryLocation'
  | 'mainDisconnectLocation'
  | 'loadRun'
  | 'serviceRun'
  | 'solarRun'
  | 'batteryRun'
  | 'specialCases'
  | 'other';

export interface InstallNotes {
  walls?: 1 | 2 | 3;
  /** One entry per wall; index i is wall i. '' = not chosen yet. */
  orientations: (Orientation | '')[];
  stories?: 1 | 2 | 'other';
  /** Free text, rendered only when `stories === 'other'`. */
  storiesOther: string;
  service?: ServiceWork;
  batteryLocation: string;
  mainDisconnectLocation: string;
  // Conduit raceway
  loadRun: string;
  serviceRun: string; // "grid/service run"
  solarRun: string;
  batteryRun: string;
  specialCases: string;
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
   * Per-box "use the polished version?" flags. An ABSENT key means ON — only an
   * explicit `false` (the user clicked "Revert to my draft") turns it off.
   * Always test `usePolished[key] !== false`.
   */
  usePolished: Partial<Record<PolishKey, boolean>>;
  tags: string[];
  designerTag?: string;
  warnings: string[];
  /**
   * Designer's approval to append AHJ requirements to the post — stores the id
   * of the SPECIFIC AHJ that was approved. The section renders only while the
   * Jurisdiction still matches that AHJ, so switching to a different AHJ
   * automatically un-approves (and switching back restores the approval).
   */
  ahjApprovedId?: string;
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

export interface Ahj {
  id: string; // uuid
  name: string;
  aliases: string[]; // alternate jurisdiction spellings, e.g. "City of Corpus Christi"
  posts: AhjPost[];
  deleted?: { at: string; by: string };
  /** Meta merge key — bumped on name/aliases/deleted changes only. Posts merge individually. */
  updatedAt: string;
  schemaVersion: 1;
}

export interface Settings {
  authors: string[];
  fixedTags: string[];
  regionLead: Record<Region, string | null>;
  designers: string[];
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
