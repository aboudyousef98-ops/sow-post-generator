// Daily Progress report (Admin › Daily Progress) — pure functions only.
// Phase matching uses the SEEDED label ids ('phase-design'/'phase-schedule'),
// which stay stable even if an admin renames the labels.

import type { BoardProject, BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { linkedPosts, liveProjects } from './board';
import { isoToUs, parseIsoLocal, weekdayName } from './dates';

export const DESIGN_PHASE_ID = 'phase-design';
export const SCHEDULE_PHASE_ID = 'phase-schedule';

/** One row of the "scheduled next 7 days" section. */
export interface ScheduledEntry {
  project: BoardProject;
  dateIso: string; // the linked post's installScheduledDate
}

/** ISO date + N days → ISO date, built from parts (never `new Date(string)`). */
export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoLocal(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Design-phase projects whose Designed date is exactly `dateIso`, by name. */
export function designedOn(board: BoardState, dateIso: string): BoardProject[] {
  return liveProjects(board.projects)
    .filter((p) => p.phaseId === DESIGN_PHASE_ID && p.designedDate === dateIso)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Schedule-phase projects split into: installs inside today..today+7
 * (inclusive, sorted by date) and rows with no linked install date at all —
 * flagged, not hidden, so nothing in Schedule silently drops off the report.
 * The date comes from the linked POSTED record first (it is authoritative),
 * falling back to the latest linked draft.
 */
export function scheduledNext7(
  board: BoardState,
  records: PostRecord[],
  todayIso: string,
): { scheduled: ScheduledEntry[]; noDate: BoardProject[] } {
  const end = addDaysIso(todayIso, 7);
  const scheduled: ScheduledEntry[] = [];
  const noDate: BoardProject[] = [];
  for (const p of liveProjects(board.projects)) {
    if (p.phaseId !== SCHEDULE_PHASE_ID) continue;
    const { draft, posted } = linkedPosts(records, p.id);
    const dateIso = posted?.sf.installScheduledDate || draft?.sf.installScheduledDate || '';
    if (!dateIso) noDate.push(p);
    else if (dateIso >= todayIso && dateIso <= end) scheduled.push({ project: p, dateIso });
  }
  scheduled.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.project.name.localeCompare(b.project.name));
  noDate.sort((a, b) => a.name.localeCompare(b.name));
  return { scheduled, noDate };
}

/** 'Saturday, 10/04/2026' */
function longDate(iso: string): string {
  return `${weekdayName(iso)}, ${isoToUs(iso)}`;
}

/** The whole report as plain text — exactly what "Copy report" puts on the clipboard. */
export function formatDailyReport(
  designDateIso: string,
  designed: BoardProject[],
  scheduled: ScheduledEntry[],
  noDate: BoardProject[],
): string {
  const lines = [
    `Daily SOW Projects Progress — ${longDate(designDateIso)}`,
    '',
    'Projects from Design:',
    ...(designed.length ? designed.map((p) => `- ${p.name}`) : ['- None']),
    '',
    'Projects scheduled for the next 7 days:',
  ];
  const schedLines = [
    ...scheduled.map((s) => `- ${s.project.name} - Scheduled ${longDate(s.dateIso)}`),
    ...noDate.map((p) => `- ${p.name} - No installation date yet`),
  ];
  lines.push(...(schedLines.length ? schedLines : ['- None']));
  return lines.join('\n');
}
