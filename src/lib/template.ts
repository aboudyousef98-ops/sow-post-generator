// Canonical post template + clipboard formats — spec/06-output-template.md.

import type { BoardProject } from '../board/types';
import type { Ahj, PostRecord, PostValue, Settings } from '../types';
import { boardsOfKind, livePosts, matchAhj } from './ahj';
import { LEVEL_INFO, LEVEL_NAMES } from './classify';
import { isoToUs, weekdayName } from './dates';
import { conduitRunLines, installNoteLines } from './installNotes';
import { effectiveText, noteLines, punctuate } from './noteText';

/** A feedback note's bullet lines: polished when available+enabled, else raw; the default phrase when empty. */
export function effectiveNoteLines(
  record: PostRecord,
  key: 'siteSurvey' | 'design' | 'homeowner',
  settings: Settings,
): string[] {
  const lines = noteLines(effectiveText(record.notes[key], key, record));
  if (lines.length) return lines;
  const defaults = settings.defaults ?? {
    siteSurvey: 'All good.',
    design: 'All good.',
    homeowner: 'No feedback.',
  };
  return [punctuate(defaults[key])];
}

/** Metro code the site belongs to: the region itself, or the resolved nearest metro for OTHER. */
function metroCode(record: PostRecord): 'HOU' | 'DFW' | undefined {
  return record.sf.region === 'OTHER' ? record.sf.nearMetro : record.sf.region;
}

/**
 * Region line value (Aboud, 2026-09-28): the Salesforce region text with the
 * metro tag beside it on EVERY project — `Houston / Beaumont – Near HOU`,
 * `Corpus Christi – Near HOU`. Falls back to the bare code when the project was
 * entered by hand with no Salesforce paste (so it never reads `HOU – Near HOU`),
 * and drops the suffix while an OTHER region has no metro resolved yet.
 */
export function regionLine(record: PostRecord): string {
  const code = metroCode(record);
  const sfText = (record.sf.installRegionRaw ?? '').trim() || code || 'Other';
  if (!code || sfText === code) return sfText;
  return `${sfText} – Near ${code}`;
}

// ---- AutoCAD title block (Aboud, 2026-09-28) -------------------------------
// The title block table is pre-printed with the five labels, so only the values
// are copied. Region here is the Salesforce text ALONE — the "– Near HOU" tag
// is for the crew reading Slack, not for the drawing.

export function titleBlockRegion(record: PostRecord): string {
  return (record.sf.installRegionRaw ?? '').trim() || metroCode(record) || record.sf.region;
}

/**
 * SOW Coordinator cell (Aboud, 2026-10-21): the board's assignment, not whoever
 * typed the draft. Only the LINKED row counts (record.projectId — matching by
 * customer name could grab the wrong project). Falls back to the author when
 * the record is unlinked, the row was deleted, or the row is unassigned — an
 * empty cell in a drawing is worse than the author's name.
 */
export function titleBlockCoordinator(record: PostRecord, boardProjects?: BoardProject[]): string {
  const linked = record.projectId
    ? boardProjects?.find((p) => p.id === record.projectId && !p.deletedAt)
    : undefined;
  return linked?.coordinator.trim() || record.author.trim();
}

/** The five title-block cells, in the order they appear in the AutoCAD table. */
export function titleBlockFields(
  record: PostRecord,
  boardProjects?: BoardProject[],
): { label: string; value: string }[] {
  return [
    { label: 'Project Name', value: record.sf.customerName.trim() },
    { label: 'Property Address', value: (record.sf.siteAddress ?? '').trim() },
    { label: 'Region', value: titleBlockRegion(record) },
    { label: 'AHJ', value: (record.sf.jurisdiction ?? '').trim() },
    { label: 'SOW Coordinator', value: titleBlockCoordinator(record, boardProjects) },
  ];
}

/** All five values, one per line — the clipboard payload for a single column paste. */
export function titleBlockTsv(record: PostRecord, boardProjects?: BoardProject[]): string {
  return titleBlockFields(record, boardProjects)
    .map((f) => f.value)
    .join('\n');
}

