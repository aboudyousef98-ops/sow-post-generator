import { describe, expect, it } from 'vitest';
import type { BoardProject } from '../board/types';
import type { PostRecord } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { POLISH_KEYS, emptyInstallNotes } from './installNotes';
import { defaultSettings } from './storage';
import {
  buildPostHtml,
  buildPostText,
  finalTags,
  missingRequired,
  regionLine,
  titleBlockFields,
  titleBlockRegion,
  titleBlockTsv,
} from './template';

function norcaRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return makeRecord(overrides);
}


// Expected output — spec/06 §2 revised per Aboud (2026-09-26): bullets instead
// of numbers, Jurisdiction + Site Address as their own lines, empty lines dropped.
const NORCA_EXPECTED = `Hello Team,
Kindly find attached the elevation drawing and BOS for Norca Garcia.
Please take the following notes into consideration:
• *Installation Date & Day:* Thursday, 10/01/2026.
• *Region:* HOU.
• *Jurisdiction:* Pasadena.
• *Site Address:* 1317 Skylark Rd, Pasadena, TX 77502.
• *Project Classification:*
    ◦ Level 1 – Standard Installation.
    ◦ Planning window: 1 crew-day.
• *Installation Notes:* Expected power disconnect duration: 1–2 hours.
• *Clearance:* All required clearance requirements have been met.
• *Site Survey Feedback:* All good.
• *Design Feedback:* All good.
• *Homeowner Feedback:* No feedback.
@Tarek Abu Hseini @Mohammed Azizi @Diego Banegas`;

describe('buildPostText', () => {
  it('produces the canonical Norca Garcia example verbatim', () => {
    expect(buildPostText(norcaRecord(), defaultSettings())).toBe(NORCA_EXPECTED);
  });

  it('uses polished text when present and enabled, raw when reverted', () => {
    const rec = norcaRecord({
      notes: { layout: 'raw layout', siteSurvey: 'raw survey', design: '', homeowner: '' },
      polished: { siteSurvey: 'Polished survey' },
    });
    expect(buildPostText(rec, defaultSettings())).toContain('*Site Survey Feedback:* Polished survey.');
    rec.usePolished.siteSurvey = false;
    expect(buildPostText(rec, defaultSettings())).toContain('*Site Survey Feedback:* raw survey.');
  });

  it('adds terminal punctuation to notes', () => {
    const rec = norcaRecord({
      installNotes: { ...emptyInstallNotes(), other: 'Attic run' },
    });
    expect(buildPostText(rec, defaultSettings())).toContain('◦ Attic run.');
  });

  it('OTHER region prints the raw region text', () => {
    const rec = norcaRecord();
    rec.sf.region = 'OTHER';
    rec.sf.installRegionRaw = 'San Antonio';
    rec.sf.jurisdiction = undefined;
    expect(regionLine(rec)).toBe('San Antonio');
  });

  it('region line is just the code (jurisdiction has its own line)', () => {
    expect(regionLine(norcaRecord())).toBe('HOU');
  });

  it('OTHER region with resolved metro prints "– Near HOU/DFW"', () => {
    const rec = norcaRecord();
    rec.sf.region = 'OTHER';
    rec.sf.installRegionRaw = 'Corpus Christi';
    rec.sf.nearMetro = 'HOU';
    expect(regionLine(rec)).toBe('Corpus Christi – Near HOU');
    rec.sf.nearMetro = 'DFW';
    expect(regionLine(rec)).toBe('Corpus Christi – Near DFW');
  });

  // Aboud, 2026-09-28: the post prints the Salesforce region text with the
  // metro tag beside it on EVERY project, not just unrecognized ones.
  it('recognized regions print the SF text + "– Near HOU/DFW"', () => {
    const rec = norcaRecord();
    rec.sf.installRegionRaw = 'Houston / Beaumont';
    expect(regionLine(rec)).toBe('Houston / Beaumont – Near HOU');
    expect(buildPostText(rec, defaultSettings())).toContain(
      '*Region:* Houston / Beaumont – Near HOU.',
    );
    rec.sf.region = 'DFW';
    rec.sf.installRegionRaw = 'Dallas / Fort Worth';
    expect(regionLine(rec)).toBe('Dallas / Fort Worth – Near DFW');
  });

  it('never prints a redundant "HOU – Near HOU" when Salesforce text is absent', () => {
    const rec = norcaRecord(); // manual entry: no installRegionRaw
    expect(regionLine(rec)).toBe('HOU');
  });

  it('drops empty bullets entirely (missing jurisdiction); Installation Notes keeps its automatic duration', () => {
    const rec = norcaRecord();
    rec.sf.jurisdiction = undefined;
    const text = buildPostText(rec, defaultSettings());
    expect(text).toContain('*Installation Notes:* Expected power disconnect duration: 1–2 hours.');
    expect(text).not.toContain('*Jurisdiction:*');
    // Defaults still fill the feedback bullets.
    expect(text).toContain('*Site Survey Feedback:* All good.');
  });
});

