import { describe, it, expect } from 'vitest';
import {
  deleteUpdate,
  editUpdate,
  isPendingInfoLabel,
  needsRatingReason,
  newReply,
  newUpdate,
  putUpdate,
  restoreUpdate,
  searchUpdates,
  threadRoots,
  updateCounts,
  updatesCorpus,
  updatesFor,
} from './updates';
import { labelRequiresNote, statusGate } from './updates';
import { mergeBoard, emptyBoard } from './board';
import type { BoardLabel, ProjectUpdate } from '../board/types';

const label = (over: Partial<BoardLabel> = {}): BoardLabel => ({
  id: 'status-pending-update',
  columnKey: 'status',
  name: 'Pending Update',
  color: '#FDAB3D',
  sortOrder: 160,
  isDefault: false,
  isDone: false,
  isSystem: false,
  archived: false,
  updatedAt: '2026-11-05T00:00:00.000Z',
  ...over,
});

const mk = (over: Partial<ProjectUpdate> = {}): ProjectUpdate => ({
  id: 'u1',
  projectId: 'p1',
  text: 'trench and external long run',
  by: 'Aboud Yousef',
  at: '2026-10-17T10:00:00.000Z',
  kind: 'note',
  updatedAt: '2026-10-17T10:00:00.000Z',
  ...over,
});

describe('gates', () => {
  it('4 and 5 stars need a reason, 1-3 do not', () => {
    expect(needsRatingReason(5)).toBe(true);
    expect(needsRatingReason(4)).toBe(true);
    expect(needsRatingReason(3)).toBe(false);
    expect(needsRatingReason(null)).toBe(false);
    expect(needsRatingReason(undefined)).toBe(false);
  });

  it('recognises the pending-info status whatever its case', () => {
    expect(isPendingInfoLabel('Pending Additional Information')).toBe(true);
    expect(isPendingInfoLabel('  pending additional information ')).toBe(true);
    expect(isPendingInfoLabel('Hold')).toBe(false);
    expect(isPendingInfoLabel(undefined)).toBe(false);
  });
});

// Aboud 2026-11-05: "Pending Update" must demand an update the same way
// "Pending Additional Information" already demands one.
describe('labels that require a note', () => {
  it('both pending statuses are gated by name, with no flag stored', () => {
    expect(labelRequiresNote(label({ name: 'Pending Update' }))).toBe(true);
    expect(labelRequiresNote(label({ name: 'Pending Additional Information' }))).toBe(true);
    // Case and stray spaces must not matter — a rename that only changes case
    // cannot be allowed to switch the gate off silently.
    expect(labelRequiresNote(label({ name: '  pending update  ' }))).toBe(true);
  });

  it('an ordinary status is not gated', () => {
    expect(labelRequiresNote(label({ name: 'Working on it' }))).toBe(false);
    expect(labelRequiresNote(undefined)).toBe(false);
  });

  it('an explicit tick beats the name, both ways', () => {
    expect(labelRequiresNote(label({ name: 'Pending Update', requiresNote: false }))).toBe(false);
    expect(labelRequiresNote(label({ name: 'OVERTIME', requiresNote: true }))).toBe(true);
  });

  it('only status labels gate — a phase label never does', () => {
    expect(labelRequiresNote(label({ columnKey: 'phase', name: 'Pending Update' }))).toBe(false);
    expect(labelRequiresNote(label({ columnKey: 'phase', requiresNote: true }))).toBe(false);
  });

  it('is independent of the three section flags, unlike them', () => {
    // A row can be parked AND owe an explanation. The section flags are
    // mutually exclusive with each other; this one is not.
    expect(labelRequiresNote(label({ requiresNote: true, outOfScope: true }))).toBe(true);
    expect(labelRequiresNote(label({ requiresNote: true, review: true }))).toBe(true);
  });

  it('a done label is never gated — the work is over', () => {
    expect(labelRequiresNote(label({ name: 'Pending Update', isDone: true }))).toBe(false);
  });

  it('names the label in the modal copy, so one gate serves every status', () => {
    const g = statusGate(label({ name: 'Pending Update' }));
    expect(g.title).toContain('Pending Update');
    expect(g.confirmLabel.length).toBeGreaterThan(0);
    expect(g.placeholder.length).toBeGreaterThan(0);
    // The long-standing pending-info wording is kept for the status that has
    // had it since 2026-10-17 — the team already reads that sentence.
    expect(statusGate(label({ name: 'Pending Additional Information' })).title).toBe(
      'What information is missing?',
    );
  });
});

