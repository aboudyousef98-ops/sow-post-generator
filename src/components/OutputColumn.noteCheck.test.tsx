// @vitest-environment jsdom
// Pre-post note check (_PLAN_note_check.md): the gate on Copy for Slack.
//
// The behaviours that matter are: it stays INVISIBLE when it has nothing to
// say, it never blocks when the AI is down, it does not nag twice for the same
// post, and editing the post voids the confirmation.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../lib/storage';
import { makeRecord } from '../lib/__fixtures__/makeRecord';
import type { Ahj, AhjPost, PostRecord } from '../types';
import OutputColumn from './OutputColumn';

const T = '2026-10-08T09:00:00.000Z';
const noteCheckMock = vi.fn();
vi.mock('../lib/api', () => ({ noteCheck: (...a: unknown[]) => noteCheckMock(...a) }));

function note(id: string, text: string): AhjPost {
  return { id, text, by: 'Aboud Yousef', at: T, history: [], pinned: false, updatedAt: T };
}
const harris: Ahj = {
  id: 'a1',
  name: 'Harris County',
  aliases: [],
  kind: 'ahj',
  posts: [note('n-trench', 'Trench depth minimum 24 inches.')],
  updatedAt: T,
  schemaVersion: 1,
};

let written: string[] = [];
let lastRecord: PostRecord | undefined;

function Harness({ initial, ahjs = [harris] }: { initial?: Partial<PostRecord>; ahjs?: Ahj[] }) {
  const [record, setRecord] = useState<PostRecord>(() => {
    const r = makeRecord(initial);
    r.sf = { ...r.sf, jurisdiction: 'Harris County' };
    return r;
  });
  lastRecord = record;
  return (
    <OutputColumn
      record={record}
      settings={defaultSettings()}
      ahjs={ahjs}
      update={(fn) => setRecord((r) => fn(r))}
      onMarkPosted={() => {}}
      onNewPost={() => {}}
      onSaveDraft={() => {}}
      toast={() => {}}
    />
  );
}

const clickCopy = () => fireEvent.click(screen.getByRole('button', { name: 'Copy for Slack' }));