describe('missingRequired', () => {
  it('empty when the major fields are filled', () => {
    expect(missingRequired(norcaRecord())).toEqual([]);
  });

  it('lists every missing major field', () => {
    const rec = norcaRecord();
    rec.sf.customerName = '';
    rec.sf.installScheduledDate = '';
    rec.sf.jurisdiction = undefined;
    rec.sf.siteAddress = ' ';
    expect(missingRequired(rec)).toEqual([
      'Customer name',
      'Jurisdiction',
      'Site address',
    ]);
  });

  it('requires the region text for OTHER regions', () => {
    const rec = norcaRecord();
    rec.sf.region = 'OTHER';
    rec.sf.installRegionRaw = undefined;
    expect(missingRequired(rec)).toContain('Region text');
  });
});

describe('missingRequired (spec/10 §1)', () => {
  it('does not require an install date', () => {
    const r = norcaRecord({
      sf: { ...norcaRecord().sf, installScheduledDate: '' },
    });
    expect(missingRequired(r)).toEqual([]);
  });

  it('still requires customer, jurisdiction and address', () => {
    const r = norcaRecord({
      sf: { ...norcaRecord().sf, customerName: '', jurisdiction: '', siteAddress: '' },
    });
    expect(missingRequired(r)).toEqual(['Customer name', 'Jurisdiction', 'Site address']);
  });
});

describe('finalTags', () => {
  it('appends the designer and dedupes case-insensitively', () => {
    const rec = norcaRecord({ designerTag: 'Khaled Mattar' });
    expect(finalTags(rec)).toEqual([
      'Tarek Abu Hseini',
      'Mohammed Azizi',
      'Diego Banegas',
      'Khaled Mattar',
    ]);
    rec.tags.push('khaled mattar');
    expect(finalTags(rec).filter((t) => t.toLowerCase() === 'khaled mattar')).toHaveLength(1);
  });

  it('appends the CLR agent and project manager after the designer (meeting 2026-10-04)', () => {
    const rec = norcaRecord({
      designerTag: 'Khaled Mattar',
      clrAgentTag: 'Adam Hallett',
      pmTag: 'Mirna Jamalieh',
    });
    expect(finalTags(rec)).toEqual([
      'Tarek Abu Hseini',
      'Mohammed Azizi',
      'Diego Banegas',
      'Khaled Mattar',
      'Adam Hallett',
      'Mirna Jamalieh',
    ]);
  });
});

describe('buildPostHtml', () => {
  it('renders <ul> bullets with <strong> labels and plain tags', () => {
    const html = buildPostHtml(norcaRecord(), defaultSettings());
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><strong>Installation Date &amp; Day:</strong> Thursday, 10/01/2026.</li>');
    expect(html).toContain('<li><strong>Site Address:</strong> 1317 Skylark Rd, Pasadena, TX 77502.</li>');
    expect(html).toContain('<p>@Tarek Abu Hseini @Mohammed Azizi @Diego Banegas</p>');
    // 9 single-value bullets (incl. the automatic disconnect-duration note) +
    // Project Classification, which is a parent <li> wrapping two nested ones
    // (level, planning window) — spec/10 §12.1.
    expect(html.match(/<li>/g)).toHaveLength(12);
  });

  it('escapes HTML in user text', () => {
    const rec = norcaRecord({
      installNotes: { ...emptyInstallNotes(), other: 'Run <20 ft & short' },
    });
    expect(buildPostHtml(rec, defaultSettings())).toContain('Run &lt;20 ft &amp; short.');
  });
});

// ---- Phase 5: AHJ requirements section -------------------------------------

import type { Ahj } from '../types';

const ccAhj: Ahj = {
  id: 'cc',
  name: 'Corpus Christi',
  aliases: ['City of Corpus Christi'],
  posts: [
    {
      id: 'p1',
      text: 'Use Square D for the AC Disconnect.\nIt is physically big — plan enclosure space.',
      by: 'Aboud Yousef',
      at: '2026-09-18T00:00:00.000Z',
      history: [],
      pinned: false,
      updatedAt: '2026-09-18T00:00:00.000Z',
    },
    {
      id: 'p2',
      text: 'Deleted rule.',
      by: 'Omar Rajab',
      at: '2026-09-19T00:00:00.000Z',
      history: [],
      pinned: false,
      deleted: { at: '2026-09-20T00:00:00.000Z', by: 'Omar Rajab' },
      updatedAt: '2026-09-20T00:00:00.000Z',
    },
  ],
  updatedAt: '2026-09-18T00:00:00.000Z',
  schemaVersion: 1,
};

