// @vitest-environment jsdom
// Board tab — create, duplicate guard, label edit, rating, archive/undo.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function Harness({
  initial,
  records = [],
  authors = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai'],
}: {
  initial?: BoardState;
  records?: PostRecord[];
  /** Override for the import tests, which need the real five-person roster. */
  authors?: string[];
}) {
  const [board, setBoard] = useState<BoardState>(initial ?? emptyBoard());
  return (
    <BoardTab
      board={board}
      setBoard={setBoard}
      me="Aboud Yousef"
      isAdmin
      authors={authors}
      toast={(text, action) => toasts.push({ text, action })}
      records={records}
      onOpenCompose={(p) => opened.push(p)}
    />
  );
}

/**
 * Same as Harness, but with prop identities that are STABLE across renders —
 * which is what App.tsx actually does (`settings.authors` and `records` come
 * from useState). The plain Harness recreates `authors` every render, which
 * silently invalidates BoardTab's `columns` useMemo and can mask stale-closure
 * bugs. Use this one for anything touching memoized callbacks.
 */
const STABLE_AUTHORS = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai'];
const STABLE_RECORDS: PostRecord[] = [];

function StableHarness({ initial }: { initial?: BoardState }) {
  const [board, setBoard] = useState<BoardState>(initial ?? emptyBoard());
  return (
    <BoardTab
      board={board}
      setBoard={setBoard}
      me="Aboud Yousef"
      isAdmin
      authors={STABLE_AUTHORS}
      toast={(text, action) => toasts.push({ text, action })}
      records={STABLE_RECORDS}
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

  it('rating: 5-star scale — click sets, clicking the same star clears, keyboard 1–5 works (T5)', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    const slider = () => screen.getByRole('slider', { name: 'Rating' });
    expect(slider().getAttribute('aria-valuemax')).toBe('5');

    // 1–3 land immediately; 4 and 5 are gated (see the rating-reason tests).
    fireEvent.click(screen.getByRole('button', { name: '3 stars' }));
    expect(slider().getAttribute('aria-valuenow')).toBe('3');

    fireEvent.click(screen.getByRole('button', { name: '3 stars' }));
    expect(slider().getAttribute('aria-valuenow')).toBe('0');

    fireEvent.keyDown(slider(), { key: '2' });
    expect(slider().getAttribute('aria-valuenow')).toBe('2');
  });

  // Aboud 2026-10-17 #3: "when the project is rated 4 or 5 the user must fill
  // out a small note saying why this project is 4 or 5 stars ... and btw I want
  // this comment to be inside the updates feature".
  describe('a 4- or 5-star rating must say why', () => {
    const rate = (stars: number) => fireEvent.click(screen.getByRole('button', { name: `${stars} stars` }));
    const slider = () => screen.getByRole('slider', { name: 'Rating' });

    it('asks for a reason and does NOT apply the rating until one is given', () => {
      render(<Harness />);
      addProject('Martha Thompson');

      rate(5);
      expect(screen.getByText('Why is this 5 stars?')).toBeTruthy();
      // The star has not moved yet — the gate holds the patch.
      expect(slider().getAttribute('aria-valuenow')).toBe('0');
    });

    it('cancelling abandons the rating entirely', () => {
      render(<Harness />);
      addProject('Martha Thompson');

      rate(4);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Why is this 4 stars?')).toBeNull();
      expect(slider().getAttribute('aria-valuenow')).toBe('0');
    });

    it('cannot be confirmed empty', () => {
      render(<Harness />);
      addProject('Martha Thompson');

      rate(5);
      expect(screen.getByRole('button', { name: /Rate 5/ }).hasAttribute('disabled')).toBe(true);
    });

    it('applies the rating and posts the reason to Updates', () => {
      render(<Harness />);
      addProject('Martha Thompson');

      rate(5);
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'this project has trench and external long run' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Rate 5/ }));

      expect(slider().getAttribute('aria-valuenow')).toBe('5');

      // The reason is on the project's Updates thread, tagged and searchable.
      fireEvent.click(screen.getAllByTitle(/open the thread/)[0]);
      expect(screen.getByText(/trench and external long run/)).toBeTruthy();
      expect(screen.getByText(/Rating reason/)).toBeTruthy();
    });

    it('1–3 stars are not gated', () => {
      render(<Harness />);
      addProject('Martha Thompson');

      rate(3);
      expect(screen.queryByLabelText('Reason')).toBeNull();
      expect(slider().getAttribute('aria-valuenow')).toBe('3');
    });
  });

  it('hold a row and drag it above another — order flips and sticks (monday-style)', () => {
    const board = emptyBoard();
    board.projects = [
      { ...boardProject('Alpha Job', 'pa'), position: 3000 },
      { ...boardProject('Beta Job', 'pb'), position: 2000 },
    ];
    render(<Harness initial={board} />);

    const rows = () => Array.from(document.querySelectorAll<HTMLElement>('tbody tr[data-project-id]'));
    expect(rows().map((r) => r.getAttribute('data-project-id'))).toEqual(['pa', 'pb']);

    // jsdom has no layout — give each row a real rect (40px tall, stacked).
    rows().forEach((r, i) => {
      r.getBoundingClientRect = () =>
        ({ top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 600, width: 600, x: 0, y: i * 40, toJSON: () => ({}) }) as DOMRect;
    });

    // Hold Beta anywhere on the row (y≈60) and drag it above Alpha's midpoint.
    fireEvent(rows()[1], new MouseEvent('pointerdown', { bubbles: true, clientY: 60, button: 0 }));
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientY: 10 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientY: 10 }));

    expect(rows().map((r) => r.getAttribute('data-project-id'))).toEqual(['pb', 'pa']);
  });

  it('a short press without movement is still a click, not a drag', () => {
    render(<Harness />);
    addProject('Martha Thompson');

    const row = screen.getByText('Martha Thompson').closest('tr')!;
    fireEvent(row, new MouseEvent('pointerdown', { bubbles: true, clientY: 20, button: 0 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientY: 20 }));

    // The status cell still opens its editor on a normal click afterwards.
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByRole('option', { name: 'Working on it' })).toBeTruthy();
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
    expect(screen.getByText('Nothing in progress — every project is in a section below.')).toBeTruthy();
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
    // Two flags live on a status row now — "done" and "out of scope".
    fireEvent.click(within(row).getByLabelText('done'));
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

// ---- Tier 1 (_STUDY_board_benchmark.md) ------------------------------------

describe('BoardTab — Tier 1', () => {
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

  function withRows() {
    const board = emptyBoard();
    board.projects = [
      { ...boardProject('Martha Thompson', 'pj-1'), coordinator: 'Omar Rajab', statusId: 'status-new' },
      { ...boardProject('Patrick Lingwall', 'pj-2'), coordinator: 'Aboud Yousef', statusId: 'status-working' },
      { ...boardProject('Carla Nunez', 'pj-3'), coordinator: 'Omar Rajab', statusId: 'status-new' },
    ];
    return board;
  }

  // ---- Out of SOW scope (Aboud 2026-10-19) ----------------------------------

  /** withRows() plus the live board's Hold label and one row on it. */
  function withHold() {
    const board = withRows();
    board.labels = [
      ...seedLabels(),
      {
        id: 'hold',
        columnKey: 'status',
        name: 'Hold',
        color: '#FDAB3D',
        sortOrder: 90,
        isDefault: false,
        isDone: false,
        isSystem: false,
        archived: false,
        updatedAt: '2026-10-10T00:00:00.000Z',
      },
    ];
    board.projects.push({ ...boardProject('Karan Staggers', 'pj-4'), statusId: 'hold' });
    return board;
  }

  it('a Hold row leaves the active table for the Out of SOW scope section', () => {
    render(<Harness initial={withHold()} />);
    // Collapsed by default, so the row is off the board entirely…
    expect(screen.queryByText('Karan Staggers')).toBeNull();
    const toggle = screen.getByRole('button', { name: /Out of SOW scope/ });
    expect(toggle.textContent).toContain('1');
    // …and the header count speaks only about the three active ones.
    expect(screen.getByText('3 of 3 active projects')).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.getByText('Karan Staggers')).toBeTruthy();
  });

  it('the section sits between the active table and Completed projects', () => {
    render(<Harness initial={withHold()} />);
    const cards = Array.from(document.querySelectorAll('.list-card'));
    // SectionCard puts `board-done` on ALL THREE sections (it carries the
    // shared layout; `board-${variant}` carries the accent). So Completed is
    // the one with no variant class of its own — matching on `board-done`
    // alone finds Installation Review first and lies about the order.
    const review = cards.findIndex((c) => c.classList.contains('board-review'));
    const scope = cards.findIndex((c) => c.classList.contains('board-scope'));
    const done = cards.findIndex(
      (c) =>
        c.classList.contains('board-done') &&
        !c.classList.contains('board-scope') &&
        !c.classList.contains('board-review'),
    );
    expect(review).toBeGreaterThan(0); // the main table card comes first
    expect(scope).toBeGreaterThan(review);
    expect(done).toBeGreaterThan(scope);
  });

  it('a search reveals an out-of-scope match without opening the section by hand', () => {
    render(<Harness initial={withHold()} />);
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'Karan' } });
    expect(screen.getByText('Karan Staggers')).toBeTruthy();
  });

  it('the open/shut choice survives a remount', () => {
    const board = withHold();
    const { unmount } = render(<Harness initial={board} />);
    fireEvent.click(screen.getByRole('button', { name: /Out of SOW scope/ }));
    unmount();
    render(<Harness initial={board} />);
    expect(screen.getByText('Karan Staggers')).toBeTruthy();
  });

  // ---- Import from Salesforce (Aboud 2026-10-19) ----------------------------

  const SCHEDULED_REPORT = readFileSync(
    resolve('src/lib/__fixtures__/sf-report-scheduled-partial.txt'),
    'utf8',
  );

  function openImport() {
    fireEvent.click(screen.getByRole('button', { name: /Import from Salesforce/ }));
    fireEvent.change(screen.getByLabelText('Salesforce report'), { target: { value: SCHEDULED_REPORT } });
    fireEvent.click(screen.getByRole('button', { name: /^Import 4$/ }));
  }

  it('importing the Scheduled report creates every missing row, on Schedule', () => {
    render(<Harness initial={emptyBoard()} />);
    openImport();

    for (const n of ['Karan Staggers', 'Nikki Calton', 'Eric Webber', 'Susan Stone']) {
      expect(screen.getByText(n)).toBeTruthy();
    }
    // The cut-off row was reported in the preview, never written.
    expect(screen.queryByText('Paul Richardson')).toBeNull();
    // Four rows, all on Schedule, so the Design/Schedule cell says so.
    expect(screen.getAllByRole('button', { name: 'Schedule' })).toHaveLength(4);
    expect(screen.getByText('4 of 4 active projects')).toBeTruthy();
  });

  it('the import carries each row’s SOW coordinator, Ya’rob included', () => {
    // The real roster spells him "Yarob"; Salesforce writes "Ya'rob".
    render(
      <Harness
        initial={emptyBoard()}
        authors={['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai', 'Yarob Alnabelsi', 'Anas Yaghmour']}
      />,
    );
    openImport();
    const row = screen.getByText('Eric Webber').closest('tr') as HTMLElement;
    // The ROSTER spelling lands on the row, not Salesforce's "Ya'rob".
    expect(within(row).getByText('Yarob Alnabelsi')).toBeTruthy();
    // And Anas, who the report assigns to a different row.
    const nikki = screen.getByText('Nikki Calton').closest('tr') as HTMLElement;
    expect(within(nikki).getByText('Anas Yaghmour')).toBeTruthy();
  });

  it('one Undo takes the whole import back off the board', () => {
    render(<Harness initial={emptyBoard()} />);
    openImport();
    expect(toasts.at(-1)?.text).toMatch(/Imported 4 projects/);

    act(() => toasts.at(-1)!.action!.fn());

    for (const n of ['Karan Staggers', 'Nikki Calton', 'Eric Webber', 'Susan Stone']) {
      expect(screen.queryByText(n)).toBeNull();
    }
    expect(screen.getByText(/No projects yet/)).toBeTruthy();
  });

  it('a second import of the same report changes nothing and offers nothing to do', () => {
    render(<Harness initial={emptyBoard()} />);
    openImport();

    fireEvent.click(screen.getByRole('button', { name: /Import from Salesforce/ }));
    fireEvent.change(screen.getByLabelText('Salesforce report'), { target: { value: SCHEDULED_REPORT } });
    expect((screen.getByRole('button', { name: /^Import$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/matches the board already/)).toBeTruthy();
  });

  it('every imported row is in the activity log', () => {
    render(<Harness initial={emptyBoard()} />);
    openImport();
    fireEvent.click(screen.getByText('Karan Staggers').closest('tr')!.querySelector('.board-updated-cell')!);
    expect(screen.getByText(/created the project/)).toBeTruthy();
  });

  it('a new row whose Salesforce status is Hold lands in Out of SOW scope', () => {
    const board = emptyBoard();
    board.labels = [
      ...seedLabels(),
      { id: 'hold', columnKey: 'status', name: 'Hold', color: '#FDAB3D', sortOrder: 90,
        isDefault: false, isDone: false, isSystem: false, archived: false, updatedAt: '2026-10-10T00:00:00.000Z' },
    ];
    render(<Harness initial={board} />);
    fireEvent.click(screen.getByRole('button', { name: /Import from Salesforce/ }));
    fireEvent.change(screen.getByLabelText('Salesforce report'), {
      target: { value: readFileSync(resolve('src/lib/__fixtures__/sf-report-design-cancel-hold.txt'), 'utf8') },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import 9$/ }));

    // Randel Love is Hold in Salesforce, so it skips the pipeline entirely.
    expect(screen.queryByText('Randel Love')).toBeNull();
    const scope = screen.getByRole('button', { name: /Out of SOW scope/ });
    expect(scope.textContent).toContain('1');
    fireEvent.click(scope);
    expect(screen.getByText('Randel Love')).toBeTruthy();
    // The other eight are on the board as usual.
    expect(screen.getByText('Gloria Davis')).toBeTruthy();
  });

  it('group by status: a header per label, in label order, with counts', () => {
    render(<Harness initial={withRows()} />);
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'status' } });

    const heads = screen.getAllByRole('button', { expanded: true });
    const titles = heads.map((h) => h.textContent);
    expect(titles.some((t) => t?.includes('New project') && t?.includes('2'))).toBe(true);
    expect(titles.some((t) => t?.includes('Working on it') && t?.includes('1'))).toBe(true);
    // All three rows are still on screen.
    for (const n of ['Martha Thompson', 'Patrick Lingwall', 'Carla Nunez']) {
      expect(screen.getByText(n)).toBeTruthy();
    }
  });

  it('group by coordinator, and collapsing a group hides only its rows', () => {
    render(<Harness initial={withRows()} />);
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'coordinator' } });

    const omar = screen.getAllByRole('button', { expanded: true }).find((h) => h.textContent?.includes('Omar Rajab'))!;
    fireEvent.click(omar);
    expect(screen.queryByText('Martha Thompson')).toBeNull();
    expect(screen.queryByText('Carla Nunez')).toBeNull();
    expect(screen.getByText('Patrick Lingwall')).toBeTruthy(); // Aboud's group, untouched
  });

  it('the group choice survives a remount', () => {
    const board = withRows();
    const { unmount } = render(<Harness initial={board} />);
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'status' } });
    unmount();
    render(<Harness initial={board} />);
    expect((screen.getByLabelText('Group by') as HTMLSelectElement).value).toBe('status');
  });

  it('install date is mirrored from the linked post — posted wins over draft', () => {
    const board = withRows();
    const records = [
      { id: 'd1', status: 'draft', author: 'Omar Rajab', projectId: 'pj-1', updatedAt: '2026-10-02T10:00:00Z', sf: { installScheduledDate: '2026-12-24' } },
      { id: 'po1', status: 'posted', author: 'Aboud Yousef', projectId: 'pj-1', postedAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', sf: { installScheduledDate: '2026-11-05' } },
    ] as unknown as PostRecord[];
    render(<Harness initial={board} records={records} />);
    expect(screen.getByText('11/05/2026')).toBeTruthy();
    expect(screen.queryByText('12/24/2026')).toBeNull();
  });

  it('install date is read-only — no button, no input, in the cell', () => {
    const board = withRows();
    const records = [
      { id: 'po1', status: 'posted', author: 'Aboud Yousef', projectId: 'pj-1', postedAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', sf: { installScheduledDate: '2026-11-05' } },
    ] as unknown as PostRecord[];
    render(<Harness initial={board} records={records} />);
    const cell = screen.getByText('11/05/2026').closest('td')!;
    expect(cell.querySelector('button')).toBeNull();
    expect(cell.querySelector('input')).toBeNull();
  });

  it('bulk edit: set status on two rows in one write, then Undo restores each row', () => {
    render(<Harness initial={withRows()} />);
    fireEvent.click(screen.getByLabelText('Select Martha Thompson'));
    fireEvent.click(screen.getByLabelText('Select Patrick Lingwall'));
    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Set status/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // Both landed in Completed projects, so neither is on the main board.
    expect(toasts.at(-1)!.text).toBe('2 projects → Done.');
    expect(screen.queryByText('Martha Thompson')).toBeNull();
    expect(screen.queryByText('Patrick Lingwall')).toBeNull();
    expect(screen.getByText('Carla Nunez')).toBeTruthy();

    // Undo puts each row back where IT was — not a single shared value.
    act(() => toasts.at(-1)!.action!.fn());
    const martha = screen.getByText('Martha Thompson').closest('tr')!;
    const patrick = screen.getByText('Patrick Lingwall').closest('tr')!;
    expect(within(martha).getByText('New project')).toBeTruthy();
    expect(within(patrick).getByText('Working on it')).toBeTruthy();
  });

  it('bulk edit: select-all checkbox, and the bar disappears once cleared', () => {
    render(<Harness initial={withRows()} />);
    fireEvent.click(screen.getByLabelText('Select all shown'));
    expect(screen.getByText('3 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Set coordinator/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mohammad Refai' }));
    expect(toasts.at(-1)!.text).toBe('3 projects → Mohammad Refai.');
    expect(screen.queryByText('3 selected')).toBeNull(); // selection cleared after applying
  });

  // Regression (review, 2026-10-08): the select-all header lives inside the
  // `columns` useMemo, so it closed over a STALE `shown`. After narrowing a
  // filter, select-all wrote the previous row set — rows that were no longer
  // on screen — and a bulk edit then hit projects the user never selected.
  //
  // NOTE: this must render through StableHarness. The normal Harness passes
  // `authors` as a fresh array literal on every render, which invalidates the
  // columns memo each time and accidentally HIDES this bug. App.tsx passes a
  // stable `settings.authors`, so the real app was affected.
  it('select-all under a filter never selects rows that were off screen', () => {
    render(<StableHarness initial={withRows()} />);
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'martha' } });
    fireEvent.click(screen.getByLabelText('Select all shown'));
    expect(screen.getByText('1 selected')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: '' } });
    // Must still be just Martha — not all three.
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('select-all ignores rows hidden inside a collapsed group', () => {
    render(<StableHarness initial={withRows()} />);
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'coordinator' } });

    const omar = screen.getAllByRole('button', { expanded: true }).find((h) => h.textContent?.includes('Omar Rajab'))!;
    fireEvent.click(omar); // Martha + Carla are Omar's — now hidden
    expect(screen.queryByText('Martha Thompson')).toBeNull();

    fireEvent.click(screen.getByLabelText('Select all shown'));
    // Only Patrick (Aboud's, still visible) may be selected.
    expect(screen.getByText('1 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Set status/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(toasts.at(-1)!.text).toBe('1 project → Done.');
  });

  // REVERSED on 2026-10-17. This used to assert that filtering a selected row
  // away silently DROPPED it. That was the most plausible cause of Aboud's
  // report: "I select multi project and change the status it does not do the
  // action for all projects" — rows he had ticked quietly left the selection,
  // so the bulk action hit fewer rows than the bar implied.
  //
  // Now an explicitly ticked row stays ticked, and the bar says how many are
  // hidden. "Select all shown" still only takes visible rows — the test above
  // ("select-all ignores rows hidden inside a collapsed group") still holds.
  it('a selected row hidden by a filter stays selected, and is reported', () => {
    render(<Harness initial={withRows()} />);
    fireEvent.click(screen.getByLabelText('Select Martha Thompson'));
    fireEvent.click(screen.getByLabelText('Select Patrick Lingwall'));
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'martha' } });

    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(screen.getByText(/1 hidden/)).toBeTruthy();
  });

  it('a bulk action still applies to a selected row the filter hides', () => {
    render(<Harness initial={withRows()} />);
    fireEvent.click(screen.getByLabelText('Select Martha Thompson'));
    fireEvent.click(screen.getByLabelText('Select Patrick Lingwall'));
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'martha' } });

    fireEvent.click(screen.getByRole('button', { name: /Set status/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    // Both — the hidden Patrick included. This is the actual bug fix.
    expect(toasts.at(-1)!.text).toBe('2 projects → Done.');
  });


  it('aging: a row untouched for 14+ days is flagged, a fresh one is not', () => {
    const board = emptyBoard();
    board.projects = [
      { ...boardProject('Old Job', 'pj-old'), updatedAt: '2026-01-01T00:00:00.000Z' },
      { ...boardProject('Fresh Job', 'pj-new'), updatedAt: new Date().toISOString() },
    ];
    render(<Harness initial={board} />);
    const old = screen.getByText('Old Job').closest('tr')!;
    const fresh = screen.getByText('Fresh Job').closest('tr')!;
    expect(old.className).toContain('board-row-aging-stale');
    expect(fresh.className).toContain('board-row-aging-none');
    expect(within(old).getByTitle(/No change in \d+ days/)).toBeTruthy();
  });

  it('aging: a passed install date reads as overdue and beats stale', () => {
    const board = emptyBoard();
    board.projects = [{ ...boardProject('Missed It', 'pj-1'), updatedAt: '2026-01-01T00:00:00.000Z' }];
    const records = [
      { id: 'po1', status: 'posted', author: 'Aboud Yousef', projectId: 'pj-1', postedAt: '2026-02-01T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z', sf: { installScheduledDate: '2026-02-10' } },
    ] as unknown as PostRecord[];
    render(<Harness initial={board} records={records} />);
    const row = screen.getByText('Missed It').closest('tr')!;
    expect(row.className).toContain('board-row-aging-overdue');
    expect(row.className).not.toContain('board-row-aging-stale');
  });

  it('Needs attention preset keeps only flagged rows; All active clears it', () => {
    const board = emptyBoard();
    board.projects = [
      { ...boardProject('Old Job', 'pj-old'), updatedAt: '2026-01-01T00:00:00.000Z' },
      { ...boardProject('Fresh Job', 'pj-new'), updatedAt: new Date().toISOString() },
    ];
    render(<Harness initial={board} />);
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }));
    expect(screen.getByText('Old Job')).toBeTruthy();
    expect(screen.queryByText('Fresh Job')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All active' }));
    expect(screen.getByText('Fresh Job')).toBeTruthy();
  });

  it('a preset replaces the previous filters rather than stacking on them', () => {
    render(<Harness initial={withRows()} />);
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'martha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
    // 'Mine' cleared the search, so Aboud's row shows and Martha's (Omar's) does not.
    expect(screen.getByText('Patrick Lingwall')).toBeTruthy();
    expect(screen.queryByText('Martha Thompson')).toBeNull();
    expect((screen.getByLabelText('Search projects') as HTMLInputElement).value).toBe('');
  });
});

