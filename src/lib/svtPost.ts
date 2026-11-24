// SVT pre-design post (Aboud 2026-11-15) — the #sow-svt-collab taskforce.
//
// SOW posts a scope analysis within hours of the site survey, BEFORE design,
// so SVT/CLR can make an informed scheduling decision (Issam's brief,
// 2026-11-13). The shape follows Omar Rajab's Louis Fritz note: equipment
// placement → routing → homeowner confirmations → schedule impact.
//
// One source feeds everything: the shared facts (walls, stories, services,
// duration, roof, special cases, battery location) come from the SAME
// InstallNotes fields and line builders the SOW post uses, so the two posts
// can never disagree. Only the pre-design questions (HO agreement,
// alternatives, likely path, two-day) live in record.svt.

import type { PostItem } from './template';
import { escapeHtml, renderItemsHtml, renderItemsText } from './template';
import { CLEARANCE_LINE, runLines, underline } from './sfSubmission';
import { clauses, installNoteLines, labelled, leadSentence } from './installNotes';
import { effectiveText, noteLines, punctuate, stripBullet } from './noteText';
import type { ClearEquipment, CostDirection, PostRecord, PostValue, SvtAsk, SvtNotes } from '../types';

/**
 * The conduit-path ticks, in the order the post prints them. Fixed names,
 * derived, never typed — like the service ticks, the model can never reword
 * them. SEPARATE from installNotes.trench on purpose: these are a pre-design
 * guess, the trench box is a confirmed scope statement with an NEC citation.
 */
export const SVT_PATHS: {
  field: 'pathB2b' | 'pathAttic' | 'pathExternal' | 'pathTrench' | 'pathExisting';
  label: string;
}[] = [
  { field: 'pathB2b', label: 'Back-to-back' },
  { field: 'pathAttic', label: 'Attic run' },
  { field: 'pathExternal', label: 'External run' },
  { field: 'pathTrench', label: 'Trench (underground)' },
  { field: 'pathExisting', label: 'Existing solar tie-in' },
];

/**
 * The crew-days sentences (Issam, 2026-11-13; widened to a one/two pick on
 * Aboud's 2026-11-15 review): SOW calls the crew days and the CLR team books
 * the Gantt accordingly. Derived, never PolishKeys.
 */
export const ONE_DAY_LINE = 'One-day job — one crew day covers it.';
export const TWO_DAY_LINE = 'Two-day job — schedule two consecutive crew days.';

export const HO_AGREES_LINE = 'The homeowner agrees with the proposed battery location.';

/**
 * The homeowner has no stated preference (Omar Rajab, William Giles,
 * 2026-11-17: "Since we don't have the homeowner's preferred battery location,
 * we'll go with the approach that works best for us: the most cost-efficient
 * option and the easiest for the installers"). Distinct from an unanswered
 * question, which still prints nothing.
 */
export const HO_UNKNOWN_LINE =
  'The homeowner has no stated preference for the battery location — this proposal is the most cost-efficient option and the easiest for the installers.';

/** Default required clearance, in inches. Overridable per record on purpose. */
export const CLEAR_REQUIRED_DEFAULT = 36;

/** How each equipment choice reads mid-sentence. */
export const CLEAR_EQUIPMENT_LABEL: Record<ClearEquipment, string> = {
  inverter: 'inverter',
  battery: 'battery',
  equipment: 'equipment',
};

/** The cost drivers already named across the 402-record corpus. */
export const COST_DRIVERS = [
  'long SER run',
  'external conduit length',
  'trenching',
  'attic run',
  'service upgrade',
  'concrete pad',
  'equipment relocation',
  'tree work',
] as const;

/** The direction word; `neutral` is a whole sentence since it takes no driver. */
export const COST_HEAD: Record<CostDirection, string> = {
  adds: 'Adds cost',
  saves: 'Saves cost',
  neutral: 'No significant cost change expected.',
};

/**
 * Things a pre-design note is NOT the answer to, and who to ask instead.
 * `team` is only filled where the channel actually named one — panel fit and
 * production range go to the PR team (Omar Rajab, 2026-11-17). The other two
 * print without a pointer rather than invent a routing nobody stated.
 */
