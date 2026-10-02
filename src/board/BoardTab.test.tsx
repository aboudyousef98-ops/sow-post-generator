// @vitest-environment jsdom
// Board tab — create, duplicate guard, label edit, rating, archive/undo.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../lib/board';
import type { BoardState } from './types';
import BoardTab from './BoardTab';

// floating-ui's autoUpdate needs ResizeObserver, which jsdom lacks.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const toasts: { text: string; action?: { label: string; fn: () => void } }[] = [];

function Harness({ initial }: { initial?: BoardState }) {
  const [board, setBoard] = useState<BoardState>(initial ?? emptyBoard());
  return (
    <BoardTab
      board={board}
      setBoard={setBoard}
      me="Aboud Yousef"
      isAdmin
      authors={['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai']}
      toast={(text, action) => toasts.push({ text, action })}
    />
  );
}

function addProject(name: string) {
  const input = screen.getByLabelText('Add project');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('BoardTab', () => {
  beforeEach(() => {
    localStorage.clear();
    toasts.length = 0;
    vi.stubGlobal('ResizeObserver', RO);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('quick-add creates a row with the default status and me as coordinator', () => {
    render(<Harness />);
    expect(screen.getByText(/No projects yet/)).toBeTruthy();

    addProject('  Martha   Thompson ');

    expect(screen.getByText('Martha Thompson')).toBeTruthy(); // name cleaned
    expect(screen.getByText('New project')).toBeTruthy(); // default label
    expect(screen.getAllByText('Aboud Yousef').length).toBeGreaterThan(0); // Q4
    // Input stays ready for the next one.
    expect((screen.getByLabelText('Add project') as HTMLInputElement).value).toBe('');
  });

  it('warns on a duplicate name (case/spacing-insensitive) and Add anyway forces it (T6)', () => {
    render(<Harness />);
    addProject('Martha Thompson');
    addProject('martha  THOMPSON');

    expect(screen.getByText(/Already on the board/)).toBeTruthy();
    expect(screen.getAllByText(/Martha Thompson/i)).toHaveLength(1); // not created yet

    fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
    expect(screen.getAllByText('martha THOMPSON').length + screen.getAllByText('Martha Thompson').length).toBe(2);
  });

  it('status cell opens the label grid and picking a label updates the cell', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('option', { name: 'Working on it' }));

    expect(screen.getByRole('button', { name: 'Working on it' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Done' })).toBeNull(); // popover closed
  });

  it('rating: click sets, clicking the same star clears, keyboard 3 works (T5)', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    const star2 = screen.getByRole('button', { name: '2 stars' });
    fireEvent.click(star2);
    expect(screen.getByRole('slider', { name: 'Rating' }).getAttribute('aria-valuenow')).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: '2 stars' }));
    expect(screen.getByRole('slider', { name: 'Rating' }).getAttribute('aria-valuenow')).toBe('0');

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Rating' }), { key: '3' });
    expect(screen.getByRole('slider', { name: 'Rating' }).getAttribute('aria-valuenow')).toBe('3');
  });

  it('archive hides the row, Undo restores it, Show archived reveals it', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(screen.queryByText('Martha Thompson')).toBeNull();
    expect(toasts.at(-1)?.text).toContain('Archived');

    // Undo from the toast action.
    act(() => toasts.at(-1)!.action!.fn());
    expect(screen.getByText('Martha Thompson')).toBeTruthy();

    // Archive again, then reveal via the filter toggle.
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show archived' }));
    expect(screen.getByText('Martha Thompson')).toBeTruthy();
  });

  it('Edit labels: add a custom label, then it is pickable (T4)', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: /Edit labels/ }));

    const modal = document.querySelector('.modal') as HTMLElement;
    fireEvent.change(within(modal).getByLabelText('New label name'), { target: { value: 'Waiting on SF' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Add' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('option', { name: 'Waiting on SF' }));
    expect(screen.getByRole('button', { name: 'Waiting on SF' })).toBeTruthy();
  });

  it('search filters rows; My projects filters by coordinator', () => {
    render(<Harness />);
    addProject('Martha Thompson');
    addProject('Patrick Lingwall');

    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'patrick' } });
    expect(screen.queryByText('Martha Thompson')).toBeNull();
    expect(screen.getByText('Patrick Lingwall')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: '' } });
    // Reassign one row to Omar, then "My projects" keeps only mine.
    const row = screen.getByText('Patrick Lingwall').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Aboud Yousef/ }));
    fireEvent.click(screen.getByRole('option', { name: /Omar Rajab/ }));
    fireEvent.click(screen.getByRole('button', { name: 'My projects' }));
    expect(screen.getByText('Martha Thompson')).toBeTruthy();
    expect(screen.queryByText('Patrick Lingwall')).toBeNull();
  });
});
