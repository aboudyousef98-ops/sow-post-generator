import { describe, expect, it } from 'vitest';
import type { InstallNotes } from '../types';
import {
  batteryAnalysisLines,
  conduitRunLines,
  disconnectDurationFor,
  emptyInstallNotes,
  installNoteLines,
  needsRoofConduitRework,
  rawTextFor,
} from './installNotes';
import { makeRecord } from './__fixtures__/makeRecord';

const n = (over: Partial<InstallNotes> = {}): InstallNotes => ({ ...emptyInstallNotes(), ...over });
const off = { usePolished: {} };

// Every post carries the derived duration line (meeting 2026-10-05: the
// designer picks the SITUATION — services/utility — and the hours follow).
const DUR_12 = 'Expected power disconnect duration: 1–2 hours.';
const DUR_46 = 'Expected power disconnect duration: 4–6 hours.';

describe('disconnectDurationFor (meeting 2026-10-05 — derived, never picked)', () => {
  it('MPU or FSU → 4–6 hours', () => {
    expect(disconnectDurationFor(n({ services: ['MPU'] }))).toBe('4-6');
    expect(disconnectDurationFor(n({ services: ['FSU', 'FTP'] }))).toBe('4-6');
  });

  it('a TNMP utility → 4–6 hours even with no service work', () => {
    expect(disconnectDurationFor(n(), 'TNMP')).toBe('4-6');
    expect(disconnectDurationFor(n(), 'Texas-New Mexico Power')).toBe('4-6');
  });

  it('everything else → 1–2 hours (all projects are Duracell systems)', () => {
    expect(disconnectDurationFor(n())).toBe('1-2');
    expect(disconnectDurationFor(n({ services: ['FTP'] }), 'CenterPoint')).toBe('1-2');
  });

  it('the legacy single `service` counts too', () => {
    expect(disconnectDurationFor(n({ service: 'MPU' }))).toBe('4-6');
  });
});

describe('installNoteLines — walls (spec/10 §3.1)', () => {
  it('one wall with an orientation', () => {
    expect(installNoteLines(n({ walls: 1, orientations: ['North'] }), off)).toEqual([
      'Installation on one wall (North).',
      DUR_12,
    ]);
  });

  it('two walls list both orientations in order', () => {
    expect(installNoteLines(n({ walls: 2, orientations: ['North', 'West'] }), off)).toEqual([
      'Installation on two walls (North, West).',
      DUR_12,
    ]);
  });

  it('three walls with one orientation still unset skip the blank', () => {
    expect(installNoteLines(n({ walls: 3, orientations: ['North', '', 'West'] }), off)).toEqual([
      'Installation on three walls (North, West).',
      DUR_12,
    ]);
  });

  it('no orientation chosen omits the parentheses', () => {
    expect(installNoteLines(n({ walls: 2, orientations: ['', ''] }), off)).toEqual([
      'Installation on two walls.',
      DUR_12,
    ]);
  });

  it('orientations beyond the wall count are ignored', () => {
    expect(installNoteLines(n({ walls: 1, orientations: ['North', 'West'] }), off)).toEqual([
      'Installation on one wall (North).',
      DUR_12,
    ]);
  });

  it('supports four and five walls (meeting 2026-10-04)', () => {
    expect(installNoteLines(n({ walls: 4, orientations: ['North', 'East', 'South', 'West'] }), off)).toEqual([
      'Installation on four walls (North, East, South, West).',
      DUR_12,
    ]);
    expect(installNoteLines(n({ walls: 5, orientations: [] }), off)).toEqual([
      'Installation on five walls.',
      DUR_12,
    ]);
  });

  it('no wall count means no wall line', () => {
    expect(installNoteLines(n({ orientations: ['North'] }), off)).toEqual([DUR_12]);
  });
});

