// SOW Bot card (Aboud 2026-11-26) — parses the automated "*SOW Bot notes*"
// update into its named fields so the Updates panel can pin a structured
// summary instead of a wall of Slack text.
//
// Rewritten 2026-11-26 (same day) against SOW Bot's REAL live posts — the
// first version was modeled on this app's own renderItemsText convention
// (`*Label:*` with indented `◦` sub-bullets) since no real sample existed
// yet. The bot's actual output, read from production, is close but not
// that: colon OUTSIDE the bold (`*Label*: value`, not `*Label:* value`), no
// `◦` sub-bullets at all — a field is one line, optionally followed by one
// or more BARE `https://...` lines (no bullet) carrying its supporting
// Slack links. "Not found" / "Not posted yet" / "Not set" is the bot's own
// "no data" phrasing, not blank. And the card never rendered at all in
// production for a different reason: `by` is stamped as the token's
// DISPLAY NAME ("SOW Bot - Aboud"), never the raw username — the original
// selectSowBotNote compared against the username and so never matched a
// single real post.

import type { ProjectUpdate } from '../board/types';

export const SOW_BOT_USERNAME = 'sow_bot';
export const SOW_BOT_NOTES_HEADER = '*SOW Bot notes*';

export type FieldKey =
  | 'status'
  | 'installDate'
  | 'blockers'
  | 'surveySvt'
  | 'preDesignAnalysis'
  | 'solriteVerification'
  | 'ahjUtility'
  | 'latestSlackActivity';

export type FieldState = 'ok' | 'pending' | 'blocked' | 'unknown';

export interface BotField {
  key: FieldKey;
  label: string;
  /** Raw Slack-marked-up value, trailing links appended on their own lines
   *  (RichText auto-links a bare URL) — '' when not posted. */
  value: string;
  present: boolean;
  state: FieldState;
}

export interface SowBotNotes {
  fields: BotField[];
}

/** Order drives both the status strip and the field list below it. */
const FIELD_DEFS: { key: FieldKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'installDate', label: 'Install date' },
  { key: 'blockers', label: 'Blockers' },
  { key: 'surveySvt', label: 'Survey / SVT' },
  { key: 'preDesignAnalysis', label: 'Pre-Design Analysis' },
  { key: 'solriteVerification', label: 'Solrite verification' },
  { key: 'ahjUtility', label: 'AHJ / utility' },
  { key: 'latestSlackActivity', label: 'Latest Slack activity' },
];

/** Does a bot post sometimes carry an extra ad-hoc bullet beyond these 8
 *  (seen live: "Design / install notes", "Layout decision")? Yes — those
 *  are deliberately NOT captured here (no slot for them in the card's fixed
 *  8-field design); their text still shows normally in the raw thread post
 *  below the card, so nothing is lost, only left out of the summary. */

export function isSowBotNote(text: string): boolean {
  return text.trim().startsWith(SOW_BOT_NOTES_HEADER);
}

/** The bot's own identity, by DISPLAY NAME — `by` is always stamped from
 *  `who.displayName` server-side (bot.mts), never the raw username. Matched
 *  by prefix, not exact, so a future rename ("SOW Bot - Khaled") still
 *  works without a code change. */
