// Shared text helpers for the post's note bullets. Extracted from template.ts
// in Phase 7 so installNotes.ts can use the same rules without a circular
// import (template.ts -> installNotes.ts -> noteText.ts).

import type { PolishKey } from '../types';

/** Ensure terminal punctuation (spec/06 §1 rendering rules). */
export function punctuate(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Remove a bullet character the writer typed, so it isn't rendered twice.
 * True bullet glyphs may sit tight against the word; a dash or asterisk must be
 * followed by a space, so "-20 ft" and "*2 AWG" keep their first character.
 */
export function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[•◦·]\s*|[-*–—]\s+)/, '').trim();
}

/**
 * Split a note into bullet lines — the team writes these as bullet points, one
 * per line (Aboud, 2026-09-28). One source line = one bullet, same order.
 */
export function noteLines(text: string): string[] {
  return text
    .split('\n')
    .map(stripBullet)
    .filter(Boolean)
    // A line with no letter and no digit says nothing — a stray "-" or "..."
    // would otherwise reach Slack as a bullet reading "-.". The labelled
    // install boxes already drop these via clause(); this keeps both paths
    // in agreement.
    .filter((l) => /[\p{L}\p{N}]/u.test(l))
    .map(punctuate);
}

/** The `polished` + `usePolished` pair. `PostRecord` satisfies this structurally. */
export interface PolishState {
  polished?: Partial<Record<PolishKey, string>>;
  usePolished: Partial<Record<PolishKey, boolean>>;
}

/**
 * The text a box actually contributes to the post: the polished version when
 * one exists and the user has not reverted it, else the raw draft.
 * An ABSENT `usePolished` key means ON — only an explicit `false` reverts.
 */
export function effectiveText(raw: string, key: PolishKey, p: PolishState): string {
  const polished = p.polished?.[key];
  return polished !== undefined && p.usePolished[key] !== false ? polished : raw;
}
