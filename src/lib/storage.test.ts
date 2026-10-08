// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ExportFile, PostRecord, Settings } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { emptyInstallNotes } from './installNotes';
import { defaultSettings, exportFileName, loadSettings, mergeImport, mergeRecords, migrateRecord } from './storage';

function rec(id: string, updatedAt: string, customer: string): PostRecord {
  return makeRecord({
    id,
    status: 'posted',
    updatedAt,
    sf: { customerName: customer, installScheduledDate: '2026-10-01', region: 'HOU', source: 'text' },
    tags: [],
  });
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

describe('mergeRecords — shared-history sync', () => {
  it('a newer tombstone wins over an older live record (deletion propagates)', () => {
    const live = rec('a', '2026-09-10T00:00:00.000Z', 'A');
    const tombstone: PostRecord = { ...rec('a', '2026-09-12T00:00:00.000Z', 'A'), deletedAt: '2026-09-12T00:00:00.000Z' };
    const { records } = mergeRecords([live], [tombstone]);
    expect(records[0].deletedAt).toBe('2026-09-12T00:00:00.000Z');
  });

  it('a newer undo wins over an older tombstone (restore propagates)', () => {
    const tombstone: PostRecord = { ...rec('a', '2026-09-12T00:00:00.000Z', 'A'), deletedAt: '2026-09-12T00:00:00.000Z' };
    const restored = rec('a', '2026-09-13T00:00:00.000Z', 'A');
    const { records } = mergeRecords([tombstone], [restored]);
    expect(records[0].deletedAt).toBeUndefined();
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

  it('default settings seed the CLR agent and project manager rosters (meeting 2026-10-04)', () => {
    const s = defaultSettings();
    expect(s.clrAgents).toEqual([
      'Adam Hallett',
      'Blake Armstrong',
      'Alexandria Mullen',
      'Tre Goodloe',
      'Austen Hallett',
    ]);
    expect(s.projectManagers).toEqual([
      'Mirna Jamalieh',
      'Joud Samardali',
      'Ghawi Mahmoud',
      'Yasmeen Momani',
      "Mua'ath Ali",
    ]);
  });
});

describe('migrateRecord — Phase 7 (spec/10 §2.2)', () => {
  /** A record as written before Phase 7: free-text layout, four-key polish maps. */
  const legacy = () =>
    makeRecord({
      installNotes: undefined,
      notes: { layout: 'Attic run\nBack-to-back', siteSurvey: 'survey', design: '', homeowner: '' },
      polished: { layout: 'Attic run.\nBack-to-back.' } as never,
      usePolished: { layout: false } as never,
    });

  it('moves notes.layout into installNotes.other and clears it', () => {
    const m = migrateRecord(legacy());
    expect(m.installNotes?.other).toBe('Attic run\nBack-to-back');
    expect(m.notes.layout).toBe('');
  });

  it('re-keys the polished text and the revert flag', () => {
    const m = migrateRecord(legacy());
    expect(m.polished?.['install.other']).toBe('Attic run.\nBack-to-back.');
    expect(m.usePolished['install.other']).toBe(false);
    expect((m.polished as Record<string, unknown>).layout).toBeUndefined();
    expect((m.usePolished as Record<string, unknown>).layout).toBeUndefined();
  });

  it('leaves the other notes and every other field alone', () => {
    const m = migrateRecord(legacy());
    expect(m.notes.siteSurvey).toBe('survey');
    expect(m.id).toBe('test-id');
    expect(m.installNotes?.loadRun).toBe('');
  });

  it('is a no-op on a record that already has installNotes and no legacy text', () => {
    const current = makeRecord({ installNotes: { ...emptyInstallNotes(), loadRun: '18 ft' } });
    expect(migrateRecord(current)).toBe(current);
  });

  it('never overwrites an existing installNotes.other', () => {
    const both = makeRecord({
      installNotes: { ...emptyInstallNotes(), other: 'already here' },
      notes: { layout: 'old text', siteSurvey: '', design: '', homeowner: '' },
    });
    expect(migrateRecord(both).installNotes?.other).toBe('already here');
  });
});

describe('migrateRecord — malformed records never reach the UI', () => {
  // These shapes arrive from the shared team store or a hand-edited export
  // file. Before this guard each one white-screened the app, and the bad
  // record was already cached in localStorage, so the reload crashed too.
  it('fills a missing notes object', () => {
    const broken = { ...makeRecord(), notes: undefined } as unknown as PostRecord;
    const m = migrateRecord(broken);
    expect(m.notes).toEqual({ layout: '', siteSurvey: '', design: '', homeowner: '' });
  });

  it('fills missing sf sub-fields rather than letting .trim() throw', () => {
    const broken = { ...makeRecord(), sf: { region: 'HOU', source: 'text' } } as unknown as PostRecord;
    const m = migrateRecord(broken);
    expect(m.sf.customerName).toBe('');
    expect(() => m.sf.customerName.trim()).not.toThrow();
  });

  it('fills a missing sf object entirely', () => {
    const broken = { ...makeRecord(), sf: undefined } as unknown as PostRecord;
    expect(migrateRecord(broken).sf.customerName).toBe('');
  });

  it('clamps a level outside 1..4, which has no LEVEL_INFO entry', () => {
    expect(migrateRecord({ ...makeRecord(), level: 7 } as unknown as PostRecord).level).toBe(4);
    expect(migrateRecord({ ...makeRecord(), level: 0 } as unknown as PostRecord).level).toBe(1);
    expect(migrateRecord({ ...makeRecord(), level: undefined } as unknown as PostRecord).level).toBe(1);
    expect(migrateRecord({ ...makeRecord(), level: 3 } as PostRecord).level).toBe(3);
  });

  it('leaves a healthy record untouched, and still returns it by identity', () => {
    const good = migrateRecord(makeRecord());
    expect(migrateRecord(good)).toBe(good);
  });
})

// Utility picker (2026-10-08). sf.utility already existed and was filled ONLY
// by the Salesforce extractor; Compose now offers it from Settings.utilities.
describe('utilities roster', () => {
  it('ships a starter list', () => {
    expect(defaultSettings().utilities).toContain('CenterPoint Energy');
    expect(defaultSettings().utilities).toContain('TNMP');
  });

  it('settings stored before the roster existed still get it (no migration needed)', () => {
    const old = { ...defaultSettings() } as Partial<Settings>;
    delete old.utilities;
    localStorage.setItem('sowpost.settings', JSON.stringify(old));
    expect(loadSettings().utilities).toEqual(defaultSettings().utilities);
  });

  it('an edited roster wins over the default', () => {
    localStorage.setItem(
      'sowpost.settings',
      JSON.stringify({ ...defaultSettings(), utilities: ['Oncor'] }),
    );
    expect(loadSettings().utilities).toEqual(['Oncor']);
  });
});
