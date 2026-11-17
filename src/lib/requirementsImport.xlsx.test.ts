// The acceptance path, through a REAL .xlsx.
//
// requirementsImport.test.ts proves the decision layer against hand-built
// grids. This one proves the bit those cannot: that an actual workbook, read
// by exceljs and flattened by sheetToGrid, lands as the right rules on the
// right boards and comes back out cleanly.
//
// The workbook is built in-process rather than committed as a fixture — a
// binary blob in the repo is a thing nobody can review in a diff, and the
// generator doubles as documentation of the column format.

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { sheetToGrid } from './sfWorkbook';
import {
  applyRequirementsImport,
  listImportBatches,
  parseRequirementsGrid,
  planRequirementsImport,
  undoImportBatch,
} from './requirementsImport';
import type { Ahj } from '../types';

const HEADER = [
  'Name', 'Type', 'Region', 'Category', 'Requirement', 'Details',
  'Source', 'Source date', 'Origin', 'Confidence', 'Status', 'Aliases',
];

const ENTRIES: [string, string, string, string][] = [
  ['Irving', 'AHJ', 'DFW', ''],
  ['Harris County', 'AHJ', 'Houston', ''],
  ['Houston', 'AHJ', 'Houston', ''],
  ['Dallas', 'AHJ', 'DFW', ''],
  ['Plano', 'AHJ', 'DFW', ''],
  ['Oncor', 'Utility', 'DFW', 'Oncor Electric Delivery'],
  ['CenterPoint', 'Utility', 'Houston', 'CNP; CenterPoint Energy'],
];
const CATS = ['Setbacks', 'Fire access', 'Labeling', 'Rapid shutdown', 'Interconnection'];
const PER_ENTRY = 35;

/** 245 clean rows + one typo'd category + two invalid rows + one duplicate + one General. */
async function buildWorkbookGrid(): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rules');
  ws.addRow(HEADER);

  let n = 0;
  for (const [name, type, region, aliases] of ENTRIES) {
    for (let i = 0; i < PER_ENTRY; i++) {
      n++;
      ws.addRow([
        name, type, region, CATS[i % CATS.length],
        `Rule ${n} for ${name}.`,
        i % 3 === 0 ? `Detail line for rule ${n}.` : '',
        `https://example.gov/${name.toLowerCase().replace(/ /g, '-')}/${i}`,
        '2026-10-01', 'Permit desk',
        ['High', 'Medium', 'Low'][i % 3],
        i % 11 === 0 ? 'To confirm' : i % 17 === 0 ? 'Superseded' : 'Current',
        i === 0 ? aliases : '',
      ]);
    }
  }
  ws.addRow(['Irving', 'AHJ', 'DFW', 'Setback', 'Typo category rule.', '', '', '', '', 'High', 'Current', '']);
  ws.addRow(['', 'AHJ', 'DFW', 'Setbacks', 'Row with no name.', '', '', '', '', 'High', 'Current', '']);
  ws.addRow(['Irving', 'Pancake', 'DFW', 'Setbacks', 'Row with a bad type.', '', '', '', '', 'High', 'Current', '']);
  // A true duplicate: "Rule 2 for Irving." is i=1, which the generator marks
  // Current, so the original DOES import and this second copy is caught.
  // (Deliberately not "Rule 1", which is i=0 and therefore To confirm — that
  // row is held back by status, so a second copy of it is not a duplicate.)
  ws.addRow(['Irving', 'AHJ', 'DFW', 'Setbacks', 'Rule 2 for Irving.', '', '', '', '', 'High', 'Current', '']);
  // And the reverse case, pinned below: a Current row whose twin was skipped
  // by status must still import — the status gate runs BEFORE the dedupe
  // check precisely so a held-back row never consumes its twin's slot.
  ws.addRow(['Irving', 'AHJ', 'DFW', 'Setbacks', 'Rule 1 for Irving.', '', '', '', '', 'High', 'Current', '']);
  ws.addRow(['All jobs', 'General', '', 'Safety', 'No PVC on roofs.', '', '', '', '', 'High', 'Current', '']);

  // Round-trip through the real binary format, exactly as the browser does.
  const buf = await wb.xlsx.writeBuffer();
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(buf as ArrayBuffer);
  return sheetToGrid(read.worksheets[0]);
}

