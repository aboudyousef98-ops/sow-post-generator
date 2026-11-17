// Project board export — the 522-row board as a sheet.
//
// Built for the bot's daily assignment and stuck-project checks, so the tests
// are about the things those jobs depend on: that label ids are resolved to
// names, that "unassigned" says so in words, and that a tombstone is never
// exported as a project.

import { describe, expect, it } from 'vitest';
import { emptyBoard, newProject } from './board';
import type { BoardProject, BoardState } from '../board/types';
import { BOARD_EXPORT_HEADER, boardToCsv, toBoardRows } from './boardExport';

const NOW = new Date('2026-11-17T12:00:00.000Z');

function board(projects: Partial<BoardProject>[]): BoardState {
  const b = emptyBoard();
  // newProject needs the labels to pick the default status.
  b.projects = projects.map((over, i) => ({
    ...newProject(over.name ?? `P${i}`, 'Aboud Yousef', b.labels),
    ...over,
  })) as BoardProject[];
  return b;
}

const header = (): string[] => [...BOARD_EXPORT_HEADER];
const col = (rows: string[][], name: string, row = 1) => rows[row][header().indexOf(name)];

describe('toBoardRows', () => {
  it('writes the header first', () => {
    expect(toBoardRows(board([]), { now: NOW })[0]).toEqual(header());
  });

  it('resolves label ids to names — an id is useless outside the app', () => {
    const b = board([{ name: 'Macie Ahrens', statusId: 'status-working' }]);
    const rows = toBoardRows(b, { now: NOW });
    expect(col(rows, 'Project name')).toBe('Macie Ahrens');
    // Whatever the seeded label is called, it is a NAME, not the raw id.
    expect(col(rows, 'Status')).not.toBe('status-working');
    expect(col(rows, 'Status')).toBeTruthy();
  });

  it('says "Unassigned" in words rather than leaving a blank cell', () => {
    const rows = toBoardRows(board([{ name: 'X', coordinator: '' }]), { now: NOW });
    expect(col(rows, 'SOW coordinator')).toBe('Unassigned');
  });

  it('keeps a real coordinator as written', () => {
    const rows = toBoardRows(board([{ name: 'X', coordinator: 'Omar Rajab' }]), { now: NOW });
    expect(col(rows, 'SOW coordinator')).toBe('Omar Rajab');
  });

  it('counts days since the last update — the stuck-project signal', () => {
    const rows = toBoardRows(board([{ name: 'X', updatedAt: '2026-11-07T12:00:00.000Z' }]), { now: NOW });
    expect(col(rows, 'Days since update')).toBe('10');
  });

  it('never exports a deleted row — a tombstone is not a project', () => {
    const rows = toBoardRows(board([{ name: 'Gone', deletedAt: NOW.toISOString() }, { name: 'Here' }]), { now: NOW });
    expect(rows).toHaveLength(2);
    expect(col(rows, 'Project name')).toBe('Here');
  });

  it('excludes archived by default, matching the board itself', () => {
    const b = board([{ name: 'Live' }, { name: 'Filed', archivedAt: NOW.toISOString() }]);
    expect(toBoardRows(b, { now: NOW })).toHaveLength(2);
  });

  it('…but includes them on request, flagged', () => {
    const b = board([{ name: 'Live' }, { name: 'Filed', archivedAt: NOW.toISOString() }]);
    const rows = toBoardRows(b, { now: NOW, includeArchived: true });
    expect(rows).toHaveLength(3);
    const filed = rows.find((r) => r[0] === 'Filed')!;
    expect(filed[header().indexOf('Archived')]).toBe('Yes');
  });

  it('takes the install date from the records map, not the project', () => {
    const b = board([{ name: 'X', id: 'p1' }]);
    b.projects[0].id = 'p1';
    const rows = toBoardRows(b, { now: NOW, installByProject: new Map([['p1', '2026-12-01']]) });
    expect(col(rows, 'Install date')).toBe('2026-12-01');
  });

  it('a missing rating is blank, not a zero', () => {
    const rows = toBoardRows(board([{ name: 'X', rating: null }]), { now: NOW });
    expect(col(rows, 'Rating')).toBe('');
  });
});

describe('boardToCsv', () => {
  it('quotes a project name containing a comma', () => {
    const csv = boardToCsv([['Name'], ['Smith, John']]);
    expect(csv).toContain('"Smith, John"');
  });

  it('carries the BOM so Excel reads UTF-8 on Windows', () => {
    expect(boardToCsv([['a']]).charCodeAt(0)).toBe(0xfeff);
  });
});
