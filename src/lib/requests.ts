// Slack-captured designer requests — pure logic (Aboud's 2026-11-06 design,
// built 2026-11-15). The channel cannot be auto-harvested (~1 in 10 human
// messages is actionable, and `@material-requests` is a user-group mention on
// nearly every message), so capture is a manual BATCH PASTE; and because 0 of
// the board's first 51 updates were ever written voluntarily, the reading is
// enforced by a popup at "Working on it" and a hard gate at "Ready to
// submit"/"Done" rather than trusted to a checkbox.

import type { BoardLabel, BoardProject, ProjectRequest } from '../board/types';
import { nameKey } from './board';

/**
 * Split a pasted blob into one candidate request per Slack message. Slack
 * copies separate messages with blank lines between them; lines inside one
 * message stay together. Fragments with no real content ("ok", emoji) drop —
 * a request worth gating on has at least a short sentence in it.
 */
export function parseSlackPaste(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 12);
}

/**
 * The board row a message most likely names. Every word of a project's name
 * must appear in the message (word-boundary, case-insensitive) — "Acevedo,
 * Maria M" still matches "Maria M Acevedo". Several candidates → the longest
 * name wins (the most specific). No candidate → null, never a guess: the
 * confirm screen's picker is where a human decides.
 */
export function suggestProject(message: string, projects: BoardProject[]): BoardProject | null {
  const hay = ` ${message.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  let best: BoardProject | null = null;
  for (const p of projects) {
    if (p.deletedAt || p.archivedAt) continue;
    const words = nameKey(p.name).split(' ').filter(Boolean);
    if (!words.length) continue;
    if (!words.every((w) => hay.includes(` ${w} `))) continue;
    if (!best || nameKey(p.name).length > nameKey(best.name).length) best = p;
  }
  return best;
}

export function newRequest(
  text: string,
  projectId: string | null,
  addedBy: string,
  now: string = new Date().toISOString(),
): ProjectRequest {
  return { id: crypto.randomUUID(), projectId, text: text.trim(), addedBy, addedAt: now, updatedAt: now };
}

/** Resolution bumps updatedAt so it wins the merge everywhere. */
export function resolveRequest(r: ProjectRequest, by: string, now: string = new Date().toISOString()): ProjectRequest {
  return { ...r, resolvedBy: by, resolvedAt: now, updatedAt: now };
}

/** Attach a parked (inbox) request to the row that now exists. */
export function attachRequest(
  r: ProjectRequest,
  projectId: string,
  now: string = new Date().toISOString(),
): ProjectRequest {
  return { ...r, projectId, updatedAt: now };
}

export function deleteRequest(r: ProjectRequest, by: string, now: string = new Date().toISOString()): ProjectRequest {
  return { ...r, deleted: { at: now, by }, updatedAt: now };
}

/** Not tombstoned. */
export function liveRequests(requests: ProjectRequest[] | undefined): ProjectRequest[] {
  return (requests ?? []).filter((r) => !r.deleted);
}

/** Live, unresolved requests attached to one row — what the chip counts and
 * the gates block on. */
export function openRequestsFor(requests: ProjectRequest[] | undefined, projectId: string): ProjectRequest[] {
  return liveRequests(requests).filter((r) => r.projectId === projectId && !r.resolvedAt);
}

/** Parked in the inbox — pasted before their board row existed. */
export function inboxRequests(requests: ProjectRequest[] | undefined): ProjectRequest[] {
  return liveRequests(requests).filter((r) => r.projectId === null);
}

// ---- which statuses trigger what (Aboud 2026-11-06: soft at "Working on
// it", hard at "Ready to submit"/"Done") ------------------------------------
// By-name defaults, the isReviewLabel convention: the live labels carry no
// flag and must work with no migration.

const WORKING_NAMES = new Set(['working on it']);
const READY_NAMES = new Set(['ready to submit']);

/** Moving here = work starts: show the open requests once, nothing blocked. */
export function isWorkingLabel(label: BoardLabel | undefined): boolean {
  return !!label && label.columnKey === 'status' && WORKING_NAMES.has(label.name.trim().toLowerCase());
}

/** Moving here = the BOS is finished: open requests must be resolved first. */
export function isReadyOrDoneLabel(label: BoardLabel | undefined): boolean {
  if (!label || label.columnKey !== 'status') return false;
  return label.isDone || READY_NAMES.has(label.name.trim().toLowerCase());
}
