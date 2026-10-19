import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSfReport } from './sfReport';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

const SCHEDULED = fixture('sf-report-scheduled-partial.txt');
const DESIGN = fixture('sf-report-design-partial.txt');

/** The real roster, which spells Yarob WITHOUT the apostrophe Salesforce uses. */
const ROSTER = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai', 'Yarob Alnabelsi', 'Anas Yaghmour'];

describe('parseSfReport — which report is this', () => {
  it('reads the Scheduled report', () => {
    expect(parseSfReport(SCHEDULED, ROSTER).kind).toBe('scheduled');
  });

  it('reads the Design report', () => {
    expect(parseSfReport(DESIGN, ROSTER).kind).toBe('design');
  });

  it('refuses a paste that is not one of the two reports', () => {
    const r = parseSfReport('some other text entirely\nwith lines', ROSTER);
    expect(r.kind).toBe('unknown');
    expect(r.error).toMatch(/which report/i);
    expect(r.rows).toEqual([]);
  });
});

describe('parseSfReport — finding the rows', () => {
  it('pulls every readable row out of the Scheduled report, in paste order', () => {
    expect(parseSfReport(SCHEDULED, ROSTER).rows.map((r) => r.name)).toEqual([
      'Karan Staggers',
      'Nikki Calton',
      'Eric Webber',
      'Susan Stone',
    ]);
  });

  it('pulls every row out of the Design report, despite the different columns', () => {
    expect(parseSfReport(DESIGN, ROSTER).rows.map((r) => r.name)).toEqual([
      'Duane Hallemann',
      'William Roberts',
      'Okernithia Shepherd',
      'Donald Kennedy',
      'Alonzo Burbridge',
      'Steven Clifton',
      'Harper Jr Walker',
    ]);
  });

  it('is not fooled by the header block, the date groups, or Subtotal/Total lines', () => {
    const names = parseSfReport(SCHEDULED, ROSTER).rows.map((r) => r.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain('Project Name');
    expect(names).not.toContain('Subtotal');
    expect(names).not.toContain('10/27/2026(5)');
  });

  it('title-cases a shouted name', () => {
    const walker = parseSfReport(DESIGN, ROSTER).rows.find((r) => /walker/i.test(r.name));
    expect(walker?.name).toBe('Harper Jr Walker');
  });

  it('counts a project listed under two dates once', () => {
    const twice = SCHEDULED.replace(
      /Aboud Yousef\nfeature not included\nKaran Staggers/,
      (m) => `${m}\n1024 Fair Oaks Dr\n25.830\nAdam Hallett\nAhmad Sarayreh\nSOLRITE\n-\nInstall Scheduled\nRedesign [Nº 1] - Karan Staggers | FF | Rooftop Solar\n${m}`,
    );
    const names = parseSfReport(twice, ROSTER).rows.map((r) => r.name);
    expect(names.filter((n) => n === 'Karan Staggers')).toHaveLength(1);
  });
});

describe('parseSfReport — the SOW coordinator', () => {
  it('reads the coordinator off each Scheduled row', () => {
    const by = new Map(parseSfReport(SCHEDULED, ROSTER).rows.map((r) => [r.name, r.coordinator]));
    expect(by.get('Karan Staggers')).toBe('Aboud Yousef');
    expect(by.get('Nikki Calton')).toBe('Anas Yaghmour');
    expect(by.get('Susan Stone')).toBe('Aboud Yousef');
  });

  it("matches Salesforce's \"Ya'rob\" to the roster's \"Yarob\"", () => {
    const webber = parseSfReport(SCHEDULED, ROSTER).rows.find((r) => r.name === 'Eric Webber');
    expect(webber?.coordinator).toBe('Yarob Alnabelsi');
  });

  it('leaves every Design row unassigned — that report shows "-" for all of them', () => {
    const r = parseSfReport(DESIGN, ROSTER);
    expect(r.rows.every((row) => row.coordinator === '')).toBe(true);
    // "-" means unassigned, not a roster miss — so it must not warn about one.
    expect(r.warnings.join(' ')).not.toMatch(/roster/);
  });

  it('a name that is not on the roster is left unassigned and warned about, never invented', () => {
    const swapped = SCHEDULED.replace('Aboud Yousef\nfeature not included\nKaran', 'Someone Else\nfeature not included\nKaran');
    const r = parseSfReport(swapped, ROSTER);
    expect(r.rows.find((row) => row.name === 'Karan Staggers')?.coordinator).toBe('');
    expect(r.warnings.join(' ')).toMatch(/Someone Else.*not on the roster/);
  });
});

describe('parseSfReport — Schedule beats Design, per row', () => {
  it('flags the Design-report row whose Salesforce status is already Install Scheduled', () => {
    const by = new Map(parseSfReport(DESIGN, ROSTER).rows.map((r) => [r.name, r.scheduled]));
    expect(by.get('Okernithia Shepherd')).toBe(true); // on the Design report, but scheduled
    expect(by.get('Duane Hallemann')).toBe(false); // status AHJ
    expect(by.get('Harper Jr Walker')).toBe(false);
  });

  it('every Scheduled-report row is scheduled', () => {
    expect(parseSfReport(SCHEDULED, ROSTER).rows.every((r) => r.scheduled)).toBe(true);
  });
});

describe('parseSfReport — honesty about what it could not read', () => {
  it('reports a row cut off mid-notes instead of importing half of it', () => {
    const r = parseSfReport(SCHEDULED, ROSTER);
    expect(r.rows.map((row) => row.name)).not.toContain('Paul Richardson');
    expect(r.unreadable.join(' ')).toMatch(/Paul Richardson.*cut off/);
  });

  it('holds back a row whose design document names a different project', () => {
    const crossed = DESIGN.replace(
      'Design Request - Steven Clifton | FF | Rooftop Solar',
      'Design Request - Someone Different | FF | Rooftop Solar',
    );
    const r = parseSfReport(crossed, ROSTER);
    expect(r.rows.map((row) => row.name)).not.toContain('Steven Clifton');
    expect(r.unreadable.join(' ')).toMatch(/Steven Clifton.*does not match/);
  });

  it('reads the report total and warns when the paste is only part of it', () => {
    const r = parseSfReport(SCHEDULED, ROSTER);
    expect(r.totalRecords).toBe(15);
    expect(r.complete).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/Found 4 of the 15 records/);
  });

  it('a paste holding every record is complete, with no warning', () => {
    const whole = DESIGN.replace(/^Total Records 61$/m, 'Total Records 7')
      .replace(/^61$/m, '7')
      .replace(/^Total\(61\)$/gm, 'Total(7)');
    const r = parseSfReport(whole, ROSTER);
    expect(r.rows).toHaveLength(7);
    expect(r.totalRecords).toBe(7);
    expect(r.complete).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});
