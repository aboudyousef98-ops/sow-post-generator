import { describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
import { defaultSettings } from './storage';
import { buildPostHtml, buildPostText, finalTags, missingRequired, regionLine } from './template';

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

  it('OTHER region with resolved metro prints "– Near Houston/Dallas"', () => {
    const rec = norcaRecord();
    rec.sf.region = 'OTHER';
    rec.sf.installRegionRaw = 'Corpus Christi';
    rec.sf.nearMetro = 'HOU';
    expect(regionLine(rec)).toBe('Corpus Christi – Near Houston');
    rec.sf.nearMetro = 'DFW';
    expect(regionLine(rec)).toBe('Corpus Christi – Near Dallas');
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