export const NOT_REVIEWED: { key: string; team: string | null }[] = [
  { key: 'panel fit', team: 'the PR team' },
  { key: 'production range', team: 'the PR team' },
  { key: 'structural', team: null },
  { key: 'AHJ requirements', team: null },
];

/** The recurring things a homeowner is asked to do before the crew arrives. */
export const HO_ACTIONS = [
  'clear the garage',
  'remove or relocate plants and landscaping in the installation area',
  'relocate a gutter leader or downspout',
  'move stored items out of the work area',
  'trim or remove trees',
  'secure pets and provide gate access',
  'clear attic access',
] as const;

export const HO_ACTIONS_LEAD = 'The homeowner will need to';

/**
 * Battery stacks → kWh sold (Daniel Beier, #sow-svt-collab 2026-11-16, in
 * answer to Ya'rob Nabulsi: read it "from the scope of the project").
 * One pick writes both numbers, so the post never carries a stack count the
 * capacity contradicts.
 */
export const STACK_KWH: Record<1 | 2 | 3, number> = { 1: 20, 2: 40, 3: 60 };

/** "Sold with 3 battery stacks (60 kWh)." — singular at one stack. */
export const stackLine = (stacks: 1 | 2 | 3) =>
  `Sold with ${stacks} battery ${stacks === 1 ? 'stack' : 'stacks'} (${STACK_KWH[stacks]} kWh).`;

/**
 * Duracell battery body width, inches — measured from `BOS_DURACELL_BATTERY`
 * in the elevation template (`_STUDY_equipment_widths_dxf.md`, 2026-11-17).
 */
export const BATTERY_WIDTH = 23.57;

/**
 * Clear gap between adjacent stacks, inches. Measured across 53 real inserts:
 * 27.33" and 27.54" centre-to-centre on a 23.57" body, i.e. 3.76"/3.97".
 *
 * NOT confirmed to be a manufacturer or fire-code minimum — it is what the
 * template draws. Open question 5 in the study; if it turns out to be a code
 * figure that varies, this becomes an input like the clearance requirement.
 */
export const BATTERY_GAP = 4;

/** Wall inches a run of N stacks needs, bodies plus the gaps between them. */
export const wallNeeded = (stacks: 1 | 2 | 3) => stacks * BATTERY_WIDTH + (stacks - 1) * BATTERY_GAP;

/**
 * The Wall Fit line. Only printed when BOTH the stack count and the measured
 * wall are present — a need with nothing to compare it to says nothing.
 * Equal counts as a fit, same rule as the clearance check.
 */
function wallFitLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const stacks = s.batteryStacks;
  const avail = s.wallAvailable;
  if (stacks === undefined || avail === undefined) return [];
  const need = wallNeeded(stacks);
  const spare = avail - need;
  const head = `${stacks} stack${stacks === 1 ? '' : 's'} need ${inches(need)}" of wall (${inches(BATTERY_WIDTH)}" each${
    stacks > 1 ? `, ${inches(BATTERY_GAP)}" gaps` : ''
  })`;
  return [
    spare >= 0
      ? `${head}; ${inches(avail)}" available — fits, with ${inches(spare)}" to spare.`
      : `${head}; only ${inches(avail)}" available — short by ${inches(-spare)}".`,
  ];
}

/**
 * The closing sentences. "they/them" for the homeowner on purpose: the form
 * cannot know a customer's pronouns, and this text is pasted into Salesforce.
 */
export const ASK_LINES: Record<SvtAsk, string> = {
  goodToGo: 'The project is good to go.',
  hoConfirm: 'Please confirm with the homeowner and let us know how they prefer to proceed.',
  hoConvince: 'Please let us know whether we can convince the homeowner to go with this approach.',
  blocked: 'Blocked — we need more information before this can be finalized.',
};

/** `Blocked` with something named. */
export const blockedLine = (what: string) => `Blocked — we need the following before this can be finalized: ${what}.`;

/** Trim float noise without forcing a decimal: 40 → "40", 11.9 → "11.9". */
const inches = (v: number) => String(Math.round(v * 10) / 10);

/** Sub-points read as sentences of their own, so they start with a capital. */
const capitalize = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * The Clearance bullet. Omar's Garage note is the spec: available space,
 * equipment width, what is left, and whether that clears the requirement.
 * Equal counts as met. Both numbers are needed for the calculation — one
 * alone says nothing, so it prints nothing. (The measured dimension is the
 * equipment WIDTH, relabelled from "depth" on 2026-11-24; the stored key stays
 * `clearDepth` so no record migrates.)
 */
function clearanceLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const lines: string[] = [];
  const { clearAvailable: avail, clearDepth: depth } = s;
  const required = s.clearRequired ?? CLEAR_REQUIRED_DEFAULT;
  if (avail !== undefined && depth !== undefined) {
    const left = Math.round(avail - depth);
    const what = CLEAR_EQUIPMENT_LABEL[s.clearEquipment ?? 'equipment'];
    const head = `The wall has ${inches(avail)}" of space and the ${what} is ${inches(depth)}" wide, leaving about ${left}"`;
    lines.push(
      left >= required
        ? `${head} — the ${inches(required)}" requirement is met.`
        : `${head} — short of the ${inches(required)}" required.`,
    );
  }
  if (s.clearanceAllMet) lines.push(CLEARANCE_LINE);
  return lines;
}

