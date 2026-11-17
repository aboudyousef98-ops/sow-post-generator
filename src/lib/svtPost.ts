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
 * equipment depth, what is left, and whether that clears the requirement.
 * Equal counts as met. Both numbers are needed for the calculation — one
 * alone says nothing, so it prints nothing.
 */
function clearanceLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const lines: string[] = [];
  const { clearAvailable: avail, clearDepth: depth } = s;
  const required = s.clearRequired ?? CLEAR_REQUIRED_DEFAULT;
  if (avail !== undefined && depth !== undefined) {
    const left = Math.round(avail - depth);
    const what = CLEAR_EQUIPMENT_LABEL[s.clearEquipment ?? 'equipment'];
    const head = `The wall has ${inches(avail)}" of space and the ${what} is ${inches(depth)}" deep, leaving about ${left}"`;
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
  if (s.hoa !== undefined) lines.push(`HOA: ${s.hoa ? 'yes' : 'no'}.`);
  if (s.batteryStacks !== undefined) lines.push(stackLine(s.batteryStacks));
  return lines;
}

/**
 * The Cost Impact bullet: the direction, then the drivers that explain it.
 *
 * `costNotes` is a one-line noun phrase labelled "Another driver", so it joins
 * the driver list rather than printing as a line of its own — which also means
 * there is no capitalisation question about it.
 */
function costLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const dir = s.costDirection;
  const typed = (s.costNotes ?? '').trim().replace(/[.\s]+$/, '');
  if (dir === 'neutral') return [COST_HEAD.neutral];
  if (dir) {
    // Unknown strings are dropped: the printed wording stays a closed set even
    // if a stored record carries a driver this build no longer offers.
    const drivers = (s.costDrivers ?? []).filter((d) => (COST_DRIVERS as readonly string[]).includes(d));
    if (typed) drivers.push(typed);
    return [drivers.length ? `${COST_HEAD[dir]} — ${drivers.join(', ')}.` : `${COST_HEAD[dir]}.`];
  }
  // No direction picked. The UI cannot produce this with text in the box, but
  // a stored record could — print it rather than silently lose it.
  return noteLines(s.costNotes ?? '');
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
 * The Battery Location bullet: the proposed location (the SAME sentence the
 * SF "Battery and Equipment Location" field prints), then the homeowner's
 * answer, then any alternative locations with their reasons.
 */
function batteryLines(record: PostRecord): string[] {
  const n = record.installNotes;
  const s: SvtNotes = record.svt ?? {};
  const lines: string[] = [];
  if (n) {
    lines.push(
      ...leadSentence('Batteries will be installed', /^batter/i, n.batteryLocation ?? '', 'install.batteryLocation', record),
    );
  }
  // Tri-state: an unanswered question prints nothing (same contract as the
  // battery yes/no questions — "unanswered" and "No" mean different things).
  if (s.hoAgrees === true) {
    lines.push(HO_AGREES_LINE);
  } else if (s.hoAgrees === 'unknown') {
    lines.push(HO_UNKNOWN_LINE);
  } else if (s.hoAgrees === false) {
    const loc = clauses(s.hoLocation ?? '', 'svt.hoLocation', record);
    lines.push(
      loc ? `The homeowner prefers a different location: ${loc}.` : 'The homeowner prefers a different location.',
    );
    lines.push(...labelled('Why it does not work', s.hoReason ?? '', 'svt.hoReason', record));
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
 * The Most Likely Conduit Path bullet: the ticked names, then what was ruled
 * out and why, then the notes.
 *
 * The ruled-out line is the one that stops the reader asking "could we not
 * just do X?" — which is exactly the round-trip the William Giles thread cost.
 */
function pathLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const names = SVT_PATHS.filter((p) => s[p.field]).map((p) => p.label);
  const lines: string[] = [];
  if (names.length) lines.push(`${names.join(', ')}.`);

  // A path ticked as likely can never also be ruled out — SvtCard clears the
  // other side on toggle — but filter anyway so a hand-edited record cannot
  // print a contradiction.
  const out = SVT_PATHS.filter((p) => (s.ruledOut ?? []).includes(p.field) && !s[p.field]).map((p) => p.label);
  if (out.length) {
    const why = (s.ruledOutReason ?? '').trim().replace(/[.\s]+$/, '');
    lines.push(`Ruled out: ${out.join(', ')}${why ? ` — ${why}` : ''}.`);
  }

  lines.push(...noteLines(effectiveText(s.pathNotes ?? '', 'svt.pathNotes', record)));
  return lines;
}

/** The Not Covered Here bullet: one line per team the items point at. */
function notReviewedLines(record: PostRecord): string[] {
  const s: SvtNotes = record.svt ?? {};
  const picked = NOT_REVIEWED.filter((x) => (s.notReviewed ?? []).includes(x.key));
  if (!picked.length) return [];
  // Group by team so items sharing a pointer share a sentence, and items with
  // no known team are simply listed.
  const byTeam = new Map<string | null, string[]>();
  for (const p of picked) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p.key]);
  return [...byTeam.entries()].map(([team, keys]) => {
    const list = keys.length > 1 ? `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}` : keys[0];
    return team
      ? `Not covered by this note: ${list} — please check with ${team}.`
      : `Not covered by this note: ${list}.`;
  });
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
    { label: 'Cost Impact', values: costLines(record) },
    { label: 'Scheduling', values: schedulingLines(record) },
    // The homeowner's homework, then the ask — the order every real note ends in.
    { label: 'Homeowner Actions', values: hoActionValues(record) },
    // The scope boundary sits immediately before the ask: it is the last thing
    // read, and it answers the question the ask would otherwise invite.
    { label: 'Not Covered Here', values: notReviewedLines(record) },
    { label: 'The Ask', values: askLines(record) },
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
  return parts.join('\n\n');
}

/** Rich-clipboard version — same renderer as the SOW post's HTML. */
export function buildSvtPostHtml(record: PostRecord): string {
  const parts = [`<p><strong>Pre-Design Analysis — ${escapeHtml(record.sf.customerName.trim() || '—')}</strong></p>`];
  const meta = metaLine(record);
  if (meta) parts.push(`<p>${escapeHtml(meta)}</p>`);
  parts.push(renderItemsHtml(buildSvtLines(record)));
  return parts.join('');
}
