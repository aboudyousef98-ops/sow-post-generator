// Guided Installation Notes — spec/10-installation-notes.md §3.
//
// Pure: dropdown choices + labelled free-text boxes -> post sub-bullets. The
// sentence wording mirrors `classify.ts` layoutSeed() so the post keeps one
// voice. Dropdown-derived sentences are never sent to the AI, so a wall count
// or an MPU can never be altered by the model.

import type {
  BatteryBase,
  InstallNotes,
  InstallTextField,
  Orientation,
  PolishKey,
  PostRecord,
  PostValue,
  RoofMaterial,
  RoofRating,
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

/**
 * The ticked services, in fixed MPU/FSU/FTP order regardless of tick order,
 * falling back to the deprecated single `service` on pre-2026-10-04 drafts.
 */
export function servicesOf(n: InstallNotes): ServiceWork[] {
  if (n.services?.length) return SERVICE_WORK.filter((s) => n.services!.includes(s));
  return n.service ? [n.service] : [];
}

const WALL_WORD: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'one wall',
  2: 'two walls',
  3: 'three walls',
  4: 'four walls',
  5: 'five walls',
};

/**
 * The walls/orientations sentence — "Installation on two walls (East, West)."
 * `lead` lets the SF Battery-and-Equipment-Location field say "Equipment on…"
 * (Aboud 2026-10-22: that field combines battery location + equipment walls).
 */
export function wallsSentence(n: InstallNotes, lead = 'Installation'): string {
  if (!n.walls) return '';
  const or = n.orientations.slice(0, n.walls).filter(Boolean);
  return `${lead} on ${WALL_WORD[n.walls]}${or.length ? ` (${or.join(', ')})` : ''}.`;
}

/**
 * Expected power disconnect duration — DERIVED, never picked (meeting
 * 2026-10-05): MPU or FSU work, or a TNMP utility, means the service is down
 * 4–6 hours; everything else (Duracell battery systems) is 1–2 hours.
 */
export function disconnectDurationFor(n: InstallNotes | undefined, utility?: string): '1-2' | '4-6' {
  const s = n ? servicesOf(n) : [];
  const tnmp = /tnmp|texas[-\s]?new\s?mexico/i.test(utility ?? '');
  return s.includes('MPU') || s.includes('FSU') || tnmp ? '4-6' : '1-2';
}

export const DURATION_WORD: Record<'1-2' | '4-6', string> = { '1-2': '1–2 hours', '4-6': '4–6 hours' };

/**
 * Roof Rating System — Mohammed Azizi, design-sow-team, 2026-09-24. The post
 * prints the rating with its band and the band's OUTCOME; the age/wear
 * criteria stay with the surveyors.
 */
export function roofBand(rating: RoofRating): { name: string; outcome: string } {
  if (rating >= 9) return { name: 'Prime', outcome: 'approved to install right away' };
  if (rating >= 7) return { name: 'Good', outcome: 'workable with small adjustments' };
  if (rating >= 5) return { name: 'Conditional', outcome: 'strongly recommend replacing the roof first' };
  if (rating >= 3) return { name: 'Poor', outcome: 'the roof must be repaired or replaced before mounting' };
  return { name: 'Unviable', outcome: 'do not install' };
}

/** Roof material picklist, in the form's dropdown order (Aboud 2026-10-27). */
export const ROOF_MATERIALS: { value: RoofMaterial; label: string }[] = [
  { value: 'shingle', label: 'Shingle' },
  { value: 'metal', label: 'Metal' },
  { value: 'clay-tile', label: 'Clay tile' },
  { value: 'tile', label: 'Tile' },
  { value: 'other', label: 'Others…' },
];

/** The picked material's display label; 'other' resolves to the free text. */
export function roofMaterialLabel(n: InstallNotes): string {
  if (!n.roofMaterial) return '';
  if (n.roofMaterial === 'other') return (n.roofMaterialOther ?? '').trim();
  return ROOF_MATERIALS.find((m) => m.value === n.roofMaterial)!.label;
}

/**
 * Metal and clay-tile roofs need the conduit rework (Aboud 2026-10-27) — the
 * form flags them with ROOF_CONDUIT_REWORK in a yellow box. Display-only, like
 * the aluminum-wiring banner: it tells the coordinator, it is never posted.
 */
export function needsRoofConduitRework(n: InstallNotes | undefined): boolean {
  return n?.roofMaterial === 'metal' || n?.roofMaterial === 'clay-tile';
}

export const ROOF_CONDUIT_REWORK =
  'Remove Solar junction box, and add LB condulet to go over the roof, ' +
  'add extra 3/4" conduits with fitting, hangers, compressions to this job.';

/** Battery base picklist, in the form's dropdown order (Aboud 2026-11-03). */
export const BATTERY_BASES: { value: BatteryBase; label: string }[] = [
  { value: 'concrete-pad', label: 'Concrete pad' },
  { value: 'wall-mount', label: 'Wall mount' },
  { value: 'existing-ground', label: 'On existing ground' },
];

