// @vitest-environment jsdom
// End-to-end acceptance flow (spec/09 Phase 1) in jsdom: paste Norca Garcia →
// fields + warning + Thursday + HOU + Diego Banegas tag → mpu + relocation →
// suggested L3 + layout seed → preview → refresh persistence → mark as posted.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { emptyInstallNotes } from './lib/installNotes';

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
    expect(screen.getByText('Slack preview')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: /Level 3/ }));
    expect(screen.getByText(/MPU, FSU, FTP, relocation ≤ 20 ft/)).toBeTruthy();
    // Wording per the 2026 standard's own table, "1.5 to 2" not "1.5–2" (spec/10 §12.2).
    // Two hits: the helper text under the select, and the post itself, which
    // now prints the planning window as well (spec/10 §12.1).
    expect(screen.getAllByText(/1\.5 to 2 crew-days/)).toHaveLength(2);

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
    fireEvent.click(screen.getByRole('button', { name: 'Mark as posted' }));
    // Toast names the project, so the same button on a Drafts row is unambiguous.
    expect(screen.getByText('Marked as posted — Norca Garcia.')).toBeTruthy();
    const records = JSON.parse(localStorage.getItem('sowpost.records') ?? '[]');
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('posted');
    expect(records[0].finalText).toContain('Level 3 – Service Equipment Modification.');

    // History tab shows it.
    fireEvent.click(screen.getByRole('button', { name: /^History/ }));
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
      installNotes: emptyInstallNotes(),
      usePolished: {},
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
    await waitFor(() => expect(screen.getByTitle('Team synced')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^History/ }));
    expect(screen.getByText('Team Customer')).toBeTruthy();
    // And it landed in the localStorage cache too.
    const cached = JSON.parse(localStorage.getItem('sowpost.records') ?? '[]');
    expect(cached.map((r: { id: string }) => r.id)).toContain('srv-1');
  });

  it('offline text flow works end-to-end without AI (health fails)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByTitle('AI offline')).toBeTruthy());
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
    await waitFor(() => expect(screen.getByRole('button', { name: /^Drafts/ })).toBeTruthy());
    fireEvent.click(screen.getByText(/New post/));
    fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
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
    // Uses the Homeowner Feedback box (the old "Installation Layout" free-text
    // note it originally exercised was replaced by guided installNotes fields
    // in Phase 7; its placeholder is now unique to this box).
    fireEvent.change(screen.getByPlaceholderText(/One bullet per line\. Empty → "No feedback\."/), {
      target: { value: 'Conduit through the attic to the garage' },
    });

    await waitFor(() => expect(stored()).toHaveLength(1), { timeout: 2000 });
    expect(stored()[0].notes.homeowner).toBe('Conduit through the attic to the garage');

    // And it survives a reload.
    unmount();
    render(<App />);
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText(/One bullet per line\. Empty → "No feedback\."/) as HTMLTextAreaElement).value,
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
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(screen.getByText('Saved to Drafts.')).toBeTruthy();
    expect(stored()).toHaveLength(1);
    expect(stored()[0].sf.customerName).toBe('Saved Now');
  });

  it('refuses to save a completely untouched form', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(screen.getByText(/Nothing to save yet/)).toBeTruthy();
    expect(stored()).toHaveLength(0);
  });

  it('marks a draft as done from its Drafts row, with a confirm step', async () => {
    const { container } = render(<App />);
    pasteText(container.querySelector('.paste-zone')!, norca);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Drafts/ })).toBeTruthy());

    // Start a different project so the row is NOT the record open in Compose.
    fireEvent.click(screen.getByText(/New post/));
    fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));

    // First click only arms the confirm — nothing is posted yet.
    fireEvent.click(screen.getByText(/Mark as done/));
    expect(screen.getByText(/Send .* to History\?/)).toBeTruthy();
    expect(stored().every((r: { status: string }) => r.status === 'draft')).toBe(true);

    fireEvent.click(screen.getByText('Yes, mark as done'));
    await waitFor(() => expect(screen.getByRole('button', { name: /^History/ })).toBeTruthy());

    const posted = stored().find((r: { status: string }) => r.status === 'posted');
    expect(posted.sf.customerName).toBe('Norca Garcia');
    // The post text is frozen at this moment, exactly as "Mark as posted" does.
    expect(posted.finalText).toContain('Norca Garcia');
    expect(posted.postedAt).toBeTruthy();
  });

  it('cancelling the row confirm leaves the draft alone', async () => {
    const { container } = render(<App />);
    pasteText(container.querySelector('.paste-zone')!, norca);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Drafts/ })).toBeTruthy());
    fireEvent.click(screen.getByText(/New post/));
    fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));

    fireEvent.click(screen.getByText(/Mark as done/));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByRole('button', { name: /^Drafts/ })).toBeTruthy();
    expect(stored().every((r: { status: string }) => r.status === 'draft')).toBe(true);
  });
});

