// Salesforce per-field submission (Aboud 2026-10-22). The team no longer posts
// the composed message to Slack — they fill Salesforce fields on the Design
// record, and "Salesforce for Slack" generates the handoff message from those.
// This module renders the SAME record the Slack post renders, but as one value
// per SF field, in the SF page's order, so Compose can offer one copy button
// per field.
//
// Shape decisions (2026-10-22 study of 11 real handoff posts, revised by the
// 2026-10-27 field audit and the 2026-11-03 battery change):
// - "Installation Window and Planning" carries the classification + install
//   notes (special cases last) + the battery installation analysis + conduit
//   raceway as labelled sections — the structured variant of what
//   coordinators were pasting by hand.
// - Walls and battery location are OMITTED from that blob because both land in
//   Battery and Equipment Location — every fact is stated exactly once.
// - The battery installation analysis goes in the WINDOW blob, not beside the
//   battery location (Aboud 2026-11-03: he wants the whole analysis in one
//   place, under Installation Notes).
// - Wiring Route and Site Modification Notes are deliberately NOT generated
//   (filled by hand in SF; the concrete pad box was retired 2026-11-03).

import type { Ahj, PostRecord, PostValue, Settings } from '../types';
import { LEVEL_INFO, LEVEL_NAMES } from './classify';
import {
  batteryAnalysisLines,
  conduitRunLines,
  disconnectDurationFor,
  installNoteLines,
  leadSentence,
  wallsSentence,
} from './installNotes';
import { punctuate } from './noteText';
import { effectiveNoteLines, requirementSections } from './template';

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

/** Exported for svtPost.ts — ONE set of SF plain-text conventions. */
export const underline = (title: string) => `${title}\n${'-'.repeat(title.length)}`;
const dashed = (lines: string[]) => lines.map((l) => `- ${l}`).join('\n');
/** Several lines read as a dashed list; a single line stays a bare sentence. */
const listy = (lines: string[]) => (lines.length > 1 ? dashed(lines) : (lines[0] ?? ''));

/** SF picklist wording — the handoff posts print "1 to 2 hours", not "1–2". */
const SF_DURATION: Record<'1-2' | '4-6', string> = { '1-2': '1 to 2 hours', '4-6': '4 to 6 hours' };

/** Crew-days per level, as a number SF accepts (level 4 is "minimum 2"). */
const LEVEL_DAYS: Record<1 | 2 | 3 | 4, string> = { 1: '1', 2: '1.5', 3: '2', 4: '2' };

/** Exported for svtPost.ts: the SVT post's "all met" tick prints this exact
 * sentence, so the pre-design note and the SOW handoff cannot word the same
 * claim two ways. */
export const CLEARANCE_LINE = 'All required clearance requirements have been met.';

/** A PostValue as dashed lines — nested points indent under their line.
 * Exported for svtPost.ts, same reason as `underline`. */
export function runLines(v: PostValue): string[] {
  if (typeof v === 'string') return [`- ${v}`];
  if (v.text) return [`- ${v.label ? `${v.label}: ${v.text}` : v.text}`];
  return [`- ${v.label}:`, ...v.sub.map((s) => `  - ${s}`)];
}