describe('AHJ requirements in the post', () => {
  it('is absent without the designer approval, even when the AHJ matches', () => {
    const rec = norcaRecord();
    rec.sf.jurisdiction = 'Corpus Christi';
    expect(buildPostText(rec, defaultSettings(), [ccAhj])).not.toContain('AHJ Requirements');
  });

  it('is absent when approved but no AHJ matches', () => {
    const rec = norcaRecord({ ahjApprovedId: 'cc' }); // jurisdiction stays Pasadena
    expect(buildPostText(rec, defaultSettings(), [ccAhj])).not.toContain('AHJ Requirements');
  });

  it('is absent when the matched AHJ differs from the approved one', () => {
    const rec = norcaRecord({ ahjApprovedId: 'some-other-ahj' });
    rec.sf.jurisdiction = 'Corpus Christi';
    expect(buildPostText(rec, defaultSettings(), [ccAhj])).not.toContain('AHJ Requirements');
  });

  it('appends the matched AHJ posts (alias match, multi-line indented, deleted posts skipped) before the tags', () => {
    const rec = norcaRecord({ ahjApprovedId: 'cc' });
    rec.sf.jurisdiction = 'City of Corpus Christi';
    const text = buildPostText(rec, defaultSettings(), [ccAhj]);
    expect(text).toContain(
      '*AHJ Requirements (Corpus Christi):*\n• Use Square D for the AC Disconnect.\n   It is physically big — plan enclosure space.',
    );
    expect(text).not.toContain('Deleted rule');
    // Tags (@mentions) stay the last line so Slack pings still work.
    expect(text.trim().split('\n').at(-1)).toContain('@Tarek Abu Hseini');
  });

  it('appears in the rich-text HTML clipboard version too', () => {
    const rec = norcaRecord({ ahjApprovedId: 'cc' });
    rec.sf.jurisdiction = 'Corpus Christi';
    const html = buildPostHtml(rec, defaultSettings(), [ccAhj]);
    expect(html).toContain('AHJ Requirements (Corpus Christi):');
    expect(html).toContain('Use Square D for the AC Disconnect.');
  });
});

// ---- Bulleted notes (Aboud, 2026-09-28) ------------------------------------
// The team writes the four feedback notes as bullet points, one per line. One
// source line = one bullet, in the same order; a single-line note stays inline.

describe('multi-line notes render as sub-bullets', () => {
  const multi = () =>
    norcaRecord({
      notes: {
        layout: '',
        siteSurvey: '',
        design: 'Solar tag should read PVC, not EMT\nElevation shows an expansion unit missing from the one-line',
        homeowner: '',
      },
    });

  it('keeps a single-line note inline after its label', () => {
    const rec = norcaRecord({
      notes: { layout: '', siteSurvey: 'Standard exterior placement.', design: '', homeowner: '' },
    });
    expect(buildPostText(rec, defaultSettings())).toContain(
      '• *Site Survey Feedback:* Standard exterior placement.',
    );
  });

  it('puts each line of a multi-line note on its own sub-bullet', () => {
    expect(buildPostText(multi(), defaultSettings())).toContain(
      '• *Design Feedback:*\n    ◦ Solar tag should read PVC, not EMT.\n    ◦ Elevation shows an expansion unit missing from the one-line.',
    );
  });

  it('drops blank lines and strips bullet characters the user typed', () => {
    const rec = norcaRecord({
      notes: { layout: '', siteSurvey: '- First point\n\n• Second point\n   \n* Third point', design: '', homeowner: '' },
    });
    const text = buildPostText(rec, defaultSettings());
    expect(text).toContain(
      '• *Site Survey Feedback:*\n    ◦ First point.\n    ◦ Second point.\n    ◦ Third point.',
    );
    expect(text).not.toContain('◦ - First');
    expect(text).not.toContain('◦ • Second');
  });

  it('nests a <ul> inside the <li> for the rich-text clipboard version', () => {
    const html = buildPostHtml(multi(), defaultSettings());
    expect(html).toContain(
      '<li><strong>Design Feedback:</strong><ul><li>Solar tag should read PVC, not EMT.</li><li>Elevation shows an expansion unit missing from the one-line.</li></ul></li>',
    );
  });

  it('polished multi-line text bullets the same way as the raw draft', () => {
    const rec = norcaRecord({
      notes: { layout: '', siteSurvey: '', design: 'tag wrong\nunit missing', homeowner: '' },
      polished: { design: 'The solar tag is incorrect.\nThe expansion unit is missing.' },
    });
    expect(buildPostText(rec, defaultSettings())).toContain(
      '• *Design Feedback:*\n    ◦ The solar tag is incorrect.\n    ◦ The expansion unit is missing.',
    );
  });
});

