// @vitest-environment jsdom
// "Ask the board" — one question, two lanes.
//
// Aboud 2026-11-05: "the 'Ask the updates' feature looks into updates, but can
// we also make it look at activity log? for example I ask, what was the
// projects that I interacted with yesterday?"

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardActivity, BoardProject, ProjectUpdate } from './types';
import { newProject, seedLabels } from '../lib/board';
import { todayIso } from '../lib/dates';
import UpdateSearchModal from './UpdateSearchModal';

const updateSearchMock = vi.fn();
const activityQueryMock = vi.fn();
vi.mock('../lib/api', () => ({
  updateSearch: (...a: unknown[]) => updateSearchMock(...a),
  activityQuery: (...a: unknown[]) => activityQueryMock(...a),
}));

const ME = 'Aboud Yousef';
const ROSTER = [ME, 'Omar Rajab'];

const projects: BoardProject[] = [
  { ...newProject('Martha Thompson', ME, seedLabels(), '2026-10-01T00:00:00.000Z'), id: 'p1' },
  { ...newProject('Karan Staggers', ME, seedLabels(), '2026-10-01T00:00:00.000Z'), id: 'p2' },
];

const upd = (over: Partial<ProjectUpdate>): ProjectUpdate => ({
  id: 'u1',
  projectId: 'p1',
  text: 'trench and external long run',
  by: ME,
  at: '2026-11-01T10:00:00.000Z',
  kind: 'note',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...over,
});

/** Yesterday, as a real local timestamp, so the local parser can find it. */
const yesterdayAt = (hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const activity: BoardActivity[] = [
  {
    id: 'a1',
    projectId: 'p2',
    actor: ME,
    action: 'update',
    changes: { statusId: { old: 'New project', new: 'Working on it' } },
    at: yesterdayAt(9),
  },
  { id: 'a2', projectId: 'p2', actor: ME, action: 'update-post', at: yesterdayAt(10) },
  { id: 'a3', projectId: 'p1', actor: 'Omar Rajab', action: 'create', at: yesterdayAt(11) },
];

const open = vi.fn();
const openActivity = vi.fn();

function renderModal() {
  return render(
    <UpdateSearchModal
      projects={projects}
      updates={[upd({})]}
      activity={activity}
      me={ME}
      roster={ROSTER}
      onOpenProject={open}
      onOpenActivity={openActivity}
      onClose={vi.fn()}
    />,
  );
}

const ask = async (q: string) => {
  fireEvent.change(screen.getByLabelText('Ask the board'), { target: { value: q } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  });
};

beforeEach(() => {
  updateSearchMock.mockReset();
  activityQueryMock.mockReset();
  open.mockReset();
  openActivity.mockReset();
  updateSearchMock.mockResolvedValue({ hits: [] });
  activityQueryMock.mockResolvedValue({ filter: {}, understood: false });
});
afterEach(cleanup);

describe('the activity lane', () => {
  it('answers "what did I interact with yesterday" with no model at all', async () => {
    // Both lanes fail: the local date parser still has to answer.
    updateSearchMock.mockRejectedValue(new Error('no key'));
    activityQueryMock.mockRejectedValue(new Error('no key'));
    renderModal();
    await ask('what were the projects I interacted with yesterday?');

    expect(screen.getByText('Karan Staggers')).toBeTruthy();
    expect(screen.getByText(/changed Status/)).toBeTruthy();
    expect(screen.getByText(/posted an update/)).toBeTruthy();
    // Omar's row is not mine, so it is not in the answer.
    expect(screen.queryByText('Martha Thompson')).toBeNull();
  });

  it('leads with an exact count, because the filter is exact', async () => {
    renderModal();
    await ask('what did I touch yesterday');
    expect(screen.getByText(/1 project you touched on /)).toBeTruthy();
  });

  it('uses the model\'s filter when it lands, over the local guess', async () => {
    // A phrasing the local parser cannot read; the model resolves it.
    activityQueryMock.mockResolvedValue({
      filter: { actors: ['Omar Rajab'], from: todayIso(), to: todayIso() },
      understood: true,
    });
    renderModal();
    await ask('whatever Omar was up to around the start of the week');

    // Today has no activity in the fixture, so the model's filter — not the
    // local parser's null — is what was applied.
    expect(screen.getByText(/0 projects Omar Rajab touched/)).toBeTruthy();
  });

  it('sends the question and context, but never the log itself', async () => {
    renderModal();
    await ask('what did I touch yesterday');

    const [, context] = activityQueryMock.mock.calls[0];
    expect(Object.keys(context as object).sort()).toEqual(['actions', 'fields', 'me', 'roster', 'today']);
    expect(JSON.stringify(context)).not.toContain('a1');
  });

  it('ignores a filter the model says it did not understand', async () => {
    activityQueryMock.mockResolvedValue({ filter: { actors: [ME] }, understood: false });
    renderModal();
    await ask('which projects have trenching?');

    // Falls through to the updates lane's framing, not an activity count.
    expect(screen.getByText(/for “which projects have trenching\?”/)).toBeTruthy();
  });

  it('drops an actor the model invented rather than answering "nothing"', async () => {
    activityQueryMock.mockResolvedValue({
      filter: { actors: ['Ghost Person'], from: yesterdayAt(0).slice(0, 10), to: yesterdayAt(23).slice(0, 10) },
      understood: true,
    });
    renderModal();
    await ask('what did the ghost do yesterday');

    // The invented actor is stripped, so the date still answers.
    expect(screen.getByText(/anyone touched/)).toBeTruthy();
  });

  it('an activity-only row opens the activity log, not the thread', async () => {
    renderModal();
    await ask('what did I touch yesterday');
    fireEvent.click(screen.getByRole('button', { name: 'Karan Staggers' }));

    expect(openActivity).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));
    expect(open).not.toHaveBeenCalled();
  });
});

describe('the updates lane still works as it did', () => {
  it('keyword matches appear with no model', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Ask the board'), { target: { value: 'trench' } });
    expect(screen.getByText(/trench and external long run/)).toBeTruthy();
  });

  it('the model ADDS matches that share no words with the question', async () => {
    updateSearchMock.mockResolvedValue({ hits: [{ projectId: 'p2', why: 'update mentions excavation' }] });
    renderModal();
    await ask('hard projects');

    expect(screen.getByText('update mentions excavation')).toBeTruthy();
  });

  it('an updates row opens the thread', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Ask the board'), { target: { value: 'trench' } });
    fireEvent.click(screen.getByRole('button', { name: 'Martha Thompson' }));

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });
});

describe('the two lanes fail independently', () => {
  it('one dead lane does not make the whole box read as offline', async () => {
    updateSearchMock.mockRejectedValue(new Error('model down'));
    activityQueryMock.mockResolvedValue({
      filter: { actors: [ME], from: yesterdayAt(0).slice(0, 10), to: yesterdayAt(23).slice(0, 10) },
      understood: true,
    });
    renderModal();
    await ask('what did I touch yesterday');

    expect(screen.queryByText(/AI is unavailable/)).toBeNull();
    expect(screen.getByText('Karan Staggers')).toBeTruthy();
  });

  it('both dead says so plainly, and keeps the local answers', async () => {
    updateSearchMock.mockRejectedValue(new Error('down'));
    activityQueryMock.mockRejectedValue(new Error('down'));
    renderModal();
    await ask('trench');

    expect(screen.getByText(/AI is unavailable/)).toBeTruthy();
    expect(screen.getByText(/trench and external long run/)).toBeTruthy();
  });
});
