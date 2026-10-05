// Extra Work tracker — pure logic (_PLAN_extra_work.md).
// Day type is computed: Sat+Sun → weekend (Aboud 2026-10-06), override wins.

import { describe, expect, it } from 'vitest';
import type { ExtraWorkEntry, ExtraWorkState } from '../extrawork/types';
import {
  canEditEntry,
  dayTypeFor,
  emptyExtraWork,
  entriesForMonth,
  isValidHours,
  liveEntries,
  mergeExtraWork,
  monthKey,
  monthLabel,
  monthLabelLong,
  newEntry,
  overtimePay,
  shiftMonth,
  patchEntry,
  personStats,
} from './extraWork';

const T0 = '2026-10-02T10:00:00.000Z';
const T1 = '2026-10-03T10:00:00.000Z';

function entry(over: Partial<ExtraWorkEntry> = {}): ExtraWorkEntry {
  return {
    ...newEntry(
      { username: 'aboudyousef', person: 'Aboud Yousef' },
      { dateIso: '2026-10-04', hours: 2, description: 'Completing daily tasks', dayTypeOverride: null },
      T0,
    ),
    id: 'e1',
    ...over,
  };
}

function state(entries: ExtraWorkEntry[]): ExtraWorkState {
  return { entries };
}

describe('dayTypeFor', () => {
  it('Sat and Sun are weekend, Mon–Fri weekday', () => {
    expect(dayTypeFor('2026-10-03', null)).toBe('weekend'); // Saturday
    expect(dayTypeFor('2026-10-04', null)).toBe('weekend'); // Sunday
    expect(dayTypeFor('2026-10-05', null)).toBe('weekday'); // Monday
    expect(dayTypeFor('2026-10-09', null)).toBe('weekday'); // Friday
  });
  it('override wins over the computed type', () => {
    expect(dayTypeFor('2026-10-05', 'holiday')).toBe('holiday');
    expect(dayTypeFor('2026-10-04', 'weekday')).toBe('weekday');
  });
});

describe('isValidHours', () => {
  it('accepts whole hours 1–24 (design decision 2026-10-06: no half hours)', () => {
    expect(isValidHours(1)).toBe(true);
    expect(isValidHours(8)).toBe(true);
    expect(isValidHours(24)).toBe(true);
  });
  it('rejects zero, negatives, fractions, and silly values', () => {
    expect(isValidHours(0)).toBe(false);
    expect(isValidHours(-1)).toBe(false);
    expect(isValidHours(0.5)).toBe(false);
    expect(isValidHours(2.5)).toBe(false);
    expect(isValidHours(25)).toBe(false);
    expect(isValidHours(NaN)).toBe(false);
  });
});

describe('newEntry / patchEntry', () => {
  it('stamps owner, timestamps and schemaVersion; trims the description', () => {
    const e = newEntry(
      { username: 'omar', person: 'Omar Rajab' },
      { dateIso: '2026-10-05', hours: 3, description: '  BOS tool  ', dayTypeOverride: null },
      T0,
    );
    expect(e.username).toBe('omar');
    expect(e.person).toBe('Omar Rajab');
    expect(e.description).toBe('BOS tool');
    expect(e.createdAt).toBe(T0);
    expect(e.updatedAt).toBe(T0);
    expect(e.schemaVersion).toBe(1);
    expect(e.id).toBeTruthy();
  });
  it('patchEntry applies fields and bumps updatedAt only', () => {
    const e = entry();
    const p = patchEntry(e, { hours: 4, description: 'More work' }, T1);
    expect(p.hours).toBe(4);
    expect(p.description).toBe('More work');
    expect(p.updatedAt).toBe(T1);
    expect(p.createdAt).toBe(T0);
    expect(p.id).toBe(e.id);
  });
});