// ---- Phase 7: Installation Notes UI (Task 8) -------------------------------

describe('Installation Notes UI', () => {
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

  it('Installation Notes dropdowns and conduit boxes reach the preview', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '2' } });
    fireEvent.change(screen.getAllByLabelText(/^Wall 1 orientation/i)[0], { target: { value: 'North' } });
    fireEvent.change(screen.getAllByLabelText(/^Wall 2 orientation/i)[0], { target: { value: 'West' } });
    fireEvent.change(screen.getByLabelText(/^Stories/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^Service equipment/i), { target: { value: 'MPU' } });
    fireEvent.change(screen.getByLabelText(/^Load run/i), { target: { value: '18 ft through the attic' } });

    const preview = document.querySelector('.preview') as HTMLElement;
    expect(preview.textContent).toContain('Installation on two walls (North, West).');
    expect(preview.textContent).toContain('1-story house.');
    expect(preview.textContent).toContain('This project requires an MPU.');
    expect(preview.textContent).toContain('Load run: 18 ft through the attic.');
  });

  it('a project with no install date can still be copied and marked as posted', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/Customer name/i), { target: { value: 'No Date Project' } });
    fireEvent.change(screen.getByLabelText(/Jurisdiction/i), { target: { value: 'Pasadena' } });
    fireEvent.change(screen.getByLabelText(/Site address/i), { target: { value: '1 Example St' } });

    expect((screen.getByRole('button', { name: /Copy for Slack/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Mark as posted/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---- Phase 7: the two AI modes (spec/10 §11) -------------------------------

describe('the two AI modes', () => {
  // Every /rewrite body the app sent, in order.
  let sent: { items: { id: string; text: string }[]; mode?: string }[];
  // When true, /rewrite hangs until `release()` — lets a test read the UI
  // while a request is still in flight.
  let hold: boolean;
  let release: (() => void) | null;
  // What the model "returns" for one item. Default: a light edit.
  let reply: (item: { id: string; text: string }) => { id: string; text: string };

  beforeEach(() => {
    localStorage.clear();
    sent = [];
    hold = false;
    release = null;
    reply = (i) => ({ id: i.id, text: `${i.text} edited.` });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/rewrite')) {
          const body = JSON.parse(String(init?.body)) as { items: { id: string; text: string }[]; mode?: string };
          sent.push(body);
          if (hold) await new Promise<void>((resolve) => (release = resolve));
          return new Response(
            JSON.stringify({
              items: body.items.map((i) => reply(i)),
              model: 'gpt-4o-mini',
              ms: 12,
            }),
            { status: 200 },
          );
        }
        // hasKey: true — both AI buttons need aiAvailable.
        return new Response(JSON.stringify({ ok: true, hasKey: true }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function renderWithNote() {
    render(<App />);
    await waitFor(() => expect(screen.getByTitle('AI available')).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Load run/i), { target: { value: 'the run go thru attic' } });
  }

  it('renders both AI buttons once a key is present', async () => {
    await renderWithNote();

    const polish = screen.getByRole('button', { name: /Polish with AI/i }) as HTMLButtonElement;
    const rewriteBtn = screen.getByRole('button', { name: 'هري ابو روي' }) as HTMLButtonElement;
    expect(polish.disabled).toBe(false);
    expect(rewriteBtn.disabled).toBe(false);
  });

  it("the rewrite button sends mode 'rewrite' and Polish sends mode 'polish'", async () => {
    await renderWithNote();

    fireEvent.click(screen.getByRole('button', { name: 'هري ابو روي' }));
    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].mode).toBe('rewrite');
    expect(sent[0].items).toEqual([{ id: 'install.loadRun', text: 'the run go thru attic' }]);

    fireEvent.click(screen.getByRole('button', { name: /Polish with AI/i }));
    await waitFor(() => expect(sent.length).toBe(2));
    expect(sent[1].mode).toBe('polish');
  });

  it('disables both buttons while one request is in flight', async () => {
    hold = true;
    await renderWithNote();

    fireEvent.click(screen.getByRole('button', { name: 'هري ابو روي' }));
    await waitFor(() => expect(sent.length).toBe(1));

    // Mid-flight: the pressed button shows its spinner, both are locked out.
    const rewriteBtn = screen.getByRole('button', { name: /Rewriting/i }) as HTMLButtonElement;
    const polish = screen.getByRole('button', { name: /Polish with AI/i }) as HTMLButtonElement;
    expect(rewriteBtn.disabled).toBe(true);
    expect(polish.disabled).toBe(true);

    release?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'هري ابو روي' })).toBeTruthy());
    expect((screen.getByRole('button', { name: /Polish with AI/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---- Review findings, 2026-09-30 — AI results must never silently replace ---
// ---- or erase what the engineer actually wrote -----------------------------

describe('the AI can never quietly delete or overwrite a note', () => {
  let sent: { items: { id: string; text: string }[]; mode?: string }[];
  let hold: boolean;
  let release: (() => void) | null;
  let reply: (item: { id: string; text: string }) => { id: string; text: string };

  beforeEach(() => {
    localStorage.clear();
    sent = [];
    hold = false;
    release = null;
    reply = (i) => ({ id: i.id, text: `${i.text} edited.` });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/rewrite')) {
          const body = JSON.parse(String(init?.body)) as { items: { id: string; text: string }[]; mode?: string };
          sent.push(body);
          if (hold) await new Promise<void>((resolve) => (release = resolve));
          return new Response(
            JSON.stringify({ items: body.items.map((i) => reply(i)), model: 'gpt-4o-mini', ms: 12 }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true, hasKey: true }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function ready() {
    render(<App />);
    await waitFor(() => expect(screen.getByTitle('AI available')).toBeTruthy());
  }

  const preview = () => (document.querySelector('.preview') as HTMLElement).textContent ?? '';

  // The server prompt tells the model to return "" for an empty note. A model
  // that misapplies that rule to a SHORT note used to blank the box silently:
  // effectiveText treats "" as a valid polished value, and both guards bail on
  // an empty polished string, so nothing warned.
  it('an empty string back from the model leaves the raw draft in the post', async () => {
    await ready();
    fireEvent.change(screen.getByLabelText(/Design Feedback/i), {
      target: { value: 'AC disconnect rating must be 200A' },
    });
    reply = (i) => ({ id: i.id, text: '' });

    fireEvent.click(screen.getByRole('button', { name: /Polish with AI/i }));
    await waitFor(() => expect(sent.length).toBe(1));

    await waitFor(() => expect(preview()).toContain('200A'));
    expect(preview()).not.toContain('Design Feedback:* All good.');
  });

  it('a whitespace-only reply is treated the same way', async () => {
    await ready();
    fireEvent.change(screen.getByLabelText(/^Load run/i), { target: { value: '18 ft through the attic' } });
    reply = (i) => ({ id: i.id, text: '   \n  ' });

    fireEvent.click(screen.getByRole('button', { name: /Polish with AI/i }));
    await waitFor(() => expect(sent.length).toBe(1));

    await waitFor(() => expect(preview()).toContain('18 ft through the attic'));
  });

  // Editing a box while its polish is in flight: the reply is keyed by id only,
  // so it used to land on top of text the user had already replaced — the
  // textarea showed the new text while the post carried the polished old one.
  it('a result for text the user has already replaced is discarded', async () => {
    hold = true;
    await ready();
    const box = screen.getByLabelText(/Design Feedback/i);
    fireEvent.change(box, { target: { value: 'ORIGINAL LINE' } });

    fireEvent.click(screen.getByRole('button', { name: /Polish with AI/i }));
    await waitFor(() => expect(sent.length).toBe(1));

    fireEvent.change(box, { target: { value: 'COMPLETELY DIFFERENT LINE' } });
    release?.();

    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('COMPLETELY DIFFERENT LINE'));
    expect(preview()).toContain('COMPLETELY DIFFERENT LINE');
    expect(preview()).not.toContain('ORIGINAL LINE');
  });

  it('a result for a box the user did NOT touch still applies', async () => {
    hold = true;
    await ready();
    fireEvent.change(screen.getByLabelText(/Design Feedback/i), { target: { value: 'design note' } });
    fireEvent.change(screen.getByLabelText(/Homeowner Feedback/i), { target: { value: 'homeowner note' } });

    fireEvent.click(screen.getByRole('button', { name: /Polish with AI/i }));
    await waitFor(() => expect(sent.length).toBe(1));
    fireEvent.change(screen.getByLabelText(/Design Feedback/i), { target: { value: 'design note CHANGED' } });
    release?.();

    await waitFor(() => expect(preview()).toContain('homeowner note edited.'));
    expect(preview()).toContain('design note CHANGED');
  });

  // A box longer than the server's 3000-char ceiling used to be sent anyway and
  // come back as a raw "bad payload".
  it('a note over the 3000-character limit is refused before it is sent', async () => {
    await ready();
    fireEvent.change(screen.getByLabelText(/Design Feedback/i), { target: { value: 'x'.repeat(3500) } });

    fireEvent.click(screen.getByRole('button', { name: /Polish with AI/i }));

    await waitFor(() => expect(screen.getByText(/too long for the AI/i)).toBeTruthy());
    expect(sent.length).toBe(0);
  });

  // AI guard hints are component state; they used to survive a record switch
  // and sit under the empty boxes of a brand-new post.
  it('guard warnings do not follow you to the next project', async () => {
    await ready();
    fireEvent.change(screen.getByLabelText(/Design Feedback/i), {
      target: { value: 'run is 2" PVC\nsecond line' },
    });
    reply = (i) => ({ id: i.id, text: 'merged into one line' });

    fireEvent.click(screen.getByRole('button', { name: /Polish with AI/i }));
    await waitFor(() => expect(document.querySelector('.bullet-drift, .dropped-tokens')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /New post/i }));

    await waitFor(() => expect(document.querySelector('.bullet-drift')).toBeNull());
    expect(document.querySelector('.dropped-tokens')).toBeNull();
  });
});

// ---- Review finding, 2026-09-30 --------------------------------------------
// newPost force-saves the open form before clearing it. Opening a draft did
// not, and switching records cancels the pending 500 ms autosave — so the last
// thing typed was dropped.

describe('opening another draft never discards what is on screen', () => {
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

  const stored = () => JSON.parse(localStorage.getItem('sowpost.records') ?? '[]') as { sf: { customerName: string }; notes: { design: string } }[];
  const byName = (name: string) => stored().find((r) => r.sf.customerName === name);

  /** Two saved drafts, then Compose holding the second one. */
  async function twoDrafts() {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Customer name/i), { target: { value: 'First Project' } });
    await waitFor(() => expect(byName('First Project')).toBeTruthy(), { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: /New post/i }));
    fireEvent.change(screen.getByLabelText(/Customer name/i), { target: { value: 'Second Project' } });
    await waitFor(() => expect(byName('Second Project')).toBeTruthy(), { timeout: 2000 });
  }

  it('flushes the open form when a Drafts row is opened inside the debounce window', async () => {
    await twoDrafts();

    // Type, then switch immediately — well inside the 500 ms autosave debounce.
    fireEvent.change(screen.getByLabelText(/Design Feedback/i), {
      target: { value: 'AC disconnect must be 200A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
    fireEvent.click(screen.getByText('First Project'));

    await waitFor(() => expect(byName('Second Project')?.notes.design).toBe('AC disconnect must be 200A'));
  });

  it('re-opening the draft that is already open keeps the unsaved keystrokes on screen', async () => {
    await twoDrafts();

    fireEvent.change(screen.getByLabelText(/Design Feedback/i), { target: { value: 'still typing this' } });
    fireEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
    fireEvent.click(screen.getByText('Second Project'));

    // It used to reload the stale stored copy and wipe the box on screen.
    await waitFor(() =>
      expect((screen.getByLabelText(/Design Feedback/i) as HTMLTextAreaElement).value).toBe('still typing this'),
    );
    expect(byName('Second Project')?.notes.design).toBe('still typing this');
  });
});

// ---- Aboud, 2026-09-30: "the guys are losing their data" -------------------
// The draft list is written on a 500 ms debounce and flushed on unload. Neither
// survives a power cut or a forced shutdown, which is how a laptop really dies.

describe('a power cut loses nothing', () => {
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

  it('writes every keystroke to the live key with no debounce', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Design Feedback/i), {
      target: { value: 'AC disconnect must be 200A' },
    });

    // Read it on the very next statement — no waitFor, no timers.
    const live = JSON.parse(localStorage.getItem('sowpost.live') ?? 'null');
    expect(live.notes.design).toBe('AC disconnect must be 200A');
    // And the debounced list has NOT been written yet, which is the whole point.
    expect(localStorage.getItem('sowpost.records')).toBeNull();
  });

  it('restores the work on the next load', () => {
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText(/Customer name/i), { target: { value: 'Power Cut Project' } });
    fireEvent.change(screen.getByLabelText(/^Load run/i), { target: { value: '18 ft through the attic' } });

    // Kill it the way a power cut does: no unload event, no flush, and the
    // debounced draft-list write never happened.
    const live = localStorage.getItem('sowpost.live');
    unmount();
    localStorage.removeItem('sowpost.records');
    localStorage.setItem('sowpost.live', live ?? '');

    render(<App />);
    expect((screen.getByLabelText(/Customer name/i) as HTMLInputElement).value).toBe('Power Cut Project');
    expect((screen.getByLabelText(/^Load run/i) as HTMLTextAreaElement).value).toBe('18 ft through the attic');
  });

  it('does not resurrect a stale live draft over a newer saved one', async () => {
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText(/Customer name/i), { target: { value: 'First text' } });
    await waitFor(() => expect(localStorage.getItem('sowpost.records')).toBeTruthy(), { timeout: 2000 });

    // The saved list moves on; the live key is left holding the older text.
    const stale = JSON.parse(localStorage.getItem('sowpost.live') ?? 'null');
    fireEvent.change(screen.getByLabelText(/Customer name/i), { target: { value: 'Second text' } });
    await waitFor(() =>
      expect(localStorage.getItem('sowpost.records')).toContain('Second text'),
      { timeout: 2000 },
    );
    localStorage.setItem('sowpost.live', JSON.stringify(stale));
    unmount();

    render(<App />);
    expect((screen.getByLabelText(/Customer name/i) as HTMLInputElement).value).toBe('Second text');
  });
});