/**
 * The Site Conditions bullet — the facts the notes cite to justify a route,
 * which is why it prints right after the conduit path. Tri-state throughout.
 */
function siteConditionLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const lines: string[] = [];
  if (s.atticAccessible === true) lines.push('The attic is accessible, so wires can be routed through it.');
  else if (s.atticAccessible === false) lines.push('The attic is not accessible.');
  if (s.detachedStructure === true) {
    lines.push('The property has detached buildings.');
    // Continuity only means anything once there is more than one structure,
    // and it is what decides whether an attic run between them is possible.
    if (s.atticsContinuous === true) {
      lines.push('The attics are continuous between the structures, so wires can be routed attic-to-attic.');
    } else if (s.atticsContinuous === false) {
      lines.push('The attics are not continuous between the structures, so wires cannot run attic-to-attic.');
    }
  } else if (s.detachedStructure === false) {
    lines.push('No detached buildings on the property.');
  }
  if (s.batteryStacks !== undefined) lines.push(stackLine(s.batteryStacks));
  return lines;
}

/**
 * The Homeowner Actions bullet: one lead line with the picked actions nested
 * under it, which is how all three notes phrase it.
 */
function hoActionValues(record: PostRecord): PostValue[] {
  const s: SvtNotes = record.svt ?? {};
  const picked = (s.hoActions ?? []).filter((a) => (HO_ACTIONS as readonly string[]).includes(a));
  const extra = (s.hoActionsOther ?? '')
    .split('\n')
    .map(stripBullet)
    .filter(Boolean)
    .filter((l) => /[\p{L}\p{N}]/u.test(l));
  const all = [...picked, ...extra].map((a) => punctuate(capitalize(a)));
  return all.length ? [{ label: HO_ACTIONS_LEAD, text: '', sub: all }] : [];
}

/** The Ask bullet — the closing sentence, and nothing else. */
function askLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  if (!s.ask) return [];
  const what = (s.blockedOn ?? '').trim();
  if (s.ask === 'blocked' && what) return [blockedLine(what.replace(/[.\s]+$/, ''))];
  return [ASK_LINES[s.ask]];
}

/**
 * The Battery Location bullet (Aboud 2026-11-24, homeowner-first redesign).
 *
 * The lead sentence is the DECIDED install location — the SAME sentence the SF
 * "Battery and Equipment Location" field prints, read from the shared
 * `installNotes.batteryLocation`. SvtCard keeps that field equal to whichever
 * box is the decision (the HO's when SOW agrees, the SOW box otherwise), so the
 * three posts can never disagree. The homeowner narrative wraps around it:
 *   - no stated preference → HO_UNKNOWN_LINE (cost-efficient, installer-easy);
 *   - a preference the SOW team agrees with → that location leads, and we say so;
 *   - a preference we disagree with → our location leads, then the HO's and why
 *     it does not work.
 */
