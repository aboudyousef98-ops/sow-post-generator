// @vitest-environment jsdom
// Phase 9: tab/sub-tab navigation, session identity, and the admin-only area.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Session } from './types';

const ADMIN: Session = { username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin' };
const MEMBER: Session = { username: 'omar', displayName: 'Omar Rajab', role: 'member' };

describe('Phase 9 navigation and sessions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/users')) {
          return new Response(JSON.stringify({ users: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows main tabs with Compose sub-tabs, and AHJ has no sub strip', () => {
    render(<App session={ADMIN} />);

    // Main strip.
    expect(screen.getByRole('button', { name: 'Compose' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AHJ Requirements' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Admin' })).toBeTruthy();
    // Compose sub strip.
    expect(screen.getByRole('button', { name: 'New Post' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Drafts/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^History/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'AHJ Requirements' }));
    expect(screen.queryByRole('button', { name: 'New Post' })).toBeNull();
    expect(document.querySelector('.subnav')).toBeNull();
  });

  it('a member does not see the Admin tab at all', () => {
    render(<App session={MEMBER} />);
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it('Admin opens on Settings, and the Users sub-tab loads the roster screen', async () => {
    render(<App session={ADMIN} />);

    fireEvent.click(screen.getByRole('button', { name: 'Admin' }));
    expect(screen.getByRole('button', { name: 'Settings' }).className).toContain('active');

    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    await waitFor(() => expect(screen.getByText('Team members')).toBeTruthy());
    expect(screen.getByText('Add a team member')).toBeTruthy();
    expect(screen.getByText('Change my password')).toBeTruthy();
  });

  it('signed in: the author is the session name, fixed — no picker — and Log out works', () => {
    const onLogout = vi.fn();
    render(<App session={MEMBER} onLogout={onLogout} />);

    expect(screen.getByTitle('Posting as').textContent).toBe('Omar Rajab');
    expect(screen.queryByLabelText('Posting as')).toBeNull(); // the <select> is gone

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('a new post is stamped with the signed-in user, not a picked name', async () => {
    render(<App session={MEMBER} />);

    fireEvent.change(screen.getByLabelText(/Customer name/i), { target: { value: 'Stamp Check' } });
    await waitFor(
      () => expect(JSON.parse(localStorage.getItem('sowpost.records') ?? '[]')).toHaveLength(1),
      { timeout: 2000 },
    );
    expect(JSON.parse(localStorage.getItem('sowpost.records')!)[0].author).toBe('Omar Rajab');
  });

  it('without a session (tests, dev) the old author picker is still there', () => {
    render(<App />);
    expect(screen.getByLabelText('Posting as')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('customer name is forced to Title Case as you type (ANTHONY STEREFF → Anthony Stereff)', () => {
    render(<App session={MEMBER} />);
    const input = screen.getByLabelText(/Customer name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ANTHONY STEREFF' } });
    expect(input.value).toBe('Anthony Stereff');
  });
});