describe('installNoteLines — stories and service', () => {
  it('renders 1, 2 and 3 stories verbatim', () => {
    expect(installNoteLines(n({ stories: 1 }), off)).toEqual(['1-story house.', DUR_12]);
    expect(installNoteLines(n({ stories: 2 }), off)).toEqual(['2-story house.', DUR_12]);
    expect(installNoteLines(n({ stories: 3 }), off)).toEqual(['3-story house.', DUR_12]);
  });

  it('other uses the free text, punctuated', () => {
    expect(installNoteLines(n({ stories: 'other', storiesOther: 'Split level, garage below' }), off)).toEqual([
      'Split level, garage below.',
      DUR_12,
    ]);
  });

  it('other with no text drops the line', () => {
    expect(installNoteLines(n({ stories: 'other', storiesOther: '  ' }), off)).toEqual([DUR_12]);
  });

  it('each single service gets the standard sentence (MPU/FSU pull the duration to 4–6)', () => {
    expect(installNoteLines(n({ services: ['MPU'] }), off)).toEqual([
      'This project requires an MPU.',
      DUR_46,
    ]);
    expect(installNoteLines(n({ services: ['FSU'] }), off)).toEqual([
      'This project requires an FSU.',
      DUR_46,
    ]);
    expect(installNoteLines(n({ services: ['FTP'] }), off)).toEqual([
      'This project requires an FTP.',
      DUR_12,
    ]);
  });

  it('multiple ticked services share one sentence, in MPU/FSU/FTP order (meeting 2026-10-04)', () => {
    expect(installNoteLines(n({ services: ['FSU', 'MPU'] }), off)).toEqual([
      'This project requires an MPU and an FSU.',
      DUR_46,
    ]);
    expect(installNoteLines(n({ services: ['FTP', 'FSU', 'MPU'] }), off)).toEqual([
      'This project requires an MPU, an FSU and an FTP.',
      DUR_46,
    ]);
  });

  it('a legacy single `service` still renders when `services` is absent', () => {
    expect(installNoteLines(n({ service: 'FSU' }), off)).toEqual([
      'This project requires an FSU.',
      DUR_46,
    ]);
  });

  it('an empty services array with a legacy value falls back to the legacy value', () => {
    // JSON can hold services: [] from an un-ticked session; the old pick must survive.
    expect(installNoteLines(n({ services: [], service: 'MPU' }), off)).toEqual([
      'This project requires an MPU.',
      DUR_46,
    ]);
  });

  it('a TNMP utility flips the rendered duration to 4–6 hours', () => {
    expect(installNoteLines(n(), off, 'TNMP')).toEqual([DUR_46]);
  });

  it('a manual duration override beats the derived value (revision 2026-10-05)', () => {
    // MPU would derive 4–6, but the designer pinned 1–2.
    expect(installNoteLines(n({ services: ['MPU'], disconnectDuration: '1-2' }), off)).toEqual([
      'This project requires an MPU.',
      DUR_12,
    ]);
    // Nothing ticked would derive 1–2, but the designer pinned 4–6.
    expect(installNoteLines(n({ disconnectDuration: '4-6' }), off)).toEqual([DUR_46]);
  });
});

describe('installNoteLines — roof rating (Roof Rating System, design-sow-team 2026-09-24)', () => {
  it('renders each band with its outcome', () => {
    expect(installNoteLines(n({ roofRating: 10 }), off)).toEqual([
      DUR_12,
      'Roof rating: 10/10 (Prime) — approved to install right away.',
    ]);
    expect(installNoteLines(n({ roofRating: 8 }), off)).toEqual([
      DUR_12,
      'Roof rating: 8/10 (Good) — workable with small adjustments.',
    ]);
    expect(installNoteLines(n({ roofRating: 5 }), off)).toEqual([
      DUR_12,
      'Roof rating: 5/10 (Conditional) — strongly recommend replacing the roof first.',
    ]);
    expect(installNoteLines(n({ roofRating: 3 }), off)).toEqual([
      DUR_12,
      'Roof rating: 3/10 (Poor) — the roof must be repaired or replaced before mounting.',
    ]);
    expect(installNoteLines(n({ roofRating: 1 }), off)).toEqual([
      DUR_12,
      'Roof rating: 1/10 (Unviable) — do not install.',
    ]);
  });

  it('no rating chosen → no roof line', () => {
    expect(installNoteLines(n(), off)).toEqual([DUR_12]);
  });
});

