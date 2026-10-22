import { describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { emptyInstallNotes } from './installNotes';
import { buildSfSubmission } from './sfSubmission';
import { defaultSettings } from './storage';

function rec(overrides: Partial<PostRecord> = {}): PostRecord {
  return makeRecord(overrides);
}

function fieldValue(r: PostRecord, id: string): string {
  const f = buildSfSubmission(r, defaultSettings()).find((x) => x.id === id);
  if (!f) throw new Error(`no field ${id}`);
  return f.value;
}

describe('buildSfSubmission — field list', () => {
  it('returns the SF fields exactly as the SF page lays them out: left column, then right', () => {
    expect(buildSfSubmission(rec(), defaultSettings()).map((f) => f.id)).toEqual([
      // left column, top to bottom
      'batteryLocation',
      'outageExpected',
      'panelFacesFront',
      'window',
      'clearanceHomeowner',
      // right column, top to bottom (Wiring Route is filled by hand in SF)
      'stories',
      'outageDuration',
      'installDays',
      // other SF sections
      'siteModification',
      'siteSurvey',
      'design',
    ]);
  });

  it('tick/picklist/number SF fields are display-only — everything else is copyable', () => {
    // Aboud 2026-10-22 (screenshot review): checkboxes, picklists and number
    // inputs in SF are quicker to click than to paste — show the value, no button.
    const copyFlags = Object.fromEntries(buildSfSubmission(rec(), defaultSettings()).map((f) => [f.id, f.copy !== false]));
    expect(copyFlags.stories).toBe(false);
    expect(copyFlags.installDays).toBe(false);
    expect(copyFlags.outageExpected).toBe(false);
    expect(copyFlags.outageDuration).toBe(false);
    expect(copyFlags.panelFacesFront).toBe(false);
    expect(copyFlags.window).toBe(true);
    expect(copyFlags.batteryLocation).toBe(true);
    expect(copyFlags.clearanceHomeowner).toBe(true);
    expect(copyFlags.siteModification).toBe(true);
  });

  it('uses the EXACT Salesforce labels', () => {
    const labels = Object.fromEntries(buildSfSubmission(rec(), defaultSettings()).map((f) => [f.id, f.label]));
    expect(labels.window).toBe('Installation Window and Planning');
    expect(labels.stories).toBe('Number of Stories');
    expect(labels.installDays).toBe('Estimated Installation Duration (Days)');
    expect(labels.outageExpected).toBe('Power Outage Expected');
    expect(labels.outageDuration).toBe('Estimated Power Outage Duration');
    expect(labels.panelFacesFront).toBe('Panel Facing Front of House');
    expect(labels.batteryLocation).toBe('Battery and Equipment Location');
    expect(labels.clearanceHomeowner).toBe('Clearance and Homeowner Preparation');
    expect(labels.siteModification).toBe('Site Modification Notes');
  });
});

describe('simple fields', () => {
  it('stories: number, or the free text for "other", or empty', () => {
    expect(fieldValue(rec({ installNotes: { ...emptyInstallNotes(), stories: 2 } }), 'stories')).toBe('2');
    expect(
      fieldValue(rec({ installNotes: { ...emptyInstallNotes(), stories: 'other', storiesOther: 'Split level' } }), 'stories'),
    ).toBe('Split level');
    expect(fieldValue(rec(), 'stories')).toBe('');
  });

  it('installation days follow the level: 1 / 1.5 / 2 / 2', () => {
    expect(fieldValue(rec({ level: 1 }), 'installDays')).toBe('1');
    expect(fieldValue(rec({ level: 2 }), 'installDays')).toBe('1.5');
    expect(fieldValue(rec({ level: 3 }), 'installDays')).toBe('2');
    expect(fieldValue(rec({ level: 4 }), 'installDays')).toBe('2');
  });

  it('outage: always expected, duration in SF picklist wording', () => {
    expect(fieldValue(rec(), 'outageExpected')).toBe('Yes');
    expect(fieldValue(rec(), 'outageDuration')).toBe('1 to 2 hours');
    const mpu = rec({ installNotes: { ...emptyInstallNotes(), services: ['MPU'] } });
    expect(fieldValue(mpu, 'outageDuration')).toBe('4 to 6 hours');
  });

  it('panel facing front of house: No by default (old records too), Yes when ticked', () => {
    expect(fieldValue(rec(), 'panelFacesFront')).toBe('No');
    expect(
      fieldValue(rec({ installNotes: { ...emptyInstallNotes(), panelFacesFront: true } }), 'panelFacesFront'),
    ).toBe('Yes');
  });
});

describe('Installation Window and Planning', () => {
  it('composes classification + install notes + conduit raceway with plain-text structure (SF strips rich format)', () => {
    const r = rec({
      level: 3,
      installNotes: {
        ...emptyInstallNotes(),
        walls: 1,
        orientations: ['East'],
        stories: 1,
        services: ['MPU'],
        roofRating: 8,
        serviceRun: 'Standard run',
        loadRun: 'Standard run',
      },
    });
    const v = fieldValue(r, 'window');
    expect(v).toContain('Level 3 – Service Equipment Modification.');
    expect(v).toContain('Planning window: 1.5 to 2 crew-days.');
    // Sections carry a dashed underline; lines carry "- " bullets — formatting
    // that survives Salesforce's plain-text fields.
    expect(v).toContain('Installation Notes\n------------------');
    expect(v).toContain('- Installation on one wall (East).');
    expect(v).toContain('- This project requires an MPU.');
    expect(v).toContain('- Roof rating: 8/10 (Good)');
    expect(v).toContain('Conduit Raceway\n---------------');
    expect(v).toContain('- Grid/service run: Standard run.');
    expect(v).toContain('- Load run: Standard run.');
    // Stories and the power-disconnect duration have their own SF fields
    // (Aboud 2026-10-22 review) — stated once, not inside this blob.
    expect(v).not.toContain('story house');
    expect(v).not.toContain('power disconnect');
    // The clearance boilerplate closes the blob (Aboud 2026-10-22).
    expect(v.endsWith('All required clearance requirements have been met.')).toBe(true);
  });

  it('a multi-point conduit run nests its points with indented dashes', () => {
    const r = rec({
      installNotes: { ...emptyInstallNotes(), serviceRun: 'Offset on the wall\nUsed 45D and LBs' },
    });
    const v = fieldValue(r, 'window');
    expect(v).toContain('- Grid/service run:\n  - Offset on the wall.\n  - Used 45D and LBs.');
  });

  it('battery location and special cases are NOT in the blob — they have their own SF fields', () => {
    const r = rec({
      installNotes: { ...emptyInstallNotes(), batteryLocation: 'Garage wall', specialCases: 'Needs Cu wire' },
    });
    const v = fieldValue(r, 'window');
    expect(v).not.toContain('Garage wall');
    expect(v).not.toContain('Needs Cu wire');
  });

  it('no conduit runs → no Conduit Raceway header', () => {
    expect(fieldValue(rec(), 'window')).not.toContain('Conduit Raceway');
  });

  it('the clearance boilerplate appears EXACTLY once — as the final sentence, even when typed into a notes box', () => {
    const r = rec({
      installNotes: {
        ...emptyInstallNotes(),
        other: 'Attic run\nAll required clearance requirements have been met',
      },
    });
    const v = fieldValue(r, 'window');
    expect(v).toContain('- Attic run.');
    expect(v.match(/clearance requirements have been met/gi)).toHaveLength(1);
    expect(v.endsWith('All required clearance requirements have been met.')).toBe(true);
  });
});

describe('merged note fields', () => {
  it('battery location uses the polished text when enabled', () => {
    const r = rec({
      installNotes: { ...emptyInstallNotes(), batteryLocation: 'garage raw' },
      polished: { 'install.batteryLocation': 'Polished garage wall' },
    });
    expect(fieldValue(r, 'batteryLocation')).toBe('Polished garage wall.');
    r.usePolished['install.batteryLocation'] = false;
    expect(fieldValue(r, 'batteryLocation')).toBe('garage raw.');
  });

  it('battery AND equipment: the equipment-walls sentence combines with the battery location', () => {
    const r = rec({
      installNotes: {
        ...emptyInstallNotes(),
        walls: 2,
        orientations: ['East', 'Interior - Garage'],
        batteryLocation: 'Batteries inside the garage',
      },
    });
    expect(fieldValue(r, 'batteryLocation')).toBe(
      '- Equipment on two walls (East, Interior - Garage).\n- Batteries inside the garage.',
    );
  });

  it('clearance/homeowner field carries homeowner notes ONLY — the boilerplate moved to the window blob', () => {
    // No homeowner note → the team default, same as the post.
    expect(fieldValue(rec(), 'clearanceHomeowner')).toBe('No feedback.');
    const r = rec({ notes: { layout: '', siteSurvey: '', design: '', homeowner: 'Clear the garage shelves' } });
    expect(fieldValue(r, 'clearanceHomeowner')).toBe('Clear the garage shelves.');
    expect(fieldValue(r, 'clearanceHomeowner')).not.toMatch(/clearance requirements/i);
  });

  it('site modification notes = concrete pad feedback + special cases, dashed when several', () => {
    const r = rec({
      installNotes: {
        ...emptyInstallNotes(),
        concretePad: 'Pads can extend past the left edge',
        specialCases: 'No AL wires in Missouri City',
      },
    });
    expect(fieldValue(r, 'siteModification')).toBe(
      '- Pads can extend past the left edge.\n- No AL wires in Missouri City.',
    );
  });

  it('site modification survives a pre-2026-10-22 record with no concretePad key', () => {
    const notes = { ...emptyInstallNotes(), specialCases: 'Old record case' };
    delete (notes as Record<string, unknown>).concretePad;
    expect(fieldValue(rec({ installNotes: notes }), 'siteModification')).toBe('Old record case.');
  });

  it('site survey / design feedback fall back to the team defaults, like the post', () => {
    expect(fieldValue(rec(), 'siteSurvey')).toBe('All good.');
    expect(fieldValue(rec(), 'design')).toBe('All good.');
    const r = rec({ notes: { layout: '', siteSurvey: 'Missing wall pictures', design: '', homeowner: '' } });
    expect(fieldValue(r, 'siteSurvey')).toBe('Missing wall pictures.');
  });
});
