// @vitest-environment jsdom
// Polish-time reminders (Aboud 2026-11-15: "when we click Polish with AI to
// do research between what we have in the requirements notes and what is
// written and popup reminders"). After a successful polish, the same AI note
// check that guards Copy for Slack runs against the current post, and any
// grounded hits pop a NON-BLOCKING reminders dialog — nothing is gated, and
// an AI failure stays silent (reminders are advisory, never an error).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { Ahj } from '../types';

const ccAhj: Ahj = {
  id: 'cc',
  name: 'Corpus Christi',
  aliases: [],
  posts: [
    {
      id: 'rp1',
      text: 'Trenches must have 24 inches of cover under driveways.',
      by: 'Aboud Yousef',
      at: '2026-10-08T00:00:00.000Z',
      history: [],
      pinned: false,
      updatedAt: '2026-10-08T00:00:00.000Z',
    },
  ],
  updatedAt: '2026-10-08T00:00:00.000Z',
  schemaVersion: 1,
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/health')) {
        return new Response(JSON.stringify({ ok: true, hasKey: true }), { status: 200 });
      }
      if (url.includes('/rewrite')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { items: { id: string; text: string }[] };
        return new Response(JSON.stringify({ items: body.items, model: 'test', ms: 5 }), { status: 200 });
      }
      if (url.includes('/notecheck')) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                lineId: 'rp1#0',
                trigger: 'trench under the driveway',
                why: 'The post plans a trench under the driveway; the county requires 24" of cover there.',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
}

describe('Compose — polish-time reminders', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sowpost.ahjs', JSON.stringify([ccAhj]));
    stubApi();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('polishing pops grounded requirement reminders, and Got it dismisses them', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Jurisdiction/), { target: { value: 'Corpus Christi' } });
    fireEvent.change(screen.getByLabelText('Site Survey Feedback'), {
      target: { value: 'The customer wants the trench under the driveway checked.' },
    });

    // The button enables only after the async /health check resolves.
    const polish = screen.getByRole('button', { name: /Polish with AI/ }) as HTMLButtonElement;
    await waitFor(() => expect(polish.disabled).toBe(false));
    fireEvent.click(polish);

    const title = await screen.findByText(/Reminders —/);
    // The note text also sits in the yellow AHJ banner on the form — scope to
    // the dialog so the assertion is about the REMINDER, not the banner.
    const modal = title.closest('.note-check-modal') as HTMLElement;
    expect(within(modal).getByText('Trenches must have 24 inches of cover under driveways.')).toBeTruthy();
    expect(within(modal).getByText(/requires 24" of cover/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Reminders —/)).toBeNull();
  });

  it('stays silent when the AI check returns no hits', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/health')) return new Response(JSON.stringify({ ok: true, hasKey: true }), { status: 200 });
      if (url.includes('/rewrite')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { items: { id: string; text: string }[] };
        return new Response(JSON.stringify({ items: body.items, model: 'test', ms: 5 }), { status: 200 });
      }
      if (url.includes('/notecheck')) return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/Jurisdiction/), { target: { value: 'Corpus Christi' } });
    fireEvent.change(screen.getByLabelText('Site Survey Feedback'), {
      target: { value: 'Simple back-to-back install.' },
    });
    const polish = screen.getByRole('button', { name: /Polish with AI/ }) as HTMLButtonElement;
    await waitFor(() => expect(polish.disabled).toBe(false));
    fireEvent.click(polish);

    // The polish itself completes…
    expect(await screen.findByText(/Polished ✓/)).toBeTruthy();
    // …and no reminder dialog ever appears.
    expect(screen.queryByText(/Reminders —/)).toBeNull();
  });
});
