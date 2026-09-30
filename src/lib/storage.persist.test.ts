// @vitest-environment jsdom
// Durability of the draft store (Aboud, 2026-09-30: "the guys are losing their
// data"). Two failure modes are covered here:
//
//  1. Whole-key clobber. saveRecords() used to write the in-memory array over
//     the top of localStorage, so a second tab — or any write built from a
//     stale array — silently deleted the other one's work.
//  2. The autosave debounce. Anything typed in the last 500 ms lived only in
//     React state. beforeunload covers a tab close; it does NOT cover a power
//     cut or a forced shutdown, which is how a laptop actually dies.

import { beforeEach, describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { clearLiveDraft, loadLiveDraft, loadRecords, saveLiveDraft, saveRecords } from './storage';

const rec = (id: string, customer: string, updatedAt: string): PostRecord =>
  makeRecord({
    id,
    updatedAt,
    sf: { customerName: customer, installScheduledDate: '', region: 'HOU', source: 'manual' },
  });

describe('saveRecords never clobbers another writer', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a record this tab has never seen', () => {
    // Another tab saved "Tab B Project" after we read our copy of the array.
    saveRecords([rec('a', 'Mine', '2026-09-30T10:00:00.000Z')]);
    saveRecords([
      rec('a', 'Mine', '2026-09-30T10:00:00.000Z'),
      rec('b', 'Tab B Project', '2026-09-30T10:05:00.000Z'),
    ]);

    // Our tab now writes from its STALE array, which has never heard of b.
    saveRecords([rec('a', 'Mine, edited', '2026-09-30T10:06:00.000Z')]);

    const onDisk = loadRecords();
    expect(onDisk.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(onDisk.find((r) => r.id === 'b')?.sf.customerName).toBe('Tab B Project');
    expect(onDisk.find((r) => r.id === 'a')?.sf.customerName).toBe('Mine, edited');
  });

  it('the newer version of the same record wins, whichever side it is on', () => {
    saveRecords([rec('a', 'Newer on disk', '2026-09-30T12:00:00.000Z')]);
    // A stale in-memory copy must not roll the record backwards.
    saveRecords([rec('a', 'Older in memory', '2026-09-30T09:00:00.000Z')]);
    expect(loadRecords()[0].sf.customerName).toBe('Newer on disk');
  });

  it('does not resurrect a record another tab deleted', () => {
    const deleted = { ...rec('a', 'Gone', '2026-09-30T12:00:00.000Z'), deletedAt: '2026-09-30T12:00:00.000Z' };
    saveRecords([deleted]);
    // Our stale array still holds the live version from before the delete.
    saveRecords([rec('a', 'Gone', '2026-09-30T11:00:00.000Z')]);
    expect(loadRecords()[0].deletedAt).toBe('2026-09-30T12:00:00.000Z');
  });
});

describe('the live draft survives a power cut', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the open record', () => {
    const open = rec('live-1', 'Half-typed Project', '2026-09-30T10:00:00.000Z');
    saveLiveDraft(open);
    expect(loadLiveDraft()?.sf.customerName).toBe('Half-typed Project');
  });

  it('is written synchronously, so there is no window to lose', () => {
    // No timers, no awaits: the value is readable on the very next statement.
    saveLiveDraft(rec('live-1', 'A', '2026-09-30T10:00:00.000Z'));
    expect(JSON.parse(localStorage.getItem('sowpost.live') ?? 'null').sf.customerName).toBe('A');
    saveLiveDraft(rec('live-1', 'AB', '2026-09-30T10:00:01.000Z'));
    expect(JSON.parse(localStorage.getItem('sowpost.live') ?? 'null').sf.customerName).toBe('AB');
  });

  it('is migrated on the way out, like every other stored record', () => {
    const legacy = {
      ...rec('live-1', 'Legacy', '2026-09-30T10:00:00.000Z'),
      installNotes: undefined,
      notes: { layout: 'Attic run', siteSurvey: '', design: '', homeowner: '' },
    };
    localStorage.setItem('sowpost.live', JSON.stringify(legacy));
    expect(loadLiveDraft()?.installNotes?.other).toBe('Attic run');
  });

  it('clears once it is safely in the draft list', () => {
    saveLiveDraft(rec('live-1', 'A', '2026-09-30T10:00:00.000Z'));
    clearLiveDraft();
    expect(loadLiveDraft()).toBeNull();
  });

  it('survives a corrupt value instead of taking the app down with it', () => {
    localStorage.setItem('sowpost.live', '{not json');
    expect(loadLiveDraft()).toBeNull();
  });
});
