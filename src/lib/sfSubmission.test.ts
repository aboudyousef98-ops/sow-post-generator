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
      // right column, top to bottom (Wiring Route and Site Modification Notes
      // are filled by hand in SF — 2026-10-27 audit moved the pad to the blob)
      'stories',
      'outageDuration',
      'installDays',
      // other SF sections
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
    // Walls are NOT in the blob (2026-10-27 audit) — the Battery and Equipment
    // Location field already states them.
    expect(v).not.toContain('Installation on one wall');
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

  it('special cases ARE in the blob (Aboud 2026-10-22); battery location is not — it has its own SF field', () => {
    const r = rec({
      installNotes: { ...emptyInstallNotes(), batteryLocation: 'Garage wall', specialCases: 'Needs Cu wire' },
    });
    const v = fieldValue(r, 'window');
    expect(v).not.toContain('Garage wall');
    expect(v).toContain('- Special cases: Needs Cu wire.');
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
  it('battery location reads "Batteries will be installed …" and uses the polished text when enabled', () => {
    const r = rec({
      installNotes: { ...emptyInstallNotes(), batteryLocation: 'on the garage left wall' },
      polished: { 'install.batteryLocation': 'On the left wall of the garage' },
    });
    expect(fieldValue(r, 'batteryLocation')).toBe('Batteries will be installed on the left wall of the garage.');
    r.usePolished['install.batteryLocation'] = false;
    expect(fieldValue(r, 'batteryLocation')).toBe('Batteries will be installed on the garage left wall.');
  });

  it('a box that already says "Batteries…" is not double-prefixed', () => {
    const r = rec({
      installNotes: { ...emptyInstallNotes(), batteryLocation: 'Batteries go inside the garage' },
    });
    expect(fieldValue(r, 'batteryLocation')).toBe('Batteries go inside the garage.');
  });

  it('battery AND equipment: the equipment-walls sentence combines with the battery location', () => {
    const r = rec({
      installNotes: {
        ...emptyInstallNotes(),
        walls: 2,
        orientations: ['East', 'Interior - Garage'],
        batteryLocation: 'inside the garage',
      },
    });
    expect(fieldValue(r, 'batteryLocation')).toBe(
      '- Equipment will be installed on two walls (East, Interior - Garage).\n- Batteries will be installed inside the garage.',
    );
  });

  it('clearance/homeowner field carries homeowner notes ONLY — the boilerplate moved to the window blob', () => {
    // No homeowner note → the team default, same as the post.
    expect(fieldValue(rec(), 'clearanceHomeowner')).toBe('No feedback.');
    const r = rec({ notes: { layout: '', siteSurvey: '', design: '', homeowner: 'Clear the garage shelves' } });
    expect(fieldValue(r, 'clearanceHomeowner')).toBe('Clear the garage shelves.');
    expect(fieldValue(r, 'clearanceHomeowner')).not.toMatch(/clearance requirements/i);
  });

  it('the retired concrete pad box no longer reaches the window blob (Aboud 2026-11-03)', () => {
    const notes = { ...emptyInstallNotes(), other: 'Attic run', specialCases: 'No AL wires in Missouri City' };
    (notes as Record<string, unknown>).concretePad = 'On the east side of the house';
    const r = rec({ installNotes: notes });
    const v = fieldValue(r, 'window');
    expect(v).not.toContain('Concrete pads');
    expect(v).toContain('- Attic run.\n- Special cases: No AL wires in Missouri City.');
    // The Site Modification Notes field is still not offered at all.
    expect(buildSfSubmission(r, defaultSettings()).find((f) => f.id === 'siteModification')).toBeUndefined();
  });

  it('a pre-2026-10-22 record with no concretePad key still builds', () => {
    const notes = { ...emptyInstallNotes(), specialCases: 'Old record case' };
    delete (notes as Record<string, unknown>).concretePad;
    const v = fieldValue(rec({ installNotes: notes }), 'window');
    expect(v).not.toContain('Concrete pads');
    expect(v).toContain('- Special cases: Old record case.');
  });

  it('site survey / design feedback fall back to the team defaults, like the post', () => {
    expect(fieldValue(rec(), 'siteSurvey')).toBe('All good.');
    expect(fieldValue(rec(), 'design')).toBe('All good.');
    const r = rec({ notes: { layout: '', siteSurvey: 'Missing wall pictures', design: '', homeowner: '' } });
    expect(fieldValue(r, 'siteSurvey')).toBe('Missing wall pictures.');
  });
});

// ---- Battery installation analysis in the window blob (Aboud 2026-11-03) ---
// Aboud's call: the WHOLE analysis lives under Installation Notes rather than
// being split across two SF fields — as its own underlined section, because SF
// strips formatting and an indented sub-list loses its grouping the moment a
// long sentence soft-wraps.

