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

/** Roof material picklist (Aboud 2026-10-27). Metal and clay tile trigger the
 * conduit-rework flag in the form — see needsRoofConduitRework(). */
export type RoofMaterial = 'shingle' | 'metal' | 'clay-tile' | 'tile' | 'other';

/**
 * One value under a post bullet. A plain string is a single sub-bullet; the
 * object form carries its own points beneath it, which is how a conduit run
 * holding several facts renders (spec/10 §3.2).
 */
export type PostValue = string | { label?: string; text: string; sub: string[] };

/**
 * Battery base picklist (Aboud 2026-11-03). Every SOW has batteries, so there
 * is deliberately no "none" escape hatch — the base is always required.
 */
export type BatteryBase = 'concrete-pad' | 'wall-mount' | 'existing-ground';

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
  | 'batteryBaseWork'
  | 'batteryElevation'
  | 'batteryGround'
  | 'batteryOther'
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
  /**
   * Roof material (Aboud 2026-10-27). OPTIONAL — same no-migration contract as
   * concretePad: records written before this date have no such field.
   */
  roofMaterial?: RoofMaterial;
  /** Free text, rendered only when `roofMaterial === 'other'`. Read with `?? ''`. */
  roofMaterialOther?: string;
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
   * @deprecated Aboud 2026-11-03 — the "Concrete pads will be installed …"
   * logic was retired and replaced by the Battery installation analysis block
   * (`batteryBase` and friends below). Kept so stored drafts still parse and
   * `rawTextFor`/`polished` keys still resolve, exactly like
   * `mainDisconnectLocation`; it is no longer rendered anywhere.
   */
  concretePad?: string;

  // ---- Battery installation analysis (Aboud 2026-11-03) -------------------
  // Two required dropdown groups — what the batteries sit on, and whether the
  // wall behind them can carry them — plus a free box. All OPTIONAL fields:
  // the same no-migration contract roofMaterial used, so records written
  // before this date simply have no such key. Required-ness is enforced in
  // `missingRequired()`, not by the type.

  /** What the batteries sit on. Drives which follow-up question is asked. */
  batteryBase?: BatteryBase;
  /**
   * Concrete-pad branch only: does the ground need prep before the pad goes
   * in? Tri-state on purpose — `undefined` is "not answered yet", which is
   * what makes it enforceable as required (a checkbox could not say this).
   */
  batteryBaseNeedsWork?: boolean;
  /** Concrete-pad branch, when `batteryBaseNeedsWork` is true. */
  batteryBaseWork?: string;
  /** Wall-mount branch: how high the batteries sit. */
  batteryElevation?: string;
  /** Existing-ground branch: what the batteries will stand on. */
  batteryGround?: string;
  /** Is the supporting wall even (flat)? Tri-state, same reason as above. */
  wallEven?: boolean;
  /** Must the batteries be pushed out off the wall? Tri-state. */
  batteryPushFromWall?: boolean;
  /** Anything the structured battery questions do not cover. Unlabelled in the output. */
  batteryOther?: string;
  /**
   * SF "Panel Facing Front of House" checkbox (Aboud 2026-10-22). OPTIONAL —
   * same no-migration contract as concretePad; undefined renders as "No".
   */
  panelFacesFront?: boolean;
  /**
   * Trench required (Aboud 2026-11-12, Slack #design-sow-team): electricians
   * were not burying conduit to code and inspections failed, so a ticked box
   * appends one fixed sentence to the Conduit Raceway bullet stating the NEC
   * Table 300.5 cover depth. OPTIONAL — same no-migration contract as
   * panelFacesFront. Derived, never typed: the sentence is TRENCH_LINE in
   * installNotes.ts and is not a PolishKey, so no AI path can reword the
   * code reference.
   */
  trench?: boolean;
  /** "Anything else" — free-form, rendered with no label. */
  other: string;
}

// ---- SVT pre-design analysis (Aboud 2026-11-15) ----------------------------
// The #sow-svt-collab taskforce: SOW posts a pre-design analysis within hours
// of the site survey — before design — so SVT/CLR can make an informed
// scheduling decision. These fields feed the Compose "SVT — Pre-design" tab
// and the SVT post output; everything the SOW post also needs (walls, stories,
// services, roof, special cases, battery location) stays in InstallNotes so it
// is typed ONCE and both outputs read it.

