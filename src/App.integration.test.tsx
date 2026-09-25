// @vitest-environment jsdom
// End-to-end acceptance flow (spec/09 Phase 1) in jsdom: paste Norca Garcia →
// fields + warning + Thursday + HOU + Diego Banegas tag → mpu + relocation →
// suggested L3 + layout seed → preview → refresh persistence → mark as posted.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// jsdom rewrites import.meta.url to http://, so resolve from the project cwd.
const norca = readFileSync('src/lib/__fixtures__/sf-paste-norca-garcia.txt', 'utf8');

function pasteText(target: Element, text: string) {
  fireEvent.paste(target, {
    clipboardData: {
      items: [],
      files: [],
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
}

describe('Compose acceptance flow', () => {
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

  it('paste → classify → preview → persist → post', async () => {
    const { container, unmount } = render(<App />);

    // Opening the app shows Compose immediately — no prompt of any kind.
    expect(screen.getByText('Preview')).toBeTruthy();
    expect(container.querySelector('input[type="password"]')).toBeNull();

    // Paste the Norca Garcia SF text.
    pasteText(container.querySelector('.paste-zone')!, norca);

    // Fields extracted.
    const customer = screen.getByLabelText(/Customer name/) as HTMLInputElement;
    await waitFor(() => expect(customer.value).toBe('Norca Garcia'));
    const date = screen.getByLabelText(/Install Scheduled Date/) as HTMLInputElement;
    expect(date.value).toBe('2026-10-01');
    // Weekday computed.
    expect(screen.getByText(/→ Thursday/)).toBeTruthy();
    // Region HOU.
    const region = screen.getByLabelText(/Install Region/) as HTMLSelectElement;
    expect(region.value).toBe('HOU');
    // Warning about the 10/9 visit.
    expect(screen.getByText(/Latest Scheduled Visit \(10\/09\/2026\) differs/)).toBeTruthy();
    // Tags include the HOU region lead.
    expect(screen.getByText('@Diego Banegas')).toBeTruthy();

    // Tick mpu + relocation ≤ 20 ft → suggested L3, seed mentions "MPU with relocation".
    fireEvent.click(screen.getByLabelText(/Main Panel Upgrade/));
    fireEvent.click(screen.getByLabelText(/Equipment relocation ≤ 20 ft/));
    expect(screen.getByText(/Suggested: L3 — Service Equipment Modification/)).toBeTruthy();
    const layout = screen.getByPlaceholderText(/Auto-seeded from drivers/) as HTMLTextAreaElement;
    expect(layout.value).toContain('MPU with relocation');

    // Preview contains the canonical lines.
    const preview = container.querySelector('.preview')!;
    expect(preview.textContent).toContain('Kindly find attached the elevation drawing and BOS for Norca Garcia.');
    expect(preview.textContent).toContain('Thursday, 10/01/2026.');
    expect(preview.textContent).toContain('Level 3 – Service Equipment Modification.');
    expect(preview.textContent).toContain('All good.');
    expect(preview.textContent).toContain('No feedback.');

    // Autosave (debounced 500 ms) → draft survives a "refresh" (remount).
    await waitFor(
      () => {
        const records = JSON.parse(localStorage.getItem('sowpost.records') ?? '[]');
        expect(records).toHaveLength(1);
        expect(records[0].sf.customerName).toBe('Norca Garcia');
      },
      { timeout: 2000 },
    );
    unmount();
    const second = render(<App />);
    const customer2 = screen.getByLabelText(/Customer name/) as HTMLInputElement;
    expect(customer2.value).toBe('Norca Garcia');

    // Mark as posted → moves to History; Compose resets.
    fireEvent.click(screen.getByText('✅ Mark as posted'));
    expect(screen.getByText('Marked as posted.')).toBeTruthy();
    const records = JSON.parse(localStorage.getItem('sowpost.records') ?? '[]');
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('posted');
    expect(records[0].finalText).toContain('Level 3 – Service Equipment Modification.');

    // History tab shows it.
    fireEvent.click(screen.getByText(/History \(1\)/));
    expect(screen.getByText('Norca Garcia')).toBeTruthy();
    second.unmount();
  });

  it('offline text flow works end-to-end without AI (health fails)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('AI offline')).toBeTruthy());
    pasteText(container.querySelector('.paste-zone')!, norca);
    const customer = screen.getByLabelText(/Customer name/) as HTMLInputElement;
    await waitFor(() => expect(customer.value).toBe('Norca Garcia'));
    // Polish button disabled, but the preview (manual flow) is complete.
    expect((screen.getByText(/Polish with AI/).closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.preview')!.textContent).toContain('Norca Garcia');
  });
});
