// @vitest-environment jsdom
// AHJ Requirements board: add AHJ, post, edit (history), pin, delete → trash →
// restore, alias conflicts, global search.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../lib/storage';
import type { Ahj } from '../types';
import AhjTab from './AhjTab';

function Harness({ initial = [] as Ahj[] }: { initial?: Ahj[] }) {
  const [ahjs, setAhjs] = useState<Ahj[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState(defaultSettings());
  return (
    <AhjTab
      ahjs={ahjs}
      setAhjs={setAhjs}
      selectedId={selectedId}
      onSelect={setSelectedId}
      settings={settings}
      setSettings={setSettings}
      toast={() => {}}
    />
  );
}

/** The right-hand board pane. Aliases also appear in the sidebar list now
 *  (Phase 8), so alias-chip assertions have to say which pane they mean. */
const board = () => document.querySelector('.ahj-board') as HTMLElement;

const addAhj = (name: string, aliases = '') => {
  fireEvent.click(screen.getByText('+ Add AHJ'));
  fireEvent.change(screen.getByPlaceholderText('e.g. Corpus Christi'), { target: { value: name } });
  if (aliases) fireEvent.change(screen.getByPlaceholderText('City of Corpus Christi'), { target: { value: aliases } });
  fireEvent.click(screen.getByRole('button', { name: 'Add AHJ' }));
};

const postRequirement = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText(/Post a new requirement/), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Post' }));
};