/** The free-text boxes inside SvtNotes, i.e. the ones the AI may polish. */
export type SvtTextField =
  | 'hoLocation'
  | 'hoReason'
  | 'alt1Location'
  | 'alt1Reason'
  | 'alt2Location'
  | 'alt2Reason'
  | 'pathNotes'
  | 'schedulingNotes';

/** What the clearance check measures the depth of. */
export type ClearEquipment = 'inverter' | 'battery' | 'equipment';

/** Which way the chosen route moves the cost. */
export type CostDirection = 'adds' | 'saves' | 'neutral';

/**
 * The closing ask of a pre-design post. Every real note in #sow-svt-collab
 * ends with one of these four (Omar Rajab ×3, Ya'rob's stacks blocker ×1), so
 * it is a pick, not prose. Writes the closing sentence ONLY — the board's
 * Pre-Design sub-status stays hand-set (Aboud 2026-11-17: Compose never
 * writes to the Board).
 */
export type SvtAsk = 'goodToGo' | 'hoConfirm' | 'hoConvince' | 'blocked';

export interface SvtNotes {
  /**
   * Does the homeowner agree with the proposed battery location?
   * FOUR states, not three (Aboud 2026-11-17, from William Giles):
   * `undefined` is "not asked yet" and prints nothing; `false` prints the HO's
   * preference and why it does not work; `'unknown'` prints HO_UNKNOWN_LINE —
   * "we looked, nobody knows, so we optimised for us", which was the headline
   * of that note and could not be said with a blank.
   *
   * Widening `boolean` to `boolean | 'unknown'` keeps every stored record
   * valid, so there is no migration and `schemaVersion` stays 1.
   */
  hoAgrees?: boolean | 'unknown';
  /** Where the HO wants the batteries, when hoAgrees === false. */
  hoLocation?: string;
  /** Why the HO's preference does not work / why SOW's location is preferred. */
  hoReason?: string;
  // Up to two alternative locations SOW can offer, each with its reason.
  // Two FIXED slots rather than an array: polish keys are a closed enum on
  // both the client and the server (rewriteSchema.ts), and two covers every
  // real case Aboud described ("sometimes we can propose 2 locations").
  alt1Location?: string;
  alt1Reason?: string;
  alt2Location?: string;
  alt2Reason?: string;
  // Most likely conduit path — ticks, each printing a fixed name in the SVT
  // post (SVT_PATHS in svtPost.ts). Derived, never typed, like the services.
  // Deliberately SEPARATE from installNotes.trench: these are a pre-design
  // guess, the trench box is a confirmed scope statement with an NEC citation.
  pathB2b?: boolean;
  pathAttic?: boolean;
  pathExternal?: boolean;
  pathTrench?: boolean;
  pathExisting?: boolean;
  /** Anything about the path the ticks cannot say. */
  pathNotes?: string;
  /**
   * Paths CONSIDERED AND REJECTED, held as `SVT_PATHS[].field` keys so the two
   * groups print the same names.
   *
   * Added 2026-11-17 after a measured round-trip: the William Giles note said
   * why the meter wall was best but never why an external-only run fails, so
   * Allie Mullen asked "could we do external conduit run?" and Omar had to
   * write the rejection by hand a day later. A path is mutually exclusive
   * between `path*` and here — SvtCard clears the other side on toggle, so a
   * contradiction cannot be stored.
   */
  ruledOut?: string[];
  /** Why those paths were rejected. Not polishable — one short clause. */
  ruledOutReason?: string;
  /**
   * One- or two-day job (Issam, #sow-svt-collab 2026-11-13; widened from a
   * two-day tick on Aboud's 2026-11-15 review): SOW calls the crew days and
   * the CLR team books the Gantt accordingly — two-day means two consecutive
   * slots with the right HO expectations. Prints ONE_DAY_LINE/TWO_DAY_LINE;
   * derived, never typed. Unanswered prints nothing.
   */
  crewDays?: 1 | 2;
  /** Anything scheduling should know (HO availability, access windows…). */
  schedulingNotes?: string;