// ---- AutoCAD title block (Aboud, 2026-09-28) -------------------------------

describe('AutoCAD title block', () => {
  it('maps the five title-block cells from the record', () => {
    const rec = norcaRecord();
    rec.sf.installRegionRaw = 'Houston / Beaumont';
    expect(titleBlockFields(rec)).toEqual([
      { label: 'Project Name', value: 'Norca Garcia' },
      { label: 'Property Address', value: '1317 Skylark Rd, Pasadena, TX 77502' },
      { label: 'Region', value: 'Houston / Beaumont' },
      { label: 'AHJ', value: 'Pasadena' },
      { label: 'SOW Coordinator', value: 'Aboud Yousef' },
    ]);
  });

  it('uses the SF region text with no "Near" suffix, unlike the post', () => {
    const rec = norcaRecord();
    rec.sf.region = 'OTHER';
    rec.sf.installRegionRaw = 'Corpus Christi';
    rec.sf.nearMetro = 'HOU';
    expect(regionLine(rec)).toBe('Corpus Christi – Near HOU');
    expect(titleBlockRegion(rec)).toBe('Corpus Christi');
  });

  it('falls back to the region code when Salesforce text is absent', () => {
    expect(titleBlockRegion(norcaRecord())).toBe('HOU');
  });

  it('builds a one-value-per-line block for the multi-cell paste', () => {
    const rec = norcaRecord();
    rec.sf.installRegionRaw = 'Houston / Beaumont';
    expect(titleBlockTsv(rec)).toBe(
      'Norca Garcia\n1317 Skylark Rd, Pasadena, TX 77502\nHouston / Beaumont\nPasadena\nAboud Yousef',
    );
  });

  it('leaves a missing field as an empty cell rather than a dash', () => {
    const rec = norcaRecord();
    rec.sf.siteAddress = undefined;
    expect(titleBlockFields(rec)[1]).toEqual({ label: 'Property Address', value: '' });
  });

  // SOW Coordinator = the board's assignment, not whoever typed the draft
  // (Aboud, 2026-10-21). Falls back to the author only when the board has
  // nothing to say — an empty cell in a drawing is worse than the author.
  describe('SOW Coordinator comes from the linked board row', () => {
    function boardRow(over: Partial<BoardProject> = {}): BoardProject {
      return {
        id: 'bp1',
        name: 'Norca Garcia',
        coordinator: 'Anas Yaghmour',
        statusId: null,
        phaseId: null,
        designedDate: null,
        rating: null,
        position: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        createdBy: 'Aboud Yousef',
        updatedAt: '2026-10-01T00:00:00.000Z',
        updatedBy: 'Aboud Yousef',
        schemaVersion: 1,
        ...over,
      };
    }

    it('uses the linked row\'s coordinator over the record author', () => {
      const rec = norcaRecord({ projectId: 'bp1' });
      expect(titleBlockFields(rec, [boardRow()])[4]).toEqual({
        label: 'SOW Coordinator',
        value: 'Anas Yaghmour',
      });
    });

    it('the TSV paste uses the board coordinator too', () => {
      const rec = norcaRecord({ projectId: 'bp1' });
      rec.sf.installRegionRaw = 'Houston / Beaumont';
      expect(titleBlockTsv(rec, [boardRow()])).toBe(
        'Norca Garcia\n1317 Skylark Rd, Pasadena, TX 77502\nHouston / Beaumont\nPasadena\nAnas Yaghmour',
      );
    });

    it('falls back to the author when the record is not linked', () => {
      const rec = norcaRecord(); // no projectId
      expect(titleBlockFields(rec, [boardRow()])[4].value).toBe('Aboud Yousef');
    });

    it('falls back to the author when the linked row was deleted', () => {
      const rec = norcaRecord({ projectId: 'bp1' });
      const rows = [boardRow({ deletedAt: '2026-10-20T00:00:00.000Z' })];
      expect(titleBlockFields(rec, rows)[4].value).toBe('Aboud Yousef');
    });

    it('falls back to the author when the linked row is unassigned', () => {
      const rec = norcaRecord({ projectId: 'bp1' });
      expect(titleBlockFields(rec, [boardRow({ coordinator: '  ' })])[4].value).toBe('Aboud Yousef');
    });

    it('falls back to the author when no board is passed at all', () => {
      const rec = norcaRecord({ projectId: 'bp1' });
      expect(titleBlockFields(rec)[4].value).toBe('Aboud Yousef');
    });
  });
});

