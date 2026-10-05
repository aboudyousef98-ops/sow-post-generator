// Daily Progress report (Admin › Daily Progress) — pure functions only.
// Phase matching uses the SEEDED label ids ('phase-design'/'phase-schedule'),
// which stay stable even if an admin renames the labels.
// Both sections are driven by the SAME picked Design date (Aboud, 2026-10-06):
// Design-phase rows designed that day, and Schedule-phase rows designed that
// day shown with their install date.

import type { BoardProject, BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { linkedPosts, liveProjects } from './board';
import { isoToUs, weekdayName } from './dates';

export const DESIGN_PHASE_ID = 'phase-design';
export const SCHEDULE_PHASE_ID = 'phase-schedule';

/** One row of the "Projects scheduled" section. */
export interface ScheduledEntry {
  project: BoardProject;
  dateIso: string; // the linked post's installScheduledDate
}

/** Design-phase projects whose Designed date is exactly `dateIso`, by name. */
export function designedOn(board: BoardState, dateIso: string): BoardProject[] {
  return liveProjects(board.projects)
    .filter((p) => p.phaseId === DESIGN_PHASE_ID && p.designedDate === dateIso)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Schedule-phase projects whose Designed date is exactly `dateIso`, split
 * into: rows with a linked install date (sorted by that date) and rows with
 * no install date at all — flagged, not hidden, so nothing designed that day
 * silently drops off the report. The date comes from the linked POSTED record
 * first (it is authoritative), falling back to the latest linked draft.
 */
export function scheduledOn(
  board: BoardState,
  records: PostRecord[],
  dateIso: string,
): { scheduled: ScheduledEntry[]; noDate: BoardProject[] } {
  const scheduled: ScheduledEntry[] = [];
  const noDate: BoardProject[] = [];
  for (const p of liveProjects(board.projects)) {
    if (p.phaseId !== SCHEDULE_PHASE_ID || p.designedDate !== dateIso) continue;
    const { draft, posted } = linkedPosts(records, p.id);
    const installIso = posted?.sf.installScheduledDate || draft?.sf.installScheduledDate || '';
    if (!installIso) noDate.push(p);
    else scheduled.push({ project: p, dateIso: installIso });
  }
  scheduled.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.project.name.localeCompare(b.project.name));
  noDate.sort((a, b) => a.name.localeCompare(b.name));
  return { scheduled, noDate };
}

/** 'Saturday, 10/04/2026' */
function longDate(iso: string): string {
  return `${weekdayName(iso)}, ${isoToUs(iso)}`;
}

/** 'Wed 10/07' — short weekday + MM/DD, no year (Aboud: the long form was too much). */
export function shortDate(iso: string): string {
  return `${weekdayName(iso).slice(0, 3)} ${isoToUs(iso).slice(0, 5)}`;
}

/** Updates textarea → one entry per non-empty trimmed line. */
export function parseUpdates(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** The whole report as plain text — exactly what "Copy report" puts on the clipboard. */
export function formatDailyReport(
  designDateIso: string,
  designed: BoardProject[],
  scheduled: ScheduledEntry[],
  noDate: BoardProject[],
  updates: string[],
): string {
  // '•' bullets, not '-' (Aboud 2026-10-07) — reads better in Slack.
  const lines = [
    `Daily SOW Projects Progress — ${longDate(designDateIso)}`,
    '',
    'Projects from Design:',
    ...(designed.length ? designed.map((p) => `• ${p.name}`) : ['• None']),
    '',
    'Projects scheduled (installation date):',
  ];
  const schedLines = [
    ...scheduled.map((s) => `• ${s.project.name} - ${shortDate(s.dateIso)}`),
    ...noDate.map((p) => `• ${p.name} - No installation date yet`),
  ];
  lines.push(...(schedLines.length ? schedLines : ['• None']));
  // Empty Updates prints NOTHING — the section exists only when typed
  // (Aboud 2026-10-07).
  if (updates.length) lines.push('', 'Updates:', ...updates.map((u) => `• ${u}`));
  return lines.join('\n');
}