/**
 * Required fields (Aboud, 2026-09-26; install date dropped 2026-09-30 per
 * spec/10 §1 — projects are now designed before a date is scheduled). The copy
 * buttons and "Mark as posted" stay disabled until these are filled. Notes are
 * NOT required — empty note bullets are simply dropped from the post.
 */
export function missingRequired(record: PostRecord): string[] {
  const missing: string[] = [];
  if (!record.sf.customerName.trim()) missing.push('Customer name');
  if (record.sf.region === 'OTHER' && !record.sf.installRegionRaw?.trim()) missing.push('Region text');
  if (!record.sf.jurisdiction?.trim()) missing.push('Jurisdiction');
  if (!record.sf.siteAddress?.trim()) missing.push('Site address');
  return missing;
}

/** Final ordered tag list: fixed → region lead → designer → CLR agent → PM → manual extras, deduped, nulls skipped. */
export function finalTags(record: PostRecord): string[] {
  const all = [
    ...record.tags,
    ...(record.designerTag ? [record.designerTag] : []),
    ...(record.clrAgentTag ? [record.clrAgentTag] : []),
    ...(record.pmTag ? [record.pmTag] : []),
  ];
  const seen = new Set<string>();
  return all.filter((t) => {
    const k = t.trim();
    if (!k || seen.has(k.toLowerCase())) return false;
    seen.add(k.toLowerCase());
    return true;
  });
}

interface PostLines {
  intro: string[];
  /** One entry per bullet. `values` holds one entry per sub-bullet; a single value renders inline. */
  items: { label: string; values: PostValue[] }[];
  tags: string[];
}

/**
 * A value as plain text. Slack mrkdwn has no underline, so the label that the
 * rich clipboard underlines is simply written out here.
 */
function valueText(v: PostValue): string {
  if (typeof v === 'string') return v;
  return v.label ? (v.text ? `${v.label}: ${v.text}` : `${v.label}:`) : v.text;
}

/** The same value for the rich clipboard, where the label IS underlined. */
function valueHtml(v: PostValue): string {
  if (typeof v === 'string') return esc(v);
  if (!v.label) return esc(v.text);
  return `<u>${esc(v.label)}:</u>${v.text ? ` ${esc(v.text)}` : ''}`;
}

function valueSub(v: PostValue): string[] {
  return typeof v === 'string' ? [] : v.sub;
}

/** A fixed one-line value: dropped from the post when blank. */
function one(value: string): string[] {
  const t = punctuate(value);
  return t ? [t] : [];
}

function buildLines(record: PostRecord, settings: Settings): PostLines {
  const iso = record.sf.installScheduledDate;
  const items = [
    { label: 'Installation Date & Day', values: iso ? [`${weekdayName(iso)}, ${isoToUs(iso)}.`] : [] },
    { label: 'Region', values: one(regionLine(record)) },
    { label: 'Jurisdiction', values: one(record.sf.jurisdiction ?? '') },
    { label: 'Site Address', values: one(record.sf.siteAddress ?? '') },
    {
      label: 'Project Classification',
      values: [
        `Level ${record.level} – ${LEVEL_NAMES[record.level]}.`,
        `Planning window: ${LEVEL_INFO[record.level].window}.`,
      ],
    },
    { label: 'Installation Notes', values: installNoteLines(record.installNotes, record, record.sf.utility) },
    { label: 'Conduit Raceway', values: conduitRunLines(record.installNotes, record) },
    { label: 'Clearance', values: ['All required clearance requirements have been met.'] },
    { label: 'Site Survey Feedback', values: effectiveNoteLines(record, 'siteSurvey', settings) },
    { label: 'Design Feedback', values: effectiveNoteLines(record, 'design', settings) },
    { label: 'Homeowner Feedback', values: effectiveNoteLines(record, 'homeowner', settings) },
  ];
  return {
    intro: [
      'Hello Team,',
      `Kindly find attached the elevation drawing and BOS for ${record.sf.customerName || '—'}.`,
      'Please take the following notes into consideration:',
    ],
    // Empty bullets are removed from the post entirely (Aboud, 2026-09-26).
    items: items.filter((it) => it.values.length > 0),
    tags: finalTags(record),
  };
}

