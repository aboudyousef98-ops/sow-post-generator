// Canonical post template + clipboard formats — spec/06-output-template.md.

import type { Ahj, PostRecord, Settings } from '../types';
import { livePosts, matchAhj } from './ahj';
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

/** The five title-block cells, in the order they appear in the AutoCAD table. */
export function titleBlockFields(record: PostRecord): { label: string; value: string }[] {
  return [
    { label: 'Project Name', value: record.sf.customerName.trim() },
    { label: 'Property Address', value: (record.sf.siteAddress ?? '').trim() },
    { label: 'Region', value: titleBlockRegion(record) },
    { label: 'AHJ', value: (record.sf.jurisdiction ?? '').trim() },
    { label: 'SOW Coordinator', value: record.author.trim() },
  ];
}

/** All five values, one per line — the clipboard payload for a single column paste. */
export function titleBlockTsv(record: PostRecord): string {
  return titleBlockFields(record)
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

/** Final ordered tag list: fixed → region lead → designer → manual extras, deduped, nulls skipped. */
export function finalTags(record: PostRecord): string[] {
  const all = [...record.tags, ...(record.designerTag ? [record.designerTag] : [])];
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
  /** One entry per bullet. `values` holds one string per sub-bullet; a single value renders inline. */
  items: { label: string; values: string[] }[];
  tags: string[];
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
    { label: 'Installation Notes', values: installNoteLines(record.installNotes, record) },
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
  const m = matchAhj(record.sf.jurisdiction, ahjs);
  if (!m || m.ahj.id !== record.ahjApprovedId) return null;
  const posts = livePosts(m.ahj).map((p) => p.text.trim());
  return posts.length ? { name: m.ahj.name, posts } : null;
}

/** Slack mrkdwn version (also the plain-text clipboard fallback). Bulleted list. */
export function buildPostText(record: PostRecord, settings: Settings, ahjs?: Ahj[]): string {
  const { intro, items, tags } = buildLines(record, settings);
  const lines = [...intro];
  for (const it of items) {
    // One value stays inline; several become indented sub-bullets under the label.
    if (it.values.length === 1) lines.push(`• *${it.label}:* ${it.values[0]}`);
    else lines.push(`• *${it.label}:*`, ...it.values.map((v) => `    ◦ ${v}`));
  }
  const ahj = ahjSection(record, ahjs);
  if (ahj) {
    lines.push(`*AHJ Requirements (${ahj.name}):*`);
    // Multi-line posts keep their line breaks, indented under the bullet.
    lines.push(...ahj.posts.map((t) => `• ${t.split('\n').filter((l) => l.trim()).join('\n   ')}`));
  }
  if (tags.length) lines.push(tags.map((t) => `@${t}`).join(' '));
  return lines.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rich-text clipboard version: <p> lines, <strong> labels, <ul> bullets, tags plain. */
export function buildPostHtml(record: PostRecord, settings: Settings, ahjs?: Ahj[]): string {
  const { intro, items, tags } = buildLines(record, settings);
  const parts = [
    ...intro.map((l) => `<p>${esc(l)}</p>`),
    '<ul>',
    ...items.map((it) =>
      it.values.length === 1
        ? `<li><strong>${esc(it.label)}:</strong> ${esc(it.values[0])}</li>`
        : `<li><strong>${esc(it.label)}:</strong><ul>${it.values
            .map((v) => `<li>${esc(v)}</li>`)
            .join('')}</ul></li>`,
    ),
    '</ul>',
  ];
  const ahj = ahjSection(record, ahjs);
  if (ahj) {
    parts.push(
      `<p><strong>AHJ Requirements (${esc(ahj.name)}):</strong></p>`,
      '<ul>',
      ...ahj.posts.map((t) => `<li>${esc(t).replace(/\n/g, '<br>')}</li>`),
      '</ul>',
    );
  }
  if (tags.length) parts.push(`<p>${esc(tags.map((t) => `@${t}`).join(' '))}</p>`);
  return parts.join('');
}
