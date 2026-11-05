// Date helpers. Weekday is always computed from date PARTS (never `new Date(string)`)
// to avoid timezone shifts — spec/03 §6.

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** 'M/D/YYYY' (or 'MM/DD/YYYY') → ISO 'YYYY-MM-DD'. Returns null when not a date. */
export function usDateToIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** ISO 'YYYY-MM-DD' → full weekday name (Sun–Sat). */
export function weekdayName(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return WEEKDAYS[d.getUTCDay()];
}

/** ISO 'YYYY-MM-DD' → 'MM/DD/YYYY' (zero-padded). */
export function isoToUs(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/** True when `iso` is strictly before `todayIso` (plain string compare works for ISO). */
export function isPast(iso: string, todayIso: string): boolean {
  return iso < todayIso;
}

/** Today as ISO in the machine's local timezone. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The LOCAL calendar day a UTC timestamp falls on, as 'YYYY-MM-DD'.
 *
 * Activity and updates are stamped with `new Date().toISOString()`, i.e. UTC,
 * so `at.slice(0, 10)` is the UTC day — and "what did I touch yesterday" means
 * yesterday by the asker's own clock. In Texas an 8pm edit is stamped the NEXT
 * day in UTC, so slicing would file it under the wrong date.
 */
export function localDateOf(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `days` before (negative) or after an ISO calendar date, staying local. */
export function shiftIsoDays(iso: string, days: number): string {
  const base = parseIsoLocal(iso);
  if (!base) return iso;
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}

// ---- Board helpers (10-project-board.md §5.4) ------------------------------

/**
 * ISO 'YYYY-MM-DD' → Date at LOCAL midnight. The board's critical date rule:
 * `new Date('2026-09-24')` parses as UTC and reads as 09/23 in Texas, so
 * calendar dates must always be built from parts.
 */
export function parseIsoLocal(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Timestamp (ISO with time, e.g. a row's updated_at) → 'just now' / '5 min ago'
 * / '2 h ago' / '3 d ago', falling back to the local MM/DD/YYYY after a week.
 * `now` is a parameter so tests never depend on the wall clock.
 */
export function relativeTime(isoTimestamp: string, now: number = Date.now()): string {
  const t = Date.parse(isoTimestamp);
  if (Number.isNaN(t)) return '';
  // Small negative ages happen with clock skew between machines — never show
  // a future time for them.
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  if (sec < 7 * 86400) return `${Math.floor(sec / 86400)} d ago`;
  const d = new Date(t); // local calendar date of the timestamp
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}
