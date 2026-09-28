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

    // Pick Level 3 directly (simple flow — no driver checklist); the scope /
    // planning-window helper text follows the selection.
    fireEvent.change(screen.getByLabelText(/Project Level/), { target: { value: '3' } });
    expect(screen.getByText(/MPU, FSU, FTP, relocation ≤ 20 ft/)).toBeTruthy();
    expect(screen.getByText(/1\.5–2 crew-days/)).toBeTruthy();

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
    // Toast names the project, so the same button on a Drafts row is unambiguous.
    expect(screen.getByText('Marked as posted — Norca Garcia.')).toBeTruthy();
    const records = JSON.parse(localStorage.getItem('sowpost.records') ?? '[]');
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('posted');
    expect(records[0].finalText).toContain('Level 3 – Service Equipment Modification.');

    // History tab shows it.
    fireEvent.click(screen.getByText(/History \(1\)/));
    expect(screen.getByText('Norca Garcia')).toBeTruthy();
    second.unmount();
  });

  it('pulls the shared team history on load and shows it in History', async () => {
    const serverRecord = {
      id: 'srv-1',
      status: 'posted',
      author: 'Omar Rajab',
      sf: {
        customerName: 'Team Customer',
        installScheduledDate: '2026-10-05',
        region: 'DFW',
        jurisdiction: 'Frisco',
        siteAddress: '1 Main St, Frisco, TX',
        source: 'text',
      },
      drivers: [],
      suggestedLevel: 2,
      level: 2,
      notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
      usePolished: { layout: true, siteSurvey: true, design: true, homeowner: true },
      tags: [],
      warnings: [],
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
      postedAt: '2026-09-20T00:00:00.000Z',
      schemaVersion: 1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/records')) {
          const body =
            init?.method === 'PUT'
              ? (JSON.parse(String(init.body)) as { records: unknown[] })
              : { records: [serverRecord] };
          return new Response(JSON.stringify(init?.method === 'PUT' ? body : { records: [serverRecord] }), { status: 200 });
        }
        if (String(url).includes('/ahjs')) {
          const body = init?.method === 'PUT' ? JSON.parse(String(init.body)) : { ahjs: [] };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 });
      }),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText('Team synced')).toBeTruthy());
    fireEvent.click(screen.getByText(/History \(1\)/));
    expect(screen.getByText('Team Customer')).toBeTruthy();
    // And it landed in the localStorage cache too.
    const cached = JSON.parse(localStorage.getItem('sowpost.records') ?? '[]');
    expect(cached.map((r: { id: string }) => r.id)).toContain('srv-1');
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

// ---- Phase 5: AHJ requirements banner in Compose ---------------------------

import type { Ahj } from './types';

const AHJ_SEED: Ahj[] = [
  {
    id: 'cc',
    name: 'Corpus Christi',
    aliases: ['City of Corpus Christi'],
    posts: [
      {
        id: 'p1',
        text: 'Use Square D for the AC Disconnect.',
        by: 'Aboud Yousef',
        at: '2026-09-18T00:00:00.000Z',
        history: [],
        pinned: false,
        updatedAt: '2026-09-18T00:00:00.000Z',
      },
    ],
    updatedAt: '2026-09-18T00:00:00.000Z',
    schemaVersion: 1,
  },
  {
    id: 'hou',
    name: 'Houston',
    aliases: [],
    posts: [
      {
        id: 'h1',
        text: 'Submit the plan set as one combined PDF.',
        by: 'Omar Rajab',
        at: '2026-09-10T00:00:00.000Z',
        history: [],
        pinned: false,
        updatedAt: '2026-09-10T00:00:00.000Z',
      },
    ],
    updatedAt: '2026-09-10T00:00:00.000Z',
    schemaVersion: 1,
  },
];

describe('AHJ requirements in Compose', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sowpost.ahjs', JSON.stringify(AHJ_SEED));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const getTick = () => screen.getByLabelText(/Include AHJ requirements in the post/) as HTMLInputElement;

  it('alias match shows the banner; approval is per-AHJ (different AHJ unticked, typo tolerated)', async () => {
    render(<App />);

    const jur = screen.getByLabelText(/Jurisdiction/) as HTMLInputElement;
    fireEvent.change(jur, { target: { value: 'City of Corpus Christi' } });

    // Banner with the post and the alias attribution.
    await waitFor(() => expect(screen.getByText(/AHJ requirements on file — Corpus Christi/)).toBeTruthy());
    expect(screen.getByText(/Matched alias “City of Corpus Christi”/)).toBeTruthy();
    expect(screen.getByText('Use Square D for the AC Disconnect.')).toBeTruthy();

    // Default: not included in the post.
    expect(document.querySelector('.preview')!.textContent).not.toContain('AHJ Requirements');

    // Designer approval → appended to the post.
    fireEvent.click(getTick());
    await waitFor(() => expect(document.querySelector('.preview')!.textContent).toContain('AHJ Requirements (Corpus Christi):'));
    expect(document.querySelector('.preview')!.textContent).toContain('Use Square D for the AC Disconnect.');

    // A DIFFERENT AHJ shows unticked — the approval belongs to Corpus Christi.
    fireEvent.change(jur, { target: { value: 'Houston' } });
    await waitFor(() => expect(screen.getByText(/AHJ requirements on file — Houston/)).toBeTruthy());
    expect(getTick().checked).toBe(false);
    expect(document.querySelector('.preview')!.textContent).not.toContain('AHJ Requirements');

    // A typo (no match) hides the banner but does NOT destroy the approval…
    fireEvent.change(jur, { target: { value: 'Corpus Christ' } });
    await waitFor(() => expect(screen.queryByText(/AHJ requirements on file/)).toBeNull());
    // …so returning to the approved AHJ restores the tick and the section.
    fireEvent.change(jur, { target: { value: 'Corpus Christi' } });
    await waitFor(() => expect(screen.getByText(/AHJ requirements on file — Corpus Christi/)).toBeTruthy());
    expect(getTick().checked).toBe(true);
    expect(document.querySelector('.preview')!.textContent).toContain('AHJ Requirements (Corpus Christi):');
  });

  it('the approval is saved on the draft — reopening it keeps the tick', async () => {
    render(<App />);

    const jur = screen.getByLabelText(/Jurisdiction/) as HTMLInputElement;
    fireEvent.change(jur, { target: { value: 'Corpus Christi' } });
    await waitFor(() => expect(screen.getByText(/AHJ requirements on file — Corpus Christi/)).toBeTruthy());
    fireEvent.click(getTick());

    // Name the draft so autosave stores it, then leave and come back.
    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Approval Keeper' } });
    await waitFor(() => expect(screen.getByText(/Drafts \(1\)/)).toBeTruthy());
    fireEvent.click(screen.getByText(/New post/));
    fireEvent.click(screen.getByText(/Drafts \(1\)/));
    fireEvent.click(screen.getByText('Approval Keeper'));

    await waitFor(() => expect(screen.getByText(/AHJ requirements on file — Corpus Christi/)).toBeTruthy());
    expect(getTick().checked).toBe(true);
    expect(document.querySelector('.preview')!.textContent).toContain('AHJ Requirements (Corpus Christi):');
  });
});

