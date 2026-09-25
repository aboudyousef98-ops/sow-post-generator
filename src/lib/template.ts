// Canonical post template + clipboard formats — spec/06-output-template.md.

import type { NoteKey, PostRecord, Settings } from '../types';
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

/** Region line value: `HOU – Pasadena`, `DFW`, or the raw region text for OTHER. */
export function regionLine(record: PostRecord): string {
  const base =
    record.sf.region === 'OTHER' ? record.sf.installRegionRaw || 'Other' : record.sf.region;
  const jur = record.sf.jurisdiction?.trim();
  return jur ? `${base} – ${jur}` : base;
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
  const dateLine = iso ? `${weekdayName(iso)}, ${isoToUs(iso)}.` : '—';
  return {
    intro: [
      'Hello Team,',
      `Kindly find attached the elevation drawing and BOS for ${record.sf.customerName || '—'}.`,
      'Please take the following notes into consideration:',
    ],
    items: [
      { label: 'Installation Date & Day', value: dateLine },
      { label: 'Region', value: punctuate(regionLine(record)) },
      { label: 'Project Classification', value: `Level ${record.level} – ${LEVEL_NAMES[record.level]}.` },
      { label: 'Installation Layout', value: effectiveNote(record, 'layout', settings) },
      { label: 'Clearance', value: 'All required clearance requirements have been met.' },
      { label: 'Site Survey Feedback', value: effectiveNote(record, 'siteSurvey', settings) },
      { label: 'Design Feedback', value: effectiveNote(record, 'design', settings) },
      { label: 'Homeowner Feedback', value: effectiveNote(record, 'homeowner', settings) },
    ],
    tags: finalTags(record),
  };
}

/** Slack mrkdwn version (also the plain-text clipboard fallback). */
export function buildPostText(record: PostRecord, settings: Settings): string {
  const { intro, items, tags } = buildLines(record, settings);
  const lines = [
    ...intro,
    ...items.map((it, i) => `${i + 1}. *${it.label}:* ${it.value}`),
  ];
  if (tags.length) lines.push(tags.map((t) => `@${t}`).join(' '));
  return lines.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rich-text clipboard version: <p> lines, <strong> labels, <ol> items, tags plain. */
export function buildPostHtml(record: PostRecord, settings: Settings): string {
  const { intro, items, tags } = buildLines(record, settings);
  const parts = [
    ...intro.map((l) => `<p>${esc(l)}</p>`),
    '<ol>',
    ...items.map((it) => `<li><strong>${esc(it.label)}:</strong> ${esc(it.value)}</li>`),
    '</ol>',
  ];
  if (tags.length) parts.push(`<p>${esc(tags.map((t) => `@${t}`).join(' '))}</p>`);
  return parts.join('');
}
