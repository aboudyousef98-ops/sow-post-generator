// Bulk import for the Requirements boards — the decision layer.
//
// These tests are the acceptance criteria written down: import rows, see the
// plan, confirm, find the rules under the right entries, undo cleanly. The
// three rules being defended throughout:
//   1. planRequirementsImport NEVER mutates the boards it is given
//   2. an import appends, it never overwrites
//   3. undo removes exactly this batch, and never a human's edit

import { describe, expect, it } from 'vitest';
import type { Ahj, AhjPost } from '../types';
import {
  applyRequirementsImport,
  countImportBatch,
  normRuleText,
  parseCsv,
  parseKind,
  parsePasted,
  parseRequirementsGrid,
  parseStatus,
  planRequirementsImport,
  ruleText,
  undoImportBatch,
} from './requirementsImport';

const T = '2026-11-17T12:00:00.000Z';

let n = 0;
const meta = () => ({ by: 'Aboud Yousef', now: T, batchId: 'batch-1', newId: () => `id-${++n}` });

function post(over: Partial<AhjPost> & { id: string }): AhjPost {
  return { text: 'x', by: 'A', at: T, history: [], pinned: false, updatedAt: T, ...over };
}
function ahj(over: Partial<Ahj> & { id: string; name: string }): Ahj {
  return { aliases: [], posts: [], updatedAt: T, schemaVersion: 1, ...over };
}

const HEADER = ['Name', 'Type', 'Region', 'Category', 'Requirement', 'Details', 'Source', 'Source date', 'Origin', 'Confidence', 'Status', 'Aliases'];
const row = (o: Partial<Record<string, string>>) =>
  [o.name ?? '', o.type ?? '', o.region ?? '', o.category ?? '', o.requirement ?? '', o.details ?? '',
   o.source ?? '', o.sourceDate ?? '', o.origin ?? '', o.confidence ?? '', o.status ?? '', o.aliases ?? ''];

const grid = (...rows: string[][]) => [HEADER, ...rows];

// ---- Value parsing ---------------------------------------------------------

describe('value parsing', () => {
  it('maps the four board types, case-insensitively', () => {
    expect(parseKind('AHJ')).toBe('ahj');
    expect(parseKind(' utility ')).toBe('utility');
    expect(parseKind('Funding')).toBe('funding');
    expect(parseKind('General')).toBe('general');
    expect(parseKind('Nonsense')).toBeNull();
  });

  it('an unreadable status imports as current rather than vanishing', () => {
    expect(parseStatus('')).toBe('current');
    expect(parseStatus('banana')).toBe('current');
    expect(parseStatus('To confirm')).toBe('to-confirm');
    expect(parseStatus('Superseded')).toBe('superseded');
  });

  it('details land beneath the requirement, and an empty one adds no blank line', () => {
    expect(ruleText('Rule.', 'More.')).toBe('Rule.\nMore.');
    expect(ruleText('Rule.', '  ')).toBe('Rule.');
  });

  it('rule text dedupes past case, spacing and a trailing stop', () => {
    expect(normRuleText('Three  foot setback.')).toBe(normRuleText('three foot setback'));
  });
});