describe('battery installation analysis — SF placement and plain-text shape', () => {
  const full = () =>
    rec({
      installNotes: {
        ...emptyInstallNotes(),
        batteryBase: 'concrete-pad',
        batteryBaseNeedsWork: true,
        batteryBaseWork: 'cut the ground to fit the concrete pad\nlevel the ground',
        wallEven: false,
        batteryPushFromWall: true,
        batteryOther: '4x4 ft pad under the battery stack',
        specialCases: 'Window to be closed off',
      },
    });

  it('renders as its own underlined section inside the window blob', () => {
    expect(fieldValue(full(), 'window')).toContain(
      [
        'Battery Installation Analysis',
        '-----------------------------',
        '- The batteries will be installed on a new concrete pad.',
        '- Battery base extra work: cut the ground to fit the concrete pad; level the ground.',
        '- The supporting wall is not even — unistruts with spring nuts will be used, and additional unistruts will push the batteries further from the wall.',
        '- 4x4 ft pad under the battery stack.',
      ].join('\n'),
    );
  });

  it('sits AFTER Installation Notes and BEFORE Conduit Raceway', () => {
    const r = full();
    r.installNotes!.serviceRun = '2" PVC, 12 ft';
    const v = fieldValue(r, 'window');
    expect(v.indexOf('Installation Notes')).toBeLessThan(v.indexOf('Battery Installation Analysis'));
    expect(v.indexOf('Battery Installation Analysis')).toBeLessThan(v.indexOf('Conduit Raceway'));
  });

  it('the underline is exactly as long as its title, like the other sections', () => {
    const v = fieldValue(full(), 'window');
    const [title, rule] = v.split('\n').slice(v.split('\n').indexOf('Battery Installation Analysis'));
    expect(rule).toBe('-'.repeat(title.length));
  });

  it('every line is a plain "- " bullet — no indentation to survive SF', () => {
    const v = fieldValue(full(), 'window');
    const section = v.split('Battery Installation Analysis\n')[1].split('\n\n')[0].split('\n').slice(1);
    for (const line of section) expect(line.startsWith('- ')).toBe(true);
  });

  it('does NOT leak into the Battery and Equipment Location field', () => {
    const v = fieldValue(full(), 'batteryLocation');
    expect(v).not.toContain('concrete pad');
    expect(v).not.toContain('unistruts');
  });

  it('the section disappears entirely while no battery question is answered', () => {
    const v = fieldValue(rec({ installNotes: { ...emptyInstallNotes(), other: 'Attic run' } }), 'window');
    expect(v).not.toContain('Battery Installation Analysis');
  });

  it('the clearance boilerplate still closes the blob, after the new section', () => {
    const v = fieldValue(full(), 'window');
    expect(v.endsWith('All required clearance requirements have been met.')).toBe(true);
  });
});

// ---- Wire material check (Aboud 2026-11-11) --------------------------------
// The whole point of the feature: the SF Design Feedback field and the Slack
// post must state the SAME material, because Solrite compares the planset
// against the install evidence.

describe('wire material verdict in the SF Design Feedback field', () => {
  it('opens the field, above whatever the coordinator typed', () => {
    const v = fieldValue(
      rec({
        notes: { layout: '', siteSurvey: '', design: 'Solar tag should read PVC, not EMT', homeowner: '' },
        wire: { design: 'CU', bos: 'AL', serviceAmps: 200 },
      }),
      'design',
    );
    expect(v.split('\n')[0]).toBe(
      '- Wire material changed after the elevation review — the BOS specifies aluminum, the design ' +
        'SLD shows copper. Please update the design SLD to 4/0 AWG aluminum for the 200 A service ' +
        '(NEC Table 310.12) and re-upload it to Salesforce so the planset matches the BOS.',
    );
    expect(v).toContain('- Solar tag should read PVC, not EMT.');
  });

  it('is the entire field, with no "All good." default, when nothing was typed', () => {
    const v = fieldValue(rec({ wire: { design: 'AL', bos: 'AL' } }), 'design');
    expect(v).toBe('Wire material unchanged — the design SLD and the BOS both specify aluminum conductors.');
  });

  it('leaves the field exactly as it was when the dropdowns are unanswered', () => {
    expect(fieldValue(rec(), 'design')).toBe('All good.');
  });

  it('never leaks into any other SF field', () => {
    const fields = buildSfSubmission(rec({ wire: { design: 'CU', bos: 'AL' } }), defaultSettings());
    for (const f of fields) {
      if (f.id !== 'design') expect(f.value).not.toContain('Wire material');
    }
  });
});