  // ---- Clearance check (Aboud 2026-11-17) --------------------------------
  // Omar's Louis Fritz / Garage note typed the whole calculation by hand:
  // "The inverter is 11.9" deep and only 40" of space is available, which
  // leaves about 28" of clearance" against a required 36". Three numbers in,
  // the sentence and the pass/fail out.
  /** Which piece the depth belongs to; defaults to the generic "equipment". */
  clearEquipment?: ClearEquipment;
  /** Wall space available, in inches. */
  clearAvailable?: number;
  /** Equipment depth, in inches. Decimals are real here (11.9). */
  clearDepth?: number;
  /**
   * Required clearance, in inches. An INPUT with a 36" default, never a
   * hardcoded constant — the figure is equipment- and AHJ-specific (it differs
   * between Duracell and Sonnen, and Omar cited it for an inverter, not a
   * battery), and this file is not the place to assert a code reference.
   */
  clearRequired?: number;
  /**
   * The blanket statement, for when no measurement is quoted (Louis Fritz /
   * Main House: "All clearance requirements have been met"). Prints the SAME
   * CLEARANCE_LINE the SOW post uses, so the two can never word it differently.
   */
  clearanceAllMet?: boolean;

  // ---- Site conditions (Aboud 2026-11-17) --------------------------------
  // The facts the notes cite to JUSTIFY a route, which is why they print
  // beside the conduit path: "the attic is accessible, so we can run through
  // it", "the property has detached buildings, so the garage would require
  // both an attic run and trenching". All tri-state — unanswered says nothing.
  atticAccessible?: boolean;
  detachedStructure?: boolean;
  /**
   * Are the attics CONTINUOUS between the structures? Only meaningful when
   * `detachedStructure` is true, and only asked then.
   *
   * Added 2026-11-17. `atticAccessible` + `detachedStructure` could state two
   * disconnected facts but not the causal chain the William Giles note turned
   * on — "although the buildings are connected by the catwalk, their attics
   * aren't connected", which is what forces the trench and therefore the
   * meter-wall recommendation.
   */
  atticsContinuous?: boolean;
  /** Reported by the survey crew on every job in #site-survey-svt-collab. */
  hoa?: boolean;
  /**
   * Battery stacks sold. Ya'rob Nabulsi asked how to verify this
   * (#sow-svt-collab, 2026-11-16) and Daniel Beier answered it the same night:
   * read it off the scope of the project, where 20 kWh = 1 stack, 40 = 2,
   * 60 = 3. So the pick is the stack count and the kWh comes with it —
   * STACK_KWH in svtPost.ts holds the mapping and prints both numbers.
   */
  batteryStacks?: 1 | 2 | 3;

  // ---- Cost impact (Aboud 2026-11-17) -----------------------------------
  // Named in all three notes ("will add cost, mainly for the long run of SER
  // cables", "more cost-effective because it shortens the external conduit
  // run", "the most cost-efficient option").
  costDirection?: CostDirection;
  /** Picked from COST_DRIVERS; unknown strings are dropped when printing. */
  costDrivers?: string[];
  /** A short driver the list cannot say. Not polishable — a noun phrase. */
  costNotes?: string;

  // ---- Homeowner actions (Aboud 2026-11-17) ------------------------------
  // "the homeowner will need to clear the garage", "the flowers and plants in
  // the installation area will need to be removed or relocated", "a leader on
  // the exterior wall will need to be relocated" — a recurring checklist.
  /** Picked from HO_ACTIONS; unknown strings are dropped when printing. */
  hoActions?: string[];
  /** One more action the list cannot say. Not polishable — a noun phrase. */
  hoActionsOther?: string;

  // ---- Scope boundary (Aboud 2026-11-17) ---------------------------------
  // Allie Mullen asked whether SOW checks that the panels fit and land in the
  // approved production range; they do not — that is the PR team. Saying so in
  // the note heads the question off. Held as `NOT_REVIEWED[].key` values.
  notReviewed?: string[];

  // ---- The ask (Aboud 2026-11-17) ---------------------------------------
  ask?: SvtAsk;
  /** What is needed, when `ask === 'blocked'`. Not polishable. */
  blockedOn?: string;
}

