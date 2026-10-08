// Persistence for the Admin › Daily Progress "Updates" box.
//
// WHY (Aboud, 2026-10-08): the box was a deliberate throwaway — plain
// useState, no storage. But DailyProgressTab unmounts whenever you leave the
// tab, so everything typed vanished on the next tab switch. He reported it as
// a bug, so it now persists.
//
// Stored PER DATE, device-local: the notes belong to one day's report, so
// moving the date picker to another day must not drag yesterday's lines along.
// Never synced — this is one admin's scratch pad, not team data.

const KEY = 'sowpost.dailyUpdates.v1';
/** Keep a month of scratch notes; older days are dropped on write. */
const KEEP_DAYS = 30;

type Store = Record<string, string>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** The text saved for that day, or '' when nothing was ever typed. */
export function loadUpdates(dateIso: string): string {
  return read()[dateIso] ?? '';
}

/**
 * Save (or clear) one day's updates. Blank text removes the entry rather than
 * storing an empty string, so the store does not fill with dead keys.
 */
export function saveUpdates(dateIso: string, text: string): void {
  const store = read();
  if (text.trim() === '') delete store[dateIso];
  else store[dateIso] = text;

  // Newest dates win — ISO strings sort chronologically as text.
  // The day being edited ALWAYS survives: editing a date older than the 30
  // most recent stored days used to prune away the very note just written, so
  // typing on an old date saved nothing at all (found by review, 2026-10-08).
  const kept = Object.keys(store)
    .filter((k) => k !== dateIso)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, KEEP_DAYS - 1);
  const pruned: Store = {};
  for (const k of kept) pruned[k] = store[k];
  if (store[dateIso] !== undefined) pruned[dateIso] = store[dateIso];

  try {
    localStorage.setItem(KEY, JSON.stringify(pruned));
  } catch {
    // Storage full or blocked — the box still works for this session.
  }
}