/**
 * AHJ requirements section (Phase 5) — only when the designer approved THIS
 * AHJ ("Include AHJ requirements in the post") AND the Jurisdiction still
 * matches it AND it has live posts. Returns null otherwise.
 */
export function ahjSection(record: PostRecord, ahjs: Ahj[] | undefined): { name: string; posts: string[] } | null {
  if (!record.ahjApprovedId || !ahjs?.length) return null;
  const m = matchAhj(record.sf.jurisdiction, boardsOfKind(ahjs, 'ahj'));
  if (!m || m.ahj.id !== record.ahjApprovedId) return null;
  const posts = livePosts(m.ahj).map((p) => p.text.trim());
  return posts.length ? { name: m.ahj.name, posts } : null;
}

/**
 * The board of each postable kind that currently applies to this record, or
 * null. Matching is per kind — AHJ on Jurisdiction, Utility on sf.utility,
 * Funding globally (first live funding board).
 * `general` is absent on purpose: SOW notes never reach a post.
 */
export function matchedBoard(record: PostRecord, ahjs: Ahj[] | undefined, kind: PostableKind): Ahj | null {
  if (!ahjs?.length) return null;
  const pool = boardsOfKind(ahjs, kind).filter((a) => !a.deleted);
  if (kind === 'funding') return pool[0] ?? null; // global — no key to match on
  const key = kind === 'ahj' ? record.sf.jurisdiction : record.sf.utility;
  return matchAhj(key, pool)?.ahj ?? null;
}

export type PostableKind = 'ahj' | 'utility' | 'funding';

/** Which record field holds the approval for each postable kind. */
export const APPROVAL_FIELD: Record<PostableKind, 'ahjApprovedId' | 'utilityApprovedId' | 'fundingApprovedId'> = {
  ahj: 'ahjApprovedId',
  utility: 'utilityApprovedId',
  funding: 'fundingApprovedId',
};

const SECTION_TITLE: Record<PostableKind, (name: string) => string> = {
  ahj: (n) => `AHJ Requirements (${n})`,
  utility: (n) => `Utility Requirements (${n})`,
  funding: (n) => `Funding Requirements (${n})`,
};

/**
 * Every approved requirement section, always in the order AHJ → Utility →
 * Funding. A section appears only when its board is still the approved one AND
 * it has live posts, so switching Jurisdiction or Utility silently drops it —
 * the same self-un-approving contract AHJ has always had.
 */
export function requirementSections(
  record: PostRecord,
  ahjs: Ahj[] | undefined,
): { title: string; posts: string[] }[] {
  const out: { title: string; posts: string[] }[] = [];
  for (const kind of ['ahj', 'utility', 'funding'] as PostableKind[]) {
    const approvedId = record[APPROVAL_FIELD[kind]];
    if (!approvedId) continue;
    const board = matchedBoard(record, ahjs, kind);
    if (!board || board.id !== approvedId) continue;
    const posts = livePosts(board).map((p) => p.text.trim()).filter(Boolean);
    if (posts.length) out.push({ title: SECTION_TITLE[kind](board.name), posts });
  }
  return out;
}

