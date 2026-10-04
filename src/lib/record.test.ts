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

  it('a completely blank record from blankRecord() has no content', () => {
    expect(hasContent(blankRecord('Aboud Yousef', defaultSettings()))).toBe(false);
  });

  it('untouched orientations (["", ""]) with nothing else set is not content', () => {
    const r = makeRecord({ sf: blankSf, installNotes: { ...emptyInstallNotes(), orientations: ['', ''] } });
    expect(hasContent(r)).toBe(false);
  });
});
