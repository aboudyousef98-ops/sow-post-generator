// Dropped-token guard after AI polishing — spec/05 §B "Client guard".
// Deterministic: extract numbers+units and known engineering tokens from the
// raw draft; any token missing from the polished text is flagged in red.

const NUMBER_UNIT_RE = /\d+(?:\.\d+)?\s*(?:A|kW|ft|in|"|AWG)\b|\d+(?:\.\d+)?"/gi;
const KNOWN_TOKEN_RE = /\b(?:EMT|PVC|Cu|AL|MPU|FSU|FTP|SER|THHN|THWN)\b/g;

export function extractGuardTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const m of text.matchAll(NUMBER_UNIT_RE)) tokens.add(m[0].replace(/\s+/g, ' ').trim());
  for (const m of text.matchAll(KNOWN_TOKEN_RE)) tokens.add(m[0]);
  return [...tokens];
}

/** Normalize a token for comparison: strip spaces, lowercase. */
function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * Tokens present in `raw` but missing from `polished`. A number-unit token
 * counts as present when its normalized form appears anywhere in the polished
 * text (so `2" PVC` matches `2″ PVC` variants are NOT attempted — exact
 * characters only, by design: better a false alarm than a silent drop).
 */
export function droppedTokens(raw: string, polished: string): string[] {
  if (!raw.trim() || !polished.trim()) return [];
  const target = norm(polished);
  return extractGuardTokens(raw).filter((t) => !target.includes(norm(t)));
}

/** Non-empty lines = bullets. Mirrors noteLines() in template.ts. */
function countBullets(text: string): number {
  return text.split('\n').filter((l) => l.trim()).length;
}

/**
 * Bullet-count guard (Aboud, 2026-09-28): the complaint was the AI collapsing a
 * bulleted note into one paragraph. The prompt forbids it, but the model can
 * still disobey — so compare the counts and let the UI warn instead of letting
 * the merge reach Slack unnoticed. Null = counts match (or nothing to compare).
 */
export function bulletCountChange(raw: string, polished: string): { from: number; to: number } | null {
  if (!raw.trim() || !polished.trim()) return null;
  const from = countBullets(raw);
  const to = countBullets(polished);
  return from === to ? null : { from, to };
}
