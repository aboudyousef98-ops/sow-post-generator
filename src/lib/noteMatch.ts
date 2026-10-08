// Pre-post note check — the deterministic half (_PLAN_note_check.md).
//
// Two jobs, both pure so they can be tested without a DOM or a network:
//   1. eligibleNotes()  — WHICH notes may be surfaced for a project at all.
//   2. keywordMatches() — which of those the post text visibly mentions.
//
// The keyword pass is not a fallback bolted on afterwards: it is the half that
// can never silently miss an exact term, and it is what still runs when the AI
// is unavailable.

import type { Ahj, PostRecord } from '../types';
import { boardsOfKind, livePosts, matchAhj } from './ahj';

/** One note that may apply to a project, with where it came from. */
export interface EligibleNote {
  noteId: string;
  /** Human label for the source board, e.g. "AHJ: Harris County". */
  board: string;
  text: string;
}

/** A surfaced note, with WHY it surfaced so the coordinator can judge it. */
export interface NoteHit extends EligibleNote {
  why: string;
}

const KIND_LABEL = { ahj: 'AHJ', utility: 'Utility', funding: 'Funding' } as const;

/**
 * Every note that could apply to this project — and nothing else.
 *
 * Aboud's explicit choice: the matched AHJ, the matched Utility, the funding
 * boards and all SOW general notes. NOT other jurisdictions' boards — showing
 * a Dallas-only rule on a Harris job is worse than showing nothing.
 */
export function eligibleNotes(record: PostRecord, ahjs: Ahj[] | undefined): EligibleNote[] {
  if (!ahjs?.length) return [];
  const out: EligibleNote[] = [];

  const push = (board: Ahj, label: string) => {
    for (const p of livePosts(board)) {
      const text = p.text.trim();
      if (text) out.push({ noteId: p.id, board: label, text });
    }
  };

  // AHJ + Utility: only the board this project actually matches.
  for (const kind of ['ahj', 'utility'] as const) {
    const key = kind === 'ahj' ? record.sf.jurisdiction : record.sf.utility;
    const m = matchAhj(key, boardsOfKind(ahjs, kind).filter((a) => !a.deleted));
    if (m) push(m.ahj, `${KIND_LABEL[kind]}: ${m.ahj.name}`);
  }

  // Funding applies to every project — no key to match on.
  for (const b of boardsOfKind(ahjs, 'funding').filter((a) => !a.deleted)) {
    push(b, `${KIND_LABEL.funding}: ${b.name}`);
  }

  // SOW general notes always apply.
  for (const b of boardsOfKind(ahjs, 'general').filter((a) => !a.deleted)) {
    push(b, 'SOW Notes');
  }

  return out;
}