describe('parseCsv', () => {
  it('handles quoted fields, embedded commas and doubled quotes', () => {
    const rows = parseCsv('a,b\n"x, y","he said ""no"""');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'he said "no"']]);
  });

  it('handles a newline inside a quoted field', () => {
    expect(parseCsv('a\n"one\ntwo"')).toEqual([['a'], ['one\ntwo']]);
  });

  it('a pasted tab-separated range is read as a grid', () => {
    expect(parsePasted('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

// ---- Parsing a grid --------------------------------------------------------

describe('parseRequirementsGrid', () => {
  it('reads a well-formed row', () => {
    const p = parseRequirementsGrid(
      grid(row({ name: 'Harris County', type: 'AHJ', category: 'Setbacks', requirement: 'Three feet.', confidence: 'High', status: 'Current', aliases: 'Harris Co.; HC' })),
    );
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ name: 'Harris County', kind: 'ahj', category: 'Setbacks', confidence: 'high', status: 'current' });
    expect(p.rows[0].aliases).toEqual(['Harris Co.', 'HC']);
  });

  it('finds the header even when the file starts with junk rows', () => {
    const p = parseRequirementsGrid([['Requirements export'], [], HEADER, row({ name: 'X', type: 'AHJ', requirement: 'R' })]);
    expect(p.rows).toHaveLength(1);
  });

  it('collects every validation error instead of stopping at the first', () => {
    const p = parseRequirementsGrid(
      grid(
        row({ name: '', type: 'AHJ', requirement: 'R' }),
        row({ name: 'X', type: 'AHJ', requirement: '' }),
        row({ name: 'Y', type: 'Pancake', requirement: 'R' }),
      ),
    );
    expect(p.rows).toHaveLength(0);
    expect(p.errors.map((e) => e.message)).toEqual([
      'Name is empty.',
      'Requirement is empty.',
      'Type "Pancake" is not AHJ, Utility, Funding or General.',
    ]);
  });

  it('errors point at the SOURCE row number a spreadsheet would show', () => {
    const p = parseRequirementsGrid(grid(row({ name: 'ok', type: 'AHJ', requirement: 'R' }), row({ name: '', type: 'AHJ', requirement: 'R' })));
    expect(p.errors[0].rowNumber).toBe(3);
  });

  it('a file with no recognisable header is rejected whole', () => {
    expect(parseRequirementsGrid([['nope', 'nothing']]).error).toMatch(/No header row/);
  });

  it('reports optional columns the file lacks', () => {
    const p = parseRequirementsGrid([['Name', 'Type', 'Requirement'], ['X', 'AHJ', 'R']]);
    expect(p.rows).toHaveLength(1);
    expect(p.missingColumns).toContain('confidence');
  });

  it('skips blank spacer rows silently', () => {
    const p = parseRequirementsGrid(grid(row({ name: 'X', type: 'AHJ', requirement: 'R' }), ['', '', ''], row({ name: 'Y', type: 'AHJ', requirement: 'R' })));
    expect(p.rows).toHaveLength(2);
    expect(p.errors).toEqual([]);
  });
});

// ---- Planning --------------------------------------------------------------

describe('planRequirementsImport', () => {
  it('groups rows by name + type into one entry', () => {
    const p = planRequirementsImport(
      parseRequirementsGrid(
        grid(
          row({ name: 'Harris County', type: 'AHJ', requirement: 'One.' }),
          row({ name: 'harris county', type: 'AHJ', requirement: 'Two.' }),
          row({ name: 'Harris County', type: 'Utility', requirement: 'Three.' }),
        ),
      ),
      [],
    );
    expect(p.entries).toHaveLength(2);
    expect(p.entries.find((e) => e.kind === 'ahj')!.rules).toHaveLength(2);
    expect(p.entries.find((e) => e.kind === 'utility')!.rules).toHaveLength(1);
  });

  it('appends to an existing board instead of creating a second one', () => {
    const existing = ahj({ id: 'b1', name: 'Harris County', kind: 'ahj', posts: [post({ id: 'p1', text: 'Old.' })] });
    const p = planRequirementsImport(
      parseRequirementsGrid(grid(row({ name: 'Harris County', type: 'AHJ', requirement: 'New.' }))),
      [existing],
    );
    expect(p.entries[0].existingId).toBe('b1');
    expect(p.counts.newEntries).toBe(0);
    expect(p.counts.existingEntries).toBe(1);
  });

  it('drops a rule already on the board, and says so', () => {
    const existing = ahj({ id: 'b1', name: 'Harris County', kind: 'ahj', posts: [post({ id: 'p1', text: 'Three feet.' })] });
    const p = planRequirementsImport(
      parseRequirementsGrid(grid(row({ name: 'Harris County', type: 'AHJ', requirement: 'three  feet' }))),
      [existing],
    );
    expect(p.entries).toHaveLength(0);
    expect(p.duplicates).toEqual([{ rowNumber: 2, label: 'Harris County', against: 'board' }]);
  });

  it('drops the same rule twice in one file', () => {
    const p = planRequirementsImport(
      parseRequirementsGrid(
        grid(row({ name: 'X', type: 'AHJ', requirement: 'Same.' }), row({ name: 'X', type: 'AHJ', requirement: 'same' })),
      ),
      [],
    );
    expect(p.entries[0].rules).toHaveLength(1);
    expect(p.duplicates[0].against).toBe('file');
  });

  it('imports Current only by default, naming what it skipped', () => {
    const p = planRequirementsImport(
      parseRequirementsGrid(
        grid(
          row({ name: 'X', type: 'AHJ', requirement: 'A', status: 'Current' }),
          row({ name: 'X', type: 'AHJ', requirement: 'B', status: 'To confirm' }),
          row({ name: 'X', type: 'AHJ', requirement: 'C', status: 'Superseded' }),
        ),
      ),
      [],
    );
    expect(p.entries[0].rules.map((r) => r.text)).toEqual(['A']);
    expect(p.skippedByStatus.map((s) => s.status)).toEqual(['to-confirm', 'superseded']);
  });

  it('the toggle lets To confirm in — but never Superseded', () => {
    const p = planRequirementsImport(
      parseRequirementsGrid(
        grid(
          row({ name: 'X', type: 'AHJ', requirement: 'B', status: 'To confirm' }),
          row({ name: 'X', type: 'AHJ', requirement: 'C', status: 'Superseded' }),
        ),
      ),
      [],
      { includeToConfirm: true },
    );
    expect(p.entries[0].rules.map((r) => r.text)).toEqual(['B']);
    expect(p.skippedByStatus.map((s) => s.status)).toEqual(['superseded']);
  });

  it('counts categories and flags a likely typo against a much bigger group', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ name: 'X', type: 'AHJ', category: 'Setbacks', requirement: `R${i}` })),
      row({ name: 'X', type: 'AHJ', category: 'Setback', requirement: 'odd one' }),
    ];
    const p = planRequirementsImport(parseRequirementsGrid(grid(...rows)), []);
    const setback = p.categories.find((c) => c.label === 'Setback')!;
    expect(setback.count).toBe(1);
    expect(setback.nearMatch).toBe('Setbacks');
    expect(p.categories.find((c) => c.label === 'Setbacks')!.nearMatch).toBeUndefined();
  });

  it('collects aliases without re-adding ones the board already has', () => {
    const existing = ahj({ id: 'b1', name: 'CenterPoint', kind: 'utility', aliases: ['CNP'] });
    const p = planRequirementsImport(
      parseRequirementsGrid(grid(row({ name: 'CenterPoint', type: 'Utility', requirement: 'R', aliases: 'CNP; CenterPoint Energy' }))),
      [existing],
    );
    expect(p.entries[0].aliasesToAdd).toEqual(['CenterPoint Energy']);
  });

  it('never mutates the boards it is given', () => {
    const existing = ahj({ id: 'b1', name: 'Harris County', kind: 'ahj', posts: [post({ id: 'p1' })] });
    const before = JSON.stringify(existing);
    planRequirementsImport(parseRequirementsGrid(grid(row({ name: 'Harris County', type: 'AHJ', requirement: 'New.' }))), [existing]);
    expect(JSON.stringify(existing)).toBe(before);
  });
});

