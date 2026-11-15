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
import { runLines, underline } from './sfSubmission';
import { clauses, installNoteLines, labelled, leadSentence } from './installNotes';
import { effectiveText, noteLines } from './noteText';
import type { PostRecord, SvtNotes } from '../types';

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

/** The Most Likely Conduit Path bullet: the ticked names, then the notes. */
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
    {
      label: 'Installation Notes',
      values: installNoteLines(record.installNotes, record, record.sf.utility, ['batteryLocation', 'other']),
    },
    { label: 'Scheduling', values: schedulingLines(record) },
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