describe('pre-post note check', () => {
  beforeEach(() => {
    written = [];
    lastRecord = undefined;
    noteCheckMock.mockReset();
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        write: vi.fn(async () => { written.push('rich'); }),
        writeText: vi.fn(async () => { written.push('plain'); }),
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('stays invisible and copies straight through when nothing matches', async () => {
    noteCheckMock.mockResolvedValue({ hits: [], model: 'm', ms: 1 });
    render(<Harness />); // the canonical post says nothing about trenching
    clickCopy();
    await waitFor(() => expect(written.length).toBe(1));
    expect(screen.queryByText(/may apply/)).toBeNull();
  });

  it('never calls the AI at all when the project has no notes on file', async () => {
    render(<Harness ahjs={[]} />);
    clickCopy();
    await waitFor(() => expect(written.length).toBe(1));
    expect(noteCheckMock).not.toHaveBeenCalled();
  });

  it('shows the popup with the note and WHY it surfaced, and holds the copy back', async () => {
    noteCheckMock.mockResolvedValue({ hits: [{ lineId: 'n-trench#0', why: 'post mentions trenching along the fence', trigger: 'trench along the fence' }], model: 'm', ms: 1 });
    render(<Harness initial={{ notes: { layout: '', siteSurvey: 'We will trench along the fence.', design: '', homeowner: '' } }} />);
    clickCopy();

    expect(await screen.findByText(/1 note may apply/)).toBeTruthy();
    expect(screen.getByText('Trench depth minimum 24 inches.')).toBeTruthy();
    expect(screen.getByText(/post mentions trenching/)).toBeTruthy();
    expect(screen.getByText('AHJ: Harris County')).toBeTruthy();
    expect(written).toEqual([]); // nothing copied yet
  });

  it('Confirm and copy copies AND records the confirmation on the record', async () => {
    noteCheckMock.mockResolvedValue({ hits: [{ lineId: 'n-trench#0', why: 'post mentions trenching along the fence', trigger: 'trench along the fence' }], model: 'm', ms: 1 });
    render(<Harness initial={{ notes: { layout: '', siteSurvey: 'We will trench along the fence.', design: '', homeowner: '' } }} />);
    clickCopy();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and copy to Slack' }));

    await waitFor(() => expect(written.length).toBe(1));
    const nc = lastRecord!.noteCheck!;
    expect(nc.items).toHaveLength(1);
    expect(nc.items[0].noteId).toBe('n-trench#0'); // the LINE, not the whole note
    // Snapshotted, so editing the note later cannot rewrite history.
    expect(nc.items[0].text).toBe('Trench depth minimum 24 inches.');
    expect(nc.source).toBe('ai');
    expect(nc.by).toBe(lastRecord!.author);
  });

  it('Cancel copies nothing and records nothing', async () => {
    noteCheckMock.mockResolvedValue({ hits: [{ lineId: 'n-trench#0', why: 'post mentions trenching along the fence', trigger: 'trench along the fence' }], model: 'm', ms: 1 });
    render(<Harness initial={{ notes: { layout: '', siteSurvey: 'We will trench along the fence.', design: '', homeowner: '' } }} />);
    clickCopy();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(written).toEqual([]);
    expect(lastRecord!.noteCheck).toBeUndefined();
  });

  it('does not nag twice — a second copy of the SAME post goes straight through', async () => {
    noteCheckMock.mockResolvedValue({ hits: [{ lineId: 'n-trench#0', why: 'post mentions trenching along the fence', trigger: 'trench along the fence' }], model: 'm', ms: 1 });
    render(<Harness initial={{ notes: { layout: '', siteSurvey: 'We will trench along the fence.', design: '', homeowner: '' } }} />);
    clickCopy();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and copy to Slack' }));
    await waitFor(() => expect(written.length).toBe(1));

    noteCheckMock.mockClear();
    clickCopy();
    await waitFor(() => expect(written.length).toBe(2));
    expect(noteCheckMock).not.toHaveBeenCalled(); // no second AI call, no popup
    expect(screen.queryByText(/may apply/)).toBeNull();
  });

  it('a confirmation does NOT carry over to a different post text', async () => {
    noteCheckMock.mockResolvedValue({ hits: [], model: 'm', ms: 1 });
    // Confirmed against some OTHER post — the hash will not match this one.
    noteCheckMock.mockResolvedValue({ hits: [{ lineId: 'n-trench#0', why: 'post mentions trenching', trigger: 'trench along the fence' }], model: 'm', ms: 1 });
    render(
      <Harness
        initial={{
          notes: { layout: '', siteSurvey: 'We will trench along the fence.', design: '', homeowner: '' },
          noteCheck: { at: T, by: 'Aboud Yousef', postHash: 'stale-hash', source: 'ai', items: [] },
        }}
      />,
    );
    clickCopy();
    expect(await screen.findByText(/may apply/)).toBeTruthy(); // re-checked, not trusted
  });

  it('AI down → still shows the keyword list, labelled, and never blocks', async () => {
    noteCheckMock.mockRejectedValue(new Error('502'));
    render(<Harness initial={{ notes: { layout: '', siteSurvey: 'We will trench along the fence.', design: '', homeowner: '' } }} />);
    clickCopy();

    expect(await screen.findByText(/AI unavailable/)).toBeTruthy();
    expect(screen.getByText('Trench depth minimum 24 inches.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and copy to Slack' }));
    await waitFor(() => expect(written.length).toBe(1));
    expect(lastRecord!.noteCheck!.source).toBe('keyword');
  });

  it('surfaces an AI-only hit the keyword pass would have missed', async () => {
    noteCheckMock.mockResolvedValue({
      hits: [{ lineId: 'n-trench#0', why: 'post mentions excavation', trigger: 'Excavation along the fence' }],
      model: 'm',
      ms: 1,
    });
    // "excavation" shares no term with the trench note.
    render(<Harness initial={{ notes: { layout: '', siteSurvey: 'Excavation along the fence.', design: '', homeowner: '' } }} />);
    clickCopy();
    expect(await screen.findByText(/post mentions excavation/)).toBeTruthy();
  });

  it('ignores a note id the model invented', async () => {
    noteCheckMock.mockResolvedValue({ hits: [{ lineId: 'does-not-exist#0', why: 'made up', trigger: 'nothing real' }], model: 'm', ms: 1 });
    render(<Harness />);
    clickCopy();
    await waitFor(() => expect(written.length).toBe(1)); // copied, no popup
    expect(screen.queryByText(/may apply/)).toBeNull();
  });
});

// Draft-deploy finding (2026-10-08): told only in the prompt to skip notes that
// "fire on every post", gpt-4o-mini still returned always-true notes on a
// completely routine post. So we verify its EVIDENCE, not its judgement.
describe('AI trigger must be grounded in the post', () => {
  beforeEach(() => {
    written = [];
    lastRecord = undefined;
    noteCheckMock.mockReset();
    vi.stubGlobal('ClipboardItem', class {});
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        write: vi.fn(async () => { written.push('rich'); }),
        writeText: vi.fn(async () => { written.push('plain'); }),
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('drops an AI hit whose quoted trigger is not in the post', () => {
    noteCheckMock.mockResolvedValue({
      hits: [{ lineId: 'n-trench#0', why: 'install date set, so NTP must exist', trigger: 'install date set' }],
      model: 'm',
      ms: 1,
    });
    render(<Harness />); // routine post — 'install date set' appears nowhere in it
    clickCopy();
    return waitFor(() => {
      expect(written.length).toBe(1); // copied straight through
      expect(screen.queryByText(/may apply/)).toBeNull();
    });
  });

  it('drops a trigger quoting only the template’s own heading', () => {
    noteCheckMock.mockResolvedValue({
      hits: [{ lineId: 'n-trench#0', why: 'routine', trigger: 'Site Survey Feedback' }],
      model: 'm',
      ms: 1,
    });
    render(<Harness />);
    clickCopy();
    return waitFor(() => expect(written.length).toBe(1));
  });

  it('keeps a hit whose trigger really is in the project-specific text', async () => {
    noteCheckMock.mockResolvedValue({
      hits: [{ lineId: 'n-trench#0', why: 'post mentions excavation', trigger: 'excavation along the fence' }],
      model: 'm',
      ms: 1,
    });
    render(<Harness initial={{ notes: { layout: '', siteSurvey: 'Excavation along the fence.', design: '', homeowner: '' } }} />);
    clickCopy();
    expect(await screen.findByText(/post mentions excavation/)).toBeTruthy();
  });
});