/** Slack mrkdwn version (also the plain-text clipboard fallback). Bulleted list. */
export function buildPostText(record: PostRecord, settings: Settings, ahjs?: Ahj[]): string {
  // Typed by hand in the preview: it replaces the generated post outright.
  if (record.manualText?.trim()) return record.manualText;

  const { intro, items, tags } = buildLines(record, settings);
  const lines = [...intro];
  for (const it of items) {
    // One value stays inline; several become indented sub-bullets under the
    // label, and a value with its own points gets a third level beneath it.
    if (it.values.length === 1 && !valueSub(it.values[0]).length) {
      lines.push(`• *${it.label}:* ${valueText(it.values[0])}`);
    } else {
      lines.push(`• *${it.label}:*`);
      for (const v of it.values) {
        lines.push(`    ◦ ${valueText(v)}`);
        lines.push(...valueSub(v).map((sv) => `        ▪ ${sv}`));
      }
    }
  }
  for (const sec of requirementSections(record, ahjs)) {
    lines.push(`*${sec.title}:*`);
    // Multi-line posts keep their line breaks, indented under the bullet.
    lines.push(...sec.posts.map((t) => `• ${t.split('\n').filter((l) => l.trim()).join('\n   ')}`));
  }
  if (tags.length) lines.push(tags.map((t) => `@${t}`).join(' '));
  return lines.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rich-text clipboard version: <p> lines, <strong> labels, <ul> bullets, tags plain. */
/**
 * Turn the plain-text post back into the rich clipboard form.
 *
 * Only used for a manually edited post: the generated one is built from
 * structure, but a hand-typed one is just text, and pasting it into Slack
 * without the bold labels and nesting would be a downgrade. Reads the same
 * glyphs buildPostText writes — • for a bullet, ◦ for a sub-bullet, ▪ for a
 * point under that — and `*Label:*` for the bold label.
 */
export function textToHtml(text: string): string {
  const out: string[] = [];
  // One entry per open <ul>. `nested` records whether that list was opened
  // INSIDE the <li> above it, because that list has to close with `</ul></li>`
  // while a top-level one closes with just `</ul>`.
  const open: { nested: boolean }[] = [];

  const closeOne = () => {
    const lvl = open.pop();
    out.push(lvl?.nested ? '</ul></li>' : '</ul>');
  };
  const closeTo = (n: number) => {
    while (open.length > n) closeOne();
  };
  const openTo = (n: number) => {
    while (open.length < n) {
      // Re-open the previous item so the new list sits inside it.
      const last = out[out.length - 1];
      const nested = open.length >= 1 && !!last && last.endsWith('</li>');
      if (nested) out[out.length - 1] = last.slice(0, -'</li>'.length);
      out.push('<ul>');
      open.push({ nested });
    }
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const level = line.startsWith('▪') ? 3 : line.startsWith('◦') ? 2 : line.startsWith('•') ? 1 : 0;
    if (level === 0) {
      closeTo(0);
      out.push(`<p>${esc(line)}</p>`);
      continue;
    }
    if (level < open.length) closeTo(level);
    openTo(level);
    const body = line.slice(1).trim();
    const bold = body.match(/^\*(.+?):\*\s*(.*)$/);
    out.push(
      bold
        ? `<li><strong>${esc(bold[1])}:</strong>${bold[2] ? ` ${esc(bold[2])}` : ''}</li>`
        : `<li>${esc(body)}</li>`,
    );
  }
  closeTo(0);
  return out.join('');
}

export function buildPostHtml(record: PostRecord, settings: Settings, ahjs?: Ahj[]): string {
  if (record.manualText?.trim()) return textToHtml(record.manualText);

  const { intro, items, tags } = buildLines(record, settings);
  const li = (v: PostValue) =>
    valueSub(v).length
      ? `<li>${valueHtml(v)}<ul>${valueSub(v)
          .map((sv) => `<li>${esc(sv)}</li>`)
          .join('')}</ul></li>`
      : `<li>${valueHtml(v)}</li>`;
  const parts = [
    ...intro.map((l) => `<p>${esc(l)}</p>`),
    '<ul>',
    ...items.map((it) =>
      it.values.length === 1 && !valueSub(it.values[0]).length
        ? `<li><strong>${esc(it.label)}:</strong> ${valueHtml(it.values[0])}</li>`
        : `<li><strong>${esc(it.label)}:</strong><ul>${it.values.map(li).join('')}</ul></li>`,
    ),
    '</ul>',
  ];
  for (const sec of requirementSections(record, ahjs)) {
    parts.push(
      `<p><strong>${esc(sec.title)}:</strong></p>`,
      '<ul>',
      ...sec.posts.map((t) => `<li>${esc(t).replace(/\n/g, '<br>')}</li>`),
      '</ul>',
    );
  }
  if (tags.length) parts.push(`<p>${esc(tags.map((t) => `@${t}`).join(' '))}</p>`);
  return parts.join('');
}