/** Every free-text box inside InstallNotes, with its polish key and post label. */
export const INSTALL_TEXT_FIELDS: { key: PolishKey; field: InstallTextField; label: string }[] = [
  { key: 'install.batteryLocation', field: 'batteryLocation', label: 'Battery location' },
  { key: 'install.mainDisconnectLocation', field: 'mainDisconnectLocation', label: 'Main disconnect location' },
  { key: 'install.loadRun', field: 'loadRun', label: 'Load run' },
  { key: 'install.serviceRun', field: 'serviceRun', label: 'Grid/service run' },
  { key: 'install.solarRun', field: 'solarRun', label: 'Solar run' },
  { key: 'install.batteryRun', field: 'batteryRun', label: 'Battery run' },
  { key: 'install.specialCases', field: 'specialCases', label: 'Special cases' },
  // Retired 2026-11-03 (see InstallNotes.concretePad) — kept so stored polish
  // keys and rawTextFor still resolve, like mainDisconnectLocation.
  { key: 'install.concretePad', field: 'concretePad', label: 'Concrete pad installation' },
  { key: 'install.batteryBaseWork', field: 'batteryBaseWork', label: 'Battery base extra work' },
  { key: 'install.batteryElevation', field: 'batteryElevation', label: 'Battery elevation' },
  { key: 'install.batteryGround', field: 'batteryGround', label: 'Existing ground' },
  { key: 'install.batteryOther', field: 'batteryOther', label: 'Anything else (battery installation)' },
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
    concretePad: '',
    other: '',
  };
}

/** The raw (un-polished) text behind any polish key, from either half of the record. */
export function rawTextFor(r: PostRecord, key: PolishKey): string {
  if (key === 'siteSurvey' || key === 'design' || key === 'homeowner') return r.notes[key];
  const f = INSTALL_TEXT_FIELDS.find((x) => x.key === key);
  // `?? ''` — optional fields (concretePad) are absent on pre-2026-10-22 records.
  return f && r.installNotes ? (r.installNotes[f.field] ?? '') : '';
}

/** Drop terminal punctuation so joined clauses read as one sentence. */
function clause(s: string): string {
  return s.replace(/[.;,!?…]+$/, '').trim();
}

/**
 * A box's effective text as mid-sentence clauses joined with "; ", or '' when
 * the box is empty. The shared primitive behind `labelled`, `leadSentence` and
 * the battery-base branches — each of which then wraps it differently.
 */
