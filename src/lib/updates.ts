// Project Updates — the Monday-style thread on each board row.
//
// Aboud 2026-10-17 #2: "I want to have notes or updates tab for each project
// where I can post as much updates as I want like Monday.com".
//
// Two of his other asks write INTO this thread rather than inventing their own
// storage, which is the whole point — one searchable place:
//   #3 a 4- or 5-star rating must come with a reason ("this project has trench
//      and external long run"), "and btw I want this comment to be inside the
//      updates feature", so that an AI search over updates can answer "find me
//      the trenching projects".
//   #6 moving a project to "Pending additional information" must say WHAT
//      information is missing. His words: "This is a must".

import type { BoardLabel, NoteGate, ProjectUpdate, UpdateKind } from '../board/types';

/** Ratings that oblige the rater to explain themselves (#3). */
export const RATING_NEEDS_REASON = 4;

/** The status label whose name triggers the "what's missing?" gate (#6). */
export const PENDING_INFO_LABEL = 'Pending Additional Information';

export function needsRatingReason(rating: number | null | undefined): boolean {
  return typeof rating === 'number' && rating >= RATING_NEEDS_REASON;
}

/**
 * Case/space-insensitive, so a label rename that only changes case still works.
 *
 * Kept for the gate COPY (see statusGate) — the gate itself is now decided by
 * labelRequiresNote, which any status label can opt into.
 */
export function isPendingInfoLabel(name: string | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === PENDING_INFO_LABEL.toLowerCase();
}

/**
 * Status labels that demand an explanation unless someone says otherwise —
 * Aboud 2026-11-05. Both already exist on the live board as team-created
 * labels, so there is nothing to seed and nothing to migrate: the names are
 * matched case-insensitively and the result is only a DEFAULT.
 */
const REQUIRES_NOTE_DEFAULT_NAMES = new Set([
  PENDING_INFO_LABEL.toLowerCase(),
  'pending update',
]);

/**
 * True when moving a row INTO this status obliges the person doing it to say
 * why. Same shape as isOutOfScopeLabel / isReviewLabel in lib/board.ts: an
 * explicit tick in Edit labels wins, and the name default makes the two
 * statuses Aboud already had work immediately.
 *
 * `isDone` switches it off for the same reason it beats the section flags —
 * finished is the stronger statement, and nobody should have to justify
 * closing out work.
 *
 * Deliberately NOT mutually exclusive with the section flags: "parked" and
 * "owes an explanation" are compatible claims about a row.
 */
export function labelRequiresNote(label: BoardLabel | undefined): boolean {
  if (!label || label.columnKey !== 'status' || label.isDone) return false;
  if (typeof label.requiresNote === 'boolean') return label.requiresNote;
  return REQUIRES_NOTE_DEFAULT_NAMES.has(label.name.trim().toLowerCase());
}

/**
 * The modal copy for a gated status. Derived from the label NAME so one gate
 * serves every status a team cares to flag, instead of a hardcoded sentence
 * per rule.
 *
 * "Pending Additional Information" keeps its original 2026-10-17 wording: the
 * team has been reading that exact sentence for weeks, and a generic rephrase
 * would be a downgrade for the one status that matters most.
 */
export function statusGate(label: BoardLabel): NoteGate {
  if (isPendingInfoLabel(label.name)) {
    return {
      title: 'What information is missing?',
      prompt: 'Say what you are waiting for before putting this on hold. Project',
      placeholder: 'e.g. need the signed utility interconnection letter from the customer',
      confirmLabel: 'Set status and post',
    };
  }
  // Same rhythm as the pending-info copy above — one short imperative, then
  // "Project" and the bolded name the modal appends. The title already names
  // the label, so the prompt does not repeat it.
  return {
    title: `What is the update for “${label.name}”?`,
    prompt: 'Say where this stands before moving it. Project',
    placeholder: 'e.g. engineering sent the revised set, waiting on the AHJ to confirm',
    confirmLabel: 'Set status and post',
  };
}

export function newUpdate(
  projectId: string,
  text: string,
  by: string,
  kind: UpdateKind = 'note',
  extra: Partial<Pick<ProjectUpdate, 'rating'>> = {},
  now: string = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): ProjectUpdate {
  return { id, projectId, text: text.trim(), by, at: now, kind, updatedAt: now, ...extra };
}

/** Live (non-deleted) updates for one project, newest first. */
export function updatesFor(all: ProjectUpdate[] | undefined, projectId: string): ProjectUpdate[] {
  return (all ?? [])
    .filter((u) => u.projectId === projectId && !u.deleted)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** projectId → live update count, for the board column badge. */
export function updateCounts(all: ProjectUpdate[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of all ?? []) {
    if (u.deleted) continue;
    m.set(u.projectId, (m.get(u.projectId) ?? 0) + 1);
  }
  return m;
}

export function editUpdate(u: ProjectUpdate, text: string, by: string, now = new Date().toISOString()): ProjectUpdate {
  return { ...u, text: text.trim(), editedAt: now, editedBy: by, updatedAt: now };
}

/**
 * Tombstone, never a splice — a hard delete would be resurrected by the next
 * merge from someone whose cache still has the row.
 */
export function deleteUpdate(u: ProjectUpdate, by: string, now = new Date().toISOString()): ProjectUpdate {
  return { ...u, deleted: { at: now, by }, updatedAt: now };
}

export function restoreUpdate(u: ProjectUpdate, now = new Date().toISOString()): ProjectUpdate {
  const rest = { ...u };
  delete rest.deleted;
  return { ...rest, updatedAt: now };
}

/** Upsert by id — the single way the board writes an update. */
export function putUpdate(all: ProjectUpdate[] | undefined, next: ProjectUpdate): ProjectUpdate[] {
  const list = all ?? [];
  return list.some((u) => u.id === next.id) ? list.map((u) => (u.id === next.id ? next : u)) : [next, ...list];
}

// ---- search ----------------------------------------------------------------

export interface UpdateHit {
  update: ProjectUpdate;
  projectName: string;
}

/**
 * Keyword search across every update. This is the offline half of #3's "I want
 * an AI search along these updates" — the AI path reuses the same corpus, and
 * this is what answers when the model is unavailable.
 *
 * Every term must appear, so "trench corpus" narrows rather than widens.
 */
export function searchUpdates(
  all: ProjectUpdate[] | undefined,
  nameById: Map<string, string>,
  query: string,
): UpdateHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return (all ?? [])
    .filter((u) => !u.deleted)
    .filter((u) => {
      const hay = `${u.text} ${nameById.get(u.projectId) ?? ''} ${u.by}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((u) => ({ update: u, projectName: nameById.get(u.projectId) ?? '(deleted project)' }));
}

/**
 * The corpus handed to the model for an AI search. Capped, because the whole
 * thread set would blow the context window on a busy board — newest first, so
 * the cap drops the stalest updates rather than a random slice.
 */
export function updatesCorpus(
  all: ProjectUpdate[] | undefined,
  nameById: Map<string, string>,
  limit = 300,
): { projectId: string; projectName: string; by: string; at: string; kind: UpdateKind; text: string }[] {
  return (all ?? [])
    .filter((u) => !u.deleted)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((u) => ({
      projectId: u.projectId,
      projectName: nameById.get(u.projectId) ?? '(deleted project)',
      by: u.by,
      at: u.at,
      kind: u.kind,
      text: u.text,
    }));
}
