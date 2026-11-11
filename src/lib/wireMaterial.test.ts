// Wire material check (AL vs CU) — Aboud 2026-11-11, after the Solrite
// rejections for "evidence (Al) does not match the planset (Cu)".

import { describe, expect, it } from 'vitest';
import type { ServiceAmps } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { POLISH_KEYS } from './installNotes';
import {
  SERVICE_AMPS,
  TABLE_310_12,
  WIRE_MATERIALS,
  wireFeedbackLine,
  wireRequestText,
  wireSizeFor,
  wireStatus,
} from './wireMaterial';

describe('TABLE_310_12', () => {
  it('carries every row of the NEC table, in ascending order', () => {
    // The dropdown stops at 225 A (Aboud 2026-11-11) — the table keeps the
    // rows above it so an older record still resolves a size.
    expect(SERVICE_AMPS).toEqual([100, 110, 125, 150, 175, 200, 225]);
    expect(Object.keys(TABLE_310_12).map(Number)).toEqual([100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400]);
    for (const a of Object.keys(TABLE_310_12).map(Number) as ServiceAmps[]) {
      expect(TABLE_310_12[a].cu).toBeTruthy();
      expect(TABLE_310_12[a].al).toBeTruthy();
    }
  });

  it('matches the printed table at the rows the team actually sees', () => {
    expect(TABLE_310_12[200]).toEqual({ cu: '#2/0 AWG', al: '#4/0 AWG' });
    expect(TABLE_310_12[100]).toEqual({ cu: '#4 AWG', al: '#2 AWG' });
    expect(TABLE_310_12[400]).toEqual({ cu: '400 kcmil', al: '600 kcmil' });
  });

  // The reference graphic Aboud supplied prints "30/" here. That is a typo in
  // the graphic; NEC Table 310.12 reads 3/0 AWG. Pinned so nobody "fixes" the
  // code back to the picture.
  it('reads 3/0 AWG at 225 A copper, not the "30/" of the reference image', () => {
    expect(TABLE_310_12[225].cu).toBe('#3/0 AWG');
  });

  it('wireSizeFor resolves both materials, and nothing without a rating', () => {
    expect(wireSizeFor(200, 'AL')).toBe('#4/0 AWG');
    expect(wireSizeFor(200, 'CU')).toBe('#2/0 AWG');
    expect(wireSizeFor(undefined, 'AL')).toBeUndefined();
    expect(wireSizeFor(200, undefined)).toBeUndefined();
  });

  // Aboud 2026-11-11: "all wires must have a prefix #2/0 #3/0 #3 #4 like
  // this". Every example he gave was an AWG gauge — "#250 kcmil" is not a
  // thing, so the prefix stops at the AWG/kcmil boundary.
  it('prefixes every AWG size with #, and no kcmil size', () => {
    const sizes = Object.values(TABLE_310_12).flatMap((r) => [r.cu, r.al]);
    expect(sizes.length).toBe(22);
    for (const s of sizes) {
      if (s.includes('AWG')) expect(s.startsWith('#')).toBe(true);
      else expect(s).toMatch(/^\d+ kcmil$/);
    }
  });

  it('offers exactly two materials', () => {
    expect(WIRE_MATERIALS.map((m) => m.value)).toEqual(['CU', 'AL']);
  });
});

describe('wireStatus', () => {
  it('is unknown until BOTH halves are picked', () => {
    expect(wireStatus(makeRecord())).toBe('unknown');
    expect(wireStatus(makeRecord({ wire: { design: 'CU' } }))).toBe('unknown');
    expect(wireStatus(makeRecord({ wire: { bos: 'AL' } }))).toBe('unknown');
    // A service rating alone says nothing about the match.
    expect(wireStatus(makeRecord({ wire: { serviceAmps: 200 } }))).toBe('unknown');
  });

  it('matches when both halves agree', () => {
    expect(wireStatus(makeRecord({ wire: { design: 'AL', bos: 'AL' } }))).toBe('match');
    expect(wireStatus(makeRecord({ wire: { design: 'CU', bos: 'CU' } }))).toBe('match');
  });

  it('mismatches when they differ', () => {
    expect(wireStatus(makeRecord({ wire: { design: 'CU', bos: 'AL' } }))).toBe('mismatch');
    expect(wireStatus(makeRecord({ wire: { design: 'AL', bos: 'CU' } }))).toBe('mismatch');
  });
});

