// Designed-date auto-stamp (Aboud 2026-10-22). Saving a Compose draft that is
// linked to a board project fills the project's BLANK Designed date with the
// coordinator's local day. Grounded in the Oct 11–21 activity study:
//   - 64% of manual date-sets were "today" stamped while working — automatable.
//   - 35% were set AHEAD (tomorrow's queue, planned in the evening) — which is
//     why this must fill only when blank and never overwrite a manual value.
//   - 11% of live projects had a draft but no date at all and silently dropped
//     off Daily Progress — the leak this closes.
// The stamp rides the normal patch/activity path, so it merges and logs like
// any hand edit. Pure function: App.tsx owns the state and the clock.

import type { BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { activityForPatch, patchProject } from './board';
import { hasContent } from './record';

/**
 * Board with the record's linked project stamped `designedDate = localTodayIso`,
 * or null when there is nothing to do (no link, project gone/archived/deleted,
 * or a date — manual or planned ahead — is already set).
 *
 * The caller passes the LOCAL day (lib/dates.todayIso), never a UTC slice:
 * 40% of the team's evening edits straddle the UTC date boundary.
 */
export function designStamp(
  board: BoardState,
  rec: PostRecord,
  localTodayIso: string,
  now: string = new Date().toISOString(),
): BoardState | null {
  if (!rec.projectId || rec.deletedAt) return null;
  // A record whose only content is the prefilled customer name is not design
  // work: openFromBoard commits exactly that shape (and the 500 ms autosave
  // echoes it), and a mere "Open in Compose" click must not write a date.
  if (!hasContent({ ...rec, sf: { ...rec.sf, customerName: '' } })) return null;
  const project = board.projects.find((p) => p.id === rec.projectId);
  if (!project || project.archivedAt || project.deletedAt) return null;
  if (project.designedDate) return null; // manual always wins — fill only when blank
  // A blank date whose history shows a designedDate change is a deliberate
  // CLEAR (or an earlier stamp) — re-stamping it would make the manual clear
  // impossible to keep while a linked draft exists. Touched once = hands off.
  if (board.activity.some((a) => a.projectId === project.id && a.changes?.designedDate)) return null;

  const patch = { designedDate: localTodayIso };
  const entry = activityForPatch(project, patch, rec.author, board.labels, now);
  const stamped = patchProject(project, patch, rec.author, now);
  return {
    ...board,
    projects: board.projects.map((p) => (p.id === project.id ? stamped : p)),
    // Prepend — the activity feed renders unsorted, newest-first by convention.
    activity: entry ? [entry, ...board.activity] : board.activity,
  };
}
