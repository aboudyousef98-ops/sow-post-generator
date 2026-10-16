// Board search matching.
//
// Two bugs from Aboud's 2026-10-17 list, both hit by the same query:
//   #9 "when I search by yarobs name nothing appears"
// The box only ever matched `project.name`, so a COORDINATOR's name matched
// nothing — and the roster spells him "Ya'rob Alnabelsi", so even once the
// field is searched, typing "yarob" misses on the apostrophe.
//
// So: search name + coordinator, and fold the punctuation people don't type.

/**
 * Lowercase, strip accents, drop the apostrophes and hyphens that separate
 * name particles, collapse whitespace. "Ya'rob Alnabelsi" -> "yarob alnabelsi".
 */
export function foldName(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents
    .replace(/['’ʼʻ`´-]/g, '') // ' ’ ʼ ʻ ` ´ -
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The fields a board row is searchable by. */
export interface Searchable {
  name: string;
  coordinator: string;
}

/**
 * Does this row match the typed needle? Every whitespace-separated term must
 * appear somewhere in the row, so "yarob glenda" narrows instead of widening —
 * and term order doesn't matter, which is what people expect of a search box.
 */
export function matchesSearch(row: Searchable, needle: string): boolean {
  const terms = foldName(needle).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const hay = `${foldName(row.name)} ${foldName(row.coordinator)}`;
  return terms.every((t) => hay.includes(t));
}
