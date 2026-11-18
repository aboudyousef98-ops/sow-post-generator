// @vitest-environment jsdom
// The yellow aluminum-wiring banner was REMOVED from Compose (Aboud
// 2026-11-15: "remove the warning that is popped in yellow, it presents in
// each compose and it is not relatable"). It fired for every jurisdiction on
// Othman's 509-row list with the same generic sentence, so it read as noise
// on virtually every project. The list and matcher stay in
// lib/aluminumWiring.ts (its own tests still pin them) in case a quieter
// surface is ever wanted — these tests pin that the BANNER stays gone.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('Compose aluminum wiring banner — removed 2026-11-15', () => {
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

  it('a listed jurisdiction no longer raises the banner', () => {
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText(/Jurisdiction/), { target: { value: 'Addison' } });
    expect(container.querySelector('.alu-banner')).toBeNull();
    expect(container.textContent).not.toContain('Aluminum wiring — Addison');
  });

  it('the stance still never enters the post preview', () => {
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText(/Jurisdiction/), { target: { value: 'Addison' } });
    expect(container.querySelector('.preview')!.textContent).not.toContain('#8 AWG');
  });
});