// ---- Installation Notes + Conduit Raceway bullets (Phase 7) ---------------

describe('Installation Notes + Conduit Raceway bullets (spec/10 §4)', () => {
  const withNotes = (over = {}) =>
    norcaRecord({ installNotes: { ...emptyInstallNotes(), ...over } });

  it('a lone automatic duration renders inline; a second value makes sub-bullets', () => {
    const text = buildPostText(withNotes(), defaultSettings());
    expect(text).toContain('• *Installation Notes:* Expected power disconnect duration: 1–2 hours.');
    const two = buildPostText(withNotes({ stories: 1 }), defaultSettings());
    expect(two).toContain('• *Installation Notes:*\n    ◦ 1-story house.\n    ◦ Expected power disconnect duration: 1–2 hours.');
  });

  it('several values render as sub-bullets', () => {
    const text = buildPostText(
      withNotes({ walls: 2, orientations: ['North', 'West'], stories: 1, service: 'MPU' }),
      defaultSettings(),
    );
    expect(text).toContain('• *Installation Notes:*\n    ◦ Installation on two walls (North, West).');
    expect(text).toContain('    ◦ 1-story house.');
    expect(text).toContain('    ◦ This project requires an MPU.');
  });

  it('Conduit Raceway is its own bullet, after Installation Notes', () => {
    const text = buildPostText(
      withNotes({ stories: 1, loadRun: '18 ft through the attic', solarRun: '1-1/4" PVC' }),
      defaultSettings(),
    );
    expect(text.indexOf('*Installation Notes:*')).toBeLessThan(text.indexOf('*Conduit Raceway:*'));
    expect(text.indexOf('*Conduit Raceway:*')).toBeLessThan(text.indexOf('*Clearance:*'));
    expect(text).toContain('◦ Load run: 18 ft through the attic.');
    expect(text).toContain('◦ Solar run: 1-1/4" PVC.');
  });

  it('Conduit Raceway disappears when nothing is filled; Installation Notes keeps only the automatic duration', () => {
    const text = buildPostText(withNotes(), defaultSettings());
    expect(text).toContain('*Installation Notes:* Expected power disconnect duration: 1–2 hours.');
    expect(text).not.toContain('Conduit Raceway');
    expect(text).not.toContain('Installation Layout');
  });

  it('Conduit Raceway alone disappears when only Installation Notes is filled', () => {
    const text = buildPostText(withNotes({ stories: 2 }), defaultSettings());
    expect(text).toContain('*Installation Notes:*');
    expect(text).not.toContain('Conduit Raceway');
  });

  it('the HTML version mirrors the text version and escapes values', () => {
    const html = buildPostHtml(withNotes({ stories: 1, solarRun: '1-1/4" PVC <east>' }), defaultSettings());
    expect(html).toContain(
      '<li><strong>Installation Notes:</strong><ul><li>1-story house.</li><li>Expected power disconnect duration: 1–2 hours.</li></ul></li>',
    );
    expect(html).toContain('<li><strong>Conduit Raceway:</strong> <u>Solar run:</u> 1-1/4" PVC &lt;east&gt;.</li>');
  });

  it('a post with no install date omits the date bullet entirely', () => {
    const r = norcaRecord({ sf: { ...norcaRecord().sf, installScheduledDate: '' } });
    const text = buildPostText(r, defaultSettings());
    expect(text).not.toContain('Installation Date & Day');
    expect(text).toContain('• *Region:* HOU.');
  });

  // Golden test — full post shape with both new bullets populated, values from
  // the worked example in spec/10-installation-notes.md §4.
  it('renders the full post with both new bullets populated (spec/10 §4)', () => {
    const rec = withNotes({
      walls: 2,
      orientations: ['North', 'West'],
      stories: 1,
      service: 'MPU',
      batteryLocation: 'garage, left of the door',
      mainDisconnectLocation: 'exterior south wall',
      specialCases: 'window to be closed off\nsmall boxes relocated',
      loadRun: '18 ft through the attic',
      serviceRun: '2" PVC, 12 ft',
      solarRun: '1-1/4" PVC on the east wall',
      batteryRun: '6 ft, back-to-back',
    });
    const expected = `Hello Team,
Kindly find attached the elevation drawing and BOS for Norca Garcia.
Please take the following notes into consideration:
• *Installation Date & Day:* Thursday, 10/01/2026.
• *Region:* HOU.
• *Jurisdiction:* Pasadena.
• *Site Address:* 1317 Skylark Rd, Pasadena, TX 77502.
• *Project Classification:*
    ◦ Level 1 – Standard Installation.
    ◦ Planning window: 1 crew-day.
• *Installation Notes:*
    ◦ Installation on two walls (North, West).
    ◦ 1-story house.
    ◦ This project requires an MPU.
    ◦ Expected power disconnect duration: 4–6 hours.
    ◦ Battery location: garage, left of the door.
    ◦ Special cases: window to be closed off; small boxes relocated.
• *Conduit Raceway:*
    ◦ Grid/service run: 2" PVC, 12 ft.
    ◦ Load run: 18 ft through the attic.
    ◦ Solar run: 1-1/4" PVC on the east wall.
    ◦ Battery run: 6 ft, back-to-back.
• *Clearance:* All required clearance requirements have been met.
• *Site Survey Feedback:* All good.
• *Design Feedback:* All good.
• *Homeowner Feedback:* No feedback.
@Tarek Abu Hseini @Mohammed Azizi @Diego Banegas`;
    expect(buildPostText(rec, defaultSettings())).toBe(expected);
  });
});

