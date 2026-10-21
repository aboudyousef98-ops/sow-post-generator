// @vitest-environment jsdom
// Compose: Salesforce notes banner (Aboud 2026-10-21 — "i want the alerts,
// ahj notes, all the notes to appear on the compose as alerts for us to
// read"). The notes live on the matching BOARD row (mirrored there by Import
// from Salesforce) and are display-only — they never enter the post text.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { emptyBoard, newProject, seedLabels } from '../lib/board';
import type { BoardState } from '../board/types';

function seedBoard() {
  const board: BoardState = {
    ...emptyBoard(),
    projects: [
      {
        ...newProject('Martha Thompson', 'Aboud Yousef', seedLabels(), '2026-10-20T00:00:00.000Z'),
        id: 'p-martha',
        sfNotes: {
          alerts: 'Roof is fine.\n4x tree trims needed.',
          utilityDesign: 'Requires a main breaker.',
        },
        sfNotesAt: '2026-10-21T08:00:00.000Z',
      },
    ],
  };
  localStorage.setItem('sowpost.board', JSON.stringify(board));
}

describe('Compose Salesforce notes banner', () => {
  beforeEach(() => {
    localStorage.clear();
    seedBoard();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows every filled section for the matching board row, and clears off-board', () => {
    const { container } = render(<App />);
    const customer = screen.getByLabelText(/Customer name/) as HTMLInputElement;

    fireEvent.change(customer, { target: { value: 'martha thompson' } });
    const banner = container.querySelector('.sf-notes-banner')!;
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Scheduling alerts');
    expect(banner.textContent).toContain('4x tree trims needed');
    expect(banner.textContent).toContain('Utility — design requirements');
    expect(banner.textContent).toContain('Requires a main breaker.');
    // Sections with no text do not render a heading.
    expect(banner.textContent).not.toContain('AHJ — battery requirements');

    fireEvent.change(customer, { target: { value: 'Nobody Known' } });
    expect(container.querySelector('.sf-notes-banner')).toBeNull();
  });

  it('stays display-only: the notes never enter the post preview', () => {
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Martha Thompson' } });
    expect(container.querySelector('.preview')!.textContent).not.toContain('tree trims');
  });
});