describe('installNoteLines — roof material (Aboud 2026-10-27)', () => {
  it('renders each picked material with its display label', () => {
    expect(installNoteLines(n({ roofMaterial: 'shingle' }), off)).toEqual([DUR_12, 'Roof material: Shingle.']);
    expect(installNoteLines(n({ roofMaterial: 'metal' }), off)).toEqual([DUR_12, 'Roof material: Metal.']);
    expect(installNoteLines(n({ roofMaterial: 'clay-tile' }), off)).toEqual([DUR_12, 'Roof material: Clay tile.']);
    expect(installNoteLines(n({ roofMaterial: 'tile' }), off)).toEqual([DUR_12, 'Roof material: Tile.']);
  });

  it('others uses the free text', () => {
    expect(installNoteLines(n({ roofMaterial: 'other', roofMaterialOther: 'Flat TPO membrane' }), off)).toEqual([
      DUR_12,
      'Roof material: Flat TPO membrane.',
    ]);
  });

  it('others with no text drops the line; no material chosen → no line', () => {
    expect(installNoteLines(n({ roofMaterial: 'other', roofMaterialOther: '  ' }), off)).toEqual([DUR_12]);
    expect(installNoteLines(n({ roofMaterial: 'other' }), off)).toEqual([DUR_12]);
    expect(installNoteLines(n(), off)).toEqual([DUR_12]);
  });

  it('renders after the roof rating line', () => {
    expect(installNoteLines(n({ roofRating: 8, roofMaterial: 'metal' }), off)).toEqual([
      DUR_12,
      'Roof rating: 8/10 (Good) — workable with small adjustments.',
      'Roof material: Metal.',
    ]);
  });

  it('needsRoofConduitRework flags metal and clay tile only', () => {
    expect(needsRoofConduitRework(n({ roofMaterial: 'metal' }))).toBe(true);
    expect(needsRoofConduitRework(n({ roofMaterial: 'clay-tile' }))).toBe(true);
    expect(needsRoofConduitRework(n({ roofMaterial: 'shingle' }))).toBe(false);
    expect(needsRoofConduitRework(n({ roofMaterial: 'tile' }))).toBe(false);
    expect(needsRoofConduitRework(n({ roofMaterial: 'other', roofMaterialOther: 'metal-ish' }))).toBe(false);
    expect(needsRoofConduitRework(n())).toBe(false);
    expect(needsRoofConduitRework(undefined)).toBe(false);
  });
});

describe('installNoteLines — labelled free text', () => {
  it('joins multiple lines with "; " under one label and strips typed bullets', () => {
    expect(
      installNoteLines(n({ specialCases: 'window to be closed off.\n- small boxes relocated' }), off),
    ).toEqual([DUR_12, 'Special cases: window to be closed off; small boxes relocated.']);
  });

  it('strips a trailing question mark so it does not double up with the label period (carried fix 2)', () => {
    // clause() must strip "?" (not just ".;,") before the label's own "." is
    // appended, else this would render "Special cases: Is this ok?.".
    expect(installNoteLines(n({ specialCases: 'Is this ok?' }), off)).toEqual([
      DUR_12,
      'Special cases: Is this ok.',
    ]);
  });

  it('renders battery location but no longer renders main disconnect location (removed, meeting 2026-10-04)', () => {
    expect(
      installNoteLines(n({ batteryLocation: 'garage', mainDisconnectLocation: 'south wall' }), off),
    ).toEqual([DUR_12, 'Battery location: garage.']);
  });

  it('renders "Anything else" as unlabelled bullets, one per line', () => {
    expect(installNoteLines(n({ other: 'Attic run\nBack-to-back' }), off)).toEqual([
      DUR_12,
      'Attic run.',
      'Back-to-back.',
    ]);
  });

  it('emits the dropdown lines before the free-text lines', () => {
    const lines = installNoteLines(
      n({
        walls: 1,
        orientations: ['North'],
        stories: 1,
        services: ['MPU'],
        roofRating: 8,
        other: 'Attic run',
      }),
      off,
    );
    expect(lines).toEqual([
      'Installation on one wall (North).',
      '1-story house.',
      'This project requires an MPU.',
      DUR_46,
      'Roof rating: 8/10 (Good) — workable with small adjustments.',
      'Attic run.',
    ]);
  });

  it('a block with nothing chosen still carries the automatic duration; no notes at all yields nothing', () => {
    expect(installNoteLines(n(), off)).toEqual([DUR_12]);
    expect(installNoteLines(undefined, off)).toEqual([]);
  });
});

