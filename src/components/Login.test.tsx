// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUser, saveCachedUsers } from '../lib/auth';
import type { TeamUser } from '../types';
import Login from './Login';

describe('Login', () => {
  let roster: TeamUser[];

  beforeEach(async () => {
    localStorage.clear();
    roster = [await makeUser('Aboudyousef', 'Aboud Yousef', 'admin', 'pw-test')];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ users: roster }), { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('signs in with the right password (username case-insensitive) and caches the roster', async () => {
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'ABOUDYOUSEF' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw-test' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));

    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith({ username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin' }),
    );
    expect(JSON.parse(localStorage.getItem('sowpost.users') ?? '[]')).toHaveLength(1);
  });

  it('rejects a wrong password with one unspecific message', async () => {
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'aboudyousef' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));

    await waitFor(() => expect(screen.getByText('Wrong username or password.')).toBeTruthy());
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('an unknown username gets the same message as a wrong password', async () => {
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'who-is-this' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw-test' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));

    await waitFor(() => expect(screen.getByText('Wrong username or password.')).toBeTruthy());
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('works offline from the cached roster after a previous login', async () => {
    saveCachedUsers(roster);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'aboudyousef' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw-test' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
  });

  it('offline with no cache explains itself instead of failing silently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    render(<Login onLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/never logged in before/)).toBeTruthy());
  });
});