describe('AhjTab', () => {
  afterEach(cleanup);

  it('adds an AHJ with aliases and posts a requirement', () => {
    render(<Harness />);
    addAhj('Corpus Christi', 'City of Corpus Christi');
    // Board opens for the new AHJ.
    expect(screen.getByText('Requirements board')).toBeTruthy();
    expect(within(board()).getByText('City of Corpus Christi')).toBeTruthy(); // alias chip

    postRequirement('Use Square D for the AC Disconnect.');
    expect(screen.getByText('Use Square D for the AC Disconnect.')).toBeTruthy();
    expect(screen.getByText('Requirements (1)')).toBeTruthy();
  });

  it('rejects an AHJ whose name collides with an existing alias', () => {
    render(<Harness />);
    addAhj('Corpus Christi', 'City of Corpus Christi');
    addAhj('city of corpus christi');
    expect(screen.getByText(/already used by Corpus Christi/)).toBeTruthy();
  });

  it('edit creates a history version; restore brings the old text back', () => {
    render(<Harness />);
    addAhj('Houston');
    postRequirement('Original text.');

    fireEvent.click(screen.getByText('Edit'));
    const boxes = screen.getAllByRole('textbox');
    const editBox = boxes.find((b) => (b as HTMLTextAreaElement).value === 'Original text.')!;
    fireEvent.change(editBox, { target: { value: 'New text.' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText('New text.')).toBeTruthy();
    expect(screen.getByText('History (1)')).toBeTruthy();

    fireEvent.click(screen.getByText('History (1)'));
    fireEvent.click(screen.getByText('Original post'));
    fireEvent.click(screen.getByText('Restore this version'));
    expect(screen.getByText('Original text.')).toBeTruthy();
    expect(screen.getByText('History (2)')).toBeTruthy();
  });

  it('pinned posts sort first', () => {
    render(<Harness />);
    addAhj('Frisco');
    postRequirement('First post.');
    postRequirement('Second post.');
    // Newest first: Second, First. Pin "First post."
    const first = screen.getByText('First post.').closest('article')!;
    fireEvent.click(within(first).getByText('Pin to top'));
    const articles = document.querySelectorAll('article');
    expect(articles[0].textContent).toContain('First post.');
    expect(within(articles[0] as HTMLElement).getByText('Pinned')).toBeTruthy();
  });

  it('deleted post goes to Trash and can be restored', () => {
    render(<Harness />);
    addAhj('Pasadena');
    postRequirement('Meter number on cover sheet.');
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.queryByText('Meter number on cover sheet.')).toBeNull();

    fireEvent.click(screen.getByText(/▼ Show/));
    expect(screen.getByText(/Pasadena: “Meter number on cover sheet.”/)).toBeTruthy();
    fireEvent.click(screen.getByText('Restore'));
    expect(screen.getByText('Meter number on cover sheet.')).toBeTruthy();
  });

  it('deleting the AHJ moves the whole board to Trash; restore brings it back', () => {
    render(<Harness />);
    addAhj('Sugar Land');
    postRequirement('Some rule.');
    fireEvent.click(screen.getByText('Move AHJ to Trash'));
    fireEvent.click(screen.getByText('Move to Trash')); // confirm modal
    expect(screen.queryByText('Requirements board')).toBeNull();

    // Trash auto-opens after an AHJ delete.
    const restoreButtons = screen.getAllByText('Restore');
    fireEvent.click(restoreButtons[0]);
    expect(screen.getByText('Requirements board')).toBeTruthy();
    expect(screen.getByText('Some rule.')).toBeTruthy();
  });

  it('refuses to restore a trashed AHJ whose name is now taken', () => {
    render(<Harness />);
    addAhj('Katy');
    fireEvent.click(screen.getByText('Move AHJ to Trash'));
    fireEvent.click(screen.getByText('Move to Trash'));
    // Recreate the same name while the old one sits in Trash.
    addAhj('Katy');
    expect(screen.getByText('Requirements board')).toBeTruthy();

    // Trash auto-opened after the AHJ delete.
    fireEvent.click(screen.getByText('Restore'));
    // Still exactly one live "Katy" board; the trashed one stayed in Trash.
    expect(screen.getAllByText(/Deleted by/)).toHaveLength(1);
    expect(screen.getByText('Restore')).toBeTruthy();
  });

  it('deduplicates aliases and drops an alias equal to the AHJ name', () => {
    render(<Harness />);
    addAhj('Plano', 'City of Plano\nplano\nCITY OF PLANO');
    // Only the one real alias survives as a chip.
    expect(within(board()).getAllByText('City of Plano')).toHaveLength(1);
    expect(within(board()).queryByText('plano')).toBeNull();
    expect(within(board()).queryByText('CITY OF PLANO')).toBeNull();
  });

  it('global search finds post text and opens the board', () => {
    render(<Harness />);
    addAhj('Corpus Christi');
    postRequirement('Use Square D for the AC Disconnect.');
    addAhj('Houston');
    postRequirement('Combined PDF only.');
    // Houston is now selected; search should jump back to Corpus Christi.
    fireEvent.change(screen.getByPlaceholderText(/Search AHJs and posts/), { target: { value: 'square d' } });
    expect(screen.getByText(/1 result for/)).toBeTruthy();
    fireEvent.click(screen.getByText('Square D', { selector: 'mark' }));
    expect(screen.getByText('Requirements board').parentElement?.textContent).toContain('Corpus Christi');
  });
});

// Export PDF (Aboud 2026-10-08): print-only block, rendered from the same data
// as the screen so the PDF can never drift from the board.
describe('Export PDF', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const board = (over: Partial<Ahj> = {}): Ahj => ({
    id: 'b1',
    name: 'Harris County',
    aliases: ['City of Harris'],
    posts: [
      { id: 'p1', text: 'Use Square D for the AC disconnect.', by: 'Aboud Yousef', at: '2026-10-08T09:00:00.000Z', history: [], pinned: false, updatedAt: '2026-10-08T09:00:00.000Z' },
      { id: 'p2', text: 'A deleted rule.', by: 'Aboud Yousef', at: '2026-10-08T09:00:00.000Z', history: [], pinned: false, updatedAt: '2026-10-08T09:00:00.000Z', deleted: { at: '2026-10-08T10:00:00.000Z', by: 'Aboud Yousef' } },
    ],
    updatedAt: '2026-10-08T09:00:00.000Z',
    schemaVersion: 1,
    ...over,
  });

  /** Pick the board from the sidebar (its name also appears in the header). */
  const selectBoard = () => fireEvent.click(document.querySelector('.ahj-sidebar-item')!);
  const exportBtn = () => screen.getByRole('button', { name: 'Export PDF' }) as HTMLButtonElement;

  it('is disabled until a board with requirements is selected', () => {
    render(<Harness initial={[board()]} />);
    expect(exportBtn().disabled).toBe(true);
    selectBoard();
    expect(exportBtn().disabled).toBe(false);
  });

  it('stays disabled for a board whose only requirement is deleted', () => {
    render(<Harness initial={[board({ posts: [board().posts[1]] })]} />);
    selectBoard();
    expect(exportBtn().disabled).toBe(true);
  });

  it('the print block exists ONLY while printing — it must not duplicate the page', () => {
    let snapshot = '';
    vi.stubGlobal('print', () => {
      snapshot = document.querySelector('.req-print')?.textContent ?? '';
    });
    render(<Harness initial={[board()]} />);
    selectBoard();
    expect(document.querySelector('.req-print')).toBeNull(); // not mounted on screen
    fireEvent.click(exportBtn());
    expect(snapshot).toContain('Harris County');
    expect(snapshot).toContain('Use Square D for the AC disconnect.');
    expect(snapshot).toContain('City of Harris'); // aliases carried over
    expect(snapshot).not.toContain('A deleted rule.'); // deleted posts omitted
    expect(document.querySelector('.req-print')).toBeNull(); // unmounted again
  });

  it('prints with req-printing on the body, and clears it afterwards', () => {
    const seen: boolean[] = [];
    vi.stubGlobal('print', () => seen.push(document.body.classList.contains('req-printing')));
    render(<Harness initial={[board()]} />);
    selectBoard();
    fireEvent.click(exportBtn());
    expect(seen).toEqual([true]);
    expect(document.body.classList.contains('req-printing')).toBe(false);
  });
});
