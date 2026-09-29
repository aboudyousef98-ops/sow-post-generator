import { describe, expect, it } from 'vitest';
import type { InstallNotes } from '../types';
import { conduitRunLines, emptyInstallNotes, installNoteLines, rawTextFor } from './installNotes';
import { makeRecord } from './__fixtures__/makeRecord';

const n = (over: Partial<InstallNotes> = {}): InstallNotes => ({ ...emptyInstallNotes(), ...over });
const off = { usePolished: {} };

describe('installNoteLines — walls (spec/10 §3.1)', () => {
  it('one wall with an orientation', () => {
    expect(installNoteLines(n({ walls: 1, orientations: ['North'] }), off)).toEqual([
      'Installation on one wall (North).',
    ]);
  });

  it('two walls list both orientations in order', () => {
    expect(installNoteLines(n({ walls: 2, orientations: ['North', 'West'] }), off)).toEqual([
      'Installation on two walls (North, West).',
    ]);
  });

  it('three walls with one orientation still unset skip the blank', () => {
    expect(installNoteLines(n({ walls: 3, orientations: ['North', '', 'West'] }), off)).toEqual([
      'Installation on three walls (North, West).',
    ]);
  });

  it('no orientation chosen omits the parentheses', () => {
    expect(installNoteLines(n({ walls: 2, orientations: ['', ''] }), off)).toEqual([
      'Installation on two walls.',
    ]);
  });

  it('orientations beyond the wall count are ignored', () => {
    expect(installNoteLines(n({ walls: 1, orientations: ['North', 'West'] }), off)).toEqual([
      'Installation on one wall (North).',
    ]);
  });

  it('no wall count means no wall line', () => {
    expect(installNoteLines(n({ orientations: ['North'] }), off)).toEqual([]);
  });
});

describe('installNoteLines — stories and service', () => {
  it('renders 1 and 2 stories verbatim', () => {
    expect(installNoteLines(n({ stories: 1 }), off)).toEqual(['1-story house.']);
    expect(installNoteLines(n({ stories: 2 }), off)).toEqual(['2-story house.']);
  });

  it('other uses the free text, punctuated', () => {
    expect(installNoteLines(n({ stories: 'other', storiesOther: 'Split level, garage below' }), off)).toEqual([
      'Split level, garage below.',
    ]);
  });

  it('other with no text drops the line', () => {
    expect(installNoteLines(n({ stories: 'other', storiesOther: '  ' }), off)).toEqual([]);
  });

  it('each service value gets the standard sentence', () => {
    expect(installNoteLines(n({ service: 'MPU' }), off)).toEqual(['This project requires an MPU.']);
    expect(installNoteLines(n({ service: 'FSU' }), off)).toEqual(['This project requires an FSU.']);
    expect(installNoteLines(n({ service: 'FTP' }), off)).toEqual(['This project requires an FTP.']);
  });
});

describe('installNoteLines — labelled free text', () => {
  it('joins multiple lines with "; " under one label and strips typed bullets', () => {
    expect(
      installNoteLines(n({ specialCases: 'window to be closed off.\n- small boxes relocated' }), off),
    ).toEqual(['Special cases: window to be closed off; small boxes relocated.']);
  });

  it('keeps battery and disconnect locations in spec order', () => {
    expect(
      installNoteLines(n({ batteryLocation: 'garage', mainDisconnectLocation: 'south wall' }), off),
    ).toEqual(['Battery location: garage.', 'Main disconnect location: south wall.']);
  });

  it('renders "Anything else" as unlabelled bullets, one per line', () => {
    expect(installNoteLines(n({ other: 'Attic run\nBack-to-back' }), off)).toEqual([
      'Attic run.',
      'Back-to-back.',
    ]);
  });

  it('emits the dropdown lines before the free-text lines', () => {
    const lines = installNoteLines(
      n({ walls: 1, orientations: ['North'], stories: 1, service: 'MPU', other: 'Attic run' }),
      off,
    );
    expect(lines).toEqual([
      'Installation on one wall (North).',
      '1-story house.',
      'This project requires an MPU.',
      'Attic run.',
    ]);
  });

  it('an all-empty block produces nothing', () => {
    expect(installNoteLines(n(), off)).toEqual([]);
    expect(installNoteLines(undefined, off)).toEqual([]);
  });
});

describe('installNoteLines — polish selection', () => {
  const notes = n({ specialCases: 'window closed' });

  it('uses the polished text by default', () => {
    expect(
      installNoteLines(notes, { polished: { 'install.specialCases': 'Window to be closed off' }, usePolished: {} }),
    ).toEqual(['Special cases: Window to be closed off.']);
  });

  it('an explicit false reverts to the raw draft', () => {
    expect(
      installNoteLines(notes, {
        polished: { 'install.specialCases': 'Window to be closed off' },
        usePolished: { 'install.specialCases': false },
      }),
    ).toEqual(['Special cases: window closed.']);
  });
});

describe('conduitRunLines (spec/10 §3.2)', () => {
  it('labels the four runs in order', () => {
    expect(
      conduitRunLines(
        n({ loadRun: '18 ft through the attic', serviceRun: '2" PVC, 12 ft', solarRun: 'east wall', batteryRun: '6 ft' }),
        off,
      ),
    ).toEqual([
      'Load run: 18 ft through the attic.',
      'Grid/service run: 2" PVC, 12 ft.',
      'Solar run: east wall.',
      'Battery run: 6 ft.',
    ]);
  });

  it('drops the empty runs and yields nothing when all four are empty', () => {
    expect(conduitRunLines(n({ solarRun: 'east wall' }), off)).toEqual(['Solar run: east wall.']);
    expect(conduitRunLines(n(), off)).toEqual([]);
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
