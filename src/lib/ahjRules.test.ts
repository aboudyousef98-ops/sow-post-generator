// Per-rule fields on a requirement post (Aboud 2026-11-17), Phase 1 of the
// ~265-rule bulk import.
//
// The contract that matters most is the one about ABSENCE: every post written
// before these fields existed has no category and no status, and must keep
// reaching Compose exactly as it always did. Grouping is allowed to add
// structure to new data; it is not allowed to change old output.

import { describe, expect, it } from 'vitest';
import type { Ahj, AhjPost } from '../types';
import { groupByCategory, isPostable, normCategory, ruleStatus } from './ahj';
import { requirementSections } from './template';
import { makeRecord } from './__fixtures__/makeRecord';

const T = (n: number) => `2026-09-${String(n).padStart(2, '0')}T00:00:00.000Z`;

function post(over: Partial<AhjPost> & { id: string }): AhjPost {
  return {
    text: 'Some requirement.',
    by: 'Aboud Yousef',
    at: T(1),
    history: [],
    pinned: false,
    updatedAt: over.at ?? T(1),
    ...over,
  };
}

function ahj(over: Partial<Ahj> & { id: string; name: string }): Ahj {
  return { aliases: [], posts: [], updatedAt: T(1), schemaVersion: 1, ...over };
}

describe('ruleStatus — absence means current', () => {
  it('a post with no status is current', () => {
    expect(ruleStatus(post({ id: 'a' }))).toBe('current');
  });

  it('reads an explicit status', () => {
    expect(ruleStatus(post({ id: 'a', status: 'to-confirm' }))).toBe('to-confirm');
    expect(ruleStatus(post({ id: 'a', status: 'superseded' }))).toBe('superseded');
  });

  it('only superseded is unpostable — to-confirm still reaches a handoff', () => {
    expect(isPostable(post({ id: 'a' }))).toBe(true);
    expect(isPostable(post({ id: 'a', status: 'current' }))).toBe(true);
    expect(isPostable(post({ id: 'a', status: 'to-confirm' }))).toBe(true);
    expect(isPostable(post({ id: 'a', status: 'superseded' }))).toBe(false);
  });
});

describe('normCategory', () => {
  it('folds case and collapses whitespace, so near-spellings are one group', () => {
    expect(normCategory('Setbacks')).toBe('setbacks');
    expect(normCategory('  SETBACKS  ')).toBe('setbacks');
    expect(normCategory('Fire   Access')).toBe('fire access');
  });

  it('an absent or blank category normalises to empty', () => {
    expect(normCategory(undefined)).toBe('');
    expect(normCategory('   ')).toBe('');
  });
});

describe('groupByCategory', () => {
  it('merges spellings that differ only by case or spacing', () => {
    const groups = groupByCategory([
      post({ id: 'a', category: 'Setbacks', text: 'one' }),
      post({ id: 'b', category: 'setbacks ', text: 'two' }),
      post({ id: 'c', category: 'SETBACKS', text: 'three' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].posts).toHaveLength(3);
  });

  it('labels the group with the FIRST spelling seen, not the normalised key', () => {
    const groups = groupByCategory([
      post({ id: 'a', category: 'Fire Access' }),
      post({ id: 'b', category: 'fire access' }),
    ]);
    expect(groups[0].label).toBe('Fire Access');
  });

  it('uncategorised rules collect under an empty label and sort LAST', () => {
    const groups = groupByCategory([
      post({ id: 'a', text: 'no category' }),
      post({ id: 'b', category: 'Labeling', text: 'has one' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Labeling', '']);
  });

  it('a list with no categories at all is ONE unlabelled group', () => {
    const groups = groupByCategory([post({ id: 'a' }), post({ id: 'b' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('');
    expect(groups[0].posts).toHaveLength(2);
  });

  it('keeps arrival order inside a group', () => {
    const groups = groupByCategory([
      post({ id: 'a', category: 'C', text: 'first' }),
      post({ id: 'b', category: 'C', text: 'second' }),
    ]);
    expect(groups[0].posts.map((p) => p.text)).toEqual(['first', 'second']);
  });
});

// ---- The compatibility contract -------------------------------------------

function recordWithBoard(posts: AhjPost[]) {
  const board = ahj({ id: 'b1', name: 'Harris County', kind: 'ahj', posts });
  const rec = makeRecord();
  rec.sf.jurisdiction = 'Harris County';
  rec.ahjApprovedId = 'b1';
  return { rec, boards: [board] };
}

describe('requirementSections — grouping never changes old output', () => {
  it('a board with NO categories yields one unlabelled group', () => {
    // Distinct dates on purpose, so livePosts' newest-first ordering is
    // actually exercised and still survives the grouping pass.
    const { rec, boards } = recordWithBoard([
      post({ id: 'a', at: T(1), text: 'Rule one.' }),
      post({ id: 'b', at: T(2), text: 'Rule two.' }),
    ]);
    const secs = requirementSections(rec, boards);
    expect(secs).toHaveLength(1);
    expect(secs[0].title).toBe('AHJ Requirements (Harris County)');
    expect(secs[0].groups).toHaveLength(1);
    expect(secs[0].groups[0].label).toBe('');
    expect(secs[0].groups[0].posts).toEqual(['Rule two.', 'Rule one.']);
  });

  it('categorised rules split into labelled groups', () => {
    const { rec, boards } = recordWithBoard([
      post({ id: 'a', at: T(1), category: 'Setbacks', text: 'Three feet.' }),
      post({ id: 'b', at: T(2), category: 'Labeling', text: 'Red placard.' }),
      post({ id: 'c', at: T(3), category: 'Setbacks', text: 'Ridge gap.' }),
    ]);
    const groups = requirementSections(rec, boards)[0].groups;
    expect(groups.map((g) => g.label).sort()).toEqual(['Labeling', 'Setbacks']);
    const setbacks = groups.find((g) => g.label === 'Setbacks')!;
    expect(setbacks.posts).toHaveLength(2);
  });

  it('superseded rules are dropped from the handoff but stay on the board', () => {
    const board = ahj({
      id: 'b1',
      name: 'Harris County',
      kind: 'ahj',
      posts: [
        post({ id: 'a', at: T(1), text: 'Still current.' }),
        post({ id: 'b', at: T(2), text: 'Old rule.', status: 'superseded' }),
      ],
    });
    const rec = makeRecord();
    rec.sf.jurisdiction = 'Harris County';
    rec.ahjApprovedId = 'b1';

    const posts = requirementSections(rec, [board])[0].groups[0].posts;
    expect(posts).toEqual(['Still current.']);
    // The board itself is untouched — superseding is not deleting.
    expect(board.posts).toHaveLength(2);
  });

  it('to-confirm rules DO reach the handoff', () => {
    const { rec, boards } = recordWithBoard([post({ id: 'a', text: 'Unconfirmed.', status: 'to-confirm' })]);
    expect(requirementSections(rec, boards)[0].groups[0].posts).toEqual(['Unconfirmed.']);
  });

  it('a board whose every rule is superseded produces no section at all', () => {
    const { rec, boards } = recordWithBoard([
      post({ id: 'a', text: 'Gone.', status: 'superseded' }),
      post({ id: 'b', text: 'Also gone.', status: 'superseded' }),
    ]);
    expect(requirementSections(rec, boards)).toEqual([]);
  });
});
