import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractedToFields, installWeekday, mergeSfFields, parseSfText } from './parser';
import { suggestDriversFromText } from './classify';
import type { SfFields } from '../types';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

const norca = fixture('sf-paste-norca-garcia.txt');
const norcaExpected = JSON.parse(fixture('sf-paste-norca-garcia.expected.json'));
const patrick = fixture('sf-paste-patrick-lingwall.txt');
const coordination = fixture('sf-paste-patrick-lingwall-coordination.txt');

describe('parseSfText — Norca Garcia fixture', () => {
  const { fields, warnings } = parseSfText(norca, '2026-09-26');

  it('extracts every expected field', () => {
    expect(fields.customerName).toBe(norcaExpected.customerName);
    expect(fields.recordTitle).toBe(norcaExpected.recordTitle);
    expect(fields.systemSizeKw).toBe(norcaExpected.systemSizeKw);
    expect(fields.projectStatus).toBe(norcaExpected.projectStatus);
    expect(fields.installScheduledDate).toBe(norcaExpected.installScheduledDate);
    expect(fields.latestScheduledVisit).toBe(norcaExpected.latestScheduledVisit);
    expect(fields.siteAddress).toBe(norcaExpected.siteAddress);
    expect(fields.jurisdiction).toBe(norcaExpected.jurisdiction);
    expect(fields.utility).toBe(norcaExpected.utility);
    expect(fields.lender).toBe(norcaExpected.lender);
    expect(fields.fundingStage).toBe(norcaExpected.fundingStage);
    expect(fields.installRegionRaw).toBe(norcaExpected.installRegionRaw);
    expect(fields.region).toBe(norcaExpected.region);
    expect(fields.sfLinks).toEqual(norcaExpected.sfLinks);
    expect(fields.source).toBe('text');
  });

  it('computes weekday Thursday', () => {
    expect(installWeekday(fields.installScheduledDate)).toBe(norcaExpected.weekday);
  });

  it('warns about the differing Latest Scheduled Visit', () => {
    expect(warnings).toEqual(norcaExpected.warnings);
  });

  it('empty "Installed" label does not swallow "Site"', () => {
    expect(fields.siteAddress).toBe('1317 Skylark Rd, Pasadena, TX 77502');
  });

  it('is order-independent (shuffled label/value pairs give the same result)', () => {
    // Rebuild the paste with label/value pairs in reverse order.
    const pairs: string[][] = [
      ['Latest Scheduled Visit', '10/9/2026, 7:45 AM'],
      ['Install Region', 'Houston / Beaumont'],
      ['Funding Stage', 'DOCS SIGNED'],
      ['Lender', 'SOLRITE'],
      ['Utility Company', '[Centerpoint](https://x.com/u/view)'],
      ['Jurisdiction', '[Pasadena](https://x.com/j/view)'],
      ['Site', '[1317 Skylark Rd, Pasadena, TX 77502](https://x.com/s/view)'],
      ['Installed', ''],
      ['Install Scheduled Date', '10/1/2026'],
      ['Project', '[Norca Garcia](https://x.com/p/view)'],
      ['Project Status', 'Install Scheduled'],
      ['System Size (KW)', '15.58'],
    ];
    const text = `Norca Garcia | FF | Rooftop Solar\n${pairs.map(([l, v]) => (v ? `${l}\n${v}` : l)).join('\n')}`;
    const shuffled = parseSfText(text, '2026-09-26').fields;
    expect(shuffled.customerName).toBe('Norca Garcia');
    expect(shuffled.installScheduledDate).toBe('2026-10-01');
    expect(shuffled.region).toBe('HOU');
    expect(shuffled.jurisdiction).toBe('Pasadena');
    expect(shuffled.systemSizeKw).toBe(15.58);
  });
});

describe('parseSfText — Patrick Lingwall fixture', () => {
  const { fields } = parseSfText(patrick, '2026-09-26');

  it('extracts date, region, jurisdiction and size', () => {
    expect(fields.installScheduledDate).toBe('2026-09-28');
    expect(installWeekday(fields.installScheduledDate)).toBe('Monday');
    expect(fields.region).toBe('HOU');
    expect(fields.jurisdiction).toBe('Houston');
    expect(fields.systemSizeKw).toBe(14.76);
  });
});

describe('parseSfText — coordination second paste + merge', () => {
  const base = parseSfText(patrick, '2026-09-26').fields as SfFields;
  const second = parseSfText(coordination, '2026-09-26');

  it('captures Scheduled Work Items and coordinator notes', () => {
    expect(second.fields.scheduledWorkItems).toContain('Attic Run');
    expect(second.fields.scheduledWorkItems).toContain('City Inspection');
    expect(second.fields.coordinatorNotes).toContain('two day install');
  });

  it('merge overwrites only the fields present in the later paste', () => {
    const merged = mergeSfFields(base, second.fields);
    expect(merged.customerName).toBe('Patrick Lingwall'); // kept
    expect(merged.installScheduledDate).toBe('2026-09-28'); // kept
    expect(merged.scheduledWorkItems).toContain('Attic Run'); // added
  });

  it('suggests attic_run from the work items keywords', () => {
    const drivers = suggestDriversFromText(second.fields.scheduledWorkItems ?? '');
    expect(drivers).toContain('attic_run');
  });
});

describe('parseSfText — warnings', () => {
  it('warns on missing date and missing customer', () => {
    const { warnings } = parseSfText('Utility Company\nCenterpoint', '2026-09-26');
    expect(warnings).toContain('Customer name missing.');
  });

  it('warns when the install date is in the past', () => {
    const { warnings } = parseSfText(norca, '2026-11-15');
    expect(warnings.some((w) => w.includes('in the past'))).toBe(true);
  });
});

describe('install date is optional (spec/10 §1)', () => {
  it('does not warn when the Salesforce paste has no install date', () => {
    const res = parseSfText('Jane Doe | FF | Project\nJurisdiction\nPasadena', '2026-09-30');
    expect(res.warnings).not.toContain('No install date found.');
    expect(res.fields.installScheduledDate).toBeUndefined();
  });

  it('still warns when a date is present but in the past', () => {
    const res = parseSfText('Install Scheduled Date\n09/01/2026', '2026-09-30');
    expect(res.warnings.some((w) => w.includes('is in the past'))).toBe(true);
  });

  it('still warns when the date text cannot be read', () => {
    const res = parseSfText('Install Scheduled Date\nnot a date', '2026-09-30');
    expect(res.warnings.some((w) => w.startsWith('Could not read Install Scheduled Date'))).toBe(true);
  });

  it('extractedToFields does not warn about a missing date either', () => {
    const res = extractedToFields({ customerName: 'Jane Doe', confidence: 'high' }, '2026-09-30');
    expect(res.warnings).not.toContain('No install date found.');
  });
});