// ---- Applying --------------------------------------------------------------

describe('applyRequirementsImport', () => {
  it('creates a board that did not exist, carrying every per-rule field', () => {
    const p = planRequirementsImport(
      parseRequirementsGrid(
        grid(row({ name: 'Irving', type: 'AHJ', region: 'DFW', category: 'Setbacks', requirement: 'Three feet.', details: 'From the ridge.', source: 'https://example.gov/x', sourceDate: '2026-01-02', origin: 'Permit desk', confidence: 'Medium' })),
      ),
      [],
    );
    const out = applyRequirementsImport([], p, meta());
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Irving');
    expect(out[0].kind).toBe('ahj');
    expect(out[0].posts[0]).toMatchObject({
      text: 'Three feet.\nFrom the ridge.',
      category: 'Setbacks',
      region: 'DFW',
      confidence: 'medium',
      sourceUrl: 'https://example.gov/x',
      sourceDate: '2026-01-02',
      origin: 'Permit desk',
      importBatchId: 'batch-1',
      by: 'Aboud Yousef',
    });
  });

  it('does not store status when it is the default', () => {
    const p = planRequirementsImport(parseRequirementsGrid(grid(row({ name: 'X', type: 'AHJ', requirement: 'R', status: 'Current' }))), []);
    expect(applyRequirementsImport([], p, meta())[0].posts[0].status).toBeUndefined();
  });

  it('stores to-confirm when it was let in', () => {
    const p = planRequirementsImport(
      parseRequirementsGrid(grid(row({ name: 'X', type: 'AHJ', requirement: 'R', status: 'To confirm' }))),
      [],
      { includeToConfirm: true },
    );
    expect(applyRequirementsImport([], p, meta())[0].posts[0].status).toBe('to-confirm');
  });

  it('APPENDS to an existing board and leaves every existing post untouched', () => {
    const existing = ahj({ id: 'b1', name: 'Harris County', kind: 'ahj', aliases: ['HC'], posts: [post({ id: 'p1', text: 'Old.', by: 'Omar' })] });
    const p = planRequirementsImport(
      parseRequirementsGrid(grid(row({ name: 'Harris County', type: 'AHJ', requirement: 'New.', aliases: 'Harris Co.' }))),
      [existing],
    );
    const out = applyRequirementsImport([existing], p, meta());
    expect(out).toHaveLength(1);
    expect(out[0].posts).toHaveLength(2);
    expect(out[0].posts.find((x) => x.id === 'p1')).toEqual(post({ id: 'p1', text: 'Old.', by: 'Omar' }));
    expect(out[0].aliases).toEqual(['HC', 'Harris Co.']);
  });

  it('leaves other boards completely alone', () => {
    const other = ahj({ id: 'b2', name: 'Dallas', kind: 'ahj', posts: [post({ id: 'p9' })] });
    const p = planRequirementsImport(parseRequirementsGrid(grid(row({ name: 'Irving', type: 'AHJ', requirement: 'R' }))), [other]);
    const out = applyRequirementsImport([other], p, meta());
    expect(out.find((b) => b.id === 'b2')).toBe(other);
  });
});

