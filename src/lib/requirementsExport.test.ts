// Export + match report, Phase 3.
//
// The claim worth defending is the ROUND TRIP: what export writes, import
// reads back to the same thing. That is tested here against the real
// importer rather than against a description of its format.

import { describe, expect, it } from 'vitest';
import type { Ahj, AhjPost, PostRecord } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { EXPORT_HEADER, matchReport, toCsv, toExportRows } from './requirementsExport';
import {
  applyRequirementsImport,
  parseCsv,
  parseRequirementsGrid,
  planRequirementsImport,
} from './requirementsImport';

const T = '2026-11-17T12:00:00.000Z';

function post(over: Partial<AhjPost> & { id: string }): AhjPost {
  return { text: 'x', by: 'A', at: T, history: [], pinned: false, updatedAt: T, ...over };
}
function ahj(over: Partial<Ahj> & { id: string; name: string }): Ahj {
  return { aliases: [], posts: [], updatedAt: T, schemaVersion: 1, ...over };
}

describe('toExportRows', () => {
  it('writes the importer’s own header', () => {
    expect(toExportRows([])[0]).toEqual([...EXPORT_HEADER]);
  });

  it('splits stored text back into Requirement and Details', () => {
    const rows = toExportRows([
      ahj({ id: 'b1', name: 'Irving', kind: 'ahj', posts: [post({ id: 'p1', text: 'Three feet.\nFrom the ridge.' })] }),
    ]);
    expect(rows[1][4]).toBe('Three feet.');
    expect(rows[1][5]).toBe('From the ridge.');
  });

  it('carries every per-rule field, with labels the importer accepts back', () => {
    const rows = toExportRows([
      ahj({
        id: 'b1',
        name: 'Irving',
        kind: 'ahj',
        posts: [
          post({
            id: 'p1',
            text: 'R',
            region: 'DFW',
            category: 'Setbacks',
            sourceUrl: 'https://x.gov/a',
            sourceDate: '2026-01-02',
            origin: 'Permit desk',
            confidence: 'medium',
            status: 'to-confirm',
          }),
        ],
      }),
    ]);
    expect(rows[1]).toEqual([
      'Irving', 'AHJ', 'DFW', 'Setbacks', 'R', '',
      'https://x.gov/a', '2026-01-02', 'Permit desk', 'Medium', 'To confirm', '',
    ]);
  });

  it('puts aliases on the first row of a board only', () => {
    const rows = toExportRows([
      ahj({
        id: 'b1',
        name: 'CenterPoint',
        kind: 'utility',
        aliases: ['CNP', 'CenterPoint Energy'],
        posts: [post({ id: 'p1', text: 'A' }), post({ id: 'p2', text: 'B' })],
      }),
    ]);
    expect(rows[1][11]).toBe('CNP; CenterPoint Energy');
    expect(rows[2][11]).toBe('');
  });

  it('a board with no rules still exports, so a round trip cannot lose it', () => {
    const rows = toExportRows([ahj({ id: 'b1', name: 'Empty', kind: 'ahj', aliases: ['E'] })]);
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('Empty');
  });

  it('skips deleted boards and deleted posts', () => {
    const rows = toExportRows([
      ahj({ id: 'b1', name: 'Gone', kind: 'ahj', deleted: { at: T, by: 'A' }, posts: [post({ id: 'p1' })] }),
      ahj({ id: 'b2', name: 'Here', kind: 'ahj', posts: [post({ id: 'p2', text: 'A' }), post({ id: 'p3', text: 'B', deleted: { at: T, by: 'A' } })] }),
    ]);
    expect(rows.filter((r) => r[0] === 'Gone')).toHaveLength(0);
    expect(rows.filter((r) => r[0] === 'Here')).toHaveLength(1);
  });
});