describe('installNoteLines — 2026-10-27 audit: order, walls omit', () => {
  it('special cases renders BELOW "anything else"', () => {
    expect(installNoteLines(n({ other: 'Attic run', specialCases: 'Window closed off' }), off)).toEqual([
      DUR_12,
      'Attic run.',
      'Special cases: Window closed off.',
    ]);
  });

  it("omit 'walls' drops the walls sentence (it lives in the SF Battery and Equipment Location field)", () => {
    const notes = n({ walls: 2, orientations: ['North', 'West'] });
    expect(installNoteLines(notes, off, undefined, ['walls'])).toEqual([DUR_12]);
    expect(installNoteLines(notes, off)).toEqual(['Installation on two walls (North, West).', DUR_12]);
  });
});

describe('installNoteLines — polish selection', () => {
  const notes = n({ specialCases: 'window closed' });

  it('uses the polished text by default', () => {
    expect(
      installNoteLines(notes, { polished: { 'install.specialCases': 'Window to be closed off' }, usePolished: {} }),
    ).toEqual([DUR_12, 'Special cases: Window to be closed off.']);
  });

  it('an explicit false reverts to the raw draft', () => {
    expect(
      installNoteLines(notes, {
        polished: { 'install.specialCases': 'Window to be closed off' },
        usePolished: { 'install.specialCases': false },
      }),
    ).toEqual([DUR_12, 'Special cases: window closed.']);
  });
});

describe('conduitRunLines (spec/10 §3.2)', () => {
  // Order fixed by Aboud, 2026-09-30: grid/service, load, solar, battery.
  it('labels the four runs in the order the crew runs them', () => {
    expect(
      conduitRunLines(
        n({ loadRun: '18 ft through the attic', serviceRun: '2" PVC, 12 ft', solarRun: 'east wall', batteryRun: '6 ft' }),
        off,
      ),
    ).toEqual([
      { label: 'Grid/service run', text: '2" PVC, 12 ft.', sub: [] },
      { label: 'Load run', text: '18 ft through the attic.', sub: [] },
      { label: 'Solar run', text: 'east wall.', sub: [] },
      { label: 'Battery run', text: '6 ft.', sub: [] },
    ]);
  });

  it('drops the empty runs and yields nothing when all four are empty', () => {
    expect(conduitRunLines(n({ solarRun: 'east wall' }), off)).toEqual([
      { label: 'Solar run', text: 'east wall.', sub: [] },
    ]);
    expect(conduitRunLines(n(), off)).toEqual([]);
  });

  it('a run written as several lines keeps them as its own points', () => {
    expect(conduitRunLines(n({ loadRun: '2" PVC from the meter\ntwo 90° bends' }), off)).toEqual([
      { label: 'Load run', text: '', sub: ['2" PVC from the meter.', 'Two 90° bends.'] },
    ]);
  });
});

describe('rawTextFor', () => {
  it('reads feedback notes and install boxes through one key space', () => {
    const r = makeRecord({
      notes: { layout: '', siteSurvey: 'survey text', design: '', homeowner: '' },
      installNotes: n({ loadRun: '18 ft' }),
    });
    expect(rawTextFor(r, 'siteSurvey')).toBe('survey text');
    expect(rawTextFor(r, 'install.loadRun')).toBe('18 ft');
    expect(rawTextFor(r, 'install.solarRun')).toBe('');
  });

  it('returns empty string when the record has no installNotes yet', () => {
    expect(rawTextFor(makeRecord({ installNotes: undefined }), 'install.loadRun')).toBe('');
  });
});