describe('thread', () => {
  it('returns one project\'s live updates, newest first', () => {
    const all = [
      mk({ id: 'a', at: '2026-10-01T00:00:00.000Z' }),
      mk({ id: 'b', at: '2026-10-05T00:00:00.000Z' }),
      mk({ id: 'c', projectId: 'p2' }),
      mk({ id: 'd', deleted: { at: 'x', by: 'y' } }),
    ];
    expect(updatesFor(all, 'p1').map((u) => u.id)).toEqual(['b', 'a']);
  });

  it('tolerates an absent updates array', () => {
    expect(updatesFor(undefined, 'p1')).toEqual([]);
    expect(updateCounts(undefined).size).toBe(0);
  });

  it('counts live updates per project', () => {
    const all = [mk({ id: 'a' }), mk({ id: 'b' }), mk({ id: 'c', projectId: 'p2' }), mk({ id: 'd', deleted: { at: 'x', by: 'y' } })];
    const c = updateCounts(all);
    expect(c.get('p1')).toBe(2);
    expect(c.get('p2')).toBe(1);
  });

  it('trims the text it stores', () => {
    expect(newUpdate('p1', '  hi  ', 'Me').text).toBe('hi');
  });

  it('edit stamps the editor and moves updatedAt', () => {
    const e = editUpdate(mk(), 'new text', 'Omar Rajab', '2026-10-18T00:00:00.000Z');
    expect(e.text).toBe('new text');
    expect(e.editedBy).toBe('Omar Rajab');
    expect(e.updatedAt).toBe('2026-10-18T00:00:00.000Z');
    expect(e.at).toBe(mk().at); // original post time is preserved
  });

  it('delete tombstones rather than removing, and restore undoes it', () => {
    const d = deleteUpdate(mk(), 'Me', '2026-10-18T00:00:00.000Z');
    expect(d.deleted).toEqual({ at: '2026-10-18T00:00:00.000Z', by: 'Me' });
    expect(updatesFor([d], 'p1')).toEqual([]);
    expect(restoreUpdate(d).deleted).toBeUndefined();
  });

  it('putUpdate inserts once then replaces in place', () => {
    const a = mk({ id: 'a' });
    const once = putUpdate([], a);
    expect(once).toHaveLength(1);
    const twice = putUpdate(once, { ...a, text: 'changed' });
    expect(twice).toHaveLength(1);
    expect(twice[0].text).toBe('changed');
  });
});

describe('merge — updates survive sync between two people', () => {
  it('unions by id and prefers the newer updatedAt', () => {
    const mine = { ...emptyBoard(), updates: [mk({ id: 'a', text: 'mine', updatedAt: '2026-10-17T12:00:00.000Z' })] };
    const theirs = {
      updates: [
        mk({ id: 'a', text: 'theirs newer', updatedAt: '2026-10-17T13:00:00.000Z' }),
        mk({ id: 'b', text: 'only theirs' }),
      ],
    };
    const out = mergeBoard(mine, theirs);
    expect(out.updates).toHaveLength(2);
    expect(out.updates.find((u) => u.id === 'a')!.text).toBe('theirs newer');
  });

  it('a delete tombstone wins over an older live copy', () => {
    const mine = { ...emptyBoard(), updates: [mk({ id: 'a', updatedAt: '2026-10-17T10:00:00.000Z' })] };
    const theirs = { updates: [deleteUpdate(mk({ id: 'a' }), 'Omar Rajab', '2026-10-17T11:00:00.000Z')] };
    expect(updatesFor(mergeBoard(mine, theirs).updates, 'p1')).toEqual([]);
  });

  it('a board written before updates existed still merges', () => {
    const legacy = { projects: [], labels: [], activity: [] } as never;
    expect(() => mergeBoard(emptyBoard(), legacy)).not.toThrow();
    expect(mergeBoard(emptyBoard(), legacy).updates).toEqual([]);
  });
});

