import { describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
import { defaultSettings } from './storage';
import { buildPostHtml, buildPostText, finalTags, regionLine } from './template';

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

// Expected output — verbatim from spec/06-output-template.md §2.
const NORCA_EXPECTED = `Hello Team,
Kindly find attached the elevation drawing and BOS for Norca Garcia.
Please take the following notes into consideration:
1. *Installation Date & Day:* Thursday, 10/01/2026.
2. *Region:* HOU – Pasadena.
3. *Project Classification:* Level 1 – Standard Installation.
4. *Installation Layout:* Standard exterior placement, with the equipment installed back-to-back and direct grid, load, and PV routing.
5. *Clearance:* All required clearance requirements have been met.
6. *Site Survey Feedback:* All good.
7. *Design Feedback:* All good.
8. *Homeowner Feedback:* No feedback.
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

  it('region without jurisdiction prints just the code', () => {
    const rec = norcaRecord();
    rec.sf.jurisdiction = undefined;
    expect(regionLine(rec)).toBe('HOU');
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
  it('renders <ol> items with <strong> labels and plain tags', () => {
    const html = buildPostHtml(norcaRecord(), defaultSettings());
    expect(html).toContain('<ol>');
    expect(html).toContain('<li><strong>Installation Date &amp; Day:</strong> Thursday, 10/01/2026.</li>');
    expect(html).toContain('<p>@Tarek Abu Hseini @Mohammed Azizi @Diego Banegas</p>');
    expect(html.match(/<li>/g)).toHaveLength(8);
  });

  it('escapes HTML in user text', () => {
    const rec = norcaRecord({
      notes: { layout: 'Run <20 ft & short', siteSurvey: '', design: '', homeowner: '' },
    });
    expect(buildPostHtml(rec, defaultSettings())).toContain('Run &lt;20 ft &amp; short.');
  });
});
