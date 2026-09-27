// localStorage persistence — spec/02-data-model.md. Keys: sowpost.records,
// sowpost.settings, sowpost.currentId, sowpost.ahjs. No credentials are ever stored.

import type { Ahj, ExportFile, PostRecord, Settings } from '../types';

const KEY_RECORDS = 'sowpost.records';
const KEY_SETTINGS = 'sowpost.settings';
const KEY_CURRENT = 'sowpost.currentId';
const KEY_AHJS = 'sowpost.ahjs';

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
    defaults: { siteSurvey: 'All good.', design: 'All good.', homeowner: 'No feedback.' },
    chips: {
      layout: [
        'Back-to-back installation.',
        'Attic run.',
        '1-story house.',
        '2-story house.',
        'Two walls ({orientations}).',
      ],
      siteSurvey: [
        'Some of the uploaded photos in Salesforce appear to belong to another project.',
        'Please take sufficient measurements of all walls and wide-angle photos of each wall.',
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
  return Array.isArray(arr) ? arr.map((r) => migrate(r)) : [];
}

export function saveRecords(records: PostRecord[]): void {
  localStorage.setItem(KEY_RECORDS, JSON.stringify(records));
}

export function loadSettings(): Settings {
  const s = read<Settings>(KEY_SETTINGS);
  return s ? { ...defaultSettings(), ...migrate(s) } : defaultSettings();
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
      byId.set(rec.id, migrate(rec));
      added++;
    } else if (rec.updatedAt > existing.updatedAt) {
      byId.set(rec.id, migrate(rec));
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
