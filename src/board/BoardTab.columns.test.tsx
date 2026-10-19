// @vitest-environment jsdom
// Column reordering and per-column value filters — Aboud, 2026-10-18.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardTab from './BoardTab';
import type { BoardLabel, BoardProject, BoardState } from './types';

const label = (id: string, name: string, columnKey: 'status' | 'phase', over: Partial<BoardLabel> = {}): BoardLabel => ({
  id,
  columnKey,
  name,
  color: '#1f8f7a',
  sortOrder: 0,
  isDefault: false,
  isDone: false,
  isSystem: false,
  archived: false,
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});

const project = (id: string, name: string, over: Partial<BoardProject> = {}): BoardProject => ({
  id,
  name,
  coordinator: '',
  statusId: 's1',
  phaseId: null,
  designedDate: null,
  rating: null,
  position: 1,
  createdAt: '2026-10-01T00:00:00Z',
  createdBy: 'Aboud Yousef',
  updatedAt: '2026-10-01T00:00:00Z',
  updatedBy: 'Aboud Yousef',
  schemaVersion: 1,
  ...over,
});

const BOARD: BoardState = {
  labels: [
    label('s1', 'Working on it', 'status'),
    // These are column-filter tests, so every row has to stay in the MAIN
    // table. "Hold" is out-of-scope by default (lib/board), which would move
    // two of the three rows into their own section — `outOfScope: false` keeps
    // the fixture about filtering and nothing else.
    label('s2', 'Hold', 'status', { outOfScope: false }),
  ],
  projects: [
    project('a', 'Alpha Customer', { coordinator: 'Omar Rajab' }),
    project('b', 'Bravo Customer', { coordinator: 'Anas Yaghmour', statusId: 's2' }),
    project('c', 'Charlie Customer', { coordinator: 'Omar Rajab', statusId: 's2' }),
  ],
  activity: [],
  updates: [],
};

function renderBoard() {
  return render(
    <BoardTab
      board={BOARD}
      setBoard={vi.fn()}
      me="Aboud Yousef"
      isAdmin
      authors={['Aboud Yousef', 'Omar Rajab', 'Anas Yaghmour']}
      toast={vi.fn()}
      records={[]}
      onOpenCompose={vi.fn()}
    />,
  );
}

const headerOrder = () =>
  [...document.querySelectorAll('thead tr:first-child th')].map((th) => th.textContent?.replace(/[↕↑↓▼\d]/g, '').trim());

describe('per-column value filters', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('lists the values present in that column', () => {
    renderBoard();

    fireEvent.click(screen.getByLabelText('Filter SOW coordinator'));

    expect(screen.getByLabelText('Anas Yaghmour')).toBeTruthy();
    expect(screen.getByLabelText('Omar Rajab')).toBeTruthy();
  });

  it('filters the rows down to the ticked value', () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText('Filter SOW coordinator'));

    fireEvent.click(screen.getByLabelText('Omar Rajab'));

    expect(screen.queryByText('Bravo Customer')).toBeNull();
    expect(screen.getByText('Alpha Customer')).toBeTruthy();
    expect(screen.getByText('Charlie Customer')).toBeTruthy();
  });

  it('shows label names in the Status filter, not internal ids', () => {
    renderBoard();

    fireEvent.click(screen.getByLabelText('Filter Status'));

    expect(screen.getByLabelText('Working on it')).toBeTruthy();
    expect(screen.getByLabelText('Hold')).toBeTruthy();
  });

  it('two columns narrow each other', () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText('Filter SOW coordinator'));
    fireEvent.click(screen.getByLabelText('Omar Rajab'));
    fireEvent.click(screen.getByLabelText('Filter Status'));
    fireEvent.click(screen.getByLabelText('Hold'));

    expect(screen.getByText('Charlie Customer')).toBeTruthy();
    expect(screen.queryByText('Alpha Customer')).toBeNull();
  });

  it('offers one obvious way to clear every column filter', () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText('Filter SOW coordinator'));
    fireEvent.click(screen.getByLabelText('Omar Rajab'));

    fireEvent.click(screen.getByRole('button', { name: /Column filters on — clear/ }));

    expect(screen.getByText('Bravo Customer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Column filters on/ })).toBeNull();
  });

  it('does not hide everything when the last value is unticked', () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText('Filter SOW coordinator'));
    fireEvent.click(screen.getByLabelText('Omar Rajab'));
    fireEvent.click(screen.getByLabelText('Omar Rajab'));

    expect(screen.getByText('Alpha Customer')).toBeTruthy();
    expect(screen.getByText('Bravo Customer')).toBeTruthy();
  });

  it('a filtered column still offers the values it is hiding, so it can be widened', () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText('Filter SOW coordinator'));
    fireEvent.click(screen.getByLabelText('Omar Rajab'));

    expect(screen.getByLabelText('Anas Yaghmour')).toBeTruthy();
  });
});