describe('mergeExtraWork', () => {
  it('newer updatedAt wins per id; unknown ids union', () => {
    const a = entry({ id: 'e1', hours: 2, updatedAt: T0 });
    const b = entry({ id: 'e1', hours: 5, updatedAt: T1 });
    const c = entry({ id: 'e2', updatedAt: T0 });
    const merged = mergeExtraWork(state([a, c]), state([b]));
    const byId = new Map(merged.entries.map((e) => [e.id, e]));
    expect(byId.get('e1')?.hours).toBe(5);
    expect(byId.size).toBe(2);
  });
  it('a tombstoned copy with newer updatedAt wins (delete survives sync)', () => {
    const alive = entry({ id: 'e1', updatedAt: T0 });
    const dead = entry({ id: 'e1', deletedAt: T1, updatedAt: T1 });
    const merged = mergeExtraWork(state([alive]), state([dead]));
    expect(merged.entries[0].deletedAt).toBe(T1);
    expect(liveEntries(merged.entries)).toEqual([]);
  });
});

describe('month helpers', () => {
  it('monthKey extracts YYYY-MM; monthLabel renders "Sep 2026"', () => {
    expect(monthKey('2026-09-28')).toBe('2026-09');
    expect(monthLabel('2026-09')).toBe('Sep 2026');
    expect(monthLabel('2026-12')).toBe('Dec 2026');
  });
  it('monthLabelLong renders "September 2026"', () => {
    expect(monthLabelLong('2026-09')).toBe('September 2026');
  });
  it('shiftMonth moves across year boundaries', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('entriesForMonth: live entries in the month, sorted by date then person', () => {
    const entries = [
      entry({ id: 'e1', person: 'Omar Rajab', dateIso: '2026-10-07' }),
      entry({ id: 'e2', person: 'Aboud Yousef', dateIso: '2026-10-07' }),
      entry({ id: 'e3', dateIso: '2026-10-01' }),
      entry({ id: 'e4', dateIso: '2026-09-30' }), // other month
      entry({ id: 'e5', dateIso: '2026-10-09', deletedAt: T1 }), // tombstone
    ];
    expect(entriesForMonth(entries, '2026-10').map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
  });
});

describe('personStats', () => {
  it('totals hours, splits weekday/weekend/holiday, counts distinct days', () => {
    const rows = [
      entry({ id: 'e1', dateIso: '2026-10-04', hours: 8 }), // Sun → weekend
      entry({ id: 'e2', dateIso: '2026-10-05', hours: 3 }), // Mon → weekday
      entry({ id: 'e3', dateIso: '2026-10-05', hours: 2 }), // same day, 2nd block
    ];
    expect(personStats(rows)).toEqual({ total: 13, weekday: 5, weekend: 8, holiday: 0, days: 2 });
  });
  it('holiday hours get their own column (design 2026-10-06)', () => {
    const rows = [entry({ id: 'e1', dateIso: '2026-10-05', hours: 4, dayTypeOverride: 'holiday' })];
    expect(personStats(rows)).toEqual({ total: 4, weekday: 0, weekend: 0, holiday: 4, days: 1 });
  });
});

describe('canEditEntry', () => {
  it('owner or admin only', () => {
    const e = entry({ username: 'omar' });
    expect(canEditEntry(e, 'omar', false)).toBe(true);
    expect(canEditEntry(e, 'aboudyousef', false)).toBe(false);
    expect(canEditEntry(e, 'aboudyousef', true)).toBe(true);
  });
});

describe('overtimePay', () => {
  it("Aboud's example: 1550 JOD salary → 51.66 daily, 6.45 hourly, 1.5× rate on extra hours", () => {
    const r = overtimePay(1550, 19);
    expect(r.daily).toBeCloseTo(51.6667, 3); // 1550 / 30
    expect(r.hourly).toBeCloseTo(6.4583, 3); // daily / 8
    expect(r.pay).toBeCloseTo(1.5 * 19 * 6.4583, 2);
  });
  it('zero/invalid salary or hours → zero pay', () => {
    expect(overtimePay(0, 10).pay).toBe(0);
    expect(overtimePay(NaN, 10).pay).toBe(0);
    expect(overtimePay(1550, 0).pay).toBe(0);
  });
});

describe('emptyExtraWork', () => {
  it('is an empty entries list', () => {
    expect(emptyExtraWork()).toEqual({ entries: [] });
  });
});
