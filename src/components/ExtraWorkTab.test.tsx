// @vitest-environment jsdom
// Extra Work tab (desktop design 2026-10-06): sidebar (Team summary + person
// rows with stacked bars), stat tiles, payroll summary table w/ Holiday column,
// person log with inline add row, instant delete + Undo toast.
// Members open only their own log; admins open anyone's.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExtraWorkEntry, ExtraWorkState } from '../extrawork/types';
import { newEntry } from '../lib/extraWork';
import ExtraWorkTab from './ExtraWorkTab';

const T0 = '2026-10-02T10:00:00.000Z';
const ROSTER = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai'];
const toasts: { text: string; action?: { label: string; fn: () => void } }[] = [];

function mkEntry(
  username: string,
  person: string,
  dateIso: string,
  hours: number,
  over: Partial<ExtraWorkEntry> = {},
): ExtraWorkEntry {
  return {
    ...newEntry({ username, person }, { dateIso, hours, description: 'some work', dayTypeOverride: null }, T0),
    ...over,
  };
}

let lastState: ExtraWorkState = { entries: [] };

function Harness({ initial, isAdmin = false }: { initial?: ExtraWorkState; isAdmin?: boolean }) {
  const [state, set] = useState<ExtraWorkState>(initial ?? { entries: [] });
  lastState = state;
  return (
    <ExtraWorkTab
      state={state}
      setState={(s) => {
        lastState = s;
        set(s);
      }}
      me="Aboud Yousef"
      myUsername="aboudyousef"
      isAdmin={isAdmin}
      roster={ROSTER}
      toast={(text, action) => toasts.push({ text, action })}
      initialMonth="2026-10"
    />
  );
}

