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
}

/** SF picklist wording — the handoff posts print "1 to 2 hours", not "1–2". */
const SF_DURATION: Record<'1-2' | '4-6', string> = { '1-2': '1 to 2 hours', '4-6': '4 to 6 hours' };

/** Crew-days per level, as a number SF accepts (level 4 is "minimum 2"). */
const LEVEL_DAYS: Record<1 | 2 | 3 | 4, string> = { 1: '1', 2: '1.5', 3: '2', 4: '2' };

const CLEARANCE_LINE = 'All required clearance requirements have been met.';

/** Flatten a conduit-run PostValue to plain lines ("Label: text." / nested points). */
function runLines(v: PostValue): string[] {
  if (typeof v === 'string') return [v];
  if (v.text) return [v.label ? `${v.label}: ${v.text}` : v.text];
  return [`${v.label}:`, ...v.sub];
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
  const windowLines = [
    `Level ${record.level} – ${LEVEL_NAMES[record.level]}.`,
    `Planning window: ${LEVEL_INFO[record.level].window}.`,
    ...installNoteLines(n, record, record.sf.utility, ['batteryLocation', 'specialCases']),
  ];
  const runs = conduitRunLines(n, record).flatMap(runLines);
  if (runs.length) windowLines.push('Conduit Raceway:', ...runs);

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
    { id: 'window', label: 'Installation Window and Planning', value: windowLines.join('\n'), multiline: true },
    { id: 'stories', label: 'Number of Stories', value: stories },
    { id: 'installDays', label: 'Estimated Installation Duration (Days)', value: LEVEL_DAYS[record.level] },
    // Every install disconnects power at least briefly — all 11 studied
    // handoffs say Yes, so the value is constant rather than guessed.
    { id: 'outageExpected', label: 'Power Outage Expected', value: 'Yes' },
    { id: 'outageDuration', label: 'Estimated Power Outage Duration', value: SF_DURATION[duration] },
    { id: 'panelFacesFront', label: 'Panel Facing Front of House', value: n?.panelFacesFront ? 'Yes' : 'No' },
    {
      id: 'batteryLocation',
      label: 'Battery and Equipment Location',
      value: boxLines(record, n?.batteryLocation, 'install.batteryLocation').join('\n'),
      multiline: true,
    },
    {
      id: 'clearanceHomeowner',
      label: 'Clearance and Homeowner Preparation',
      value: [CLEARANCE_LINE, ...homeowner].join('\n'),
      multiline: true,
    },
    { id: 'siteModification', label: 'Site Modification Notes', value: siteMod.join('\n'), multiline: true },
    {
      id: 'siteSurvey',
      label: 'Site Survey Feedback',
      value: effectiveNoteLines(record, 'siteSurvey', settings).map(punctuate).join('\n'),
      multiline: true,
    },
    {
      id: 'design',
      label: 'Design Feedback',
      value: effectiveNoteLines(record, 'design', settings).map(punctuate).join('\n'),
      multiline: true,
    },
  ];
}
