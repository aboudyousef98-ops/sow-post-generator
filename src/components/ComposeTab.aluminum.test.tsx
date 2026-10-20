// @vitest-environment jsdom
// Compose: yellow aluminum-wiring warning under Jurisdiction, driven by the
// Salesforce jurisdiction against Othman's 509-row list (Aboud 2026-10-20).
// Shows for EVERY matched jurisdiction (his call), display-only — it never
// enters the post text.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('Compose aluminum wiring warning', () => {
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

  it('shows the stance for a listed jurisdiction and clears off-list', () => {
    const { container } = render(<App />);
    const jurisdiction = screen.getByLabelText(/Jurisdiction/) as HTMLInputElement;

    fireEvent.change(jurisdiction, { target: { value: 'Addison' } });
    const banner = container.querySelector('.alu-banner')!;
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Aluminum wiring — Addison');
    expect(banner.textContent).toContain('Aluminum #8 AWG or larger only');

    fireEvent.change(jurisdiction, { target: { value: 'Nowhereville' } });
    expect(container.querySelector('.alu-banner')).toBeNull();
  });

  it('stays display-only: the stance never enters the post preview', () => {
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText(/Jurisdiction/), { target: { value: 'Addison' } });
    expect(container.querySelector('.preview')!.textContent).not.toContain('#8 AWG');
  });
});
