import { describe, expect, it } from 'vitest';
import type { SfFields } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { emptyInstallNotes } from './installNotes';
import { blankRecord, hasContent } from './record';
import { defaultSettings } from './storage';

// makeRecord() defaults sf.customerName to 'Norca Garcia' and fills jurisdiction
// + siteAddress too, so these tests need a record with the sf half genuinely
// blank — override every sf field the way blankRecord() would leave it.
const blankSf: SfFields = {
  customerName: '',
  installScheduledDate: '',
  region: 'HOU',
  source: 'manual',
};

describe('hasContent — installNotes (carried fix, Phase 7 review)', () => {
  it('a record with ONLY installNotes.loadRun filled and no customer name counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), loadRun: '18 ft' } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY installNotes.walls = 2 set counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), walls: 2 } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY installNotes.service = "MPU" counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), service: 'MPU' } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY services ticked counts as content (meeting 2026-10-04)', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), services: ['FSU'] } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY a roof rating chosen counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), roofRating: 3 } });
    expect(hasContent(r)).toBe(true);
  });

  // Battery installation analysis (Aboud 2026-11-03) — a draft holding only
  // one of these answers must still autosave, like every other dropdown.
  it('a record with ONLY a battery base chosen counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), batteryBase: 'wall-mount' } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY the wall-evenness answer counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), wallEven: false } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY "push from wall" answered No counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), batteryPushFromWall: false } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY the trench box ticked counts as content (Aboud 2026-11-12)', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), trench: true } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY the extra-work answer counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), batteryBaseNeedsWork: false } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY the battery elevation typed counts as content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), batteryElevation: '48 in' } });
    expect(hasContent(r)).toBe(true);
  });

  it('a completely blank record from blankRecord() has no content', () => {
    expect(hasContent(blankRecord('Aboud Yousef', defaultSettings()))).toBe(false);
  });

  it('untouched orientations (["", ""]) with nothing else set is not content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), orientations: ['', ''] } });
    expect(hasContent(r)).toBe(false);
  });
});

// SVT pre-design fields (Aboud 2026-11-15) — the same data-loss class the
// install-notes entries above exist to prevent: a draft holding ONLY
// pre-design content must still autosave.
describe('hasContent — svt pre-design fields', () => {
  it('a record with ONLY a conduit-path tick counts as content', () => {
    const r = makeRecord({ sf: blankSf, svt: { pathAttic: true } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY the HO-agrees answer counts as content', () => {
    const r = makeRecord({ sf: blankSf, svt: { hoAgrees: false } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY the crew-days pick counts as content', () => {
    const r = makeRecord({ sf: blankSf, svt: { crewDays: 1 } });
    expect(hasContent(r)).toBe(true);
  });

  it('a record with ONLY an SVT text box filled counts as content', () => {
    const r = makeRecord({ sf: blankSf, svt: { hoReason: 'blocks the gas meter clearance' } });
    expect(hasContent(r)).toBe(true);
  });

  it('an empty svt object is not content', () => {
    const r = makeRecord({ sf: blankSf, svt: {} });
    expect(hasContent(r)).toBe(false);
  });
});
