// localStorage persistence — spec/02-data-model.md. Keys: sowpost.records,
// sowpost.settings, sowpost.currentId, sowpost.ahjs. No credentials are ever stored.

import type { BoardState } from '../board/types';
import type { ExtraWorkState } from '../extrawork/types';
import type { Ahj, ExportFile, InstallNotes, PostRecord, Settings } from '../types';
import { emptyBoard, mergeBoard } from './board';
import { emptyExtraWork, mergeExtraWork } from './extraWork';
import { emptyInstallNotes } from './installNotes';

const KEY_RECORDS = 'sowpost.records';
const KEY_SETTINGS = 'sowpost.settings';
const KEY_CURRENT = 'sowpost.currentId';
const KEY_AHJS = 'sowpost.ahjs';
/** The Compose record as it is this instant — see saveLiveDraft(). */
const KEY_LIVE = 'sowpost.live';

export function defaultSettings(): Settings {
  return {
    authors: ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai'],
    fixedTags: ['Tarek Abu Hseini', 'Mohammed Azizi'],
    regionLead: { HOU: 'Diego Banegas', DFW: 'Wesley Bomfim', OTHER: null },
    designers: [
      'Abdel Rahman Al Khalaileh',
      'Ahmad AlSarayreh',
      'Hamzah Musamih',
      'Khaled Mattar',
      'Rashed Kteshat',
      'Ihab Huwaidi',
      'Khader Alnajjar',
      'Khaled Kurik',
      'Abdallah Aljamal',
      'Ahmad Awad',
    ],
    // CLR agents + project managers (SF "Fulfillment Coordinator") — meeting
    // 2026-10-04, names from Aboud's Salesforce screenshots.
    clrAgents: ['Adam Hallett', 'Blake Armstrong', 'Alexandria Mullen', 'Tre Goodloe', 'Austen Hallett'],
    projectManagers: ['Mirna Jamalieh', 'Joud Samardali', 'Ghawi Mahmoud', 'Yasmeen Momani', "Mua'ath Ali"],
    defaults: { siteSurvey: 'All good.', design: 'All good.', homeowner: 'No feedback.' },
    chips: {
      // Installation Notes — spec/10 §7. The 1-story / 2-story / two-walls
      // chips are gone: those are dropdowns now.
      'install.other': ['Back-to-back installation.', 'Attic run.'],
      'install.specialCases': [
        'Window to be closed off.',
        'Small junction boxes to be relocated.',
        'Existing equipment to be moved.',
      ],
      siteSurvey: [
        'Some of the uploaded photos in Salesforce appear to belong to another project.',
        'Please take sufficient measurements of all walls.',
        'Please provide the wall height.',
        'Please add a wide-angle photo of each wall.',
      ],
      design: [
        'The conduit material for the service path should be 2" PVC instead of 2" EMT.',
        'The solar tag, currently listed as #3 AWG Cu THWN in 1-1/4" EMT conduit, should instead read 1-1/4" PVC conduit.',
        'Please specify the conduit size for the solar portion of the installation.',
        'The AC disconnect rating must be 200A.',
        'This project is in {jurisdiction}; please confirm the AC disconnect brand required by the AHJ (Square D vs Eaton).',
        'We suggest using Cu instead of AL for this run, as it is short and requires several bends.',
        'The elevation drawing shows an expansion unit; this is not reflected in the one-line diagram.',
        'The wiring between the meter and inverter, and between the inverter and MDP, was changed from SER to THHN Cu because SER is used for attic runs only.',
        'The BOS covers both scenarios, with calculations provided for 1-1/4" PVC and 2" PVC.',
        'Please review the one-line diagram against the elevation.',
        'The one-line diagram is missing the {component}.',
      ],
      homeowner: [
        'The installation wall must be cleaned and prepared before installation.',
        'The wood fence/door will need to be drilled to accommodate the conduit routing.',
        'Homeowner confirmation is required before drilling through {area}, and confirmation that all affected areas will be properly restored.',
        'Only limited time will be available for garage clearing prior to installation.',
      ],
    },
    schemaVersion: 1,
  };
}

/** Migration stub — guard on schemaVersion (02 §Rules). */
export function migrate<T extends { schemaVersion?: number }>(value: T): T {
  // schemaVersion 1 is current; future migrations chain here.
  return value;
}

/**
 * Phase 7 (spec/10 §2.2): the free-text `Installation Layout` note became the
 * guided Installation Notes section. A record written before Phase 7 carries
 * its text in `notes.layout` — move it to `installNotes.other` so a reopened
 * draft shows it under "Anything else", and re-key its polished version.
 *
 * Runs on every load AND inside mergeRecords(), so records pulled from the
 * shared Blobs store or from a JSON import are migrated too.
 */
