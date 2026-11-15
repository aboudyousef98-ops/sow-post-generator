// @vitest-environment jsdom
// Compose mode cards (Aboud 2026-11-15): "i want the SOW compose tab to be
// the default and be on the left" — SOW first in the switch, and ALWAYS the
// mode a fresh Compose opens in, even if a previous session left SVT behind.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('Compose mode switch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('SOW sits on the left and is the default — even over a stale preference', () => {
    localStorage.setItem('sowpost.composeMode.v1', 'svt'); // pre-change persistence
    render(<App />);
    const cards = document.querySelectorAll('.compose-mode-switch .mode-card');
    expect(cards[0].textContent).toContain('SOW — Full scope');
    expect(cards[1].textContent).toContain('SVT — Pre-Design');
    expect(cards[0].className).toContain('active');
    // The SOW form is what renders.
    expect(screen.getByText('Installation Notes')).toBeTruthy();
    expect(screen.queryByText('Pre-Design analysis')).toBeNull();
  });
});