describe('search', () => {
  const names = new Map([
    ['p1', 'Glenda Hodge'],
    ['p2', 'Paul Richardson'],
  ]);
  const all = [
    mk({ id: 'a', text: 'this project has trench and external long run', kind: 'rating', rating: 5 }),
    mk({ id: 'b', projectId: 'p2', text: 'waiting on the utility letter' }),
    mk({ id: 'c', deleted: { at: 'x', by: 'y' }, text: 'trench deleted' }),
  ];

  it('finds the trenching project — the use case Aboud described', () => {
    const hits = searchUpdates(all, names, 'trench');
    expect(hits).toHaveLength(1);
    expect(hits[0].projectName).toBe('Glenda Hodge');
  });

  it('searches the project name and the author too', () => {
    expect(searchUpdates(all, names, 'richardson')).toHaveLength(1);
    expect(searchUpdates(all, names, 'aboud')).toHaveLength(2);
  });

  it('requires every term', () => {
    expect(searchUpdates(all, names, 'trench utility')).toHaveLength(0);
  });

  it('skips deleted updates and empty queries', () => {
    expect(searchUpdates(all, names, 'deleted')).toHaveLength(0);
    expect(searchUpdates(all, names, '   ')).toEqual([]);
  });
});

describe('AI corpus', () => {
  it('carries the project name so the model can answer with it', () => {
    const c = updatesCorpus(mk() ? [mk()] : [], new Map([['p1', 'Glenda Hodge']]));
    expect(c[0].projectName).toBe('Glenda Hodge');
  });

  it('caps newest-first so a busy board cannot blow the context window', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      mk({ id: `u${i}`, at: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    const c = updatesCorpus(many, new Map(), 10);
    expect(c).toHaveLength(10);
    expect(c[0].at.startsWith('2026-10-50'.slice(0, 7))).toBe(true);
    expect(c[0].at > c[9].at).toBe(true); // newest first
  });
});

// ---- Threaded replies (Aboud 2026-11-15 — "like monday.com") ----------------

describe('threaded replies', () => {
  const T0 = '2026-11-15T10:00:00.000Z';
  const T1 = '2026-11-15T11:00:00.000Z';
  const T2 = '2026-11-15T12:00:00.000Z';
  const T3 = '2026-11-15T13:00:00.000Z';

  it('a reply is an ordinary update carrying its parent id and project', () => {
    const root = newUpdate('p1', 'waiting on the AHJ', 'Aboud Yousef', 'note', {}, T0);
    const reply = newReply(root, 'they answered this morning', 'Omar Rajab', T1);
    expect(reply.projectId).toBe('p1');
    expect(reply.parentId).toBe(root.id);
    expect(reply.by).toBe('Omar Rajab');
    expect(reply.kind).toBe('note');
  });

  it('threadRoots: posts newest-first, replies oldest-first under their post', () => {
    const a = newUpdate('p1', 'first post', 'A', 'note', {}, T0);
    const b = newUpdate('p1', 'second post', 'A', 'note', {}, T2);
    const r1 = newReply(a, 'first reply', 'B', T1);
    const r2 = newReply(a, 'second reply', 'C', T3);
    const thread = threadRoots([r2, a, b, r1], 'p1');
    expect(thread.map((t) => t.root.text)).toEqual(['second post', 'first post']);
    expect(thread[1].replies.map((r) => r.text)).toEqual(['first reply', 'second reply']);
    expect(thread[0].replies).toEqual([]);
  });

  it('a deleted reply drops; a deleted post with live replies stays as a stub', () => {
    const a = newUpdate('p1', 'root', 'A', 'note', {}, T0);
    const r1 = newReply(a, 'kept', 'B', T1);
    const r2 = deleteUpdate(newReply(a, 'gone', 'C', T1), 'C', T2);
    const deadRoot = deleteUpdate(newUpdate('p1', 'lonely', 'A', 'note', {}, T0), 'A', T2);
    const thread = threadRoots([a, r1, r2, deadRoot], 'p1');
    // The lonely deleted root vanishes outright…
    expect(thread).toHaveLength(1);
    // …a deleted reply just drops…
    expect(thread[0].replies.map((r) => r.text)).toEqual(['kept']);
    // …and when the ROOT dies but replies live, the root rides along flagged
    // deleted so the component can render the "(update deleted)" stub.
    const gone = deleteUpdate(a, 'A', T3);
    const stubbed = threadRoots([gone, r1], 'p1');
    expect(stubbed).toHaveLength(1);
    expect(stubbed[0].root.deleted).toBeTruthy();
    expect(stubbed[0].replies.map((r) => r.text)).toEqual(['kept']);
  });

  it('replies count toward the pill (conversation size)', () => {
    const a = newUpdate('p1', 'root', 'A', 'note', {}, T0);
    const r = newReply(a, 'reply', 'B', T1);
    expect(updateCounts([a, r]).get('p1')).toBe(2);
  });
});
