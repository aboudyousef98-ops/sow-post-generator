import { describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
import { applyQuery, authorsIn, defaultQuery } from './listQuery';

function rec(over: {
  id: string;
  customer: string;
  region?: PostRecord['sf']['region'];
  jurisdiction?: string;
  address?: string;
  author?: string;
  level?: PostRecord['level'];
  updatedAt?: string;
  postedAt?: string;
  designer?: string;
}): PostRecord {
  return {
    id: over.id,
    status: over.postedAt ? 'posted' : 'draft',
    author: over.author ?? 'Aboud Yousef',
    sf: {
      customerName: over.customer,
      installScheduledDate: '2026-10-01',
      region: over.region ?? 'HOU',
      jurisdiction: over.jurisdiction,
      siteAddress: over.address,
      source: 'text',
    },
    drivers: [],
    suggestedLevel: over.level ?? 1,
    level: over.level ?? 1,
    notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
    usePolished: { layout: true, siteSurvey: true, design: true, homeowner: true },
    tags: [],
    designerTag: over.designer,
    warnings: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-09-20T00:00:00.000Z',
    postedAt: over.postedAt,
    schemaVersion: 1,
  };
}

const records = [
  rec({ id: 'a', customer: 'Norca Garcia', region: 'HOU', jurisdiction: 'Pasadena', level: 1, updatedAt: '2026-09-10T00:00:00.000Z', author: 'Aboud Yousef' }),
  rec({ id: 'b', customer: 'Patrick Lingwall', region: 'HOU', jurisdiction: 'Houston', level: 2, updatedAt: '2026-09-22T00:00:00.000Z', author: 'Omar Rajab', designer: 'Khaled Mattar' }),
  rec({ id: 'c', customer: 'Sabrina Salinas', region: 'DFW', jurisdiction: 'Frisco', address: '12 Oak St, Frisco, TX', level: 3, updatedAt: '2026-09-15T00:00:00.000Z', author: 'Mohammad Refai' }),
];

describe('applyQuery — search', () => {
  it('free text across everything', () => {
    expect(applyQuery(records, { ...defaultQuery('updated'), text: 'lingwall' }).map((r) => r.id)).toEqual(['b']);
    expect(applyQuery(records, { ...defaultQuery('updated'), text: 'oak st' }).map((r) => r.id)).toEqual(['c']);
  });

  it('search-by restricts the field (name vs jurisdiction vs designer)', () => {
    const q = defaultQuery('updated');
    // "houston" appears in b's jurisdiction, not in any customer name.
    expect(applyQuery(records, { ...q, text: 'houston', searchBy: 'customer' })).toHaveLength(0);
    expect(applyQuery(records, { ...q, text: 'houston', searchBy: 'jurisdiction' }).map((r) => r.id)).toEqual(['b']);
    expect(applyQuery(records, { ...q, text: 'khaled', searchBy: 'designer' }).map((r) => r.id)).toEqual(['b']);
  });
});

describe('applyQuery — filters', () => {
  it('region, level and author filters combine', () => {
    const q = defaultQuery('updated');
    expect(applyQuery(records, { ...q, region: 'HOU' })).toHaveLength(2);
    expect(applyQuery(records, { ...q, level: 3 }).map((r) => r.id)).toEqual(['c']);
    expect(applyQuery(records, { ...q, region: 'HOU', author: 'Omar Rajab' }).map((r) => r.id)).toEqual(['b']);
    expect(applyQuery(records, { ...q, region: 'DFW', level: 1 })).toHaveLength(0);
  });
});

describe('applyQuery — sorting', () => {
  it('sorts by last edited desc by default, asc when toggled', () => {
    const q = defaultQuery('updated');
    expect(applyQuery(records, q).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(applyQuery(records, { ...q, sortDir: 'asc' }).map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by customer name and by level', () => {
    const q = { ...defaultQuery('updated'), sortDir: 'asc' as const };
    expect(applyQuery(records, { ...q, sortBy: 'customer' }).map((r) => r.sf.customerName)).toEqual([
      'Norca Garcia',
      'Patrick Lingwall',
      'Sabrina Salinas',
    ]);
    expect(applyQuery(records, { ...q, sortBy: 'level' }).map((r) => r.level)).toEqual([1, 2, 3]);
  });
});

describe('authorsIn', () => {
  it('unique sorted authors', () => {
    expect(authorsIn(records)).toEqual(['Aboud Yousef', 'Mohammad Refai', 'Omar Rajab']);
  });
});
