// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildNotifications, loadLastSeen, saveLastSeen } from './notifications';
import type { BoardActivity, BoardProject, ProjectUpdate } from '../board/types';

const SINCE = '2026-10-17T00:00:00.000Z';
const LATER = '2026-10-17T10:00:00.000Z';
const EARLIER = '2026-10-16T10:00:00.000Z';

const project = (id: string, name: string): BoardProject =>
  ({ id, name, deletedAt: undefined }) as BoardProject;

const PROJECTS = [project('p1', 'Glenda Hodge'), project('p2', 'Paul Richardson')];

const update = (over: Partial<ProjectUpdate> = {}): ProjectUpdate => ({
  id: 'u1',
  projectId: 'p1',
  text: 'waiting on the AHJ',
  by: 'Omar Rajab',
  at: LATER,
  kind: 'note',
  updatedAt: LATER,
  ...over,
});

const act = (over: Partial<BoardActivity> = {}): BoardActivity => ({
  id: 'a1',
  projectId: 'p1',
  actor: 'Omar Rajab',
  action: 'update',
  changes: { statusId: { old: 'New project', new: 'Hold' } },
  at: LATER,
  ...over,
});

const build = (a: BoardActivity[], u: ProjectUpdate[], me = 'Aboud Yousef') =>
  buildNotifications(a, u, PROJECTS, me, SINCE);

describe('buildNotifications', () => {
  it('reports someone else\'s update, with its words and project name', () => {
    const [n] = build([], [update()]);
    expect(n.actor).toBe('Omar Rajab');
    expect(n.projectName).toBe('Glenda Hodge');
    expect(n.text).toBe('waiting on the AHJ');
    expect(n.kind).toBe('update');
  });

  it('never reports your own actions', () => {
    expect(build([act({ actor: 'Aboud Yousef' })], [update({ by: 'Aboud Yousef' })])).toEqual([]);
  });

  it('ignores anything at or before the last-seen stamp', () => {
    expect(build([act({ at: EARLIER })], [update({ at: EARLIER })])).toEqual([]);
    expect(build([], [update({ at: SINCE })])).toEqual([]);
  });

  it('skips deleted updates and projects that no longer exist', () => {
    expect(build([], [update({ deleted: { at: LATER, by: 'x' } })])).toEqual([]);
    expect(build([], [update({ projectId: 'gone' })])).toEqual([]);
  });

  it('reports notable field changes and the status name', () => {
    const [n] = build([act()], []);
    expect(n.text).toBe('status → Hold');
    expect(n.kind).toBe('activity');
  });

  it('stays quiet about noise nobody needs telling about', () => {
    // A date nudge or a drag-reorder must not ring the bell.
    expect(build([act({ changes: { designedDate: { old: '—', new: '2026-10-20' } } })], [])).toEqual([]);
    expect(build([act({ changes: { position: { old: '1', new: '2' } } })], [])).toEqual([]);
  });

  it('reports lifecycle actions in words', () => {
    expect(build([act({ action: 'archive', changes: undefined })], [])[0].text).toBe('archived it');
    expect(build([act({ action: 'create', changes: undefined })], [])[0].text).toBe('created this project');
  });

  it('does not double-report an update via the activity log', () => {
    // The update itself is reported from the thread, with better wording.
    const out = build([act({ action: 'update-post', changes: undefined })], [update()]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('update');
  });

  it('is newest first', () => {
    const out = build([], [
      update({ id: 'old', at: '2026-10-17T01:00:00.000Z' }),
      update({ id: 'new', at: '2026-10-17T09:00:00.000Z' }),
    ]);
    expect(out.map((n) => n.id)).toEqual(['u:new', 'u:old']);
  });

  it('tolerates absent activity and updates', () => {
    expect(buildNotifications(undefined, undefined, PROJECTS, 'me', SINCE)).toEqual([]);
  });
});

describe('last seen', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to now, so a first sign-in is not flooded with history', () => {
    const now = '2026-10-17T12:00:00.000Z';
    expect(loadLastSeen(now)).toBe(now);
  });

  it('round-trips', () => {
    saveLastSeen(LATER);
    expect(loadLastSeen()).toBe(LATER);
  });
});
