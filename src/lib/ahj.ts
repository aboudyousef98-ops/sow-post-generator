// AHJ Requirements core (Phase 5): jurisdiction matching, post ordering,
// deep merge for team sync, name-conflict checks and global search.
//
// Kept dependency-free so the Netlify function (`ahjs.mts`) can import the
// same merge the client uses — one merge algorithm, tested once.

import type { Ahj, AhjPost, RequirementKind, RuleStatus } from '../types';

/** Case/whitespace-insensitive canonical form of a jurisdiction name. */
export function normName(s: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface AhjMatch {
  ahj: Ahj;
  /** `'name'` or the alias text that matched. */
  via: string;
}

/**
 * A board's kind. ABSENT means 'ahj' — every board created before 2026-10-08
 * predates the split and must keep landing in the AHJ tab.
 */
export function kindOf(a: Ahj): RequirementKind {
  return a.kind ?? 'ahj';
}

/** Live boards of one kind, in their stored order. */
export function boardsOfKind(ahjs: Ahj[], kind: RequirementKind): Ahj[] {
  return ahjs.filter((a) => kindOf(a) === kind);
}

/**
 * Replace every board of ONE kind, leaving the other kinds untouched.
 *
 * The Requirements tab is rendered per kind, so it only ever receives (and
 * returns) its own slice. Writing that slice straight back would delete every
 * other kind — this stitches it back together and stamps the kind on anything
 * newly created.
 */
export function replaceKind(all: Ahj[], kind: RequirementKind, next: Ahj[]): Ahj[] {
  const stamped = next.map((a) => (kindOf(a) === kind ? { ...a, kind } : { ...a, kind }));
  return [...all.filter((a) => kindOf(a) !== kind), ...stamped];
}

/**
 * Match a free-text key against live board names/aliases.
 *
 * `ahjs` must already be narrowed to ONE kind — matching is per kind, since an
 * AHJ named "Harris County" and a utility named "Harris Electric" live in the
 * same store.
 */
export function matchAhj(jurisdiction: string | undefined, ahjs: Ahj[]): AhjMatch | null {
  const n = normName(jurisdiction ?? '');
  if (!n) return null;
  for (const a of ahjs) {
    if (a.deleted) continue;
    if (normName(a.name) === n) return { ahj: a, via: 'name' };
    const alias = a.aliases.find((x) => normName(x) === n);
    if (alias) return { ahj: a, via: alias };
  }
  return null;
}

/** Non-deleted posts: pinned first, then newest first. */
export function livePosts(a: Ahj): AhjPost[] {
  return a.posts
    .filter((p) => !p.deleted)
    .sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.at.localeCompare(x.at));
}

// ---- Per-rule fields (Aboud 2026-11-17) -----------------------------------

/**
 * A rule's status. ABSENT means `current` — every post written before the
 * per-rule fields existed has no status, and must keep reaching Compose
 * exactly as it does today. Read status through here, never off the field.
 */
export function ruleStatus(p: AhjPost): RuleStatus {
  return p.status ?? 'current';
}

/** Superseded rules stay on the board and out of every handoff. */
export function isPostable(p: AhjPost): boolean {
  return ruleStatus(p) !== 'superseded';
}

/**
 * Canonical form of a category, for GROUPING ONLY.
 *
 * Category is free text (Aboud 2026-11-17), so "Setbacks", "setbacks " and
 * "SETBACKS" are one group. The original spelling of the first rule in a
 * group is what gets displayed — this value is a key, never a label.
 */
