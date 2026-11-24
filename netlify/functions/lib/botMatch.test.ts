import { describe, it, expect } from 'vitest';
import { type AhjLike, type RecordLike, matchReport } from './botMatch';

const boards: AhjLike[] = [
  { name: 'Harris County', aliases: ['Harris Co'], kind: 'ahj' },
  { name: 'CenterPoint', aliases: [], kind: 'utility' },
  { name: 'Old County', aliases: [], kind: 'ahj', deleted: true },
];

const rec = (customerName: string, jurisdiction?: string, utility?: string): RecordLike => ({
  sf: { customerName, jurisdiction, utility },
});

describe('botMatch — matchReport', () => {
  it('matches by name and alias (case/space-insensitive), no gap', () => {
    const r = matchReport([rec('A', 'harris  co', 'CenterPoint')], boards);
    expect(r.gaps).toEqual([]);
    expect(r.blank).toEqual([]);
    expect(r.checked).toBe(1);
  });

  it('groups an unmatched jurisdiction by value with its customers, worst first', () => {
    const r = matchReport(
      [rec('A', 'Montgomery County'), rec('B', 'Montgomery County'), rec('C', 'Waller County')],
      boards,
    );
    expect(r.gaps[0]).toEqual({ value: 'Montgomery County', kind: 'ahj', customers: ['A', 'B'], count: 2 });
    expect(r.gaps[1]).toEqual({ value: 'Waller County', kind: 'ahj', customers: ['C'], count: 1 });
  });

  it('counts blanks and does not treat a deleted board as a match', () => {
    const r = matchReport([rec('A', ''), rec('B', 'Old County', '')], boards);
    // A has no jurisdiction + no utility; B has a deleted-board jurisdiction + no utility.
    expect(r.blank).toContainEqual({ kind: 'ahj', count: 1 });
    expect(r.blank).toContainEqual({ kind: 'utility', count: 2 });
    expect(r.gaps.find((g) => g.value === 'Old County')).toBeTruthy();
  });

  it('flags an unmatched utility distinctly from a jurisdiction', () => {
    const r = matchReport([rec('A', 'Harris County', 'Oncor')], boards);
    expect(r.gaps).toEqual([{ value: 'Oncor', kind: 'utility', customers: ['A'], count: 1 }]);
  });
});