export function buildSfSubmission(record: PostRecord, settings: Settings, ahjs?: Ahj[]): SfSubmissionField[] {
  const n = record.installNotes;

  // Classification + the install-note sentences (special cases and concrete
  // pad INCLUDED — 2026-10-27 audit: pad before "anything else", special
  // cases after it) + conduit raceway, one fact per line. Walls, battery
  // location, stories and the disconnect duration are omitted — each lands in
  // its own SF field (walls: the Battery and Equipment Location sentence, per
  // the same audit). The clearance boilerplate closes the GENERATED part of
  // the blob (strays typed into a notes box are filtered so it appears
  // exactly once); since 2026-11-15 any APPROVED requirement sections follow
  // it, so the include checkboxes reach SF too.
  const clearanceRe = /clearance requirements have been met/i;
  const windowParts = [
    `Level ${record.level} – ${LEVEL_NAMES[record.level]}.\nPlanning window: ${LEVEL_INFO[record.level].window}.`,
  ];
  const noteSentences = installNoteLines(n, record, record.sf.utility, [
    'walls',
    'batteryLocation',
    'stories',
    'disconnectDuration',
  ]).filter((l) => !clearanceRe.test(l));
  if (noteSentences.length) windowParts.push(`${underline('Installation Notes')}\n${dashed(noteSentences)}`);
  // Battery installation analysis — its own section between Installation Notes
  // and Conduit Raceway (Aboud 2026-11-03). He asked for the WHOLE analysis
  // under Installation Notes rather than split across two SF fields; a
  // sibling section rather than an indented sub-list, because SF strips
  // formatting and these sentences are long enough to soft-wrap, which would
  // flatten any indentation back into the list above it.
  const battery = batteryAnalysisLines(n, record).filter((l) => !clearanceRe.test(l));
  if (battery.length) windowParts.push(`${underline('Battery Installation Analysis')}\n${dashed(battery)}`);
  const runs = conduitRunLines(n, record).flatMap(runLines).filter((l) => !clearanceRe.test(l));
  if (runs.length) windowParts.push(`${underline('Conduit Raceway')}\n${runs.join('\n')}`);
  windowParts.push(CLEARANCE_LINE);
  // Approved AHJ/Utility/Funding requirements (Aboud 2026-11-15): the include
  // checkboxes used to feed the Slack post alone, which read as "not working"
  // once SF per-field became the submission path. Same single source as the
  // Slack post — requirementSections() — appended after the clearance line.
  // A multi-line requirement keeps its continuation lines indented under its
  // dash, so it reads as one item.
  for (const sec of requirementSections(record, ahjs)) {
    const dashed = (p: string) =>
      p
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, i) => (i === 0 ? `- ${l}` : `  ${l}`))
        .join('\n');
    // A labelled group gets its category as a plain heading line; an
    // unlabelled one prints its items straight under the section title, which
    // is byte-identical to what an uncategorised board produced before.
    const body = sec.groups
      .map((g) => (g.label ? `${g.label}:\n${g.posts.map(dashed).join('\n')}` : g.posts.map(dashed).join('\n')))
      .join('\n');
    windowParts.push(`${underline(sec.title)}\n${body}`);
  }

  const stories =
    n?.stories === 'other' ? n.storiesOther.trim() : n?.stories !== undefined ? String(n.stories) : '';

  const duration = n?.disconnectDuration ?? disconnectDurationFor(n, record.sf.utility);

  // Date / region / address / jurisdiction are NOT offered: Salesforce is where
  // those came from — the SF record already has them (Aboud 2026-10-22 review).
  // Order = the SF "Design and Installation Context" section exactly as laid
  // out on the page: LEFT column top-to-bottom, then RIGHT column (Aboud
  // 2026-10-22, screenshot). Wiring Route (right, #2) is filled by hand in SF.
  return [
    {
      id: 'batteryLocation',
      label: 'Battery and Equipment Location',
      // Battery location + the equipment walls, combined (Aboud 2026-10-22:
      // "this must combine the batteries location and the equipment walls").
      // Both read as full sentences — "Equipment will be installed on…" /
      // "Batteries will be installed…" (2026-10-27 audit).
      value: listy([
        ...(n ? [wallsSentence(n, 'Equipment will be installed')].filter(Boolean) : []),
        ...(n
          ? leadSentence('Batteries will be installed', /^batter/i, n.batteryLocation ?? '', 'install.batteryLocation', record)
          : []),
      ]),
      multiline: true,
    },
    // Every install disconnects power at least briefly — all 11 studied
    // handoffs say Yes, so the value is constant rather than guessed.
    { id: 'outageExpected', label: 'Power Outage Expected', value: 'Yes', copy: false },
    { id: 'panelFacesFront', label: 'Panel Facing Front of House', value: n?.panelFacesFront ? 'Yes' : 'No', copy: false },
    { id: 'window', label: 'Installation Window and Planning', value: windowParts.join('\n\n'), multiline: true },
    {
      id: 'clearanceHomeowner',
      label: 'Clearance and Homeowner Preparation',
      // Homeowner notes only — the clearance boilerplate closes the window blob
      // instead (Aboud 2026-10-22). Defaults to 'No feedback.' like the post.
      value: listy(effectiveNoteLines(record, 'homeowner', settings).map(punctuate)),
      multiline: true,
    },
    { id: 'stories', label: 'Number of Stories', value: stories, copy: false },
    { id: 'outageDuration', label: 'Estimated Power Outage Duration', value: SF_DURATION[duration], copy: false },
    { id: 'installDays', label: 'Estimated Installation Duration (Days)', value: LEVEL_DAYS[record.level], copy: false },
    // Site Modification Notes is no longer generated (2026-10-27 audit): the
    // concrete pad moved into the window blob. Like Wiring Route, the SF field
    // is filled by hand if ever needed.
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
