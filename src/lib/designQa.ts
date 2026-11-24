// Design process QA (Aboud 2026-11-24) — two tri-state checks that ride the
// same mechanism as the wire verdict: a derived Design Feedback line. Each is
// silent until answered and silent when the answer is "yes"; only an explicit
// "no" prints a reminder to the designer. Kept out of the AI path (not a
// PolishKey), so the wording can never be reworded.

import type { PostRecord } from '../types';

/** Printed when the project files were NOT on the shared folder. */
export const SHARED_FOLDER_REMINDER = 'Please save the project files to the shared folder.';

/** Printed when the designer did NOT use the master template. */
export const TEMPLATE_REMINDER = 'Please use the master template on the shared folder for future projects.';

/**
 * The derived Design Feedback lines from the design QA checks, in print order.
 * Empty while unanswered or when both answers are "yes" — a brand-new draft
 * must never flag the designer (same tri-state contract as the wire verdict).
 */
export function designQaLines(r: PostRecord): string[] {
  const q = r.designQa;
  const lines: string[] = [];
  if (q?.sharedFolder === false) lines.push(SHARED_FOLDER_REMINDER);
  if (q?.usedTemplate === false) lines.push(TEMPLATE_REMINDER);
  return lines;
}
