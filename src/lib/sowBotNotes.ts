// SOW Bot card (Aboud 2026-11-26) — parses the automated "*SOW Bot notes*"
// update into its named fields so the Updates panel can pin a structured
// summary instead of a wall of Slack text.
//
// The bullet shape is NOT invented here: it is the exact convention every
// other post builder in this app already emits (see renderItemsText in
// template.ts) — `• *Label:* value` for a one-line field, `• *Label:*` then
// indented `    ◦ value` lines for a multi-line one. SOW Bot has not posted a
// live note yet (no API token exists in production as of this writing — see
// the bot-API checkpoint), so this is built against that established
// convention rather than a real sample. If SOW Bot's actual wording differs,
// `parseSowBotNotes` degrading to `null` (→ raw-text fallback, rule 6) is the
// signal to revisit the regexes below, not a bug.

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
  /** Raw Slack-marked-up value (RichText renders it) — '' when not posted. */
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

export function isSowBotNote(text: string): boolean {
  return text.trim().startsWith(SOW_BOT_NOTES_HEADER);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Values that mean "nothing to report" for every field except Blockers. */
const BLANK_RE = /^(|-|—|n\/a|none|tbd|unknown)$/i;

const BLOCKED_RE = /\b(block(ed|er)?s?|fail(ed|s)?|reject(ed)?|on hold|delay(ed)?|stuck|issue|problem|denied)\b/i;
const PENDING_RE = /\b(pending|waiting|in[- ]progress|working on it|scheduled|in review|to[- ]?do|awaiting|not yet)\b/i;
const OK_RE = /\b(done|complete(d)?|approved|passed|verified|confirmed|resolved|ready|clear|on track)\b/i;

/**
 * Keyword classification, applied uniformly to every field except Blockers
 * (rule 3 is its own binary: empty/"None" is the good state, anything else is
 * red — a value there is never "pending" or merely "unknown"). For the other
 * seven fields, a value present with no red/amber signal reads as green: the
 * field is answered and nothing in it is a concern (an install date, an AHJ
 * name, a "passed" — all facts, not problems). Only a genuinely missing value
 * is grey. This is a judgment call, not a spec'd rule — tune the regexes
 * above as real SOW Bot wording arrives.
 */
function classifyField(key: FieldKey, value: string, present: boolean): FieldState {
  const v = value.trim();
  if (key === 'blockers') return !present || BLANK_RE.test(v) ? 'ok' : 'blocked';
  if (!present || BLANK_RE.test(v)) return 'unknown';
  if (BLOCKED_RE.test(v)) return 'blocked';
  if (PENDING_RE.test(v)) return 'pending';
  if (OK_RE.test(v)) return 'ok';
  return 'ok';
}

/**
 * Parse one update body into its 8 known fields. Returns `null` when the text
 * does not start with the SOW Bot header, or starts with it but carries none
 * of the known bullets at all — both cases mean "don't trust this shape,"
 * which is the signal for the raw-text fallback (rule 6). A body that is
 * missing SOME fields but has at least one recognizable bullet still parses:
 * the missing ones just render as the grey "unknown" chip.
 */
export function parseSowBotNotes(text: string): SowBotNotes | null {
  if (!isSowBotNote(text)) return null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const fields: BotField[] = [];
  let recognized = 0;

  for (const def of FIELD_DEFS) {
    const lineRe = new RegExp(`^\\s*•\\s*\\*${escapeRegExp(def.label)}:\\*\\s*(.*)$`);
    const subRe = /^\s*◦\s*(.*)$/;
    let value = '';
    let present = false;

    for (let i = 0; i < lines.length; i++) {
      const m = lineRe.exec(lines[i]);
      if (!m) continue;
      present = true;
      const inline = m[1].trim();
      if (inline) {
        value = inline;
      } else {
        const sub: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const sm = subRe.exec(lines[j]);
          if (!sm) break;
          sub.push(sm[1].trim());
        }
        value = sub.join('\n');
      }
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
 * Pick the note the pinned card shows: newest first, live rows only. `by` is
 * compared case-sensitively against the bot's own fixed username — a human
 * typing "*SOW Bot notes*" by hand does not hijack the card (and never has a
 * matching `by`, since that is stamped from the session, not typed).
 */
export function selectSowBotNote(updates: ProjectUpdate[], projectId: string): SowBotNoteHit | null {
  const notes = updates
    .filter((u) => u.projectId === projectId && !u.deleted && u.by === SOW_BOT_USERNAME && isSowBotNote(u.text))
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