describe('a real .xlsx, end to end', () => {
  it('imports, groups, dedupes, reports and undoes cleanly', async () => {
    const grid = await buildWorkbookGrid();
    const parsed = parseRequirementsGrid(grid);

    // Two rows are deliberately unimportable; everything else parses.
    expect(parsed.error).toBeUndefined();
    expect(parsed.errors.map((e) => e.message).sort()).toEqual([
      'Name is empty.',
      'Type "Pancake" is not AHJ, Utility, Funding or General.',
    ]);
    // 7 entries x 35, + typo row + duplicate + status-twin + General = 249.
    expect(parsed.rows).toHaveLength(ENTRIES.length * PER_ENTRY + 4);

    const plan = planRequirementsImport(parsed, []);

    // Status filter: To confirm and Superseded both held back by default.
    expect(plan.counts.skippedByStatus).toBeGreaterThan(0);
    expect(plan.skippedByStatus.every((s) => s.status === 'to-confirm' || s.status === 'superseded')).toBe(true);

    // The duplicate row is caught against the file, not imported twice.
    expect(plan.duplicates.some((d) => d.against === 'file')).toBe(true);

    // ...but a Current row whose twin was held back by status DOES import.
    // Status is filtered before dedupe, so the skipped twin never blocks it.
    const irvingTexts = plan.entries.find((e) => e.name === 'Irving')!.rules.map((r) => r.text);
    expect(irvingTexts).toContain('Rule 1 for Irving.');
    expect(irvingTexts.filter((t) => t === 'Rule 2 for Irving.')).toHaveLength(1);

    // 8 entries: the 7 from the sheet plus "All jobs" (General).
    expect(plan.entries).toHaveLength(ENTRIES.length + 1);
    expect(plan.counts.newEntries).toBe(ENTRIES.length + 1);
    expect(plan.counts.existingEntries).toBe(0);

    // The typo'd category is flagged against the big one BEFORE any write.
    const setback = plan.categories.find((c) => c.label === 'Setback');
    expect(setback?.nearMatch).toBe('Setbacks');

    // ---- confirm ----
    let id = 0;
    const after = applyRequirementsImport([], plan, {
      by: 'Aboud Yousef',
      now: '2026-11-17T12:00:00.000Z',
      batchId: 'batch-xlsx',
      newId: () => `id-${++id}`,
    });

    const byName = (n: string) => after.find((b) => b.name === n) as Ahj;
    expect(byName('Oncor').kind).toBe('utility');
    expect(byName('Oncor').aliases).toEqual(['Oncor Electric Delivery']);
    expect(byName('CenterPoint').aliases).toEqual(['CNP', 'CenterPoint Energy']);
    expect(byName('All jobs').kind).toBe('general');

    // Per-rule fields survived the binary round trip.
    const irving = byName('Irving');
    const withDetails = irving.posts.find((p) => p.text.includes('\nDetail line'))!;
    expect(withDetails.category).toBeTruthy();
    expect(withDetails.region).toBe('DFW');
    expect(withDetails.sourceUrl).toMatch(/^https:\/\/example\.gov\/irving\//);
    expect(withDetails.sourceDate).toBe('2026-10-01');
    expect(withDetails.origin).toBe('Permit desk');
    expect(withDetails.importBatchId).toBe('batch-xlsx');

    // ---- re-import is a no-op ----
    const again = planRequirementsImport(parsed, after);
    expect(again.counts.newRules).toBe(0);
    // Everything that imported is now a board-duplicate, AND the row that was
    // already an in-file duplicate is still caught as one.
    expect(again.counts.duplicates).toBe(plan.counts.newRules + plan.counts.duplicates);
    expect(again.duplicates.filter((d) => d.against === 'board')).toHaveLength(plan.counts.newRules);

    // ---- the batch is discoverable, and undo takes it all back ----
    const batches = listImportBatches(after);
    expect(batches).toHaveLength(1);
    expect(batches[0].count).toBe(plan.counts.newRules);

    const { boards: undone, removed } = undoImportBatch(after, 'batch-xlsx');
    expect(removed).toBe(plan.counts.newRules);
    expect(undone).toEqual([]);
  });

  it('the To confirm toggle lets them in, and Superseded still never imports', async () => {
    const parsed = parseRequirementsGrid(await buildWorkbookGrid());
    const strict = planRequirementsImport(parsed, []);
    const loose = planRequirementsImport(parsed, [], { includeToConfirm: true });

    expect(loose.counts.newRules).toBeGreaterThan(strict.counts.newRules);
    expect(loose.skippedByStatus.every((s) => s.status === 'superseded')).toBe(true);
  });

  it('appends to boards that already exist rather than duplicating them', async () => {
    const parsed = parseRequirementsGrid(await buildWorkbookGrid());
    const existing: Ahj[] = [
      {
        id: 'b-irving',
        name: 'Irving',
        kind: 'ahj',
        aliases: ['City of Irving'],
        posts: [
          {
            id: 'human-1',
            text: 'Written by a person.',
            by: 'Omar Rajab',
            at: '2026-10-01T00:00:00.000Z',
            history: [],
            pinned: true,
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        updatedAt: '2026-10-01T00:00:00.000Z',
        schemaVersion: 1,
      },
    ];

    const plan = planRequirementsImport(parsed, existing);
    expect(plan.entries.find((e) => e.name === 'Irving')!.existingId).toBe('b-irving');

    let id = 0;
    const after = applyRequirementsImport(existing, plan, {
      by: 'Aboud Yousef',
      now: '2026-11-17T12:00:00.000Z',
      batchId: 'batch-2',
      newId: () => `new-${++id}`,
    });

    // One Irving board, the human post intact and still pinned.
    expect(after.filter((b) => b.name === 'Irving')).toHaveLength(1);
    const irving = after.find((b) => b.id === 'b-irving')!;
    expect(irving.posts.find((p) => p.id === 'human-1')).toEqual(existing[0].posts[0]);
    expect(irving.aliases).toContain('City of Irving');

    // Undo leaves the board and the human post standing.
    const { boards: undone } = undoImportBatch(after, 'batch-2');
    const left = undone.find((b) => b.id === 'b-irving')!;
    expect(left.posts).toHaveLength(1);
    expect(left.posts[0].id).toBe('human-1');
  });
});