/**
 * Words too common to be evidence of anything. A note saying "the install must
 * be on the south wall" must not match every post that contains "install".
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'from', 'by', 'as', 'it', 'its', 'not', 'no', 'all', 'any', 'can', 'will', 'must', 'should',
  'shall', 'may', 'need', 'needs', 'needed', 'use', 'used', 'using', 'please', 'make', 'sure',
  'before', 'after', 'when', 'while', 'about', 'into', 'over', 'under', 'per', 'each', 'every',
  'has', 'have', 'had', 'do', 'does', 'did', 'you', 'your', 'we', 'our', 'they', 'their',
  // Domain words that appear on virtually every post — matching on them is noise.
  'install', 'installation', 'project', 'site', 'system', 'post', 'notes', 'note', 'team',
  'date', 'day', 'days', 'crew', 'work', 'required', 'requirement', 'requirements',
]);

/** Terms worth searching for: ≥4 chars, not a stopword, not a bare number. */
export function keyTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9"'\-\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-'"]+|[-'"]+$/g, ''))
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 4) continue;
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // a bare "24" matches far too much
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/** Whole-word search, so "trench" does not match "trenchless". */
function mentions(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

/**
 * Sentences the post template prints on EVERY post regardless of the project.
 *
 * Matching against these is pure noise: a note mentioning "clearance" fired on
 * every single post, because the template always says "All required clearance
 * requirements have been met." Found by running the real thing locally
 * (2026-10-08) — exactly the false-positive class that makes people stop
 * reading the list.
 *
 * Keep in sync with the constant strings in lib/template.ts.
 */
const BOILERPLATE = [
  'all required clearance requirements have been met',
  'expected power disconnect duration',
  'planning window',
  'project classification',
  'site survey feedback',
  'design feedback',
  'homeowner feedback',
  'installation date & day',
  'kindly find attached the elevation drawing and bos',
  'please take the following notes into consideration',
  'hello team',
];

/**
 * The post with its fixed template wording removed, leaving only what is
 * actually specific to this project.
 *
 * Two passes: the constant sentences above, and the bullet LABELS. The
 * template always renders a label as `*Clearance:*`, so one regex removes them
 * all — and it has to, because stripping the sentence "all required clearance
 * requirements have been met" still left the word "Clearance" in the label.
 */
function projectText(post: string): string {
  let out = post.toLowerCase();
  out = out.replace(/\*[^*\n]{0,40}:\*/g, ' '); // *Label:* bullet headings
  // Sentences generated from the Installation Notes dropdowns. Every job has a
  // wall count, so "Installation on one wall." is template, not something the
  // coordinator wrote — and gpt-4o-mini kept using it to justify unrelated
  // notes on routine posts even when given it as a worked counter-example
  // (draft-deploy testing, 2026-10-08). MPU/FSU/FTP and roof ratings are NOT
  // stripped: those genuinely distinguish one job from another.
  out = out.replace(/installation on (one|two|three|four|five) walls?[^.]*\./g, ' ');
  for (const phrase of BOILERPLATE) out = out.split(phrase).join(' ');
  return out;
}

/** A term long enough that sharing it alone is real evidence. */
const DISTINCTIVE_LEN = 6;

/**
 * Is the model's quoted trigger real, and is it project-specific?
 *
 * We do not trust the model's judgement about relevance — we check its
 * EVIDENCE. The trigger must be a verbatim quote that survives boilerplate
 * stripping, which means it came from something the coordinator actually wrote
 * about this job, not from the template.
 *
 * Why this exists (draft-deploy testing, 2026-10-08): told only in the prompt
 * to skip notes that "fire on every post", gpt-4o-mini still surfaced
 * always-true notes ("install date set, so NTP must exist") on a completely
 * routine post. Those would have appeared on EVERY post forever. Checking the
 * quote is deterministic where the prompt was not.
 */
export function triggerIsGrounded(post: string, trigger: string): boolean {
  const quote = trigger.trim().toLowerCase().replace(/\s+/g, ' ');
  // Too short to be evidence of anything specific.
  if (quote.length < 8) return false;
  const hay = projectText(post).replace(/\s+/g, ' ');
  return hay.includes(quote);
}

/**
 * Notes whose distinctive terms appear in the post.
 *
 * The bar is deliberately high, because a long list is worse than no list —
 * people stop reading it. A note surfaces only when the post shares either
 * ONE distinctive (≥6 char) term, or TWO shorter ones. A single short word
 * like "wall" is not evidence of anything and used to drag notes in.
 *
 * Template boilerplate is stripped first — see BOILERPLATE.
 */
export function keywordMatches(post: string, notes: EligibleNote[]): NoteHit[] {
  const hay = projectText(post);
  const out: NoteHit[] = [];
  for (const n of notes) {
    const hits = keyTerms(n.text).filter((t) => mentions(hay, t));
    const distinctive = hits.filter((t) => t.length >= DISTINCTIVE_LEN);
    if (distinctive.length === 0 && hits.length < 2) continue;
    // Longest first: the most distinctive term is the most convincing reason.
    const best = [...hits].sort((a, b) => b.length - a.length)[0];
    out.push({ ...n, why: `matched “${best}”` });
  }
  return out;
}

/**
 * Merge the keyword and AI passes, deduped by note id.
 *
 * Keyword wins on collision: "matched ‘trench’" is checkable by the reader,
 * where the AI's reason has to be taken on trust.
 */
export function mergeHits(keyword: NoteHit[], ai: NoteHit[]): NoteHit[] {
  const byId = new Map<string, NoteHit>();
  for (const h of ai) byId.set(h.noteId, h);
  for (const h of keyword) byId.set(h.noteId, h);
  // Stable order: as the notes were listed, not as the model returned them.
  return [...byId.values()];
}

/**
 * Identity of a post for staleness. A confirmation covers THIS text only — edit
 * the post afterwards and the next copy must re-check, or the gate is defeated
 * by confirming an empty draft and then writing the real post.
 */
export function postHash(text: string): string {
  let h = 2166136261; // FNV-1a, enough to detect an edit (not a security hash)
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