// ---- Undo ------------------------------------------------------------------

describe('undoImportBatch', () => {
  it('removes exactly this batch and nothing a human wrote', () => {
    const boards = [
      ahj({
        id: 'b1',
        name: 'Harris County',
        kind: 'ahj',
        posts: [post({ id: 'p1', text: 'Human.' }), post({ id: 'p2', text: 'Imported.', importBatchId: 'batch-1' })],
      }),
    ];
    expect(countImportBatch(boards, 'batch-1')).toBe(1);
    const { boards: out, removed } = undoImportBatch(boards, 'batch-1');
    expect(removed).toBe(1);
    expect(out[0].posts.map((p) => p.id)).toEqual(['p1']);
  });

  it('leaves another batch alone', () => {
    const boards = [ahj({ id: 'b1', name: 'X', posts: [post({ id: 'p1', importBatchId: 'batch-2' })] })];
    expect(undoImportBatch(boards, 'batch-1').removed).toBe(0);
  });

  it('KEEPS an imported post somebody has since edited', () => {
    const boards = [
      ahj({ id: 'b1', name: 'X', posts: [post({ id: 'p1', importBatchId: 'batch-1', editedAt: T, editedBy: 'Omar' })] }),
    ];
    const { boards: out, removed, keptEdited } = undoImportBatch(boards, 'batch-1');
    expect(removed).toBe(0);
    expect(keptEdited).toBe(1);
    expect(out[0].posts).toHaveLength(1);
  });

  it('removes a board the import created, once it is empty again', () => {
    const boards = [ahj({ id: 'b1', name: 'Irving', posts: [post({ id: 'p1', importBatchId: 'batch-1' })] })];
    expect(undoImportBatch(boards, 'batch-1').boards).toEqual([]);
  });

  it('KEEPS a pre-existing board that the import only appended to', () => {
    const boards = [
      ahj({ id: 'b1', name: 'Harris County', posts: [post({ id: 'p1', text: 'Human.' }), post({ id: 'p2', importBatchId: 'batch-1' })] }),
    ];
    const { boards: out } = undoImportBatch(boards, 'batch-1');
    expect(out).toHaveLength(1);
    expect(out[0].posts).toHaveLength(1);
  });
});

// ---- The acceptance path ---------------------------------------------------

describe('end to end: import, confirm, find the rules, undo', () => {
  it('round-trips a mixed sheet across AHJ, Utility and General', () => {
    const parsed = parseRequirementsGrid(
      grid(
        row({ name: 'Irving', type: 'AHJ', region: 'DFW', category: 'Setbacks', requirement: 'Three feet.' }),
        row({ name: 'Irving', type: 'AHJ', region: 'DFW', category: 'Labeling', requirement: 'Red placard.' }),
        row({ name: 'Oncor', type: 'Utility', region: 'DFW', category: 'Meter', requirement: 'Meter base.', aliases: 'Oncor Electric Delivery' }),
        row({ name: 'All jobs', type: 'General', requirement: 'No PVC on roofs.' }),
      ),
      );
    const plan = planRequirementsImport(parsed, []);
    expect(plan.counts).toMatchObject({ rows: 4, newEntries: 3, newRules: 4, duplicates: 0, errors: 0 });

    const after = applyRequirementsImport([], plan, meta());
    expect(after.map((b) => `${b.name}/${b.kind}`).sort()).toEqual(['All jobs/general', 'Irving/ahj', 'Oncor/utility']);
    expect(after.find((b) => b.name === 'Irving')!.posts).toHaveLength(2);
    expect(after.find((b) => b.name === 'Oncor')!.aliases).toEqual(['Oncor Electric Delivery']);

    // Re-importing the same sheet adds nothing.
    const again = planRequirementsImport(parsed, after);
    expect(again.counts.newRules).toBe(0);
    expect(again.counts.duplicates).toBe(4);

    // And the undo takes it all back out.
    const { boards: undone, removed } = undoImportBatch(after, 'batch-1');
    expect(removed).toBe(4);
    expect(undone).toEqual([]);
  });
});
