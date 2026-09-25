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
  polished?: Partial<Notes>; // AI results; undefined field = not polished
  usePolished: Record<NoteKey, boolean>;
  tags: string[];
  designerTag?: string;
  warnings: string[];
  finalText?: string; // frozen at "Mark as posted"
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
  schemaVersion: 1;
}

export interface Settings {
  authors: string[];
  fixedTags: string[];
  regionLead: Record<Region, string | null>;
  designers: string[];
  defaults: { siteSurvey: string; design: string; homeowner: string };
  chips: Record<NoteKey, string[]>;
  lastAuthor?: string;
  schemaVersion: 1;
}

export interface ExportFile {
  exportedAt: string;
  schemaVersion: 1;
  settings: Settings;
  records: PostRecord[];
}