describe('planning window in the post (spec/10 §12.1)', () => {
  it('renders Project Classification as level + planning window sub-bullets', () => {
    const text = buildPostText(norcaRecord({ level: 3 }), defaultSettings());
    expect(text).toContain(
      '• *Project Classification:*\n    ◦ Level 3 – Service Equipment Modification.\n    ◦ Planning window: 1.5 to 2 crew-days.',
    );
  });

  it('uses each level’s own window', () => {
    expect(buildPostText(norcaRecord({ level: 1 }), defaultSettings())).toContain(
      '◦ Planning window: 1 crew-day.',
    );
    expect(buildPostText(norcaRecord({ level: 4 }), defaultSettings())).toContain(
      '◦ Planning window: Site-specific, minimum 2 days.',
    );
  });

  it('the HTML version carries it as a nested list item', () => {
    const html = buildPostHtml(norcaRecord({ level: 2 }), defaultSettings());
    expect(html).toContain('<li>Planning window: 1 to 1.5 crew-days.</li>');
  });
});

// ---- Aboud, 2026-09-30 -----------------------------------------------------

describe('a conduit run with several points renders them as sub-points', () => {
  const withRuns = (over: Partial<PostRecord['installNotes']>) =>
    norcaRecord({ installNotes: { ...emptyInstallNotes(), ...over } });

  it('a one-line run still reads inline beside its label', () => {
    const text = buildPostText(
      withRuns({ loadRun: '18 ft through the attic', solarRun: 'attic run to the inverter' }),
      defaultSettings(),
    );
    expect(text).toContain('    ◦ Load run: 18 ft through the attic.');
    expect(text).toContain('    ◦ Solar run: attic run to the inverter.');
  });

  it('several lines become a third level under the run label', () => {
    const text = buildPostText(
      withRuns({ serviceRun: '2" PVC from the meter to the MPU\n12 ft, two 90° bends\nexpansion unit at the wall' }),
      defaultSettings(),
    );
    expect(text).toContain(
      '    ◦ Grid/service run:\n        ▪ 2" PVC from the meter to the MPU.\n        ▪ 12 ft, two 90° bends.\n        ▪ Expansion unit at the wall.',
    );
    // The old "join with ; " form must be gone for runs.
    expect(text).not.toContain('2" PVC from the meter to the MPU; 12 ft');
  });

  it('the rich clipboard nests a real list', () => {
    const html = buildPostHtml(withRuns({ solarRun: 'Attic run to the inverter\n1-1/4" PVC' }), defaultSettings());
    expect(html).toContain(
      '<li><strong>Conduit Raceway:</strong><ul><li><u>Solar run:</u><ul>' +
        '<li>Attic run to the inverter.</li><li>1-1/4" PVC.</li></ul></li></ul></li>',
    );
  });
});

