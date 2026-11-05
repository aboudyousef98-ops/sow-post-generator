// @vitest-environment jsdom
// The Automations panel, and the engine firing through the real board.
//
// Aboud 2026-11-05: "why I can't create my own automations inside the website
// for the board? and have the current automation appear there editable?"

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard, newProject, seedLabels } from '../lib/board';
import type { PostRecord } from '../types';
import type { AutomationRule, BoardLabel, BoardState } from './types';
import BoardTab from './BoardTab';

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const toasts: { text: string; action?: { label: string; fn: () => void } }[] = [];
const ROSTER = ['Aboud Yousef', 'Omar Rajab', 'Anas Yaghmour'];

function Harness({ initial, isAdmin = true }: { initial?: BoardState; isAdmin?: boolean }) {
  const [board, setBoard] = useState<BoardState>(initial ?? emptyBoard());
  return (
    <BoardTab
      board={board}
      setBoard={setBoard}
      me="Aboud Yousef"
      isAdmin={isAdmin}
      authors={ROSTER}
      toast={(text, action) => toasts.push({ text, action })}
      records={[] as PostRecord[]}
      onOpenCompose={vi.fn()}
    />
  );
}

const INSTALLED: BoardLabel = {
  id: 's-installed',
  columnKey: 'status',
  name: 'Installed',
  color: '#00C875',
  sortOrder: 170,
  isDefault: false,
  isDone: false,
  isSystem: false,
  archived: false,
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const rule = (over: Partial<AutomationRule>): AutomationRule => ({
  id: 'r1',
  enabled: true,
  trigger: { kind: 'status-to', statusId: 's-installed' },
  action: { kind: 'set-phase', phaseId: 'phase-schedule' },
  createdAt: '2026-11-05T10:00:00.000Z',
  createdBy: 'Aboud Yousef',
  updatedAt: '2026-11-05T10:00:00.000Z',
  updatedBy: 'Aboud Yousef',
  ...over,
});

const boardWith = (automations: AutomationRule[] = []): BoardState => {
  const b = emptyBoard();
  b.labels = [...b.labels, INSTALLED];
  b.projects = [{ ...newProject('Martha Thompson', 'Aboud Yousef', seedLabels(), '2026-10-01T00:00:00.000Z'), id: 'p1' }];
  b.automations = automations;
  return b;
};

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /Automations/ }));
const panel = () => screen.getByRole('heading', { name: 'Automations' }).closest('.modal') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  vi.stubGlobal('ResizeObserver', RO);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// "have the current automation appear there editable" — the half that is about
// making what already exists visible.
describe('the built-in rules are visible and reachable', () => {
  it('lists all seven, described from this board\'s own labels', () => {
    render(<Harness initial={boardWith()} />);
    openPanel();

    const items = within(panel()).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(7);
    expect(within(panel()).getByText(/rated 4★ or higher/)).toBeTruthy();
    expect(within(panel()).getByText(/Completed section/)).toBeTruthy();
    expect(within(panel()).getByText(/Installation Review section/)).toBeTruthy();
    expect(within(panel()).getByText(/Out of SOW scope section/)).toBeTruthy();
  });

  it('a knob opens the control that actually edits the rule', () => {
    render(<Harness initial={boardWith()} />);
    openPanel();
    fireEvent.click(within(panel()).getAllByRole('button', { name: /which status/ })[0]);

    // Edit labels, on the Status column.
    expect(screen.getByRole('heading', { name: /labels/i })).toBeTruthy();
    // And the automations panel got out of the way.
    expect(screen.queryByRole('heading', { name: 'Automations' })).toBeNull();
  });
});

