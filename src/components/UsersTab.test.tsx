// @vitest-environment jsdom
// Admin › Users as a management screen (Aboud 2026-11-15): the roster shows
// each account's email (contact info only), and an admin can EDIT an existing
// account — display name + email — inline. Password management (reset / change
// my own) predates this and stays as it was.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, TeamUser } from '../types';
import UsersTab from './UsersTab';

const put = vi.fn(async (users: TeamUser[]) => users);

vi.mock('../lib/api', () => ({
  fetchSharedUsers: () => Promise.resolve(ROSTER),
  putSharedUsers: (users: TeamUser[]) => put(users),
}));

const user = (over: Partial<TeamUser>): TeamUser => ({
  username: 'aboudyousef',
  displayName: 'Aboud Yousef',
  role: 'admin',
  salt: 's',
  passHash: 'h',
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  schemaVersion: 1,
  ...over,
});

const ROSTER: TeamUser[] = [
  user({}),
  user({ username: 'khaled', displayName: 'Khaled Mattar', role: 'member', email: 'kmattar@dynamicecohome.com' }),
];

const SESSION: Session = { username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin' };

const toasts: string[] = [];

describe('Admin › Users management', () => {
  beforeEach(() => {
    localStorage.clear();
    toasts.length = 0;
    put.mockClear();
  });
  afterEach(cleanup);

  const renderTab = async () => {
    render(<UsersTab session={SESSION} toast={(t) => toasts.push(t)} />);
    await waitFor(() => expect(screen.getByText('Khaled Mattar')).toBeTruthy());
  };

  it('shows each account email, and a dash when none is stored', async () => {
    await renderTab();
    expect(screen.getByText('kmattar@dynamicecohome.com')).toBeTruthy();
    const mine = screen.getByText('aboudyousef').closest('tr')!;
    expect(within(mine).getByText('—')).toBeTruthy();
  });

  it('Edit opens the row inline; Save writes the new name and normalised email', async () => {
    await renderTab();
    const row = screen.getByText('Khaled Mattar').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(row).getByLabelText('Display name'), { target: { value: 'Khaled M. Mattar' } });
    fireEvent.change(within(row).getByLabelText('Email'), { target: { value: '  KM@Dynamicecohome.COM ' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Khaled M. Mattar')).toBeTruthy();
    expect(screen.getByText('km@dynamicecohome.com')).toBeTruthy();
    const pushed = put.mock.calls.at(-1)![0].find((u: TeamUser) => u.username === 'khaled')!;
    expect(pushed.displayName).toBe('Khaled M. Mattar');
    expect(pushed.email).toBe('km@dynamicecohome.com');
    expect(pushed.updatedAt > ROSTER[1].updatedAt).toBe(true); // merge key moved
  });

  it('refuses a malformed email with a toast, writing nothing', async () => {
    await renderTab();
    const row = screen.getByText('Khaled Mattar').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(row).getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    expect(toasts.some((t) => t.includes('email'))).toBe(true);
    expect(put).not.toHaveBeenCalled();
  });

  it('clearing the email removes it from the account', async () => {
    await renderTab();
    const row = screen.getByText('Khaled Mattar').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(row).getByLabelText('Email'), { target: { value: '' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    const pushed = put.mock.calls.at(-1)![0].find((u: TeamUser) => u.username === 'khaled')!;
    expect(pushed.email).toBeUndefined();
  });

  it('the add-user form takes an optional email', async () => {
    await renderTab();
    const form = screen.getByText('Add a team member').closest('.card')!;
    fireEvent.change(within(form as HTMLElement).getByLabelText('Username'), { target: { value: 'omar' } });
    fireEvent.change(within(form as HTMLElement).getByLabelText('Display name (appears on posts)'), {
      target: { value: 'Omar Rajab' },
    });
    fireEvent.change(within(form as HTMLElement).getByLabelText('Email (optional)'), {
      target: { value: 'ORajab@dynamicecohome.com' },
    });
    fireEvent.change(within(form as HTMLElement).getByLabelText('Password'), { target: { value: 'pw1234' } });
    fireEvent.click(within(form as HTMLElement).getByRole('button', { name: 'Add user' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const pushed = put.mock.calls.at(-1)![0].find((u: TeamUser) => u.username === 'omar')!;
    expect(pushed.email).toBe('orajab@dynamicecohome.com');
  });
});
