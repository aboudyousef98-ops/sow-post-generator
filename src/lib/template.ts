// Canonical post template + clipboard formats — spec/06-output-template.md.

import type { Ahj, NoteKey, PostRecord, Settings } from '../types';
import { livePosts, matchAhj } from './ahj';
import { LEVEL_NAMES } from './classify';
import { isoToUs, weekdayName } from './dates';

/** Ensure terminal punctuation (06 §1 rendering rules). */
function punctuate(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** The text actually used for a note: polished when available+enabled, else raw; default phrase when empty. */
export function effectiveNote(record: PostRecord, key: NoteKey, settings: Settings): string {
  const polished = record.polished?.[key];
  const usePolished = polished !== undefined && record.usePolished[key];
  const text = (usePolished ? polished : record.notes[key]).trim();
  if (text) return punctuate(text);
  if (key === 'layout') return ''; // layout has no default phrase; parser/drivers seed it
  const defaults: Record<Exclude<NoteKey, 'layout'>, string> = settings.defaults
    ? { siteSurvey: settings.defaults.siteSurvey, design: settings.defaults.design, homeowner: settings.defaults.homeowner }
    : { siteSurvey: 'All good.', design: 'All good.', homeowner: 'No feedback.' };
  return punctuate(defaults[key]);
}

/**
 * Region line value: `HOU`, `DFW`, or for OTHER the raw text plus the resolved
 * nearest metro, e.g. `Corpus Christi – Near Houston`.
 */
export function regionLine(record: PostRecord): string {
  if (record.sf.region !== 'OTHER') return record.sf.region;
  const raw = record.sf.installRegionRaw || 'Other';
  const near = record.sf.nearMetro;
  return near ? `${raw} – Near ${near === 'HOU' ? 'Houston' : 'Dallas'}` : raw;
}

/**
 * Required fields (Aboud, 2026-09-26): the copy buttons and "Mark as posted"
 * stay disabled until these are filled. Notes are NOT required — empty note
 * bullets are simply dropped from the post.
 */
export function missingRequired(record: PostRecord): string[] {
  const missing: string[] = [];
  if (!record.sf.customerName.trim()) missing.push('Customer name');
  if (!record.sf.installScheduledDate) missing.push('Install date');
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
  items: { label: string; value: string }[];
  tags: string[];
}

function buildLines(record: PostRecord, settings: Settings): PostLines {
  const iso = record.sf.installScheduledDate;
  const items = [
    { label: 'Installation Date & Day', value: iso ? `${weekdayName(iso)}, ${isoToUs(iso)}.` : '' },
    { label: 'Region', value: punctuate(regionLine(record)) },
    { label: 'Jurisdiction', value: punctuate(record.sf.jurisdiction ?? '') },
    { label: 'Site Address', value: punctuate(record.sf.siteAddress ?? '') },
    { label: 'Project Classification', value: `Level ${record.level} – ${LEVEL_NAMES[record.level]}.` },
    { label: 'Installation Layout', value: effectiveNote(record, 'layout', settings) },
    { label: 'Clearance', value: 'All required clearance requirements have been met.' },
    { label: 'Site Survey Feedback', value: effectiveNote(record, 'siteSurvey', settings) },
    { label: 'Design Feedback', value: effectiveNote(record, 'design', settings) },
    { label: 'Homeowner Feedback', value: effectiveNote(record, 'homeowner', settings) },
  ];
  return {
    intro: [
      'Hello Team,',
      `Kindly find attached the elevation drawing and BOS for ${record.sf.customerName || '—'}.`,
      'Please take the following notes into consideration:',
    ],
    // Empty bullets are removed from the post entirely (Aboud, 2026-09-26).
    items: items.filter((it) => it.value.trim() !== ''),
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
  const lines = [...intro, ...items.map((it) => `• *${it.label}:* ${it.value}`)];
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
    ...items.map((it) => `<li><strong>${esc(it.label)}:</strong> ${esc(it.value)}</li>`),
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