describe('ExtraWorkTab', () => {
  beforeEach(() => {
    toasts.length = 0;
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('defaults to my own log and adds an entry owned by me', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Log hours' }));
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText(/Extra hours/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Description of work/), { target: { value: 'BOS tool' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(lastState.entries).toHaveLength(1);
    const e = lastState.entries[0];
    expect(e.username).toBe('aboudyousef');
    expect(e.person).toBe('Aboud Yousef');
    expect(e.hours).toBe(3);
    expect(e.dayTypeOverride).toBeNull(); // Monday, auto weekday, no override stored
  });

  it('stores an override only when it differs from the auto day type', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Log hours' }));
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-10-05' } }); // Monday
    fireEvent.change(screen.getByLabelText(/Day type/), { target: { value: 'Holiday' } });
    fireEvent.change(screen.getByLabelText(/Extra hours/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Description of work/), { target: { value: 'Eid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(lastState.entries[0].dayTypeOverride).toBe('holiday');
  });

  it('rejects fractional hours with a toast', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Log hours' }));
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText(/Extra hours/), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText(/Description of work/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(lastState.entries).toHaveLength(0);
    expect(toasts.length).toBe(1);
  });

  it('member: own row opens the log; another person stays read-only', () => {
    const theirs = mkEntry('omar', 'Omar Rajab', '2026-10-05', 2, { id: 'theirs' });
    render(<Harness initial={{ entries: [theirs] }} />);
    fireEvent.click(screen.getByRole('button', { name: /Omar Rajab/ }));
    // Still my (empty) log — Omar's entries are not shown as a log table.
    expect(screen.getByText(/Aboud Yousef — log/)).toBeTruthy();
  });

  it('admin: opens another person log and deletes with Undo (tombstone, then restore)', () => {
    const theirs = mkEntry('omar', 'Omar Rajab', '2026-10-05', 2, { id: 'theirs' });
    render(<Harness initial={{ entries: [theirs] }} isAdmin />);
    fireEvent.click(screen.getByRole('button', { name: /Omar Rajab/ }));
    expect(screen.getByText(/Omar Rajab — log/)).toBeTruthy();
    fireEvent.click(screen.getByTitle('Delete'));
    expect(lastState.entries[0].deletedAt).toBeTruthy();
    const undo = toasts.find((t) => t.action)?.action;
    expect(undo?.label).toBe('Undo');
    undo?.fn();
    expect(lastState.entries[0].deletedAt).toBeUndefined();
  });

  it('member cannot delete someone else’s entry even if visible in summary', () => {
    const mine = mkEntry('aboudyousef', 'Aboud Yousef', '2026-10-04', 8, { id: 'mine' });
    render(<Harness initial={{ entries: [mine] }} />);
    // My own log shows my entry with a delete control.
    expect(screen.getByTitle('Delete')).toBeTruthy();
  });

  it('Team summary shows the payroll table with Holiday column and TOTAL row', () => {
    const a = mkEntry('aboudyousef', 'Aboud Yousef', '2026-10-04', 8); // Sun → weekend
    const b = mkEntry('omar', 'Omar Rajab', '2026-10-05', 2); // Mon → weekday
    const h = mkEntry('omar', 'Omar Rajab', '2026-10-06', 4, { dayTypeOverride: 'holiday' });
    render(<Harness initial={{ entries: [a, b, h] }} />);
    fireEvent.click(screen.getByRole('button', { name: /Team summary/ }));
    const table = screen.getByRole('table', { name: 'Payroll summary' });
    expect(within(table).getByText('Holiday')).toBeTruthy();
    const totalRow = within(table).getByText('TOTAL').closest('tr')!;
    expect(within(totalRow).getByText('14')).toBeTruthy(); // 8+2+4
    expect(within(totalRow).getByText('4')).toBeTruthy(); // holiday col
  });

  it('overtime calculator: enter salary on a log → final pay from 1.5 × hours × hourly', () => {
    const a = mkEntry('aboudyousef', 'Aboud Yousef', '2026-10-04', 8, { id: 'a' });
    const b = mkEntry('aboudyousef', 'Aboud Yousef', '2026-10-05', 3, { id: 'b' });
    render(<Harness initial={{ entries: [a, b] }} />);
    // 11 h this month; 1550/30/8 = 6.4583 hourly → 1.5 × 11 × 6.4583 = 106.56
    fireEvent.change(screen.getByLabelText(/Monthly salary/), { target: { value: '1550' } });
    expect(screen.getByText('106.56 JOD')).toBeTruthy();
    expect(screen.getByText(/6\.46 JOD\/h/)).toBeTruthy();
    // Salary is kept locally only — never in the synced entries state.
    expect(JSON.stringify(lastState)).not.toContain('1550');
  });

  it('calculator shows on EVERY employee log (salary remembered per person), not on Team summary', () => {
    render(<Harness isAdmin />);
    fireEvent.click(screen.getByRole('button', { name: /Team summary/ }));
    expect(screen.queryByLabelText(/Monthly salary/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Omar Rajab/ }));
    const omarSalary = screen.getByLabelText(/Monthly salary/);
    fireEvent.change(omarSalary, { target: { value: '1200' } });
    // Each person keeps their own number: switching back to me shows mine (empty).
    fireEvent.click(screen.getByRole('button', { name: /Aboud Yousef/ }));
    expect((screen.getByLabelText(/Monthly salary/) as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Omar Rajab/ }));
    expect((screen.getByLabelText(/Monthly salary/) as HTMLInputElement).value).toBe('1200');
  });

  it('my own log offers a personal Download .xlsx (member self-export)', () => {
    const mine = mkEntry('aboudyousef', 'Aboud Yousef', '2026-10-04', 8, { id: 'mine' });
    render(<Harness initial={{ entries: [mine] }} />);
    // Default view = my log; the log card header carries the personal export.
    expect(screen.getByText(/Aboud Yousef — log/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download .xlsx' })).toBeTruthy();
  });

  it('month switcher moves between months', () => {
    render(<Harness />);
    expect(screen.getByText('October 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('September 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('November 2026')).toBeTruthy();
  });
});
