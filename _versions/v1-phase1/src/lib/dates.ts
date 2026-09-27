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
