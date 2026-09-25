import { describe, expect, it } from 'vitest';
import type { ExportFile, PostRecord } from '../types';
import { defaultSettings, exportFileName, mergeImport } from './storage';

function rec(id: string, updatedAt: string, customer: string): PostRecord {
  return {
    id,
    status: 'posted',
    author: 'Aboud Yousef',
    sf: { customerName: customer, installScheduledDate: '2026-10-01', region: 'HOU', source: 'text' },
    drivers: [],
    suggestedLevel: 1,
    level: 1,
    notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
    usePolished: { layout: true, siteSurvey: true, design: true, homeowner: true },
    tags: [],
    warnings: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt,
    schemaVersion: 1,
  };
}

const exportFile = (records: PostRecord[]): ExportFile => ({
  exportedAt: '2026-09-26T00:00:00.000Z',
  schemaVersion: 1,
  settings: defaultSettings(),
  records,
});

describe('mergeImport', () => {
  it('adds unknown ids and keeps the newer updatedAt on conflict', () => {
    const current = [rec('a', '2026-09-10T00:00:00.000Z', 'Old A')];
    const incoming = exportFile([
      rec('a', '2026-09-20T00:00:00.000Z', 'New A'), // newer → wins
      rec('b', '2026-09-05T00:00:00.000Z', 'B'), // new id → added
    ]);
    const { records, added, updated } = mergeImport(current, incoming);
    expect(added).toBe(1);
    expect(updated).toBe(1);
    expect(records.find((r) => r.id === 'a')?.sf.customerName).toBe('New A');
    expect(records).toHaveLength(2);
  });

  it('keeps the current record when it is newer', () => {
    const current = [rec('a', '2026-09-20T00:00:00.000Z', 'Current A')];
    const incoming = exportFile([rec('a', '2026-09-10T00:00:00.000Z', 'Stale A')]);
    const { records, updated } = mergeImport(current, incoming);
    expect(updated).toBe(0);
    expect(records[0].sf.customerName).toBe('Current A');
  });
});

describe('defaults', () => {
  it('export file name is dated', () => {
    expect(exportFileName(new Date(2026, 8, 26))).toBe('sowpost-backup-2026-09-26.json');
  });

  it('default settings match the spec rosters', () => {
    const s = defaultSettings();
    expect(s.authors).toContain('Aboud Yousef');
    expect(s.fixedTags).toEqual(['Tarek Abu Hseini', 'Mohammed Azizi']);
    expect(s.regionLead.HOU).toBe('Diego Banegas');
    expect(s.regionLead.DFW).toBe('Wesley Bomfim');
    expect(s.defaults.homeowner).toBe('No feedback.');
    expect(s.designers).toHaveLength(10);
  });
});
