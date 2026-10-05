// Monthly company report — pure builders only. The .xlsx writer
// (extraWorkXlsx.ts) and the PDF print view both render exactly this
// structure, so the format lives in one tested place.

import type { ExtraWorkEntry } from '../extrawork/types';
import {
  dayShort,
  dayTypeFor,
  dayTypeLabel,
  entriesForMonth,
  monthLabel,
  personStats,
  type PersonStats,
} from './extraWork';

/** One table row, as the company sheet prints it. */
export interface ReportRow {
  dateIso: string;
  day: string; // 'Sun'
  dayType: string; // 'Weekend'
  hours: number;
  description: string;
}

export interface PersonReport {
  person: string;
  stats: PersonStats;
  rows: ReportRow[];
}

export interface MonthReport {
  monthKey: string; // '2026-09'
  persons: PersonReport[];
}

/** Group a month's live entries by person (alphabetical), rows by date. */
export function buildMonthReport(entries: ExtraWorkEntry[], key: string): MonthReport {
  const monthEntries = entriesForMonth(entries, key);
  const byPerson = new Map<string, ExtraWorkEntry[]>();
  for (const e of monthEntries) {
    const list = byPerson.get(e.person) ?? [];
    list.push(e);
    byPerson.set(e.person, list);
  }
  const persons = [...byPerson.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([person, list]) => ({
      person,
      stats: personStats(list),
      rows: list.map((e) => ({
        dateIso: e.dateIso,
        day: dayShort(e.dateIso),
        dayType: dayTypeLabel(dayTypeFor(e.dateIso, e.dayTypeOverride)),
        hours: e.hours,
        description: e.description,
      })),
    }));
  return { monthKey: key, persons };
}

export interface SummaryRow extends PersonStats {
  person: string;
}

/** Per-person totals plus a TOTAL row — the on-screen/PDF summary table. */
export function summaryRows(report: MonthReport): SummaryRow[] {
  const rows: SummaryRow[] = report.persons.map((p) => ({ person: p.person, ...p.stats }));
  const total = rows.reduce(
    (acc, r) => ({
      person: 'TOTAL',
      total: acc.total + r.total,
      weekday: acc.weekday + r.weekday,
      weekend: acc.weekend + r.weekend,
      holiday: acc.holiday + r.holiday,
      days: acc.days + r.days,
    }),
    { person: 'TOTAL', total: 0, weekday: 0, weekend: 0, holiday: 0, days: 0 },
  );
  return [...rows, total];
}

/** 'Extra Work Summary - SOW Team - Sep 2026' — exactly the company file name. */
export function reportFileName(key: string): string {
  return `Extra Work Summary - SOW Team - ${monthLabel(key)}`;
}

/** The same report narrowed to one person — each member exports their own hours. */
export function personReport(report: MonthReport, person: string): MonthReport {
  return { monthKey: report.monthKey, persons: report.persons.filter((p) => p.person === person) };
}

/** 'Extra Work - Aboud Yousef - Sep 2026'. */
export function personFileName(person: string, key: string): string {
  return `Extra Work - ${person} - ${monthLabel(key)}`;
}