describe('a manually edited post replaces the generated one', () => {
  it('buildPostText returns the manual text verbatim', () => {
    const rec = norcaRecord({ manualText: 'Hello Team,\nI typed this myself.' });
    expect(buildPostText(rec, defaultSettings())).toBe('Hello Team,\nI typed this myself.');
  });

  it('changing a field no longer changes the post', () => {
    const rec = norcaRecord({ manualText: 'Fixed text.' });
    rec.sf.customerName = 'Someone Else Entirely';
    expect(buildPostText(rec, defaultSettings())).toBe('Fixed text.');
  });

  it('the rich clipboard keeps the bold labels and the nesting', () => {
    const rec = norcaRecord({
      manualText: 'Hello Team,\n• *Region:* HOU.\n• *Conduit Raceway:*\n    ◦ Load run:\n        ▪ 18 ft.\n@Someone',
    });
    const html = buildPostHtml(rec, defaultSettings());
    expect(html).toContain('<p>Hello Team,</p>');
    expect(html).toContain('<li><strong>Region:</strong> HOU.</li>');
    expect(html).toContain('<li><strong>Conduit Raceway:</strong><ul><li>Load run:<ul><li>18 ft.</li></ul></li></ul></li>');
    expect(html).toContain('<p>@Someone</p>');
  });

  it('escapes HTML typed by hand', () => {
    const rec = norcaRecord({ manualText: 'Run <20 ft & short' });
    expect(buildPostHtml(rec, defaultSettings())).toContain('Run &lt;20 ft &amp; short');
  });

  it('an empty manual string is treated as "not manually edited"', () => {
    const rec = norcaRecord({ manualText: '' });
    expect(buildPostText(rec, defaultSettings())).toContain('Hello Team,');
    expect(buildPostText(rec, defaultSettings())).toContain('Norca Garcia');
  });
});

// Internal notes (Aboud 2026-10-08): the coordinator's scratch pad. Team-visible
// via the normal record sync, but it must NEVER reach the post or the AI.
describe('internalNotes never leaks', () => {
  it('post text is byte-identical with and without internal notes', () => {
    const base = norcaRecord();
    const withNotes = { ...base, internalNotes: 'chase Diego about the fence\nHO not answering' };
    expect(buildPostText(withNotes, defaultSettings())).toBe(buildPostText(base, defaultSettings()));
  });

  it('does not leak through the hand-edited manualText path either', () => {
    const base = { ...norcaRecord(), manualText: 'Typed by hand.' };
    const withNotes = { ...base, internalNotes: 'SECRET-INTERNAL-STRING' };
    const out = buildPostText(withNotes, defaultSettings());
    expect(out).toBe(buildPostText(base, defaultSettings()));
    expect(out).not.toContain('SECRET-INTERNAL-STRING');
  });

  it('is not a PolishKey, so no AI path can ever send it', () => {
    expect(POLISH_KEYS).not.toContain('internalNotes' as never);
  });
});