describe('column reordering', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('moves a dragged column into the target slot', () => {
    renderBoard();
    const before = headerOrder();
    expect(before.indexOf('Rating')).toBeGreaterThan(before.indexOf('SOW coordinator'));

    const ths = [...document.querySelectorAll('thead tr:first-child th')];
    const rating = ths.find((t) => t.textContent?.includes('Rating'))!;
    const coord = ths.find((t) => t.textContent?.includes('SOW coordinator'))!;
    fireEvent.dragStart(rating);
    fireEvent.dragOver(coord);
    fireEvent.drop(coord);

    const after = headerOrder();
    expect(after.indexOf('Rating')).toBeLessThan(after.indexOf('SOW coordinator'));
  });

  it('remembers the order across a remount', () => {
    const { unmount } = renderBoard();
    const ths = [...document.querySelectorAll('thead tr:first-child th')];
    const rating = ths.find((t) => t.textContent?.includes('Rating'))!;
    const coord = ths.find((t) => t.textContent?.includes('SOW coordinator'))!;
    fireEvent.dragStart(rating);
    fireEvent.drop(coord);
    unmount();

    renderBoard();

    const after = headerOrder();
    expect(after.indexOf('Rating')).toBeLessThan(after.indexOf('SOW coordinator'));
  });

  it('never moves the sticky Project name column', () => {
    renderBoard();
    const ths = [...document.querySelectorAll('thead tr:first-child th')];
    const name = ths.find((t) => t.textContent?.includes('Project name'))!;
    const rating = ths.find((t) => t.textContent?.includes('Rating'))!;

    fireEvent.dragStart(name);
    fireEvent.drop(rating);

    expect(headerOrder()[1]).toBe('Project name');
  });

  it('keeps every column — a reorder must never lose one', () => {
    renderBoard();
    const before = headerOrder().length;
    const ths = [...document.querySelectorAll('thead tr:first-child th')];
    fireEvent.dragStart(ths.find((t) => t.textContent?.includes('Rating'))!);
    fireEvent.drop(ths.find((t) => t.textContent?.includes('Status'))!);

    expect(headerOrder()).toHaveLength(before);
  });
});

describe('the body follows the header order', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('reorders the cells in each row, not just the headings', () => {
    renderBoard();
    const ths = [...document.querySelectorAll('thead tr:first-child th')];
    fireEvent.dragStart(ths.find((t) => t.textContent?.includes('Rating'))!);
    fireEvent.drop(ths.find((t) => t.textContent?.includes('SOW coordinator'))!);

    const ratingIdx = headerOrder().indexOf('Rating');
    const row = document.querySelector('tbody tr')!;
    const cells = [...row.querySelectorAll('td')];
    // The rating cell renders star buttons; find it by that, not by text.
    expect(within(cells[ratingIdx] as HTMLElement).queryAllByRole('button').length).toBeGreaterThan(0);
  });
});
