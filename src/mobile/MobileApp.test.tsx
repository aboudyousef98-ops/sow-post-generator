// @vitest-environment jsdom
// iPhone shell — tab bar, board bottom-sheet edits, hours log flow, drafts
// review gating, admin roster sheet. Mobile components reuse the tested libs;
// these tests pin the glue.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardState } from '../board/types';
import type { ExtraWorkState } from '../extrawork/types';
import type { Ahj, PostRecord, Session, Settings } from '../types';
import { extraWorkRoster } from '../lib/auth';
import { emptyBoard, newProject } from '../lib/board';
import { defaultSettings } from '../lib/storage';
import { makeRecord } from '../lib/__fixtures__/makeRecord';
import MobileApp from './MobileApp';

const session: Session = { username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin' };
const memberSession: Session = { username: 'omar', displayName: 'Omar Rajab', role: 'member' };

const toasts: { text: string; action?: { label: string; fn: () => void } }[] = [];
let lastBoard: BoardState | undefined;
let lastExtra: ExtraWorkState | undefined;
let lastSettings: Settings | undefined;

function Harness({
  who = session,
  board: initialBoard,
  drafts = [],
}: {
  who?: Session;
  board?: BoardState;
  drafts?: PostRecord[];
}) {
  const [board, setBoard] = useState<BoardState>(initialBoard ?? emptyBoard());
  const [records, setRecords] = useState<PostRecord[]>(drafts);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [ahjs, setAhjs] = useState<Ahj[]>([]);
  const [extra, setExtra] = useState<ExtraWorkState>({ entries: [] });
  return (
    <MobileApp
      session={who}
      onLogout={() => {}}
      ewRoster={extraWorkRoster(who.displayName, settings.authors)}
      board={board}
      setBoard={(b) => {
        lastBoard = b;
        setBoard(b);
      }}
      records={records}
      setRecords={setRecords}
      drafts={records.filter((r) => r.status === 'draft' && !r.deletedAt)}
      settings={settings}
      setSettings={(s) => {
        lastSettings = s;
        setSettings(s);
      }}
      ahjs={ahjs}
      setAhjs={setAhjs}
      extraWork={extra}
      setExtraWork={(s) => {
        lastExtra = s;
        setExtra(s);
      }}
      markPostedById={() => {}}
      duplicateDraft={() => {}}
      deleteRecord={() => {}}
      syncOk
      toast={(text, action) => toasts.push({ text, action })}
    />
  );
}

describe('MobileApp shell', () => {
  beforeEach(() => {
    toasts.length = 0;
    lastBoard = undefined;
    lastExtra = undefined;
    lastSettings = undefined;
    localStorage.clear();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the tab bar; Admin only for admins', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Hours/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Admin/ })).toBeTruthy();
    cleanup();
    render(<Harness who={memberSession} />);
    expect(screen.queryByRole('button', { name: /Admin/ })).toBeNull();
  });

  it('board: tapping the status cell opens a sheet; picking a label patches + logs activity', () => {
    const board = emptyBoard();
    const p = { ...newProject('Patrick Lingwall', 'Aboud Yousef', board.labels, '2026-10-01T00:00:00.000Z'), id: 'p1' };
    render(<Harness board={{ ...board, projects: [p] }} />);
    // The status cell shows the default label name; tap it.
    const row = screen.getByText('Patrick Lingwall').closest('tr')!;
    fireEvent.click(within(row).getAllByRole('cell')[2]);
    const sheet = screen.getByRole('dialog', { name: 'Status' });
    const working = within(sheet).getByRole('button', { name: 'Working on it' });
    fireEvent.click(working);
    const updated = lastBoard!.projects.find((x) => x.id === 'p1')!;
    expect(updated.statusId).toBe(lastBoard!.labels.find((l) => l.name === 'Working on it')!.id);
    expect(lastBoard!.activity.length).toBe(1);
  });

  // The gate reads the same label flag the desktop board reads, so a status
  // the team marks "needs a note" cannot be slipped from a phone either
  // (Aboud 2026-11-05 — "Pending Update" is gated by name).
  it('board: a gated status is blocked on mobile until an update is written', () => {
    const board = emptyBoard();
    board.labels = [
      ...board.labels,
      {
        id: 's-pu',
        columnKey: 'status',
        name: 'Pending Update',
        color: '#FDAB3D',
        sortOrder: 160,
        isDefault: false,
        isDone: false,
        isSystem: false,
        archived: false,
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ];
    const p = { ...newProject('Patrick Lingwall', 'Aboud Yousef', board.labels, '2026-10-01T00:00:00.000Z'), id: 'p1' };
    render(<Harness board={{ ...board, projects: [p] }} />);

    const row = screen.getByText('Patrick Lingwall').closest('tr')!;
    fireEvent.click(within(row).getAllByRole('cell')[2]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Status' })).getByRole('button', { name: 'Pending Update' }));

    // Nothing written yet — the patch is held by the gate.
    expect(lastBoard).toBeUndefined();
    const reason = screen.getByLabelText('Reason');
    fireEvent.change(reason, { target: { value: 'waiting on the AHJ to confirm' } });
    fireEvent.click(screen.getByRole('button', { name: /Set status and post/ }));

    expect(lastBoard!.projects.find((x) => x.id === 'p1')!.statusId).toBe('s-pu');
    expect(lastBoard!.updates).toHaveLength(1);
    expect(lastBoard!.updates[0].kind).toBe('status');
    expect(lastBoard!.updates[0].text).toBe('waiting on the AHJ to confirm');
  });

  it('board: add project creates a row owned by me with a create activity', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Add project');
    fireEvent.change(input, { target: { value: 'New Customer' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(lastBoard!.projects).toHaveLength(1);
    expect(lastBoard!.projects[0].coordinator).toBe('Aboud Yousef');
    expect(lastBoard!.activity[0].action).toBe('create');
  });

  it('hours: full-screen log flow — quick pick, description gating, submit', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Hours/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Log hours' }));
    // Submit disabled until a description exists.
    const submit = screen.getByRole('button', { name: 'Add a description to log' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    fireEvent.change(screen.getByLabelText('What you worked on'), { target: { value: 'BOS tool' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log 4 hours' }));
    expect(lastExtra!.entries).toHaveLength(1);
    expect(lastExtra!.entries[0].hours).toBe(4);
    expect(lastExtra!.entries[0].username).toBe('aboudyousef');
  });

  // Regression (review, 2026-10-08): an admin who drilled into a teammate's
  // log and tapped "+ Log hours" had the entry recorded on their OWN log —
  // the submit hardcoded the signed-in user instead of the selected person.
  it('hours: an admin logging from a teammate’s log records it for that teammate', () => {
    localStorage.setItem(
      'sowpost.users',
      JSON.stringify([
        { username: 'aboudyousef', displayName: 'Aboud Yousef', role: 'admin', salt: 's', passHash: 'h', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', schemaVersion: 1 },
        { username: 'orajab', displayName: 'Omar Rajab', role: 'member', salt: 's', passHash: 'h', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', schemaVersion: 1 },
      ]),
    );
    render(<Harness />); // signed in as Aboud Yousef, admin
    fireEvent.click(screen.getByRole('button', { name: /^Hours/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    fireEvent.click(screen.getByText('Omar Rajab')); // drill into his log
    fireEvent.click(screen.getByRole('button', { name: '+ Log hours' }));
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    fireEvent.change(screen.getByLabelText('What you worked on'), { target: { value: 'Night cutover' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log 4 hours' }));

    expect(lastExtra!.entries).toHaveLength(1);
    expect(lastExtra!.entries[0].person).toBe('Omar Rajab');
    expect(lastExtra!.entries[0].username).toBe('orajab');
  });

  // Regression (2026-10-08): Anas opened Hours and saw nothing. The roster came
  // from Settings.authors — device-local, shipped with only 3 names — so the
  // two people added later were absent from their own screen. It now comes
  // from the synced users blob.
  it('hours: a member missing from Settings.authors still appears on their own Team list', () => {
    const anas: Session = { username: 'ayaghmour', displayName: 'Anas Yaghmour', role: 'member' };
    expect(defaultSettings().authors).not.toContain('Anas Yaghmour'); // the trap that caused it
    localStorage.setItem(
      'sowpost.users',
      JSON.stringify([
        {
          username: 'ayaghmour',
          displayName: 'Anas Yaghmour',
          role: 'member',
          salt: 's',
          passHash: 'h',
          createdAt: '2026-10-02T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
          schemaVersion: 1,
        },
      ]),
    );
    render(<Harness who={anas} />);
    fireEvent.click(screen.getByRole('button', { name: /^Hours/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(screen.getByText('Anas Yaghmour')).toBeTruthy();
  });

  it('drafts: review blocks Copy for Slack while fields are missing', async () => {
    const draft = makeRecord({
      id: 'd1',
      status: 'draft',
      sf: { ...makeRecord().sf, jurisdiction: '' },
    });
    render(<Harness drafts={[draft]} />);
    fireEvent.click(screen.getByRole('button', { name: /Drafts/ }));
    fireEvent.click(screen.getByText(/Missing jurisdiction/i));
    fireEvent.click(screen.getByRole('button', { name: 'Copy for Slack' }));
    expect(toasts.some((t) => /Fill in: Jurisdiction/.test(t.text))).toBe(true);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('admin: roster sheet adds a name into settings', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/ }));
    fireEvent.click(screen.getByText('Authors (Posting as)'));
    const sheet = screen.getByRole('dialog', { name: 'Authors (Posting as)' });
    fireEvent.change(within(sheet).getByPlaceholderText('Add a name'), { target: { value: 'Anas Yaghmour' } });
    fireEvent.keyDown(within(sheet).getByPlaceholderText('Add a name'), { key: 'Enter' });
    expect(lastSettings!.authors).toContain('Anas Yaghmour');
  });
});
