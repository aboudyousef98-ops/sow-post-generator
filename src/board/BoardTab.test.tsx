// @vitest-environment jsdom
// Board tab — create, duplicate guard, label edit, rating, archive/undo.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard, newProject, seedLabels } from '../lib/board';
import type { PostRecord } from '../types';
import type { BoardProject, BoardState } from './types';
import BoardTab from './BoardTab';

// floating-ui's autoUpdate needs ResizeObserver, which jsdom lacks.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const toasts: { text: string; action?: { label: string; fn: () => void } }[] = [];
const opened: BoardProject[] = [];

function Harness({ initial, records = [] }: { initial?: BoardState; records?: PostRecord[] }) {
  const [board, setBoard] = useState<BoardState>(initial ?? emptyBoard());
  return (
    <BoardTab
      board={board}
      setBoard={setBoard}
      me="Aboud Yousef"
      isAdmin
      authors={['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai']}
      toast={(text, action) => toasts.push({ text, action })}
      records={records}
      onOpenCompose={(p) => opened.push(p)}
    />
  );
}

function boardProject(name: string, id: string): BoardProject {
  return { ...newProject(name, 'Aboud Yousef', seedLabels(), '2026-10-01T00:00:00.000Z'), id };
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
    opened.length = 0;
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

  it('status → Done moves the row out of sight into Completed projects, with Undo', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('option', { name: 'Done' }));

    // Gone from the main board (section is collapsed by default)…
    expect(screen.queryByText('Martha Thompson')).toBeNull();
    expect(screen.getByText('Nothing in progress — everything is in Completed projects below.')).toBeTruthy();
    expect(toasts.at(-1)?.text).toBe('Martha Thompson → Completed projects.');

    // …and in the Completed section when expanded, still fully editable.
    const toggle = screen.getByRole('button', { name: /Completed projects/ });
    expect(within(toggle).getByText('1')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText('Martha Thompson')).toBeTruthy();

    // Undo brings it straight back to the main board.
    act(() => toasts.at(-1)!.action!.fn());
    expect(within(screen.getByRole('button', { name: /Completed projects/ })).getByText('0')).toBeTruthy();
    expect(screen.getByText('Martha Thompson')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy();
  });

  it('a custom label marked "done" also completes a project', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    // Add a label and tick its "done" flag in Edit labels.
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: /Edit labels/ }));
    const modal = document.querySelector('.modal') as HTMLElement;
    fireEvent.change(within(modal).getByLabelText('New label name'), { target: { value: 'Shipped' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Add' }));
    const row = within(modal).getByLabelText('Rename Shipped').closest('.board-label-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('option', { name: 'Shipped' }));

    expect(screen.queryByText('Martha Thompson')).toBeNull();
    expect(
      within(screen.getByRole('button', { name: /Completed projects/ })).getByText('1'),
    ).toBeTruthy();
  });

  it('designed-date range filter keeps only rows inside From–To', () => {
    render(<Harness />);
    addProject('Early Job');
    addProject('Late Job');

    // Give each row a designed date through the date cell popover.
    const setDate = (name: string, iso: string) => {
      const row = screen.getByText(name).closest('tr')!;
      fireEvent.click(row.querySelector('.board-date')!); // the empty phase cell also reads "—"
      fireEvent.change(screen.getByLabelText('Designed date'), { target: { value: iso } });
    };
    setDate('Early Job', '2026-09-01');
    setDate('Late Job', '2026-10-20');

    fireEvent.change(screen.getByLabelText('Designed date from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Designed date to'), { target: { value: '2026-10-31' } });
    expect(screen.queryByText('Early Job')).toBeNull();
    expect(screen.getByText('Late Job')).toBeTruthy();

    // A row with no date at all is hidden while a range is set.
    addProject('Dateless Job');
    expect(screen.queryByText('Dateless Job')).toBeNull();

    // Clearing the range brings everything back.
    fireEvent.click(screen.getByTitle('Clear the date range'));
    expect(screen.getByText('Early Job')).toBeTruthy();
    expect(screen.getByText('Dateless Job')).toBeTruthy();
  });

  it('Post column: — when unlinked, Draft/Posted when linked; click hands the project to Compose', () => {
    const board = emptyBoard();
    const p1 = { ...boardProject('Martha Thompson', 'pj-1') };
    const p2 = { ...boardProject('Patrick Lingwall', 'pj-2') };
    const p3 = { ...boardProject('No Post Yet', 'pj-3') };
    board.projects = [p1, p2, p3];
    const records = [
      { id: 'd1', status: 'draft', author: 'Omar Rajab', projectId: 'pj-1', updatedAt: '2026-10-02T10:00:00Z' },
      { id: 'po1', status: 'posted', author: 'Aboud Yousef', projectId: 'pj-2', postedAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
    ] as unknown as PostRecord[];

    render(<Harness initial={board} records={records} />);

    expect(screen.getByText(/Draft · OR ·/)).toBeTruthy();
    expect(screen.getByText(/Posted \d{2}\/\d{2} ✓/)).toBeTruthy();
    const empty = screen.getByText('No Post Yet').closest('tr')!;
    fireEvent.click(within(empty).getByTitle('Start a post for this project'));
    expect(opened.map((p) => p.id)).toEqual(['pj-3']);
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