// ---- Battery installation analysis (Aboud 2026-11-03) ----------------------
// Replaces the retired `concretePad` box. Two required dropdown groups — the
// battery base and the supporting wall — plus a free "anything else" box, all
// rendered as one block of its own under Installation Notes.

describe('batteryAnalysisLines — battery base', () => {
  it('a concrete pad needing no extra work says so explicitly', () => {
    expect(batteryAnalysisLines(n({ batteryBase: 'concrete-pad', batteryBaseNeedsWork: false }), off)).toEqual([
      'The batteries will be installed on a new concrete pad.',
      'No additional ground work is required for the battery base.',
    ]);
  });

  it('a concrete pad needing extra work labels the work instead', () => {
    expect(
      batteryAnalysisLines(
        n({
          batteryBase: 'concrete-pad',
          batteryBaseNeedsWork: true,
          batteryBaseWork: 'cut the ground to fit the concrete pad\nlevel the ground',
        }),
        off,
      ),
    ).toEqual([
      'The batteries will be installed on a new concrete pad.',
      'Battery base extra work: cut the ground to fit the concrete pad; level the ground.',
    ]);
  });

  it('extra work ticked but not yet described drops the work line, keeping the pad line', () => {
    expect(
      batteryAnalysisLines(
        n({ batteryBase: 'concrete-pad', batteryBaseNeedsWork: true, batteryBaseWork: '  ' }),
        off,
      ),
    ).toEqual(['The batteries will be installed on a new concrete pad.']);
  });

  it('an unanswered extra-work question prints the pad line alone', () => {
    expect(batteryAnalysisLines(n({ batteryBase: 'concrete-pad' }), off)).toEqual([
      'The batteries will be installed on a new concrete pad.',
    ]);
  });

  it('wall mount prints the elevation inside the sentence', () => {
    expect(
      batteryAnalysisLines(n({ batteryBase: 'wall-mount', batteryElevation: '48 in above the garage floor' }), off),
    ).toEqual(['The batteries will be wall-mounted at an elevation of 48 in above the garage floor.']);
  });

  it('wall mount with no elevation yet still states the mount', () => {
    expect(batteryAnalysisLines(n({ batteryBase: 'wall-mount' }), off)).toEqual([
      'The batteries will be wall-mounted.',
    ]);
  });

  it('existing ground joins the description after an em dash', () => {
    expect(
      batteryAnalysisLines(
        n({ batteryBase: 'existing-ground', batteryGround: 'inside the garage on concrete ground' }),
        off,
      ),
    ).toEqual(['The batteries will be installed on the existing ground — inside the garage on concrete ground.']);
  });

  it('existing ground with no description yet still states the ground', () => {
    expect(batteryAnalysisLines(n({ batteryBase: 'existing-ground' }), off)).toEqual([
      'The batteries will be installed on the existing ground.',
    ]);
  });

  it('several description lines join with "; " into the one sentence', () => {
    expect(
      batteryAnalysisLines(
        n({ batteryBase: 'existing-ground', batteryGround: 'concrete ground\nslopes slightly east' }),
        off,
      ),
    ).toEqual(['The batteries will be installed on the existing ground — concrete ground; slopes slightly east.']);
  });

  it('no base chosen and no notes at all yield nothing', () => {
    expect(batteryAnalysisLines(n(), off)).toEqual([]);
    expect(batteryAnalysisLines(undefined, off)).toEqual([]);
  });
});