describe('wireFeedbackLine', () => {
  it('says nothing at all while the answer is unknown', () => {
    expect(wireFeedbackLine(makeRecord())).toBe('');
    expect(wireFeedbackLine(makeRecord({ wire: { design: 'CU' } }))).toBe('');
  });

  it('states an unchanged material, with the size when the rating is known', () => {
    expect(wireFeedbackLine(makeRecord({ wire: { design: 'AL', bos: 'AL', serviceAmps: 200 } }))).toBe(
      'Wire material unchanged — the design SLD and the BOS both specify aluminum conductors ' +
        '(#4/0 AWG for the 200 A service, NEC Table 310.12).',
    );
  });

  it('states an unchanged material without a size when no rating is picked', () => {
    expect(wireFeedbackLine(makeRecord({ wire: { design: 'CU', bos: 'CU' } }))).toBe(
      'Wire material unchanged — the design SLD and the BOS both specify copper conductors.',
    );
  });

  it('asks for the SLD change, naming the size, when the rating is known', () => {
    expect(wireFeedbackLine(makeRecord({ wire: { design: 'CU', bos: 'AL', serviceAmps: 200 } }))).toBe(
      'Wire material changed after the elevation review — the BOS specifies aluminum, the design SLD ' +
        'shows copper. Please update the design SLD to #4/0 AWG aluminum for the 200 A service ' +
        '(NEC Table 310.12) and re-upload it to Salesforce so the planset matches the BOS.',
    );
  });

  it('asks for the SLD change without a size when no rating is picked', () => {
    expect(wireFeedbackLine(makeRecord({ wire: { design: 'AL', bos: 'CU' } }))).toBe(
      'Wire material changed after the elevation review — the BOS specifies copper, the design SLD ' +
        'shows aluminum. Please update the design SLD to copper conductors and re-upload it to ' +
        'Salesforce so the planset matches the BOS.',
    );
  });
});

describe('wireRequestText', () => {
  it('is the ask on its own, for pasting to the designer', () => {
    expect(wireRequestText(makeRecord({ wire: { design: 'CU', bos: 'AL', serviceAmps: 150 } }))).toBe(
      'Please update the design SLD to #2/0 AWG aluminum for the 150 A service (NEC Table 310.12) ' +
        'and re-upload it to Salesforce so the planset matches the BOS.',
    );
  });

  it('is empty when there is nothing to ask for', () => {
    expect(wireRequestText(makeRecord({ wire: { design: 'AL', bos: 'AL' } }))).toBe('');
    expect(wireRequestText(makeRecord())).toBe('');
  });
});

// The whole value of the feature is that the material is stated truthfully.
// An AI rewrite of that sentence would defeat it, so the data deliberately
// lives OUTSIDE anything the AI can reach.
describe('the verdict is out of the AI\'s reach', () => {
  it('"wire" is not a PolishKey, so no rewrite request can carry it', () => {
    expect(POLISH_KEYS).not.toContain('wire' as never);
    expect(POLISH_KEYS.some((k) => k.includes('wire'))).toBe(false);
  });

  it('does not read notes.design, so polishing that box cannot change the verdict', () => {
    const wire = { design: 'CU', bos: 'AL', serviceAmps: 200 } as const;
    const plain = makeRecord({ wire });
    const polished = makeRecord({
      wire,
      notes: { layout: '', siteSurvey: '', design: 'the wires are fine', homeowner: '' },
      polished: { design: 'Everything matches, no change needed.' },
    });
    expect(wireFeedbackLine(polished)).toBe(wireFeedbackLine(plain));
  });

  it('is not an InstallNotes field either — it cannot ride that path into a polish key', () => {
    const r = makeRecord({ wire: { design: 'AL', bos: 'CU' } });
    expect(Object.keys(r.installNotes ?? {})).not.toContain('wire');
  });
});