// Aboud 2026-10-17 #6: "whenever a person put the status to 'Pending additional
// information' the system also must open the updates window and ask him to
// write what information is he missing. This is a must".
//
// NOTE: that label is one Aboud created himself — it is NOT in seedLabels() —
// so the gate matches it BY NAME (case/space-insensitive). Renaming the label
// in Admin → Labels would stop the gate firing. See lib/updates.ts.
describe('Pending Additional Information must say what is missing', () => {
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

  const PENDING = {
    id: 'status-pending-info',
    columnKey: 'status' as const,
    name: 'Pending Additional Information',
    color: '#FDAB3D',
    sortOrder: 50,
    isDefault: false,
    isDone: false,
    isSystem: false,
    archived: false,
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  const withPending = () => {
    const b = emptyBoard();
    b.labels = [...b.labels, PENDING];
    b.projects = [boardProject('Martha Thompson', 'pm')];
    return b;
  };

  const setStatusToPending = () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'New project' })[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Pending Additional Information' }));
  };

  /** The board renders two table bodies (sticky header clone) — take the first. */
  const openThread = () => fireEvent.click(screen.getAllByTitle(/open the thread|Post the first update/)[0]);

  it('asks what is missing, and does not change the status yet', () => {
    render(<Harness initial={withPending()} />);
    setStatusToPending();

    expect(screen.getByText('What information is missing?')).toBeTruthy();
    // Still the default status — the gate holds the patch.
    expect(screen.getAllByRole('button', { name: 'New project' }).length).toBeGreaterThan(0);
  });

  it('cancelling leaves the status alone', () => {
    render(<Harness initial={withPending()} />);
    setStatusToPending();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getAllByRole('button', { name: 'New project' }).length).toBeGreaterThan(0);
  });

  it('cannot be confirmed empty', () => {
    render(<Harness initial={withPending()} />);
    setStatusToPending();
    expect(screen.getByRole('button', { name: /Set status and post/ }).hasAttribute('disabled')).toBe(true);
  });

  it('applies the status and posts what is missing to Updates', () => {
    render(<Harness initial={withPending()} />);
    setStatusToPending();

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'need the signed utility interconnection letter' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set status and post/ }));

    expect(screen.getAllByRole('button', { name: 'Pending Additional Information' }).length).toBeGreaterThan(0);

    openThread();
    expect(screen.getByText(/signed utility interconnection letter/)).toBeTruthy();
    expect(screen.getByText(/Missing info/)).toBeTruthy();
  });

  it('an ordinary status change is not gated', () => {
    render(<Harness initial={withPending()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'New project' })[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Working on it' }));

    expect(screen.queryByLabelText('Reason')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Working on it' }).length).toBeGreaterThan(0);
  });
});