describe('batteryAnalysisLines — wall support', () => {
  it('an even wall is supported normally', () => {
    expect(batteryAnalysisLines(n({ wallEven: true, batteryPushFromWall: false }), off)).toEqual([
      'The supporting wall is even — the batteries installation will be wall supported normally.',
    ]);
  });

  it('an even wall that must be pushed out adds the unistrut line', () => {
    expect(batteryAnalysisLines(n({ wallEven: true, batteryPushFromWall: true }), off)).toEqual([
      'The supporting wall is even — the batteries installation will be wall supported normally.',
      'Unistruts will be used to push the batteries further from the wall.',
    ]);
  });

  it('an uneven wall calls for unistruts with spring nuts', () => {
    expect(batteryAnalysisLines(n({ wallEven: false, batteryPushFromWall: false }), off)).toEqual([
      'The supporting wall is not even — unistruts with spring nuts will be used to support the batteries.',
    ]);
  });

  it('an uneven wall that must also be pushed out reads as ONE sentence, not two unistrut lines', () => {
    expect(batteryAnalysisLines(n({ wallEven: false, batteryPushFromWall: true }), off)).toEqual([
      'The supporting wall is not even — unistruts with spring nuts will be used, and additional unistruts will push the batteries further from the wall.',
    ]);
  });

  it('push = No prints nothing of its own', () => {
    expect(batteryAnalysisLines(n({ batteryPushFromWall: false }), off)).toEqual([]);
  });

  it('push = Yes before the evenness question is answered still prints', () => {
    expect(batteryAnalysisLines(n({ batteryPushFromWall: true }), off)).toEqual([
      'Unistruts will be used to push the batteries further from the wall.',
    ]);
  });
});

describe('batteryAnalysisLines — anything else, order and polish', () => {
  it('the free box renders unlabelled, one bullet per line, LAST', () => {
    expect(
      batteryAnalysisLines(
        n({
          batteryBase: 'concrete-pad',
          batteryBaseNeedsWork: false,
          wallEven: true,
          batteryPushFromWall: false,
          // Printed exactly as typed, like the main "Anything else" box — the
          // designer's own wording and capitalisation survive.
          batteryOther: '4x4 ft pad under the battery stack\nHomeowner to clear the shelving',
        }),
        off,
      ),
    ).toEqual([
      'The batteries will be installed on a new concrete pad.',
      'No additional ground work is required for the battery base.',
      'The supporting wall is even — the batteries installation will be wall supported normally.',
      '4x4 ft pad under the battery stack.',
      'Homeowner to clear the shelving.',
    ]);
  });

  it('uses the polished text for the work box when one is enabled', () => {
    const notes = n({ batteryBase: 'concrete-pad', batteryBaseNeedsWork: true, batteryBaseWork: 'cut ground' });
    const on = { usePolished: {}, polished: { 'install.batteryBaseWork': 'saw-cut the slab to fit the pad' } };
    expect(batteryAnalysisLines(notes, on)).toEqual([
      'The batteries will be installed on a new concrete pad.',
      'Battery base extra work: saw-cut the slab to fit the pad.',
    ]);
  });

  it('a pre-2026-11-03 record with none of the battery keys yields nothing', () => {
    const notes = n();
    const keys = [
      'batteryBase',
      'batteryBaseNeedsWork',
      'batteryBaseWork',
      'batteryElevation',
      'batteryGround',
      'wallEven',
      'batteryPushFromWall',
      'batteryOther',
    ];
    for (const k of keys) delete (notes as unknown as Record<string, unknown>)[k];
    expect(batteryAnalysisLines(notes, off)).toEqual([]);
  });
});

describe('installNoteLines — the retired concrete pad box (Aboud 2026-11-03)', () => {
  it('no longer prints a "Concrete pads will be installed …" line', () => {
    const notes = n({ other: 'Attic run' });
    (notes as unknown as Record<string, unknown>).concretePad = 'On the east side';
    expect(installNoteLines(notes, off)).toEqual([DUR_12, 'Attic run.']);
  });

  it('does not print battery-analysis lines either — they are their own block', () => {
    expect(installNoteLines(n({ batteryBase: 'wall-mount', batteryElevation: '48 in' }), off)).toEqual([DUR_12]);
  });
});
