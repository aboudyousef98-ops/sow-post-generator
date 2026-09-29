import { describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
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
  return {
    id: 'test-id',
    status: 'draft',
    author: 'Aboud Yousef',
    sf: {
      customerName: 'Norca Garcia',
      installScheduledDate: '2026-10-01',
      region: 'HOU',
      jurisdiction: 'Pasadena',
      siteAddress: '1317 Skylark Rd, Pasadena, TX 77502',
      source: 'text',
    },
    drivers: [],
    suggestedLevel: 1,
    level: 1,
    notes: {
      layout:
        'Standard exterior placement, with the equipment installed back-to-back and direct grid, load, and PV routing.',
      siteSurvey: '',
      design: '',
      homeowner: '',
    },
    usePolished: { layout: true, siteSurvey: true, design: true, homeowner: true },
    tags: ['Tarek Abu Hseini', 'Mohammed Azizi', 'Diego Banegas'],
    warnings: [],
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  };
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
• *Project Classification:* Level 1 – Standard Installation.
• *Installation Layout:* Standard exterior placement, with the equipment installed back-to-back and direct grid, load, and PV routing.
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
      notes: { layout: 'Attic run', siteSurvey: '', design: '', homeowner: '' },
    });
    expect(buildPostText(rec, defaultSettings())).toContain('*Installation Layout:* Attic run.');
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

  it('drops empty bullets entirely (empty layout, missing jurisdiction)', () => {
    const rec = norcaRecord({
      notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
    });
    rec.sf.jurisdiction = undefined;
    const text = buildPostText(rec, defaultSettings());
    expect(text).not.toContain('*Installation Layout:*');
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
      'Install date',
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
});

describe('buildPostHtml', () => {
  it('renders <ul> bullets with <strong> labels and plain tags', () => {
    const html = buildPostHtml(norcaRecord(), defaultSettings());
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><strong>Installation Date &amp; Day:</strong> Thursday, 10/01/2026.</li>');
    expect(html).toContain('<li><strong>Site Address:</strong> 1317 Skylark Rd, Pasadena, TX 77502.</li>');
    expect(html).toContain('<p>@Tarek Abu Hseini @Mohammed Azizi @Diego Banegas</p>');
    expect(html.match(/<li>/g)).toHaveLength(10);
  });

  it('escapes HTML in user text', () => {
    const rec = norcaRecord({
      notes: { layout: 'Run <20 ft & short', siteSurvey: '', design: '', homeowner: '' },
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
        layout: 'Standard exterior placement.',
        siteSurvey: '',
        design: 'Solar tag should read PVC, not EMT\nElevation shows an expansion unit missing from the one-line',
        homeowner: '',
      },
    });

  it('keeps a single-line note inline after its label', () => {
    expect(buildPostText(norcaRecord(), defaultSettings())).toContain(
      '• *Installation Layout:* Standard exterior placement, with the equipment installed back-to-back and direct grid, load, and PV routing.',
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
});