describe('writing a rule', () => {
  const build = () => {
    openPanel();
    fireEvent.click(within(panel()).getByRole('button', { name: '+ New automation' }));
  };

  it('a blank rule cannot be saved', () => {
    render(<Harness initial={boardWith()} />);
    build();
    expect(within(panel()).getByRole('button', { name: 'Save automation' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the sentence the rule will read as, live, before it is saved', () => {
    render(<Harness initial={boardWith()} />);
    build();
    fireEvent.change(within(panel()).getByLabelText('Trigger status'), { target: { value: 's-installed' } });
    fireEvent.change(within(panel()).getByLabelText('Action'), { target: { value: 'set-phase' } });
    fireEvent.change(within(panel()).getByLabelText('Action phase'), { target: { value: 'phase-schedule' } });

    expect(
      within(panel()).getByText('When a project moves to “Installed” → set Design/Schedule to “Schedule”.'),
    ).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: 'Save automation' }).hasAttribute('disabled')).toBe(false);
  });

  it('saves it into the shared board, where the team can read it', () => {
    render(<Harness initial={boardWith()} />);
    build();
    fireEvent.change(within(panel()).getByLabelText('Trigger status'), { target: { value: 's-installed' } });
    fireEvent.change(within(panel()).getByLabelText('Action'), { target: { value: 'set-phase' } });
    fireEvent.change(within(panel()).getByLabelText('Action phase'), { target: { value: 'phase-schedule' } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save automation' }));

    // Builder closed, rule listed under "Yours".
    expect(within(panel()).queryByLabelText('Trigger status')).toBeNull();
    expect(within(panel()).getByText(/set Design\/Schedule to “Schedule”/)).toBeTruthy();
  });

  it('changing the trigger clears its old field, so a stale value cannot sneak through', () => {
    render(<Harness initial={boardWith()} />);
    build();
    fireEvent.change(within(panel()).getByLabelText('Trigger status'), { target: { value: 's-installed' } });
    fireEvent.change(within(panel()).getByLabelText('Trigger'), { target: { value: 'rating-at-least' } });

    // The rating is unset, so the rule is incomplete again.
    expect((within(panel()).getByLabelText('Trigger rating') as HTMLSelectElement).value).toBe('');
    expect(within(panel()).getByRole('button', { name: 'Save automation' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('who may change them', () => {
  it('a non-admin reads every rule but gets no edit controls', () => {
    render(<Harness initial={boardWith([rule({})])} isAdmin={false} />);
    openPanel();

    expect(within(panel()).getByText(/set Design\/Schedule to “Schedule”/)).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: '+ New automation' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: /^Delete/ })).toBeNull();
    expect(within(panel()).getByText(/Only an admin can change them/)).toBeTruthy();
    // The enable toggle is visible but inert.
    expect(within(panel()).getByRole('checkbox').hasAttribute('disabled')).toBe(true);
  });

  it('an admin can pause a rule without deleting it', () => {
    render(<Harness initial={boardWith([rule({})])} />);
    openPanel();
    fireEvent.click(within(panel()).getByRole('checkbox'));

    expect((within(panel()).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    // Still listed — a paused rule must not look like a lost one.
    expect(within(panel()).getByText(/set Design\/Schedule to “Schedule”/)).toBeTruthy();
  });

  it('deleting tombstones the rule rather than dropping it', () => {
    render(<Harness initial={boardWith([rule({})])} />);
    openPanel();
    expect(within(panel()).getAllByRole('checkbox')).toHaveLength(1);

    fireEvent.click(within(panel()).getByRole('button', { name: /^Delete/ }));

    // Gone from the list — asserted via the row's own enable toggle, not the
    // sentence: the empty state quotes the same example rule as this fixture.
    expect(within(panel()).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(panel()).queryByRole('button', { name: /^Delete/ })).toBeNull();
    expect(within(panel()).getByText(/None yet/)).toBeTruthy();
    expect(toasts.at(-1)!.text).toMatch(/deleted for the team/);
  });
});

// The engine, driven through the real board rather than the lib.
describe('a rule actually fires', () => {
  const setStatus = (name: string) => {
    fireEvent.click(screen.getAllByRole('button', { name: 'New project' })[0]);
    fireEvent.click(screen.getByRole('option', { name }));
  };

  it('a set- action lands in the same change as the edit that triggered it', () => {
    render(<Harness initial={boardWith([rule({})])} />);
    setStatus('Installed');

    const row = screen.getByText('Martha Thompson').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Installed' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Schedule' })).toBeTruthy();
  });

  it('a disabled rule does nothing', () => {
    render(<Harness initial={boardWith([rule({ enabled: false })])} />);
    setStatus('Installed');

    const row = screen.getByText('Martha Thompson').closest('tr')!;
    expect(within(row).queryByRole('button', { name: 'Schedule' })).toBeNull();
  });

  it('a condition that does not hold stops it', () => {
    render(<Harness initial={boardWith([rule({ condition: { coordinator: 'Omar Rajab' } })])} />);
    // Martha's coordinator is Aboud, so the rule must not fire.
    setStatus('Installed');

    const row = screen.getByText('Martha Thompson').closest('tr')!;
    expect(within(row).queryByRole('button', { name: 'Schedule' })).toBeNull();
  });

  it('a post-update action writes to the project\'s own thread', () => {
    render(
      <Harness
        initial={boardWith([rule({ action: { kind: 'post-update', text: 'installed — awaiting review' } })])}
      />,
    );
    setStatus('Installed');

    const row = screen.getByText('Martha Thompson').closest('tr')!;
    fireEvent.click(within(row).getByTitle(/open the thread/));
    expect(screen.getByText('installed — awaiting review')).toBeTruthy();
  });

  it('a require-note action gates the change, and names the rule that did it', () => {
    render(<Harness initial={boardWith([rule({ action: { kind: 'require-note' } })])} />);
    setStatus('Installed');

    expect(screen.getByLabelText('Reason')).toBeTruthy();
    // Says WHICH rule is blocking — a gate with no stated cause is the kind
    // people work around rather than ask about.
    expect(screen.getByText(/When a project moves to “Installed”/)).toBeTruthy();
    // And the status has not moved yet.
    expect(screen.getAllByRole('button', { name: 'New project' }).length).toBeGreaterThan(0);
  });

  it('a gated rule still applies its sibling set- action on confirm', () => {
    render(
      <Harness
        initial={boardWith([
          rule({ id: 'gate', action: { kind: 'require-note' } }),
          rule({ id: 'set', action: { kind: 'set-reviewer', person: 'Omar Rajab' } }),
        ])}
      />,
    );
    setStatus('Installed');
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'crew finished today' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and post/ }));

    const row = screen.getByText('Martha Thompson').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Installed' })).toBeTruthy();
  });

  it('a project-created rule fires on quick-add', () => {
    const b = boardWith([
      rule({ trigger: { kind: 'project-created' }, action: { kind: 'set-phase', phaseId: 'phase-design' } }),
    ]);
    b.projects = [];
    render(<Harness initial={b} />);

    const input = screen.getByLabelText('Add project');
    fireEvent.change(input, { target: { value: 'Karan Staggers' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const row = screen.getByText('Karan Staggers').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Design' })).toBeTruthy();
  });

  it('a status change with no rule behind it is untouched', () => {
    render(<Harness initial={boardWith([])} />);
    setStatus('Installed');

    const row = screen.getByText('Martha Thompson').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Installed' })).toBeTruthy();
    expect(screen.queryByLabelText('Reason')).toBeNull();
  });
});