describe('toCsv', () => {
  it('quotes fields containing a comma, a quote or a newline', () => {
    const csv = toCsv([['plain', 'has, comma', 'has "quote"', 'has\nnewline']]);
    expect(csv).toContain('plain,"has, comma","has ""quote""","has\nnewline"');
  });

  it('starts with a BOM so Excel reads UTF-8 on Windows', () => {
    expect(toCsv([['a']]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe('the round trip', () => {
  it('export → CSV → import reproduces the same boards', () => {
    const before = [
      ahj({
        id: 'b1',
        name: 'Irving',
        kind: 'ahj',
        aliases: ['City of Irving'],
        posts: [
          post({ id: 'p1', text: 'Three feet.\nFrom the ridge.', category: 'Setbacks', region: 'DFW', confidence: 'high' }),
          post({ id: 'p2', text: 'Red placard, "visible".', category: 'Labeling' }),
        ],
      }),
      ahj({ id: 'b2', name: 'Oncor', kind: 'utility', aliases: [], posts: [post({ id: 'p3', text: 'Meter base.' })] }),
    ];

    const csv = toCsv(toExportRows(before));
    const parsed = parseRequirementsGrid(parseCsv(csv.replace(/^\uFEFF/, '')));
    expect(parsed.error).toBeUndefined();
    expect(parsed.errors).toEqual([]);

    let id = 0;
    const after = applyRequirementsImport([], planRequirementsImport(parsed, []), {
      by: 'Aboud Yousef',
      now: T,
      batchId: 'b',
      newId: () => `n-${++id}`,
    });

    const irving = after.find((b) => b.name === 'Irving')!;
    expect(irving.kind).toBe('ahj');
    expect(irving.aliases).toEqual(['City of Irving']);
    expect(irving.posts.map((p) => p.text).sort()).toEqual(
      ['Red placard, "visible".', 'Three feet.\nFrom the ridge.'].sort(),
    );
    const setback = irving.posts.find((p) => p.category === 'Setbacks')!;
    expect(setback.region).toBe('DFW');
    expect(setback.confidence).toBe('high');
    expect(after.find((b) => b.name === 'Oncor')!.kind).toBe('utility');
  });

  it('re-importing an export of the CURRENT boards adds nothing', () => {
    const boards = [
      ahj({ id: 'b1', name: 'Irving', kind: 'ahj', posts: [post({ id: 'p1', text: 'Three feet.' })] }),
    ];
    const parsed = parseRequirementsGrid(parseCsv(toCsv(toExportRows(boards)).replace(/^\uFEFF/, '')));
    const plan = planRequirementsImport(parsed, boards);
    expect(plan.counts.newRules).toBe(0);
    expect(plan.counts.duplicates).toBe(1);
  });
});

// ---- Match report ----------------------------------------------------------

function rec(customer: string, jurisdiction?: string, utility?: string): PostRecord {
  const r = makeRecord();
  r.sf.customerName = customer;
  r.sf.jurisdiction = jurisdiction;
  r.sf.utility = utility;
  return r;
}

describe('matchReport', () => {
  const boards = [
    ahj({ id: 'b1', name: 'Harris County', kind: 'ahj' }),
    ahj({ id: 'b2', name: 'CenterPoint', kind: 'utility', aliases: ['CNP'] }),
  ];

  it('lists a jurisdiction no board matches', () => {
    const r = matchReport([rec('A', 'Montgomery County', 'CenterPoint')], boards);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]).toMatchObject({ value: 'Montgomery County', kind: 'ahj', count: 1 });
    expect(r.gaps[0].customers).toEqual(['A']);
  });

  it('an ALIAS counts as a match — the report only lists real gaps', () => {
    expect(matchReport([rec('A', 'Harris County', 'CNP')], boards).gaps).toEqual([]);
  });

  it('groups by value, not by record, worst first', () => {
    const r = matchReport(
      [
        rec('A', 'Montgomery County', 'CenterPoint'),
        rec('B', 'montgomery county', 'CenterPoint'),
        rec('C', 'Galveston County', 'CenterPoint'),
      ],
      boards,
    );
    expect(r.gaps.map((g) => [g.value, g.count])).toEqual([
      ['Montgomery County', 2],
      ['Galveston County', 1],
    ]);
    expect(r.gaps[0].customers).toEqual(['A', 'B']);
  });

  it('counts blanks separately — nothing to match is not a gap', () => {
    const r = matchReport([rec('A', '', '')], boards);
    expect(r.gaps).toEqual([]);
    expect(r.blank).toEqual([
      { kind: 'ahj', count: 1 },
      { kind: 'utility', count: 1 },
    ]);
  });

  it('reports a utility gap and a jurisdiction gap independently', () => {
    const r = matchReport([rec('A', 'Harris County', 'Oncor')], boards);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]).toMatchObject({ value: 'Oncor', kind: 'utility' });
  });

  it('reports how many records it looked at', () => {
    expect(matchReport([rec('A'), rec('B')], boards).checked).toBe(2);
  });
});