// Aboud 2026-10-17 #2 — the thread itself.
describe('Updates thread', () => {
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

  const withRow = () => {
    const b = emptyBoard();
    b.projects = [boardProject('Martha Thompson', 'pm')];
    return b;
  };

  it('posts an update and shows it in the thread and the column badge', () => {
    render(<Harness initial={withRow()} />);
    fireEvent.click(screen.getAllByTitle('Post the first update')[0]);

    fireEvent.change(screen.getByRole('textbox', { name: 'New update' }), { target: { value: 'waiting on the AHJ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));

    expect(screen.getByText('waiting on the AHJ')).toBeTruthy();
    expect(screen.getByText('1 update')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getAllByTitle('1 update — open the thread').length).toBeGreaterThan(0);
  });

  it('renders the formatting marks as real elements, like the notes panels', () => {
    render(<Harness initial={withRow()} />);
    fireEvent.click(screen.getAllByTitle('Post the first update')[0]);

    fireEvent.change(screen.getByRole('textbox', { name: 'New update' }), { target: { value: '• one\n• two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));

    expect(document.querySelectorAll('.upd-item ul li')).toHaveLength(2);
  });

  it('deletes an update', () => {
    render(<Harness initial={withRow()} />);
    fireEvent.click(screen.getAllByTitle('Post the first update')[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'New update' }), { target: { value: 'oops' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('oops')).toBeNull();
    expect(screen.getByText('0 updates')).toBeTruthy();
  });
});

// Aboud 2026-10-17: "do u see the 'Last update' column, use this one for the
// activity log, when we click on it a new small window pop-up and show us
// everything". The log existed but was buried in the ⋯ menu, so nobody found it.
describe('Last update opens the activity log', () => {
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

  it('clicking the cell opens the full log for that row', () => {
    const b = emptyBoard();
    b.projects = [boardProject('Martha Thompson', 'pm')];
    render(<Harness initial={b} />);

    fireEvent.click(screen.getAllByLabelText(/Activity log for Martha Thompson/)[0]);
    expect(screen.getByText('Activity — Martha Thompson')).toBeTruthy();
  });

  it('shows the field changes and the update posts together', () => {
    const b = emptyBoard();
    b.projects = [boardProject('Martha Thompson', 'pm')];
    render(<Harness initial={b} />);

    // A field change...
    fireEvent.click(screen.getAllByRole('button', { name: 'New project' })[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Working on it' }));
    // ...and an update post.
    fireEvent.click(screen.getAllByTitle('Post the first update')[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'New update' }), { target: { value: 'waiting on the AHJ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getAllByLabelText(/Activity log for Martha Thompson/)[0]);
    expect(screen.getByText(/posted an update/)).toBeTruthy();
    // The field change is rendered as "Status: New project → Working on it"
    // across several elements, so match the row rather than an exact string.
    expect(screen.getByText('Working on it', { selector: 'b' })).toBeTruthy();
  });
});

describe('BoardTab — Salesforce notes import (Aboud 2026-10-21)', () => {
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

  const ROSTER5 = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai', 'Yarob Alnabelsi', 'Anas Yaghmour'];
  const XLSX = readFileSync(resolve('src/lib/__fixtures__/sf-export-design.xlsx'));

  /** Eric Webber already on the board, already on Schedule — only his notes differ. */
  function seeded(): BoardState {
    const board = emptyBoard();
    board.projects = [
      {
        ...newProject('Eric Webber', 'Aboud Yousef', seedLabels(), '2026-10-01T00:00:00.000Z'),
        id: 'p-webber',
        phaseId: 'phase-schedule',
        sfNotes: { alerts: 'An old alert.' },
        sfNotesAt: '2026-10-01T00:00:00.000Z',
      },
    ];
    return board;
  }

  async function loadExport() {
    fireEvent.click(screen.getByRole('button', { name: /Import from Salesforce/ }));
    const file = new File([XLSX], 'Scope of Work Assignments - Design.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(screen.getByLabelText(/exported .xlsx/i), { target: { files: [file] } });
    await screen.findByText(/found 62 of 62/, undefined, { timeout: 15_000 });
  }

  async function importFile() {
    await loadExport();
    fireEvent.click(screen.getByRole('button', { name: /^Import \d+$/ }));
  }

  it('a matched row gets the export notes, logged in activity as a summary', async () => {
    render(<Harness initial={seeded()} authors={ROSTER5} />);
    await importFile();

    expect(toasts.at(-1)?.text).toMatch(/notes updated/);
    fireEvent.click(screen.getByText('Eric Webber').closest('tr')!.querySelector('.board-updated-cell')!);
    expect(screen.getByText(/Salesforce notes/)).toBeTruthy();
  });

  it('Undo puts the old notes back — the same export offers the update again', async () => {
    render(<Harness initial={seeded()} authors={ROSTER5} />);
    await importFile();
    act(() => toasts.at(-1)!.action!.fn());

    // The created rows are gone again…
    expect(screen.queryByText('Johann Lawrence-Brian Dsouza')).toBeNull();
    // …and Eric's notes reverted, so the same file still has 1 notes update to offer.
    await loadExport();
    expect(screen.getByText(/updated Salesforce notes/)).toBeTruthy();
  });
});