export function isSowBotAuthor(by: string): boolean {
  const n = by.trim().toLowerCase();
  return n === SOW_BOT_USERNAME || n.startsWith('sow bot');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BARE_URL_RE = /^https?:\/\/\S+$/;

/** Exact-match "no data" tokens, for fields other than Blockers. */
const BLANK_RE = /^(|-|—|n\/a|tbd|unknown)$/i;

const BLOCKED_RE = /\b(block(ed|er)?s?|fail(ed|s)?|reject(ed)?|on hold|delay(ed)?|stuck|issue|problem|denied)\b/i;
const PENDING_RE = /\b(pending|waiting|in[- ]progress|working on it|scheduled|in review|to[- ]?do|awaiting|not yet)\b/i;
const OK_RE = /\b(done|complete(d)?|approved|passed|verified|confirmed|resolved|ready|clear|on track)\b/i;

/**
 * Keyword classification, applied uniformly to every field except Blockers
 * (its own binary rule, see below). A leading "Not …" — SOW Bot's own
 * consistent phrasing for "no data" ("Not found", "Not posted yet", "Not
 * set", "Not confirmed in Slack") — reads as the grey unknown chip, checked
 * before any keyword match so it cannot also catch, e.g., "not yet" as
 * pending. Otherwise a value present with no red/amber signal reads as
 * green: the field is answered and nothing in it is a concern (an install
 * date, an AHJ name, a "passed" — facts, not problems). Only a genuinely
 * missing value is grey. Judgment call, not a spec'd rule — tune these as
 * SOW Bot's wording drifts.
 */
function classifyField(key: FieldKey, value: string, present: boolean): FieldState {
  const v = value.trim();
  if (key === 'blockers') {
    const clear = v === '' || BLANK_RE.test(v) || /^(none\b|not found\b|no blockers\b|no issues\b)/i.test(v);
    return !present || clear ? 'ok' : 'blocked';
  }
  if (!present || v === '' || BLANK_RE.test(v) || /^not\s/i.test(v)) return 'unknown';
  if (BLOCKED_RE.test(v)) return 'blocked';
  if (PENDING_RE.test(v)) return 'pending';
  if (OK_RE.test(v)) return 'ok';
  return 'ok';
}

/**
 * Parse one update body into its 8 known fields. Returns `null` when the
 * text does not start with the SOW Bot header, or starts with it but
 * carries none of the known bullets at all — both mean "don't trust this
 * shape," the signal for the raw-text fallback (rule 6). A body missing
 * SOME fields but with at least one recognizable bullet still parses: the
 * missing ones just render as the grey "unknown" chip.
 */
export function parseSowBotNotes(text: string): SowBotNotes | null {
  if (!isSowBotNote(text)) return null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const fields: BotField[] = [];
  let recognized = 0;

  for (const def of FIELD_DEFS) {
    // Colon OUTSIDE the bold — `*Label*: value`, confirmed against SOW
    // Bot's real posts, not `*Label:* value`.
    const lineRe = new RegExp(`^\\s*•\\s*\\*${escapeRegExp(def.label)}\\*:\\s*(.*)$`);
    let value = '';
    let present = false;

    for (let i = 0; i < lines.length; i++) {
      const m = lineRe.exec(lines[i]);
      if (!m) continue;
      present = true;
      const parts = [m[1].trim()];
      // 0+ bare link lines immediately follow a field — SOW Bot's own
      // supporting-evidence links, not a separate field.
      for (let j = i + 1; j < lines.length && BARE_URL_RE.test(lines[j].trim()); j++) {
        parts.push(lines[j].trim());
      }
      value = parts.join('\n');
      break;
    }

    if (present) recognized++;
    fields.push({ key: def.key, label: def.label, value, present, state: classifyField(def.key, value, present) });
  }

  if (recognized === 0) return null;
  return { fields };
}

export interface SowBotNoteHit {
  update: ProjectUpdate;
  /** More than one live sow_bot note exists for this project (rule 5). */
  duplicate: boolean;
}

/**
 * Pick the note the pinned card shows: newest first, live rows only.
 */
export function selectSowBotNote(updates: ProjectUpdate[], projectId: string): SowBotNoteHit | null {
  const notes = updates
    .filter((u) => u.projectId === projectId && !u.deleted && isSowBotAuthor(u.by) && isSowBotNote(u.text))
    .sort((a, b) => b.at.localeCompare(a.at));
  if (!notes.length) return null;
  return { update: notes[0], duplicate: notes.length > 1 };
}

/**
 * "Nov 26, 2026, 6:42 PM" in Asia/Amman — SOW Bot's home base, regardless of
 * the reader's own machine. Jordan has run a fixed UTC+3 with no DST since
 * 2022; using the IANA zone (not a hardcoded +3) means this stays correct if
 * that ever changes again, with no code edit here.
 */
export function formatAmmanTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Amman',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}