export function normCategory(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface RuleGroup {
  /** The category as first written, or '' for rules with no category. */
  label: string;
  posts: AhjPost[];
}

/**
 * Group posts by category for Compose, preserving the order they arrive in.
 *
 * Uncategorised rules collect under a '' label and are emitted LAST, so a
 * board that predates categories reads exactly as one ungrouped list — which
 * is how every existing board must keep reading.
 */
export function groupByCategory(posts: AhjPost[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const p of posts) {
    const key = normCategory(p.category);
    const g = groups.get(key);
    if (g) g.posts.push(p);
    else groups.set(key, { label: key ? (p.category ?? '').trim() : '', posts: [p] });
  }
  const out = [...groups.values()];
  // Uncategorised last — a labelled group is more useful at the top.
  return [...out.filter((g) => g.label), ...out.filter((g) => !g.label)];
}

const lastAct = (p: AhjPost) => p.editedAt ?? p.at;
const lastBy = (p: AhjPost) => p.editedBy ?? p.by;

/** Latest post/edit among live posts — the board's "Last edited by … · …" stamp. */
export function ahjLastActivity(a: Ahj): { at: string; by: string } | null {
  const ps = a.posts.filter((p) => !p.deleted);
  if (!ps.length) return null;
  const top = ps.reduce((m, p) => (lastAct(p) > lastAct(m) ? p : m));
  return { at: lastAct(top), by: lastBy(top) };
}

/**
 * Does any live AHJ (other than `excludeId`) already use one of `terms` as its
 * name or an alias? Used when adding/renaming and when restoring from Trash.
 */
export function nameConflict(
  terms: string[],
  ahjs: Ahj[],
  excludeId?: string,
): { term: string; ahjName: string } | null {
  for (const a of ahjs) {
    if (a.deleted || a.id === excludeId) continue;
    const own = new Set([a.name, ...a.aliases].map(normName));
    const hit = terms.find((t) => own.has(normName(t)));
    if (hit) return { term: hit, ahjName: a.name };
  }
  return null;
}

/**
 * Merge two copies of the SAME post: newer `updatedAt` wins the fields, but
 * the histories are unioned and — when both sides carry different text — the
 * losing side's text is preserved as a history version instead of vanishing.
 */
function mergePost(a: AhjPost, b: AhjPost): AhjPost {
  const [win, lose] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  const history = [...win.history];
  const seen = new Set(history.map((h) => `${h.at}|${h.text}`));
  const add = (h: { text: string; at: string; by: string }) => {
    const k = `${h.at}|${h.text}`;
    if (seen.has(k)) return;
    seen.add(k);
    history.push(h);
  };
  for (const h of lose.history ?? []) add(h);
  if (lose.text !== win.text && !history.some((h) => h.text === lose.text)) {
    add({ text: lose.text, at: lose.editedAt ?? lose.at, by: lose.editedBy ?? lose.by });
  }
  history.sort((x, y) => y.at.localeCompare(x.at)); // newest first, deterministic
  return { ...win, history };
}

/**
 * Deep merge for team sync. AHJ meta (name/aliases/deleted) follows the newer
 * `Ahj.updatedAt`; posts merge individually by id (see mergePost), so two
 * designers posting to — or editing on — the same board concurrently never
 * lose text (unlike whole-object merge).
 */
export function mergeAhjs(current: Ahj[], incoming: Ahj[]): Ahj[] {
  const byId = new Map(current.map((a) => [a.id, a]));
  for (const inc of incoming ?? []) {
    if (!inc?.id) continue;
    const ex = byId.get(inc.id);
    if (!ex) {
      byId.set(inc.id, { ...inc, posts: inc.posts ?? [] }); // tolerate malformed imports
      continue;
    }
    const meta = inc.updatedAt > ex.updatedAt ? inc : ex;
    const posts = new Map((ex.posts ?? []).map((p) => [p.id, p]));
    for (const p of inc.posts ?? []) {
      if (!p?.id) continue;
      const pe = posts.get(p.id);
      posts.set(p.id, pe ? mergePost(pe, p) : p);
    }
    byId.set(inc.id, { ...meta, posts: [...posts.values()] });
  }
  return [...byId.values()];
}

// ---- global search ---------------------------------------------------------

export type AhjSearchHit =
  | { kind: 'ahj'; ahj: Ahj; via: string; preview: string }
  | { kind: 'post'; ahj: Ahj; post: AhjPost; pre: string; match: string; after: string };

const flat = (s: string) => s.replace(/\s+/g, ' ');

export function clip(s: string, n: number): string {
  const f = flat(s);
  return f.length > n ? `${f.slice(0, n)}…` : f;
}

/** Search live AHJ names, aliases and post text. Post hits carry a highlight snippet. */
export function searchAhjs(query: string, ahjs: Ahj[]): AhjSearchHit[] {
  const q = normName(query);
  if (q.length < 2) return [];
  const hits: AhjSearchHit[] = [];
  for (const a of ahjs) {
    if (a.deleted) continue;
    const lp = livePosts(a);
    const nameHit = normName(a.name).includes(q);
    const aliasHit = a.aliases.find((al) => normName(al).includes(q));
    if (nameHit || aliasHit) {
      hits.push({
        kind: 'ahj',
        ahj: a,
        via: nameHit ? 'name' : (aliasHit as string),
        preview: lp[0] ? clip(lp[0].text, 150) : '(no posts yet)',
      });
    }
    for (const p of lp) {
      // Search the whitespace-flattened text so multi-word queries match
      // across line breaks; the snippet is flattened anyway.
      const hay = flat(p.text);
      const idx = hay.toLowerCase().indexOf(q);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 60);
      const end = idx + q.length;
      hits.push({
        kind: 'post',
        ahj: a,
        post: p,
        pre: (start > 0 ? '…' : '') + hay.slice(start, idx),
        match: hay.slice(idx, end),
        after: hay.slice(end, end + 110) + (end + 110 < hay.length ? '…' : ''),
      });
    }
  }
  return hits;
}