function batteryLines(record: PostRecord): string[] {
  const n = record.installNotes;
  const s: SvtNotes = record.svt ?? {};
  const lines: string[] = [];
  // The decided install location leads. SvtCard normally syncs the HO's
  // location into the shared `batteryLocation` on agree, but read it straight
  // from `svt.hoLocation` here too so the post is right even for an unsynced
  // record (hand edits, imports). Otherwise the shared field is the decision.
  const agreedToHo = s.hoHasPreference === true && s.sowAgrees === true && (s.hoLocation ?? '').trim() !== '';
  if (agreedToHo) {
    lines.push(...leadSentence('Batteries will be installed', /^batter/i, s.hoLocation ?? '', 'svt.hoLocation', record));
  } else if (n) {
    lines.push(
      ...leadSentence('Batteries will be installed', /^batter/i, n.batteryLocation ?? '', 'install.batteryLocation', record),
    );
  }
  // Tri-state throughout: an unanswered question prints nothing.
  if (s.hoHasPreference === false) {
    lines.push(HO_UNKNOWN_LINE);
  } else if (s.hoHasPreference === true) {
    if (s.sowAgrees === true) {
      // The decided location IS the HO's — the lead already named it, so don't
      // restate the place, only that it is theirs and that we concur.
      lines.push('This is the homeowner’s preferred location.');
      lines.push(...labelled('Our analysis', s.hoAnalysis ?? '', 'svt.hoAnalysis', record));
      const why = clauses(s.agreeReason ?? '', 'svt.agreeReason', record);
      lines.push(why ? `The SOW team agrees — ${why}.` : 'The SOW team agrees with this location.');
    } else if (s.sowAgrees === false) {
      const loc = clauses(s.hoLocation ?? '', 'svt.hoLocation', record);
      lines.push(
        loc ? `The homeowner prefers a different location: ${loc}.` : 'The homeowner prefers a different location.',
      );
      lines.push(...labelled('Our analysis', s.hoAnalysis ?? '', 'svt.hoAnalysis', record));
      lines.push(...labelled('Why it does not work', s.hoReason ?? '', 'svt.hoReason', record));
    } else {
      // Preference stated, SOW agreement not decided yet.
      const loc = clauses(s.hoLocation ?? '', 'svt.hoLocation', record);
      lines.push(loc ? `The homeowner prefers ${loc}.` : 'The homeowner has a preferred location.');
      lines.push(...labelled('Our analysis', s.hoAnalysis ?? '', 'svt.hoAnalysis', record));
    }
  }
  const alts = [
    { loc: clauses(s.alt1Location ?? '', 'svt.alt1Location', record), reason: clauses(s.alt1Reason ?? '', 'svt.alt1Reason', record) },
    { loc: clauses(s.alt2Location ?? '', 'svt.alt2Location', record), reason: clauses(s.alt2Reason ?? '', 'svt.alt2Reason', record) },
  ];
  for (const a of alts) {
    // The location anchors the line — a reason with no location prints nothing.
    if (a.loc) lines.push(`Alternative location: ${a.loc}${a.reason ? ` — ${a.reason}` : ''}.`);
  }
  return lines;
}

/**
 * The Most Likely Conduit Path bullet: the ticked names, then the notes.
 * (The "ruled out" group was removed from the tool on 2026-11-24.)
 */
function pathLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const names = SVT_PATHS.filter((p) => s[p.field]).map((p) => p.label);
  const lines: string[] = [];
  if (names.length) lines.push(`${names.join(', ')}.`);
  lines.push(...noteLines(effectiveText(s.pathNotes ?? '', 'svt.pathNotes', record)));
  return lines;
}

/** The Scheduling bullet: the crew-days call, then anything scheduling
 * should know. Unanswered prints nothing — the house tri-state contract. */
function schedulingLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const lines: string[] = [];
  if (s.crewDays === 1) lines.push(ONE_DAY_LINE);
  else if (s.crewDays === 2) lines.push(TWO_DAY_LINE);
  lines.push(...noteLines(effectiveText(s.schedulingNotes ?? '', 'svt.schedulingNotes', record)));
  return lines;
}

