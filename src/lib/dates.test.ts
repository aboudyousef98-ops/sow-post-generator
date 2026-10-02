// Unit tests for lib/dates — including the board's critical date rule
// (10-project-board.md §5.4): calendar dates are parsed/formatted as LOCAL
// parts only, never via `new Date('YYYY-MM-DD')` (UTC shift → T8 regression).

import { describe, expect, it } from 'vitest';
import {
  isPast,
  isoToUs,
  parseIsoLocal,
  relativeTime,
  todayIso,
  usDateToIso,
  weekdayName,
} from './dates';

describe('usDateToIso', () => {
  it('parses M/D/YYYY and MM/DD/YYYY', () => {
    expect(usDateToIso('9/24/2026')).toBe('2026-09-24');
    expect(usDateToIso('09/24/2026')).toBe('2026-09-24');
    expect(usDateToIso(' 1/3/2027 ')).toBe('2027-01-03');
  });
  it('rejects non-dates and out-of-range parts', () => {
    expect(usDateToIso('Martha Thompson')).toBeNull();
    expect(usDateToIso('13/24/2026')).toBeNull();
    expect(usDateToIso('12/32/2026')).toBeNull();
    expect(usDateToIso('2026-09-24')).toBeNull();
  });
});

describe('weekdayName', () => {
  it('computes the weekday from parts', () => {
    expect(weekdayName('2026-09-24')).toBe('Thursday');
    expect(weekdayName('2026-10-02')).toBe('Friday');
  });
  it('returns empty for malformed input', () => {
    expect(weekdayName('09/24/2026')).toBe('');
  });
});

describe('isoToUs', () => {
  it('formats zero-padded MM/DD/YYYY', () => {
    expect(isoToUs('2026-09-24')).toBe('09/24/2026');
  });
  it('passes non-ISO strings through', () => {
    expect(isoToUs('TBD')).toBe('TBD');
  });
});

describe('isPast / todayIso', () => {
  it('compares ISO strings lexically', () => {
    expect(isPast('2026-09-23', '2026-09-24')).toBe(true);
    expect(isPast('2026-09-24', '2026-09-24')).toBe(false);
  });
  it('todayIso is a valid local ISO date', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseIsoLocal', () => {
  it('returns local midnight — the date survives any timezone (T8)', () => {
    const d = parseIsoLocal('2026-09-24');
    expect(d).not.toBeNull();
    // Local getters, NOT getUTC*: in a negative-offset zone (Texas) a UTC
    // parse would make these read 23 Sep.
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(24);
    expect(d!.getHours()).toBe(0);
  });
  it('rejects malformed strings', () => {
    expect(parseIsoLocal('09/24/2026')).toBeNull();
    expect(parseIsoLocal('')).toBeNull();
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  it('buckets recent timestamps', () => {
    expect(relativeTime('2026-10-02T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-10-02T11:55:00Z', now)).toBe('5 min ago');
    expect(relativeTime('2026-10-02T10:00:00Z', now)).toBe('2 h ago');
    expect(relativeTime('2026-09-29T12:00:00Z', now)).toBe('3 d ago');
  });
  it('falls back to the calendar date after a week', () => {
    expect(relativeTime('2026-09-01T12:00:00Z', now)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
  it('never says "in the future" for small clock skew', () => {
    expect(relativeTime('2026-10-02T12:00:20Z', now)).toBe('just now');
  });
  it('returns empty for malformed input', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});
