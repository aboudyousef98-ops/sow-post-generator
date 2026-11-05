// Asking the ACTIVITY LOG a question — "what were the projects I interacted
// with yesterday?"
//
// Aboud 2026-11-05: "the 'Ask the updates' feature looks into updates, but can
// we also make it look at activity log?"
//
// WHY THIS IS NOT THE SAME DESIGN AS lib/updates's AI search.
//
// "Which projects have trenching?" is a question about MEANING, so the model
// reads the updates and picks the ones that match. "What did I touch
// yesterday?" is not: it is a filter — actor is me, the date is one specific
// calendar day, and the answer is a set of project ids. Two reasons the
// updates design would be wrong for it:
//
//   1. the live log holds 2,589 entries and is capped at 5,000. Sending that
//      corpus to a model would be slow and expensive, every single time.
//   2. a model asked to pick dates out of timestamps will get it nearly right,
//      which for "yesterday" is the same as wrong.
//
// So the model does QUERY EXTRACTION, not retrieval: it turns the English
// question into the filter below, and this file applies that filter locally,
// exactly. Nothing from the log is ever uploaded. parseLocalFilter handles the
// common phrasings with no model at all, so the box works with no key.

import type { BoardActivity, BoardProject } from '../board/types';
import { fieldLabel } from './board';
import { localDateOf, shiftIsoDays } from './dates';

/**
 * A question, reduced to something that can be applied exactly.
 * Every field is optional and they AND together.
 */
export interface ActivityFilter {
  /** Roster display names — matched exactly, never fuzzily. */
  actors?: string[];
  /** Local calendar day, inclusive. */
  from?: string;
  /** Local calendar day, inclusive. */
  to?: string;
  actions?: string[];
  /** ProjectPatch keys, e.g. 'statusId' — "who changed the status of…". */
  fields?: string[];
  projectNameContains?: string;
}

export interface ActivityHit {
  projectId: string;
  projectName: string;
  /** Matching entries, for ordering by how much happened. */
  count: number;
  /** Most recent matching entry, for the date shown on the row. */
  lastAt: string;
  /** "changed Status 3×, posted 1 update" — what actually happened. */
  summary: string;
}

/** True when the filter would actually narrow anything. */
export function hasActivityFilter(f: ActivityFilter | null | undefined): boolean {
  if (!f) return false;
  return Boolean(
    f.actors?.length || f.from || f.to || f.actions?.length || f.fields?.length || f.projectNameContains,
  );
}

const ACTION_WORDS: Record<string, string> = {
  create: 'created it',
  archive: 'archived it',
  restore: 'restored it',
  delete: 'deleted it',
  'update-post': 'posted an update',
  'update-edit': 'edited an update',
  'update-delete': 'deleted an update',
};

/** "changed Status 3×, posted 1 update" — plural-aware, newest concern first. */
function summarise(entries: BoardActivity[]): string {
  const counts = new Map<string, number>();
  const bump = (what: string) => counts.set(what, (counts.get(what) ?? 0) + 1);
  for (const e of entries) {
    if (e.action === 'update' && e.changes) {
      for (const key of Object.keys(e.changes)) bump(`changed ${fieldLabel(key)}`);
      continue;
    }
    bump(ACTION_WORDS[e.action] ?? e.action);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([what, n]) => (n === 1 ? what : `${what} ${n}×`))
    .join(', ');
}

function matches(e: BoardActivity, f: ActivityFilter, nameById: Map<string, string>): boolean {
  if (f.actors?.length && !f.actors.includes(e.actor)) return false;
  if (f.actions?.length && !f.actions.includes(e.action)) return false;
  if (f.fields?.length) {
    const keys = Object.keys(e.changes ?? {});
    if (!keys.some((k) => f.fields!.includes(k))) return false;
  }
  if (f.from || f.to) {
    // LOCAL day, not `at.slice(0, 10)` — see dates.localDateOf for why.
    const day = localDateOf(e.at);
    if (!day) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
  }
  if (f.projectNameContains) {
    const name = (nameById.get(e.projectId) ?? '').toLowerCase();
    if (!name.includes(f.projectNameContains.toLowerCase())) return false;
  }
  return true;
}

/**
 * Projects whose activity matches, one row each, busiest first.
 *
 * An EMPTY filter returns nothing rather than everything: an empty filter means
 * the question was not understood, and answering it with all 387 projects would
 * look like a result while being useless.
 */
export function applyActivityFilter(
  activity: BoardActivity[] | undefined,
  projects: BoardProject[],
  filter: ActivityFilter | null | undefined,
): ActivityHit[] {
  if (!hasActivityFilter(filter)) return [];
  const f = filter as ActivityFilter;
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const byProject = new Map<string, BoardActivity[]>();
  for (const e of activity ?? []) {
    if (!e?.projectId || !matches(e, f, nameById)) continue;
    // A project deleted since is not an answer anyone can act on.
    if (!nameById.has(e.projectId)) continue;
    const list = byProject.get(e.projectId);
    if (list) list.push(e);
    else byProject.set(e.projectId, [e]);
  }
  return [...byProject.entries()]
    .map(([projectId, entries]) => ({
      projectId,
      projectName: nameById.get(projectId) as string,
      count: entries.length,
      lastAt: entries.reduce((max, e) => (e.at > max ? e.at : max), entries[0].at),
      summary: summarise(entries),
    }))
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

// ---- the no-model path ------------------------------------------------------

/** Monday of the week `iso` falls in (ISO weeks, so the week starts Monday). */
function startOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return shiftIsoDays(iso, -dow);
}