// Requirements split (Aboud 2026-10-08) — _PLAN_requirements_split.md.
describe('Utility / Funding / General requirement sections', () => {
  const board = (id: string, name: string, kind: Ahj['kind'], text: string): Ahj => ({
    id,
    name,
    aliases: [],
    kind,
    posts: [
      { id: id + '-p', text, by: 'Aboud Yousef', at: '2026-10-08T00:00:00.000Z', history: [], pinned: false, updatedAt: '2026-10-08T00:00:00.000Z' },
    ],
    updatedAt: '2026-10-08T00:00:00.000Z',
    schemaVersion: 1,
  });

  const util = board('u1', 'CenterPoint Energy', 'utility', 'Meter must be on the south wall.');
  const fund = board('f1', 'Solrite', 'funding', 'Upload the signed NTP before scheduling.');
  const gen = board('g1', 'House rules', 'general', 'Always Title Case customer names.');

  it('a utility section appears only when the Utility matches AND is approved', () => {
    const rec = norcaRecord({ utilityApprovedId: 'u1' });
    rec.sf.utility = 'CenterPoint Energy';
    const text = buildPostText(rec, defaultSettings(), [util]);
    expect(text).toContain('*Utility Requirements (CenterPoint Energy):*\n• Meter must be on the south wall.');
  });

  it('changing the Utility away silently un-approves it', () => {
    const rec = norcaRecord({ utilityApprovedId: 'u1' });
    rec.sf.utility = 'Oncor';
    expect(buildPostText(rec, defaultSettings(), [util])).not.toContain('Utility Requirements');
  });

  it('funding is global — it needs no key on the record, only approval', () => {
    const rec = norcaRecord({ fundingApprovedId: 'f1' });
    const text = buildPostText(rec, defaultSettings(), [fund]);
    expect(text).toContain('*Funding Requirements (Solrite):*\n• Upload the signed NTP before scheduling.');
  });

  it('funding is still absent without approval', () => {
    expect(buildPostText(norcaRecord(), defaultSettings(), [fund])).not.toContain('Funding Requirements');
  });

  it('SOW general notes NEVER reach the post, by any route', () => {
    const rec = norcaRecord({ ahjApprovedId: 'g1', utilityApprovedId: 'g1', fundingApprovedId: 'g1' });
    const text = buildPostText(rec, defaultSettings(), [gen]);
    expect(text).not.toContain('Always Title Case customer names.');
    expect(text).not.toContain('House rules');
  });

  it('all three sections print in the order AHJ → Utility → Funding', () => {
    const rec = norcaRecord({ ahjApprovedId: 'cc', utilityApprovedId: 'u1', fundingApprovedId: 'f1' });
    rec.sf.jurisdiction = 'Corpus Christi';
    rec.sf.utility = 'CenterPoint Energy';
    const text = buildPostText(rec, defaultSettings(), [ccAhj, util, fund, gen]);
    const order = ['AHJ Requirements', 'Utility Requirements', 'Funding Requirements'].map((t) => text.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Tags still land last so Slack pings keep working.
    expect(text.trim().split('\n').at(-1)).toContain('@Tarek Abu Hseini');
  });

  it('an AHJ-only post is byte-identical to before the split', () => {
    const rec = norcaRecord({ ahjApprovedId: 'cc' });
    rec.sf.jurisdiction = 'Corpus Christi';
    // Adding unrelated boards of other kinds must not change a thing.
    expect(buildPostText(rec, defaultSettings(), [ccAhj, util, fund, gen])).toBe(
      buildPostText(rec, defaultSettings(), [ccAhj]),
    );
  });

  it('the HTML clipboard version carries the new sections too', () => {
    const rec = norcaRecord({ utilityApprovedId: 'u1' });
    rec.sf.utility = 'CenterPoint Energy';
    expect(buildPostHtml(rec, defaultSettings(), [util])).toContain('Utility Requirements (CenterPoint Energy):');
  });
});

// ---- Wire material check in Design Feedback (Aboud 2026-11-11) -------------
// The verdict is DERIVED from the two dropdowns, not typed into notes.design,
// so the AI can never reword it and it cannot be deleted by accident.

describe('wire material verdict leads Design Feedback', () => {
  const MATCH =
    'Wire material unchanged — the design SLD and the BOS both specify aluminum conductors ' +
    '(4/0 AWG for the 200 A service, NEC Table 310.12).';

  it('is the whole bullet when the feedback box is empty — the "All good." default never fires', () => {
    const rec = norcaRecord({ wire: { design: 'AL', bos: 'AL', serviceAmps: 200 } });
    const text = buildPostText(rec, defaultSettings());
    expect(text).toContain(`• *Design Feedback:* ${MATCH}`);
    expect(text).not.toContain('• *Design Feedback:* All good.');
  });

  it('comes FIRST, above whatever the coordinator typed', () => {
    const rec = norcaRecord({
      notes: { layout: '', siteSurvey: '', design: 'Solar tag should read PVC, not EMT', homeowner: '' },
      wire: { design: 'CU', bos: 'AL', serviceAmps: 200 },
    });
    expect(buildPostText(rec, defaultSettings())).toContain(
      '• *Design Feedback:*\n    ◦ Wire material changed after the elevation review — the BOS ' +
        'specifies aluminum, the design SLD shows copper. Please update the design SLD to 4/0 AWG ' +
        'aluminum for the 200 A service (NEC Table 310.12) and re-upload it to Salesforce so the ' +
        'planset matches the BOS.\n    ◦ Solar tag should read PVC, not EMT.',
    );
  });

  it('survives the AI untouched — polishing the design box cannot reword it', () => {
    const rec = norcaRecord({
      notes: { layout: '', siteSurvey: '', design: 'tag wrong', homeowner: '' },
      polished: { design: 'Wire material is fine, ignore the mismatch.' },
      wire: { design: 'AL', bos: 'AL', serviceAmps: 200 },
    });
    const text = buildPostText(rec, defaultSettings());
    expect(text).toContain(MATCH);
    // The polished text still renders as the coordinator's own bullet, under it.
    expect(text).toContain('◦ Wire material is fine, ignore the mismatch.');
  });

  it('changes nothing when the two dropdowns are not both picked', () => {
    expect(buildPostText(norcaRecord({ wire: { design: 'AL' } }), defaultSettings())).toContain(
      '• *Design Feedback:* All good.',
    );
    expect(buildPostText(norcaRecord(), defaultSettings())).toBe(NORCA_EXPECTED);
  });

  it('leaves Site Survey and Homeowner feedback alone', () => {
    const text = buildPostText(
      norcaRecord({ wire: { design: 'CU', bos: 'AL', serviceAmps: 200 } }),
      defaultSettings(),
    );
    expect(text).toContain('• *Site Survey Feedback:* All good.');
    expect(text).toContain('• *Homeowner Feedback:* No feedback.');
    expect(text).not.toContain('• *Site Survey Feedback:* Wire material');
  });

  it('reaches the rich clipboard too', () => {
    const rec = norcaRecord({ wire: { design: 'AL', bos: 'AL', serviceAmps: 200 } });
    expect(buildPostHtml(rec, defaultSettings())).toContain(`<strong>Design Feedback:</strong> ${MATCH}`);
  });
});