/**
 * The SVT post's bullets, in fixed order. The Installation Notes bullet is
 * installNoteLines — the exact builder the SOW post uses — which covers walls,
 * stories, service upgrades, the disconnect duration, the roof and the special
 * cases in one pass. Battery location and "anything else" are omitted there:
 * the location leads the Battery Location bullet instead, and "anything else"
 * stays a full-SOW detail. Empty bullets are dropped, as everywhere.
 */
export function buildSvtLines(record: PostRecord): PostItem[] {
  const items: PostItem[] = [
    { label: 'Battery Location', values: batteryLines(record) },
    { label: 'Most Likely Conduit Path', values: pathLines(record) },
    // Site conditions sit beside the path because they are what justifies it
    // ("detached buildings, so the garage would need an attic run and a
    // trench"), and clearance follows as the verdict on the chosen wall.
    { label: 'Site Conditions', values: siteConditionLines(record) },
    // Wall fit before clearance: width decides whether the run goes on that
    // wall at all, clearance decides whether you can stand in front of it.
    { label: 'Wall Fit', values: wallFitLines(record) },
    { label: 'Clearance', values: clearanceLines(record) },
    {
      label: 'Installation Notes',
      values: installNoteLines(record.installNotes, record, record.sf.utility, ['batteryLocation', 'other']),
    },
    { label: 'Scheduling', values: schedulingLines(record) },
    // The homeowner's homework, then the ask. The ask is NOT a labelled bullet
    // (Aboud 2026-11-24: "remove this wording on the slack post") — it closes
    // the post as a plain sentence, appended by each builder below.
    { label: 'Homeowner Actions', values: hoActionValues(record) },
  ];
  return items.filter((it) => it.values.length > 0);
}

/** "8.2 kW | Pasadena | Oncor" — missing parts dropped, '' when none. */
function metaLine(record: PostRecord): string {
  return [
    record.sf.systemSizeKw !== undefined ? `${record.sf.systemSizeKw} kW` : '',
    (record.sf.jurisdiction ?? '').trim(),
    (record.sf.utility ?? '').trim(),
  ]
    .filter(Boolean)
    .join(' | ');
}

/** Slack mrkdwn version (also the plain-text clipboard fallback). */
export function buildSvtPostText(record: PostRecord): string {
  const lines = [`*Pre-Design Analysis — ${record.sf.customerName.trim() || '—'}*`];
  const meta = metaLine(record);
  if (meta) lines.push(meta);
  lines.push(...renderItemsText(buildSvtLines(record)));
  // The closing ask, as a plain sentence with no "The Ask" heading.
  lines.push(...askLines(record));
  return lines.join('\n');
}

/**
 * The Salesforce version (Aboud 2026-11-15: "salesforce does not have
 * formatting so we need to create ours like the SOW"). The SAME bullets as
 * the Slack post — buildSvtLines is the one source — rendered with the SF
 * plain-text conventions sfSubmission.ts established: dashed underlines for
 * section titles, "- " lines, two-space nested indents.
 */
export function buildSvtSfText(record: PostRecord): string {
  const header = `Pre-Design Analysis — ${record.sf.customerName.trim() || '—'}`;
  const meta = metaLine(record);
  const parts = [meta ? `${header}\n${meta}` : header];
  for (const it of buildSvtLines(record)) {
    parts.push(`${underline(it.label)}\n${it.values.flatMap(runLines).join('\n')}`);
  }
  // The closing ask, as a plain sentence with no "The Ask" underline heading.
  const ask = askLines(record);
  if (ask.length) parts.push(ask.join('\n'));
  return parts.join('\n\n');
}

/** Rich-clipboard version — same renderer as the SOW post's HTML. */
export function buildSvtPostHtml(record: PostRecord): string {
  const parts = [`<p><strong>Pre-Design Analysis — ${escapeHtml(record.sf.customerName.trim() || '—')}</strong></p>`];
  const meta = metaLine(record);
  if (meta) parts.push(`<p>${escapeHtml(meta)}</p>`);
  parts.push(renderItemsHtml(buildSvtLines(record)));
  // The closing ask, as a plain paragraph with no "The Ask" heading.
  for (const line of askLines(record)) parts.push(`<p>${escapeHtml(line)}</p>`);
  return parts.join('');
}