/**
 * The phrasings worth handling without a model, so "what did I touch
 * yesterday" answers instantly, offline, and with no key — the same contract
 * the keyword pass gives the updates search.
 *
 * Returns null when nothing is recognised, which is the signal to wait for the
 * model rather than to answer badly.
 */
export function parseLocalFilter(query: string, me: string, roster: string[], todayIso: string): ActivityFilter | null {
  const q = query.toLowerCase();
  const filter: ActivityFilter = {};

  // ---- when
  const lastN = q.match(/last\s+(\d{1,3})\s+days?/);
  if (/\byesterday\b/.test(q)) {
    const d = shiftIsoDays(todayIso, -1);
    filter.from = d;
    filter.to = d;
  } else if (/\btoday\b/.test(q)) {
    filter.from = todayIso;
    filter.to = todayIso;
  } else if (/\blast week\b/.test(q)) {
    const thisMonday = startOfWeek(todayIso);
    filter.from = shiftIsoDays(thisMonday, -7);
    filter.to = shiftIsoDays(thisMonday, -1);
  } else if (/\bthis week\b/.test(q)) {
    filter.from = startOfWeek(todayIso);
    filter.to = todayIso;
  } else if (lastN) {
    // "last 7 days" includes today, so it is N-1 back.
    filter.from = shiftIsoDays(todayIso, -(Number(lastN[1]) - 1));
    filter.to = todayIso;
  }

  // ---- who. A named teammate wins over "I": "what did Omar do yesterday"
  // asked by Aboud is about Omar.
  const named = roster.find((n) => {
    const first = n.split(' ')[0].toLowerCase();
    return q.includes(n.toLowerCase()) || new RegExp(`\\b${first}\\b`).test(q);
  });
  if (named) filter.actors = [named];
  else if (/\b(i|me|my|mine)\b/.test(q)) filter.actors = [me];

  // A date alone is a real question ("what happened yesterday"); an actor
  // alone is "everything they have ever done", which is not an answer.
  return filter.from || filter.to ? filter : null;
}

/**
 * Context handed to the model so it can resolve "yesterday" and a first name
 * without guessing. Deliberately tiny — no activity, no updates, no project
 * list. The whole point is that the log never leaves the browser.
 */
export function queryContext(
  me: string,
  roster: string[],
  todayIso: string,
): { me: string; today: string; roster: string[]; fields: string[]; actions: string[] } {
  return {
    me,
    today: todayIso,
    roster,
    fields: ['name', 'coordinator', 'reviewer', 'statusId', 'phaseId', 'designedDate', 'rating', 'sfNotes'],
    actions: ['create', 'update', 'archive', 'restore', 'delete', 'update-post', 'update-edit', 'update-delete'],
  };
}

/**
 * Drop anything the model invented. A hallucinated actor or field would
 * silently narrow the answer to nothing, which reads as "you did nothing
 * yesterday" — a confidently wrong answer, the worst kind here.
 */
export function sanitizeFilter(
  raw: ActivityFilter | null | undefined,
  roster: string[],
  context = queryContext('', roster, ''),
): ActivityFilter {
  if (!raw) return {};
  const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const out: ActivityFilter = {};
  const actors = (raw.actors ?? []).filter((a) => roster.includes(a));
  if (actors.length) out.actors = actors;
  const actions = (raw.actions ?? []).filter((a) => context.actions.includes(a));
  if (actions.length) out.actions = actions;
  const fields = (raw.fields ?? []).filter((f) => context.fields.includes(f));
  if (fields.length) out.fields = fields;
  if (isDate(raw.from)) out.from = raw.from;
  if (isDate(raw.to)) out.to = raw.to;
  if (typeof raw.projectNameContains === 'string' && raw.projectNameContains.trim()) {
    out.projectNameContains = raw.projectNameContains.trim();
  }
  // A backwards range matches nothing; swapping is what the asker meant.
  if (out.from && out.to && out.from > out.to) [out.from, out.to] = [out.to, out.from];
  return out;
}

/** "12 projects you touched yesterday" — the line above the results. */
export function describeFilter(f: ActivityFilter, me: string, hits: number): string {
  const who = !f.actors?.length
    ? 'anyone'
    : f.actors.length === 1
      ? f.actors[0] === me
        ? 'you'
        : f.actors[0]
      : f.actors.join(' and ');
  let when = '';
  if (f.from && f.to) when = f.from === f.to ? ` on ${f.from}` : ` between ${f.from} and ${f.to}`;
  else if (f.from) when = ` since ${f.from}`;
  else if (f.to) when = ` up to ${f.to}`;
  const verb = who === 'you' ? 'you touched' : `${who} touched`;
  return `${hits} project${hits === 1 ? '' : 's'} ${verb}${when}.`;
}
