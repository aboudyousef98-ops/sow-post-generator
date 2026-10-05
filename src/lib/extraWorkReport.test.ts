// Monthly company report — pure builders. The .xlsx/PDF renderers consume
// exactly this structure; persons alphabetical, rows by date, stats per person.

import { describe, expect, it } from 'vitest';
import type { ExtraWorkEntry } from '../extrawork/types';
import { newEntry } from './extraWork';
import { buildMonthReport, personFileName, personReport, reportFileName, summaryRows } from './extraWorkReport';

const T0 = '2026-10-02T10:00:00.000Z';

function e(person: string, dateIso: string, hours: number, over: Partial<ExtraWorkEntry> = {}): ExtraWorkEntry {
  return {
    ...newEntry(
      { username: person.toLowerCase().replace(/\s+/g, ''), person },
      { dateIso, hours, description: `work by ${person}`, dayTypeOverride: null },
      T0,
    ),
    ...over,
  };
}

describe('buildMonthReport', () => {
  it('groups by person alphabetically, rows sorted by date, with stats', () => {
    const entries = [
      e('Omar Rajab', '2026-10-07', 2),
      e('Aboud Yousef', '2026-10-04', 8), // Sunday → weekend
      e('Aboud Yousef', '2026-10-05', 3), // Monday → weekday
      e('Omar Rajab', '2026-10-03', 6), // Saturday → weekend
      e('Omar Rajab', '2026-09-30', 9), // other month — excluded
      e('Anas Yaghmour', '2026-10-09', 1, { deletedAt: T0 }), // tombstone — excluded
    ];
    const report = buildMonthReport(entries, '2026-10');
    expect(report.monthKey).toBe('2026-10');
    expect(report.persons.map((p) => p.person)).toEqual(['Aboud Yousef', 'Omar Rajab']);
    const aboud = report.persons[0];
    expect(aboud.stats).toEqual({ total: 11, weekday: 3, weekend: 8, holiday: 0, days: 2 });
    expect(aboud.rows).toEqual([
      { dateIso: '2026-10-04', day: 'Sun', dayType: 'Weekend', hours: 8, description: 'work by Aboud Yousef' },
      { dateIso: '2026-10-05', day: 'Mon', dayType: 'Weekday', hours: 3, description: 'work by Aboud Yousef' },
    ]);
    const omar = report.persons[1];
    expect(omar.rows.map((r) => r.dateIso)).toEqual(['2026-10-03', '2026-10-07']);
  });
});

describe('summaryRows', () => {
  it('one row per person plus TOTAL', () => {
    const report = buildMonthReport(
      [e('Aboud Yousef', '2026-10-04', 8), e('Omar Rajab', '2026-10-05', 2)],
      '2026-10',
    );
    expect(summaryRows(report)).toEqual([
      { person: 'Aboud Yousef', total: 8, weekday: 0, weekend: 8, holiday: 0, days: 1 },
      { person: 'Omar Rajab', total: 2, weekday: 2, weekend: 0, holiday: 0, days: 1 },
      { person: 'TOTAL', total: 10, weekday: 2, weekend: 8, holiday: 0, days: 2 },
    ]);
  });
});

describe('reportFileName', () => {
  it("matches the company file: 'Extra Work Summary - SOW Team - Sep 2026'", () => {
    expect(reportFileName('2026-09')).toBe('Extra Work Summary - SOW Team - Sep 2026');
  });
});

describe('personal export (Aboud 2026-10-07: each member exports their own hours)', () => {
  it('personReport narrows a month report to one person', () => {
    const report = buildMonthReport(
      [e('Aboud Yousef', '2026-10-04', 8), e('Omar Rajab', '2026-10-05', 2)],
      '2026-10',
    );
    const mine = personReport(report, 'Aboud Yousef');
    expect(mine.monthKey).toBe('2026-10');
    expect(mine.persons.map((p) => p.person)).toEqual(['Aboud Yousef']);
  });
  it("personFileName: 'Extra Work - Aboud Yousef - Sep 2026'", () => {
    expect(personFileName('Aboud Yousef', '2026-09')).toBe('Extra Work - Aboud Yousef - Sep 2026');
  });
});