// ---- Draft safety (Aboud, 2026-09-28) --------------------------------------
// Two projects were lost. The root cause found in the code: autosave required a
// customer name, so anything typed before the name existed was never persisted.

describe('draft safety', () => {
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

  const stored = () => JSON.parse(localStorage.getItem('sowpost.records') ?? '[]');

  it('autosaves notes typed BEFORE the customer name exists', async () => {
    const { unmount } = render(<App />);

    // Only a note — no customer name anywhere. This used to save nothing at all.
    fireEvent.change(screen.getByPlaceholderText(/One bullet per line — Arabic\/English ok/), {
      target: { value: 'Conduit through the attic to the garage' },
    });

    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 2000 });
    expect(stored()[0].notes.layout).toBe('Conduit through the attic to the garage');

    // And it survives a reload.
    unmount();
    render(<App />);
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText(/One bullet per line — Arabic\/English ok/) as HTMLTextAreaElement).value,
      ).toBe('Conduit through the attic to the garage'),
    );
  });

  it('"New post" saves the open draft instead of discarding it', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Rescued Project' } });

    // Click immediately — inside the 500 ms autosave debounce window.
    fireEvent.click(screen.getByText(/New post/));

    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0].sf.customerName).toBe('Rescued Project');
    expect(stored()[0].status).toBe('draft');
  });

  it('"Save as Draft" persists on the spot and says so', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Customer name/), { target: { value: 'Saved Now' } });
    fireEvent.click(screen.getByRole('button', { name: /Save as Draft/ }));

    expect(screen.getByText('Saved to Drafts.')).toBeTruthy();
    expect(stored()).toHaveLength(1);
    expect(stored()[0].sf.customerName).toBe('Saved Now');
  });

  it('refuses to save a completely untouched form', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Save as Draft/ }));
    expect(screen.getByText(/Nothing to save yet/)).toBeTruthy();
    expect(stored()).toHaveLength(0);
  });

  it('marks a draft as done from its Drafts row, with a confirm step', async () => {
    const { container } = render(<App />);
    pasteText(container.querySelector('.paste-zone')!, norca);
    await waitFor(() => expect(screen.getByText(/Drafts \(1\)/)).toBeTruthy());

    // Start a different project so the row is NOT the record open in Compose.
    fireEvent.click(screen.getByText(/New post/));
    fireEvent.click(screen.getByText(/Drafts \(1\)/));

    // First click only arms the confirm — nothing is posted yet.
    fireEvent.click(screen.getByText(/Mark as done/));
    expect(screen.getByText(/Send .* to History\?/)).toBeTruthy();
    expect(stored().every((r: { status: string }) => r.status === 'draft')).toBe(true);

    fireEvent.click(screen.getByText('Yes, mark as done'));
    await waitFor(() => expect(screen.getByText(/History \(1\)/)).toBeTruthy());

    const posted = stored().find((r: { status: string }) => r.status === 'posted');
    expect(posted.sf.customerName).toBe('Norca Garcia');
    // The post text is frozen at this moment, exactly as "Mark as posted" does.
    expect(posted.finalText).toContain('Norca Garcia');
    expect(posted.postedAt).toBeTruthy();
  });

  it('cancelling the row confirm leaves the draft alone', async () => {
    const { container } = render(<App />);
    pasteText(container.querySelector('.paste-zone')!, norca);
    await waitFor(() => expect(screen.getByText(/Drafts \(1\)/)).toBeTruthy());
    fireEvent.click(screen.getByText(/New post/));
    fireEvent.click(screen.getByText(/Drafts \(1\)/));

    fireEvent.click(screen.getByText(/Mark as done/));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByText(/Drafts \(1\)/)).toBeTruthy();
    expect(stored().every((r: { status: string }) => r.status === 'draft')).toBe(true);
  });
});