/**
 * Every shape the UI dereferences without guarding first. A record from the
 * shared team store or a hand-edited export file can be missing any of them;
 * `records.mts` only validates `id` + `updatedAt`. When one was missing the app
 * white-screened — and because the bad record had already been cached, the
 * reload crashed too, so the only way out was clearing localStorage by hand.
 */
function isWellFormed(r: PostRecord): boolean {
  return (
    !!r.notes &&
    !!r.sf &&
    typeof r.sf.customerName === 'string' &&
    typeof r.level === 'number' &&
    r.level >= 1 &&
    r.level <= 4
  );
}

/** Levels outside 1..4 have no LEVEL_NAMES / LEVEL_INFO entry — clamp, never index blindly. */
function clampLevel(level: unknown): PostRecord['level'] {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.round(level) : 1;
  return Math.min(4, Math.max(1, n)) as PostRecord['level'];
}

export function migrateRecord(r: PostRecord): PostRecord {
  const legacyText = r.notes?.layout ?? '';
  const legacyPolished = (r.polished as Record<string, string> | undefined)?.layout;
  const legacyUse = (r.usePolished as Record<string, boolean> | undefined)?.layout;
  if (r.installNotes && !legacyText && legacyPolished === undefined && legacyUse === undefined && isWellFormed(r)) {
    return r; // already migrated and sound — same object, so callers can cheaply compare
  }

  const installNotes: InstallNotes = { ...emptyInstallNotes(), ...r.installNotes };
  if (legacyText && !installNotes.other) installNotes.other = legacyText;

  const polished: Record<string, string> = { ...(r.polished as Record<string, string> | undefined) };
  if (legacyPolished !== undefined && polished['install.other'] === undefined) {
    polished['install.other'] = legacyPolished;
  }
  delete polished.layout;

  const usePolished: Record<string, boolean> = { ...(r.usePolished as Record<string, boolean>) };
  if (legacyUse !== undefined && usePolished['install.other'] === undefined) {
    usePolished['install.other'] = legacyUse;
  }
  delete usePolished.layout;

  // Spread first, then guarantee the fields the UI dereferences — a stored
  // record can be missing any of them (see isWellFormed above).
  const storedSf = (r.sf ?? {}) as Partial<PostRecord['sf']>;
  const storedNotes = (r.notes ?? {}) as Partial<PostRecord['notes']>;

  return {
    ...r,
    level: clampLevel(r.level),
    sf: {
      ...storedSf,
      customerName: storedSf.customerName ?? '',
      installScheduledDate: storedSf.installScheduledDate ?? '',
      region: storedSf.region ?? 'HOU',
      source: storedSf.source ?? 'manual',
    },
    installNotes,
    notes: {
      ...storedNotes,
      siteSurvey: storedNotes.siteSurvey ?? '',
      design: storedNotes.design ?? '',
      homeowner: storedNotes.homeowner ?? '',
      layout: '',
    },
    polished: Object.keys(polished).length ? (polished as PostRecord['polished']) : undefined,
    usePolished: usePolished as PostRecord['usePolished'],
  };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadRecords(): PostRecord[] {
  const arr = read<PostRecord[]>(KEY_RECORDS);
  return Array.isArray(arr) ? arr.map((r) => migrateRecord(migrate(r))) : [];
}

/**
 * Merge-on-write, never overwrite.
 *
 * This used to be a plain `setItem` of the in-memory array, which meant any
 * writer holding a stale array silently deleted everyone else's work — a second
 * tab, or this tab a moment after a background sync landed. Now the array is
 * merged over what is actually on disk, newest `updatedAt` per id winning, so
 * a write can add and update but never remove. Deletes still work: they are
 * tombstones (`deletedAt`) carrying a newer timestamp, so they win the merge.
 */
export function saveRecords(records: PostRecord[]): void {
  const onDisk = read<PostRecord[]>(KEY_RECORDS);
  const base = Array.isArray(onDisk) ? onDisk : [];
  const merged = mergeRecords(base, records).records;
  localStorage.setItem(KEY_RECORDS, JSON.stringify(merged));
}

/**
 * The record open in Compose, written synchronously on every single change.
 *
 * The draft list is written on a 500 ms debounce, and the unload flush only
 * covers a tab or window closing — neither survives a power cut or a forced
 * shutdown. This key does: it is one small synchronous write per keystroke, so
 * the worst case is losing nothing rather than the last half second. It is
 * cleared once the record is safely in the draft list.
 */
export function saveLiveDraft(record: PostRecord): void {
  try {
    localStorage.setItem(KEY_LIVE, JSON.stringify(record));
  } catch {
    // Quota or private-mode failure must never break typing.
  }
}

export function loadLiveDraft(): PostRecord | null {
  const r = read<PostRecord>(KEY_LIVE);
  return r && typeof r === 'object' && 'id' in r ? migrateRecord(migrate(r)) : null;
}

export function clearLiveDraft(): void {
  localStorage.removeItem(KEY_LIVE);
}

export function loadSettings(): Settings {
  const stored = read<Settings>(KEY_SETTINGS);
  const d = defaultSettings();
  if (!stored) return d;
  const s = migrate(stored);
  return {
    ...d,
    ...s,
    // Per-key, so an edited phrase wins but a newly added key still arrives.
    defaults: { ...d.defaults, ...s.defaults },
    // Chips are NOT user-editable yet (the chip editor is Phase 2), so a stored
    // `chips` can only ever be a stale copy of an older default — taking it
    // would hide every new suggestion from everyone except a fresh browser
    // (spec/10 §7.1). When chip editing ships, change this to a per-key merge.
    chips: d.chips,
  };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
}

export function loadCurrentId(): string | null {
  return localStorage.getItem(KEY_CURRENT);
}

export function saveCurrentId(id: string | null): void {
  if (id === null) localStorage.removeItem(KEY_CURRENT);
  else localStorage.setItem(KEY_CURRENT, id);
}

// ---- Project Board cache ----------------------------------------------------

const KEY_BOARD = 'sowpost.board';

/** Offline cache of the shared board — merged on load, same contract as records. */
export function loadBoard(): BoardState {
  const stored = read<BoardState>(KEY_BOARD);
  if (!stored || !Array.isArray(stored.projects)) return emptyBoard();
  return mergeBoard(emptyBoard(), stored);
}

/** Merge-on-write, never overwrite — same rationale as saveRecords(). */
export function saveBoard(board: BoardState): void {
  const onDisk = read<BoardState>(KEY_BOARD);
  const base = onDisk && Array.isArray(onDisk.projects) ? mergeBoard(emptyBoard(), onDisk) : emptyBoard();
  localStorage.setItem(KEY_BOARD, JSON.stringify(mergeBoard(base, board)));
}

// ---- Extra Work cache -------------------------------------------------------

const KEY_EXTRAWORK = 'sowpost.extrawork';

/** Offline cache of the shared Extra Work entries — merged on load, same contract as records. */
export function loadExtraWork(): ExtraWorkState {
  const stored = read<ExtraWorkState>(KEY_EXTRAWORK);
  if (!stored || !Array.isArray(stored.entries)) return emptyExtraWork();
  return mergeExtraWork(emptyExtraWork(), stored);
}

/** Merge-on-write, never overwrite — same rationale as saveRecords(). */
export function saveExtraWork(state: ExtraWorkState): void {
  const onDisk = read<ExtraWorkState>(KEY_EXTRAWORK);
  const base =
    onDisk && Array.isArray(onDisk.entries) ? mergeExtraWork(emptyExtraWork(), onDisk) : emptyExtraWork();
  localStorage.setItem(KEY_EXTRAWORK, JSON.stringify(mergeExtraWork(base, state)));
}

export function loadAhjs(): Ahj[] {
  const arr = read<Ahj[]>(KEY_AHJS);
  return Array.isArray(arr) ? arr.map((a) => migrate(a)) : [];
}

export function saveAhjs(ahjs: Ahj[]): void {
  localStorage.setItem(KEY_AHJS, JSON.stringify(ahjs));
}

export function buildExport(settings: Settings, records: PostRecord[], ahjs: Ahj[] = []): ExportFile {
  return { exportedAt: new Date().toISOString(), schemaVersion: 1, settings, records, ahjs };
}

export function exportFileName(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `sowpost-backup-${y}-${m}-${d}.json`;
}

/**
 * Merge two record sets by id; when both exist the newer `updatedAt` wins.
 * Used by import, and by the Phase-4 shared-history sync (both directions).
 */
export function mergeRecords(
  current: PostRecord[],
  incoming: PostRecord[],
): { records: PostRecord[]; added: number; updated: number } {
  const byId = new Map(current.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  for (const rec of incoming ?? []) {
    if (!rec?.id) continue;
    const existing = byId.get(rec.id);
    if (!existing) {
      byId.set(rec.id, migrateRecord(migrate(rec)));
      added++;
    } else if (rec.updatedAt > existing.updatedAt) {
      byId.set(rec.id, migrateRecord(migrate(rec)));
      updated++;
    }
  }
  return { records: [...byId.values()], added, updated };
}

/**
 * Import merge (02 §Rules). Settings are applied only when `importSettings`
 * is true (handled by the caller).
 */
export function mergeImport(
  current: PostRecord[],
  incoming: ExportFile,
): { records: PostRecord[]; added: number; updated: number } {
  return mergeRecords(current, incoming.records ?? []);
}
