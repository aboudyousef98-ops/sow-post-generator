// @vitest-environment jsdom
// Board → Compose linking: the board controls Compose, never the opposite.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Session } from './types';

const ADMIN: Session = { username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin' };

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function addProject(name: string) {
  const input = screen.getByLabelText('Add project');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('Board → Compose linking', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', RO);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Post cell on an empty row starts a prefilled, linked draft; the chip jumps back', async () => {
    render(<App session={ADMIN} />);
    addProject('martha thompson');

    const row = screen.getByText('martha thompson').closest('tr')!;
    fireEvent.click(within(row).getByTitle('Start a post for this project'));

    // Compose is open with the customer prefilled (Title Case) and linked.
    const customer = screen.getByLabelText(/Customer name/) as HTMLInputElement;
    expect(customer.value).toBe('Martha Thompson');
    const chip = screen.getByTitle('Show this project on the board');
    expect(chip.textContent).toContain('martha thompson');

    // The chip navigates back to the board.
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: 'Board' }).className).toContain('active');

    // The Post column now shows the draft.
    expect(screen.getByText(/Draft · AY ·/)).toBeTruthy();
  });

  it('clicking a row with a draft opens THAT draft, not a new one', () => {
    render(<App session={ADMIN} />);
    addProject('Patrick Lingwall');

    const row = () => screen.getByText('Patrick Lingwall').closest('tr')!;
    fireEvent.click(within(row()).getByTitle('Start a post for this project'));
    // Type something so the draft is distinguishable.
    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Patrick Lingwall Jr' } });

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    fireEvent.click(within(row()).getByTitle('Open the draft in Compose'));
    expect((screen.getByLabelText(/Customer name/) as HTMLInputElement).value).toBe('Patrick Lingwall Jr');
  });

  it('a draft typed directly in Compose gets a Link suggestion for the matching board row — nothing links silently', () => {
    render(<App session={ADMIN} />);
    addProject('Norca Garcia');

    fireEvent.click(screen.getByRole('button', { name: 'Compose' }));
    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'NORCA GARCIA' } });

    // Suggestion appears, not a link.
    expect(screen.queryByTitle('Show this project on the board')).toBeNull();
    expect(screen.getByText(/link this post to/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(screen.getByTitle('Show this project on the board')).toBeTruthy();

    // Unlink brings the suggestion back.
    fireEvent.click(screen.getByLabelText('Unlink from the board'));
    expect(screen.getByText(/link this post to/)).toBeTruthy();
  });

  // Aboud 2026-11-06: the board is a 12-column grid and was scrolling itself
  // out of sight inside a 1360px reading width. The wider cap is the board's
  // alone — widening the form tabs too would make those read worse.
  it('only the Board tab gets the wide page cap', () => {
    render(<App session={ADMIN} />);

    const main = () => document.querySelector('main.page')!;
    expect(main().className).toContain('page-wide');

    fireEvent.click(screen.getByRole('button', { name: 'Compose' }));
    expect(main().className).not.toContain('page-wide');

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(main().className).toContain('page-wide');
  });
});
