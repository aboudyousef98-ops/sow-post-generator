// Salesforce per-field submission (Aboud 2026-10-22). The team no longer posts
// the composed message to Slack — they fill Salesforce fields on the Design
// record, and "Salesforce for Slack" generates the handoff message from those.
// This module renders the SAME record the Slack post renders, but as one value
// per SF field, in the SF page's order, so Compose can offer one copy button
// per field.
//
// Shape decisions (from the 2026-10-22 study of 11 real handoff posts):
// - "Installation Window and Planning" carries the classification + install
//   notes + conduit raceway as labelled lines — the structured variant of what
//   coordinators were pasting by hand.
// - Battery location and special cases are OMITTED from that blob because each
//   lands in its own SF field (Battery and Equipment Location / Site
//   Modification Notes) — every fact is stated exactly once.
// - Wiring Route is deliberately NOT generated (Aboud: no picker; filled by
//   hand in SF).

import type { PostRecord, PostValue, Settings } from '../types';
import { LEVEL_INFO, LEVEL_NAMES } from './classify';
import { isoToUs } from './dates';
import { conduitRunLines, disconnectDurationFor, installNoteLines } from './installNotes';
import { effectiveText, noteLines, punctuate } from './noteText';
import { effectiveNoteLines, regionLine } from './template';

export interface SfSubmissionField {
  /** Stable key for React and the per-field "copied" tick. */
  id: string;
  /** The EXACT Salesforce field label, so the panel reads like the SF page. */
  label: string;
  /** What the copy button puts on the clipboard. '' = nothing to copy yet. */
  value: string;
  /** Rendered as a multi-line block instead of a single line. */
  multiline?: boolean;
  /**
   * false = the SF field is a checkbox / picklist / number input (Aboud
   * 2026-10-22): clicking it in SF is faster than pasting, so the panel shows
   * the value to read, with no copy button.
   */
  copy?: boolean;
}

// ---- plain-text structure ----------------------------------------------------
// Salesforce long-text fields strip every kind of rich formatting, so structure
// must survive as characters: dashed underlines for sections, "- " bullets for
// lines, two-space indents for nested points.

const underline = (title: string) => `${title}\n${'-'.repeat(title.length)}`;
const dashed = (lines: string[]) => lines.map((l) => `- ${l}`).join('\n');
/** Several lines read as a dashed list; a single line stays a bare sentence. */
const listy = (lines: string[]) => (lines.length > 1 ? dashed(lines) : (lines[0] ?? ''));

/** SF picklist wording — the handoff posts print "1 to 2 hours", not "1–2". */
const SF_DURATION: Record<'1-2' | '4-6', string> = { '1-2': '1 to 2 hours', '4-6': '4 to 6 hours' };

/** Crew-days per level, as a number SF accepts (level 4 is "minimum 2"). */
const LEVEL_DAYS: Record<1 | 2 | 3 | 4, string> = { 1: '1', 2: '1.5', 3: '2', 4: '2' };

const CLEARANCE_LINE = 'All required clearance requirements have been met.';

/** A conduit-run PostValue as dashed lines — nested points indent under their run. */
function runLines(v: PostValue): string[] {
  if (typeof v === 'string') return [`- ${v}`];
  if (v.text) return [`- ${v.label ? `${v.label}: ${v.text}` : v.text}`];
  return [`- ${v.label}:`, ...v.sub.map((s) => `  - ${s}`)];
}

/** A note box's effective (polished-aware) text as punctuated lines. */
function boxLines(record: PostRecord, raw: string | undefined, key: Parameters<typeof effectiveText>[1]): string[] {
  return noteLines(effectiveText(raw ?? '', key, record));
}

export function buildSfSubmission(record: PostRecord, settings: Settings): SfSubmissionField[] {
  const n = record.installNotes;
  const iso = record.sf.installScheduledDate;

  // Classification + the install-note sentences + conduit raceway, one fact per
  // line. Battery location / special cases are omitted — see the header note.
  const windowParts = [
    `Level ${record.level} – ${LEVEL_NAMES[record.level]}.\nPlanning window: ${LEVEL_INFO[record.level].window}.`,
  ];
  const noteSentences = installNoteLines(n, record, record.sf.utility, ['batteryLocation', 'specialCases']);
  if (noteSentences.length) windowParts.push(`${underline('Installation Notes')}\n${dashed(noteSentences)}`);
  const runs = conduitRunLines(n, record).flatMap(runLines);
  if (runs.length) windowParts.push(`${underline('Conduit Raceway')}\n${runs.join('\n')}`);

  const stories =
    n?.stories === 'other' ? n.storiesOther.trim() : n?.stories !== undefined ? String(n.stories) : '';

  const duration = n?.disconnectDuration ?? disconnectDurationFor(n, record.sf.utility);

  const homeowner = boxLines(record, record.notes.homeowner, 'homeowner');
  const siteMod = [
    ...boxLines(record, n?.concretePad, 'install.concretePad'),
    ...boxLines(record, n?.specialCases, 'install.specialCases'),
  ];

  return [
    { id: 'installDate', label: 'Installation Date', value: iso ? isoToUs(iso) : '' },
    { id: 'region', label: 'Region', value: regionLine(record) },
    { id: 'siteAddress', label: 'Site Address', value: record.sf.siteAddress?.trim() ?? '' },
    { id: 'jurisdiction', label: 'Jurisdiction', value: record.sf.jurisdiction?.trim() ?? '' },
    { id: 'window', label: 'Installation Window and Planning', value: windowParts.join('\n\n'), multiline: true },
    { id: 'stories', label: 'Number of Stories', value: stories, copy: false },
    { id: 'installDays', label: 'Estimated Installation Duration (Days)', value: LEVEL_DAYS[record.level], copy: false },
    // Every install disconnects power at least briefly — all 11 studied
    // handoffs say Yes, so the value is constant rather than guessed.
    { id: 'outageExpected', label: 'Power Outage Expected', value: 'Yes', copy: false },
    { id: 'outageDuration', label: 'Estimated Power Outage Duration', value: SF_DURATION[duration], copy: false },
    { id: 'panelFacesFront', label: 'Panel Facing Front of House', value: n?.panelFacesFront ? 'Yes' : 'No', copy: false },
    {
      id: 'batteryLocation',
      label: 'Battery and Equipment Location',
      value: listy(boxLines(record, n?.batteryLocation, 'install.batteryLocation')),
      multiline: true,
    },
    {
      id: 'clearanceHomeowner',
      label: 'Clearance and Homeowner Preparation',
      value: listy([CLEARANCE_LINE, ...homeowner]),
      multiline: true,
    },
    { id: 'siteModification', label: 'Site Modification Notes', value: listy(siteMod), multiline: true },
    {
      id: 'siteSurvey',
      label: 'Site Survey Feedback',
      value: listy(effectiveNoteLines(record, 'siteSurvey', settings).map(punctuate)),
      multiline: true,
    },
    {
      id: 'design',
      label: 'Design Feedback',
      value: listy(effectiveNoteLines(record, 'design', settings).map(punctuate)),
      multiline: true,
    },
  ];
}