function clauses(raw: string, key: PolishKey, p: PolishState): string {
  return effectiveText(raw, key, p).split('\n').map(stripBullet).map(clause).filter(Boolean).join('; ');
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

/** What `installNoteLines` may leave out — labelled boxes AND derived sentences
 * that land in their own Salesforce field (sfSubmission.ts states each fact once). */
export type InstallNoteOmit = InstallTextField | 'stories' | 'disconnectDuration' | 'walls';

/**
 * A prefixed sentence (Aboud 2026-10-27 audit): the box holds the where/what
 * ("on the east side of the house"), the line reads "<lead> on the east side
 * of the house." Several lines join with "; " into the one sentence. A
 * designer who already wrote the subject ("Concrete pads go past the edge")
 * is not double-prefixed — `already` matching the first clause keeps their
 * wording as typed.
 */
export function leadSentence(
  lead: string,
  already: RegExp,
  raw: string,
  key: PolishKey,
  p: PolishState,
): string[] {
  const parts = effectiveText(raw, key, p).split('\n').map(stripBullet).map(clause).filter(Boolean);
  if (!parts.length) return [];
  if (already.test(parts[0])) return [`${parts.join('; ')}.`];
  // Mid-sentence, the box text loses its leading capital — unless the word is
  // all-caps (an acronym or model name like "TPO").
  const first = parts[0];
  const decap = /^[A-Z][a-z]/.test(first) ? first[0].toLowerCase() + first.slice(1) : first;
  return [`${lead} ${[decap, ...parts.slice(1)].join('; ')}.`];
}

/**
 * The `Installation Notes` bullet's sub-bullets, in the order spec/10 §3.1
 * fixes. `utility` (sf.utility) feeds the automatic disconnect-duration line.
 * `omit` skips parts that land in their own Salesforce field, so the SF
 * "Installation window and planning" blob states each fact exactly once
 * (sfSubmission.ts); the Slack post passes nothing and keeps its full shape.
 */
export function installNoteLines(
  n: InstallNotes | undefined,
  p: PolishState,
  utility?: string,
  omit: InstallNoteOmit[] = [],
): string[] {
  if (!n) return [];
  const lines: string[] = [];

  // 1. Dropdown-derived sentences. Walls can be omitted (2026-10-27 audit):
  //    the SF Battery and Equipment Location field already states them.
  if (!omit.includes('walls')) {
    const walls = wallsSentence(n);
    if (walls) lines.push(walls);
  }
  if (!omit.includes('stories')) {
    if (n.stories === 'other') {
      if (n.storiesOther.trim()) lines.push(punctuate(n.storiesOther));
    } else if (n.stories) lines.push(`${n.stories}-story house.`);
  }
  const services = servicesOf(n);
  if (services.length) {
    // "an MPU and an FSU" / "an MPU, an FSU and an FTP" — one sentence, every
    // item keeps its own article so each reads as its own requirement.
    const withArticle = services.map((s) => `an ${s}`);
    const joined =
      withArticle.length === 1
        ? withArticle[0]
        : `${withArticle.slice(0, -1).join(', ')} and ${withArticle[withArticle.length - 1]}`;
    lines.push(`This project requires ${joined}.`);
  }
  // Manual pin wins; otherwise the hours follow the situation automatically.
  if (!omit.includes('disconnectDuration')) {
    const duration = n.disconnectDuration ?? disconnectDurationFor(n, utility);
    lines.push(`Expected power disconnect duration: ${DURATION_WORD[duration]}.`);
  }
  if (n.roofRating) {
    const band = roofBand(n.roofRating);
    lines.push(`Roof rating: ${n.roofRating}/10 (${band.name}) — ${band.outcome}.`);
  }
  // "Others…" with its box left blank drops the line, mirroring storiesOther.
  const material = roofMaterialLabel(n);
  if (material) lines.push(`Roof material: ${clause(material)}.`);

  // 2. Free text, in the order fixed by the 2026-10-27 audit: battery
  //    location, "anything else", and special cases LAST (Aboud: "lets have
  //    it below the Anything else").
  //    (mainDisconnectLocation retired, meeting 2026-10-04; concretePad
  //    retired 2026-11-03 — the Battery installation analysis block replaced
  //    it, see batteryAnalysisLines.)
  if (!omit.includes('batteryLocation')) {
    const def = field('batteryLocation');
    lines.push(...labelled(def.label, n.batteryLocation ?? '', def.key, p));
  }

  // 3. "Anything else" — unlabelled, one bullet per line, exactly as the old
  //    free-text Installation Layout note rendered. Keeps the migration invisible.
  lines.push(...noteLines(effectiveText(n.other, 'install.other', p)));

  if (!omit.includes('specialCases')) {
    const def = field('specialCases');
    lines.push(...labelled(def.label, n.specialCases ?? '', def.key, p));
  }

  return lines;
}

/**
 * The `Battery Installation Analysis` block (Aboud 2026-11-03) — its own
 * section, sibling to Installation Notes and Conduit Raceway in both the Slack
 * post and the SF "Installation Window and Planning" field.
 *
 * Four lines at most, always in this order: what the batteries sit on, the
 * ground work that base needs, how the wall behind them carries them, then
 * anything the questions did not cover.
 *
 * Every branch degrades gracefully when its follow-up box is still empty — the
 * form requires those answers (see `missingRequired`), but a half-filled draft
 * must still render something sensible rather than a dangling sentence.
 */
export function batteryAnalysisLines(n: InstallNotes | undefined, p: PolishState): string[] {
  if (!n) return [];
  const lines: string[] = [];

  // 1 + 2. The base, and the ground work it needs.
  if (n.batteryBase === 'concrete-pad') {
    lines.push('The batteries will be installed on a new concrete pad.');
    if (n.batteryBaseNeedsWork === true) {
      const def = field('batteryBaseWork');
      lines.push(...labelled(def.label, n.batteryBaseWork ?? '', def.key, p));
    } else if (n.batteryBaseNeedsWork === false) {
      // Stated out loud rather than left silent (Aboud 2026-11-03): the crew
      // needs to see the question was actually answered, not skipped.
      lines.push('No additional ground work is required for the battery base.');
    }
  } else if (n.batteryBase === 'wall-mount') {
    const elevation = clauses(n.batteryElevation ?? '', 'install.batteryElevation', p);
    lines.push(
      elevation ? `The batteries will be wall-mounted at an elevation of ${elevation}.` : 'The batteries will be wall-mounted.',
    );
  } else if (n.batteryBase === 'existing-ground') {
    const ground = clauses(n.batteryGround ?? '', 'install.batteryGround', p);
    const lead = 'The batteries will be installed on the existing ground';
    lines.push(ground ? `${lead} — ${ground}.` : `${lead}.`);
  }

  // 3. The supporting wall. An uneven wall that must ALSO be pushed out reads
  //    as one sentence — generated as two, it says "unistruts" twice in
  //    consecutive bullets and looks like a duplication bug.
  const push = n.batteryPushFromWall === true;
  if (n.wallEven === true) {
    lines.push('The supporting wall is even — the batteries installation will be wall supported normally.');
    if (push) lines.push('Unistruts will be used to push the batteries further from the wall.');
  } else if (n.wallEven === false) {
    lines.push(
      push
        ? 'The supporting wall is not even — unistruts with spring nuts will be used, and additional unistruts will push the batteries further from the wall.'
        : 'The supporting wall is not even — unistruts with spring nuts will be used to support the batteries.',
    );
  } else if (push) {
    lines.push('Unistruts will be used to push the batteries further from the wall.');
  }

  // 4. Anything else — unlabelled, one bullet per line, like the main box.
  lines.push(...noteLines(effectiveText(n.batteryOther ?? '', 'install.batteryOther', p)));

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
    return labelledRun(def.label, n[f] ?? '', def.key, p);
  });
}
