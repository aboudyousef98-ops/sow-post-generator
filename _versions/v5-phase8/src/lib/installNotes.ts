// Guided Installation Notes — spec/10-installation-notes.md §3.
//
// Pure: dropdown choices + labelled free-text boxes -> post sub-bullets. The
// sentence wording mirrors `classify.ts` layoutSeed() so the post keeps one
// voice. Dropdown-derived sentences are never sent to the AI, so a wall count
// or an MPU can never be altered by the model.

import type {
  InstallNotes,
  InstallTextField,
  Orientation,
  PolishKey,
  PostRecord,
  PostValue,
  ServiceWork,
} from '../types';
import { effectiveText, noteLines, punctuate, stripBullet, type PolishState } from './noteText';

// Re-exported so callers of installNoteLines/conduitRunLines get the type from
// the same module as the functions (spec/10 §3 documents it here).
export type { PolishState };

export const ORIENTATIONS: Orientation[] = [
  'North',
  'North-East',
  'East',
  'South-East',
  'South',
  'South-West',
  'West',
  'North-West',
  'Interior - Garage',
];

export const SERVICE_WORK: ServiceWork[] = ['MPU', 'FSU', 'FTP'];

const WALL_WORD: Record<1 | 2 | 3, string> = {
  1: 'one wall',
  2: 'two walls',
  3: 'three walls',
};

/** Every free-text box inside InstallNotes, with its polish key and post label. */
export const INSTALL_TEXT_FIELDS: { key: PolishKey; field: InstallTextField; label: string }[] = [
  { key: 'install.batteryLocation', field: 'batteryLocation', label: 'Battery location' },
  { key: 'install.mainDisconnectLocation', field: 'mainDisconnectLocation', label: 'Main disconnect location' },
  { key: 'install.loadRun', field: 'loadRun', label: 'Load run' },
  { key: 'install.serviceRun', field: 'serviceRun', label: 'Grid/service run' },
  { key: 'install.solarRun', field: 'solarRun', label: 'Solar run' },
  { key: 'install.batteryRun', field: 'batteryRun', label: 'Battery run' },
  { key: 'install.specialCases', field: 'specialCases', label: 'Special cases' },
  { key: 'install.other', field: 'other', label: 'Anything else' },
];

/** All 11 polishable boxes. Order is the request order sent to /api/rewrite. */
export const POLISH_KEYS: PolishKey[] = [
  ...INSTALL_TEXT_FIELDS.map((f) => f.key),
  'siteSurvey',
  'design',
  'homeowner',
];

/** A fully-blank Installation Notes block — every box empty, no dropdown chosen. */
export function emptyInstallNotes(): InstallNotes {
  return {
    orientations: [],
    storiesOther: '',
    batteryLocation: '',
    mainDisconnectLocation: '',
    loadRun: '',
    serviceRun: '',
    solarRun: '',
    batteryRun: '',
    specialCases: '',
    other: '',
  };
}

/** The raw (un-polished) text behind any polish key, from either half of the record. */
export function rawTextFor(r: PostRecord, key: PolishKey): string {
  if (key === 'siteSurvey' || key === 'design' || key === 'homeowner') return r.notes[key];
  const f = INSTALL_TEXT_FIELDS.find((x) => x.key === key);
  return f && r.installNotes ? r.installNotes[f.field] : '';
}

/** Drop terminal punctuation so joined clauses read as one sentence. */
function clause(s: string): string {
  return s.replace(/[.;,!?…]+$/, '').trim();
}

/**
 * A labelled free-text field: every non-empty line becomes a clause, the
 * clauses are joined with "; " under one label, and the result gets a period.
 * Empty -> no line at all.
 */
function labelled(label: string, raw: string, key: PolishKey, p: PolishState): string[] {
  const parts = effectiveText(raw, key, p).split('\n').map(stripBullet).map(clause).filter(Boolean);
  return parts.length ? [`${label}: ${parts.join('; ')}.`] : [];
}

/** Sub-points read as sentences of their own, so they start with a capital. */
function capitalize(t: string): string {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * A conduit run, as one sub-bullet (spec/10 §3.2, revised by Aboud 2026-09-30).
 *
 * One line reads inline — `Load run: 18 ft through the attic.` Several lines
 * become their own points UNDER the run's label instead of being joined with
 * "; ", because a run carrying three separate facts was unreadable as one
 * sentence. The Installation Notes labelled boxes still join; only runs nest.
 */
function labelledRun(label: string, raw: string, key: PolishKey, p: PolishState): PostValue[] {
  const parts = effectiveText(raw, key, p).split('\n').map(stripBullet).map(clause).filter(Boolean);
  if (!parts.length) return [];
  // The label is kept separate from the text so the rich clipboard can
  // underline it (Aboud, 2026-09-30).
  if (parts.length === 1) return [{ label, text: `${parts[0]}.`, sub: [] }];
  return [{ label, text: '', sub: parts.map((x) => punctuate(capitalize(x))) }];
}

const field = (f: InstallTextField) => INSTALL_TEXT_FIELDS.find((x) => x.field === f)!;

/** The `Installation Notes` bullet's sub-bullets, in the order spec/10 §3.1 fixes. */
export function installNoteLines(n: InstallNotes | undefined, p: PolishState): string[] {
  if (!n) return [];
  const lines: string[] = [];

  // 1. Dropdown-derived sentences.
  if (n.walls) {
    const or = n.orientations.slice(0, n.walls).filter(Boolean);
    lines.push(`Installation on ${WALL_WORD[n.walls]}${or.length ? ` (${or.join(', ')})` : ''}.`);
  }
  if (n.stories === 1) lines.push('1-story house.');
  else if (n.stories === 2) lines.push('2-story house.');
  else if (n.stories === 'other' && n.storiesOther.trim()) lines.push(punctuate(n.storiesOther));
  if (n.service) lines.push(`This project requires an ${n.service}.`);

  // 2. Labelled free text.
  for (const f of ['batteryLocation', 'mainDisconnectLocation', 'specialCases'] as InstallTextField[]) {
    const def = field(f);
    lines.push(...labelled(def.label, n[f], def.key, p));
  }

  // 3. "Anything else" — unlabelled, one bullet per line, exactly as the old
  //    free-text Installation Layout note rendered. Keeps the migration invisible.
  lines.push(...noteLines(effectiveText(n.other, 'install.other', p)));

  return lines;
}

/** The `Conduit Raceway` bullet's sub-bullets. All four empty -> bullet dropped. */
export function conduitRunLines(n: InstallNotes | undefined, p: PolishState): PostValue[] {
  if (!n) return [];
  // Order fixed by Aboud, 2026-09-30: grid/service first, then load, solar,
  // battery — the order the crew actually runs them on site.
  const runs: InstallTextField[] = ['serviceRun', 'loadRun', 'solarRun', 'batteryRun'];
  return runs.flatMap((f) => {
    const def = field(f);
    return labelledRun(def.label, n[f], def.key, p);
  });
}