// ---- Wire material check (Aboud 2026-11-11) ------------------------------
// Solrite rejects a project when the conductors in the install evidence are
// not the ones on the submitted planset ("evidence (Al) … planset (Cu)"). The
// material can legitimately change after the elevation review; what was
// missing was anything in the handoff that SAID so. These two picks drive a
// derived first bullet under Design Feedback — see lib/wireMaterial.ts.

export type WireMaterial = 'CU' | 'AL';

/** Service or feeder rating, in amperes — the rows of NEC Table 310.12. */
export type ServiceAmps = 100 | 110 | 125 | 150 | 175 | 200 | 225 | 250 | 300 | 350 | 400;

export interface WireCheck {
  /** Drives the conductor size quoted in the feedback line. Optional. */
  serviceAmps?: ServiceAmps;
  /** What the design SLD / planset uploaded to Salesforce shows. */
  design?: WireMaterial;
  /** What the BOS and the installation will actually use. */
  bos?: WireMaterial;
}

/**
 * Every free-text box the AI may polish. Dropdown-derived values (walls,
 * orientation, stories, service) are deliberately NOT here — they can never be
 * altered by the model.
 */
export type PolishKey =
  | `install.${InstallTextField}`
  | `svt.${SvtTextField}`
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
  /**
   * Wire material check (Aboud 2026-11-11). OPTIONAL — the same no-migration
   * contract as roofMaterial/batteryBase: records written before this date
   * simply have no key, and render exactly as they did.
   *
   * Deliberately TOP LEVEL rather than inside InstallNotes: it drives Design
   * Feedback, not the Installation Notes bullet, and keeping it out of
   * InstallNotes means it can never become a PolishKey — so no AI path can
   * reword the material. Pinned by wireMaterial.test.ts.
   */
  wire?: WireCheck;
  /**
   * SVT pre-design analysis (Aboud 2026-11-15). OPTIONAL — the same
   * no-migration contract as wire/roofMaterial: records written before this
   * date simply have no key, and render exactly as they did.
   */
  svt?: SvtNotes;
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

/**
 * How sure we are of a rule. Imported from the Confidence column; absent on
 * everything written by hand before 2026-11-17.
 */
export type RuleConfidence = 'high' | 'medium' | 'low';

/**
 * A rule's lifecycle. **Absent means `current`** — every post written before
 * 2026-11-17 has no status and must keep showing exactly as it does now.
 * `superseded` is hidden from Compose but never deleted: the board keeps the
 * history, the post just stops reaching a handoff.
 */
export type RuleStatus = 'current' | 'to-confirm' | 'superseded';

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

  // ---- Per-rule fields (Aboud 2026-11-17, for the ~265-rule bulk import) ---
  // All OPTIONAL and all absent on existing posts, so nothing already on a
  // board changes behaviour. `schemaVersion` stays 1 — no migration. The
  // server schema is already `.loose()` on posts, so these pass through the
  // PUT with no function change.
  /**
   * Groups rules in Compose. FREE TEXT, normalised for grouping only
   * (`normCategory`) — the import preview shows every distinct category with
   * its row count so typos are caught before the write, not after. A rule is
   * never rejected for an unrecognised category.
   */
  category?: string;
  /** Houston / DFW / Other — metadata on the rule, NOT part of a board's key. */
  region?: string;
  confidence?: RuleConfidence;
  /** Absent = `current`. Read it through `ruleStatus()`, never directly. */
  status?: RuleStatus;
  /** Where the rule came from — rendered as a link icon beside the rule. */
  sourceUrl?: string;
  /** ISO date the source was published or last checked. */
  sourceDate?: string;
  /** Free text: who or what asserted this (a person, a permit, a phone call). */
  origin?: string;
  /**
   * Set by a bulk import, so "Undo this import" can remove exactly the posts
   * that import created and nothing else. Absent on hand-written posts, which
   * is what makes them un-undoable by a batch action.
   */
  importBatchId?: string;
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
  /**
   * CONTACT INFO ONLY (Aboud 2026-11-15) — shown on the Admin roster so an
   * admin knows how to reach each person. Not a login, not a notification
   * channel. OPTIONAL, the no-migration contract: accounts created before
   * this date have no such key. Normalised lowercase.
   */
  email?: string;
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
