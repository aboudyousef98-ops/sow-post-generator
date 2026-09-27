// AHJ Requirements core: matching, ordering, deep merge, conflicts, search.

import { describe, expect, it } from 'vitest';
import type { Ahj, AhjPost } from '../types';
import {
  ahjLastActivity,
  livePosts,
  matchAhj,
  mergeAhjs,
  nameConflict,
  normName,
  searchAhjs,
} from './ahj';

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

const corpus = ahj({
  id: 'cc',
  name: 'Corpus Christi',
  aliases: ['City of Corpus Christi', 'Corpus Christi, TX'],
  posts: [
    post({ id: 'p1', text: 'Use Square D for the AC Disconnect.', at: T(10), updatedAt: T(10), pinned: true }),
    post({ id: 'p2', text: 'Keep 36" clear working space.', at: T(12), updatedAt: T(12) }),
    post({ id: 'p3', text: 'Old rule.', at: T(5), updatedAt: T(14), deleted: { at: T(14), by: 'Omar Rajab' } }),
  ],
});
const houston = ahj({ id: 'hou', name: 'Houston', aliases: ['City of Houston'] });
const deletedAhj = ahj({ id: 'del', name: 'Sugar Land', deleted: { at: T(2), by: 'Omar Rajab' } });
const ALL = [corpus, houston, deletedAhj];

describe('normName / matchAhj', () => {
  it('normalizes case and whitespace', () => {
    expect(normName('  City  of   Houston ')).toBe('city of houston');
  });

  it('matches by exact name, case/space-insensitive', () => {
    expect(matchAhj('corpus christi', ALL)?.ahj.id).toBe('cc');
    expect(matchAhj('  HOUSTON ', ALL)?.ahj.id).toBe('hou');
    expect(matchAhj('Houston', ALL)?.via).toBe('name');
  });

  it('matches by alias and reports which alias', () => {
    const m = matchAhj('City of Corpus Christi', ALL);
    expect(m?.ahj.id).toBe('cc');
    expect(m?.via).toBe('City of Corpus Christi');
  });

  it('ignores deleted AHJs, empty input and unknown names', () => {
    expect(matchAhj('Sugar Land', ALL)).toBeNull();
    expect(matchAhj('', ALL)).toBeNull();
    expect(matchAhj('Austin', ALL)).toBeNull();
  });
});

describe('livePosts / ahjLastActivity', () => {
  it('filters deleted posts, pinned first, then newest', () => {
    expect(livePosts(corpus).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('last activity uses the latest edit or post among live posts', () => {
    const edited = ahj({
      id: 'x',
      name: 'X',
      posts: [
        post({ id: 'a', at: T(3), updatedAt: T(3) }),
        post({ id: 'b', at: T(2), editedAt: T(20), editedBy: 'Omar Rajab', updatedAt: T(20) }),
      ],
    });
    expect(ahjLastActivity(edited)).toEqual({ at: T(20), by: 'Omar Rajab' });
    expect(ahjLastActivity(houston)).toBeNull();
  });
});

describe('nameConflict', () => {
  it('finds collisions against live names and aliases, excluding self', () => {
    expect(nameConflict(['HOUSTON'], ALL)?.ahjName).toBe('Houston');
    expect(nameConflict(['city of corpus christi'], ALL)?.ahjName).toBe('Corpus Christi');
    expect(nameConflict(['Houston'], ALL, 'hou')).toBeNull();
    expect(nameConflict(['Sugar Land'], ALL)).toBeNull(); // deleted AHJs don't block
    expect(nameConflict(['Austin'], ALL)).toBeNull();
  });
});

describe('mergeAhjs', () => {
  it('unions by id; newer meta wins; posts merge individually so none are lost', () => {
    const base = ahj({ id: 'a', name: 'Frisco', updatedAt: T(1), posts: [post({ id: 'p1', at: T(1), updatedAt: T(1) })] });
    // Browser A renames + posts p2; browser B posts p3 concurrently.
    const fromA: Ahj = { ...base, name: 'Frisco TX', updatedAt: T(5), posts: [...base.posts, post({ id: 'p2', at: T(5), updatedAt: T(5) })] };
    const fromB: Ahj = { ...base, posts: [...base.posts, post({ id: 'p3', at: T(4), updatedAt: T(4) })] };

    const merged = mergeAhjs([fromB], [fromA]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Frisco TX'); // newer meta
    expect(merged[0].posts.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3']); // no post lost
  });

  it('per-post: newer updatedAt wins (edits and delete tombstones propagate)', () => {
    const mine = ahj({ id: 'a', name: 'A', posts: [post({ id: 'p', text: 'old', at: T(1), updatedAt: T(1) })] });
    const theirs = ahj({
      id: 'a',
      name: 'A',
      posts: [post({ id: 'p', text: 'old', at: T(1), updatedAt: T(9), deleted: { at: T(9), by: 'Omar Rajab' } })],
    });
    const merged = mergeAhjs([mine], [theirs]);
    expect(merged[0].posts[0].deleted?.by).toBe('Omar Rajab');
    // And the older side never resurrects it.
    const merged2 = mergeAhjs([theirs], [mine]);
    expect(merged2[0].posts[0].deleted?.by).toBe('Omar Rajab');
  });

  it('concurrent edits to the SAME post: newer text wins, losing text survives in history', () => {
    const orig = post({ id: 'p', text: 'original', at: T(1), updatedAt: T(1) });
    const editA = ahj({
      id: 'a',
      name: 'A',
      posts: [{ ...orig, text: 'edit by Aboud', editedAt: T(5), editedBy: 'Aboud Yousef', updatedAt: T(5), history: [{ text: 'original', at: T(1), by: 'Aboud Yousef' }] }],
    });
    const editB = ahj({
      id: 'a',
      name: 'A',
      posts: [{ ...orig, text: 'edit by Omar', editedAt: T(6), editedBy: 'Omar Rajab', updatedAt: T(6), history: [{ text: 'original', at: T(1), by: 'Aboud Yousef' }] }],
    });
    for (const [mine, theirs] of [[editA, editB], [editB, editA]] as const) {
      const p = mergeAhjs([mine], [theirs])[0].posts[0];
      expect(p.text).toBe('edit by Omar'); // newer wins
      expect(p.history.map((h) => h.text)).toContain('edit by Aboud'); // loser preserved
      expect(p.history.map((h) => h.text)).toContain('original');
      expect(p.history.filter((h) => h.text === 'original')).toHaveLength(1); // deduped
    }
  });

  it('normal sync of an unchanged older copy does not pollute history', () => {
    const older = ahj({ id: 'a', name: 'A', posts: [post({ id: 'p', text: 'same', at: T(1), updatedAt: T(1) })] });
    const newerPin = ahj({ id: 'a', name: 'A', posts: [post({ id: 'p', text: 'same', at: T(1), updatedAt: T(3), pinned: true })] });
    const p = mergeAhjs([older], [newerPin])[0].posts[0];
    expect(p.pinned).toBe(true);
    expect(p.history).toHaveLength(0);
  });

  it('tolerates an incoming AHJ with no posts array (malformed import)', () => {
    const bad = { ...ahj({ id: 'x', name: 'X' }), posts: undefined } as unknown as Ahj;
    const merged = mergeAhjs([], [bad]);
    expect(merged[0].posts).toEqual([]);
    expect(livePosts(merged[0])).toEqual([]);
  });

  it('adds unknown AHJs and keeps unmatched existing ones', () => {
    const merged = mergeAhjs([corpus], [houston]);
    expect(merged.map((a) => a.id).sort()).toEqual(['cc', 'hou']);
  });
});

describe('searchAhjs', () => {
  it('needs at least 2 characters', () => {
    expect(searchAhjs('s', ALL)).toEqual([]);
  });

  it('finds AHJs by name/alias and posts by text with a snippet', () => {
    const hits = searchAhjs('square d', ALL);
    expect(hits).toHaveLength(1);
    const h = hits[0];
    expect(h.kind).toBe('post');
    expect(h.ahj.id).toBe('cc');
    if (h.kind === 'post') {
      expect(h.match.toLowerCase()).toBe('square d');
      expect(h.pre + h.match + h.after).toContain('Square D for the AC Disconnect');
    }

    const byAlias = searchAhjs('city of hou', ALL);
    expect(byAlias.some((x) => x.kind === 'ahj' && x.ahj.id === 'hou')).toBe(true);
  });

  it('matches phrases across line breaks and double spaces', () => {
    const multi = ahj({
      id: 'm',
      name: 'Multi',
      posts: [post({ id: 'mp', text: 'Keep 36" clear\nworking  space in front.' })],
    });
    const hits = searchAhjs('clear working space', [multi]);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('post');
  });

  it('never searches deleted AHJs or deleted posts', () => {
    expect(searchAhjs('sugar', ALL)).toEqual([]);
    expect(searchAhjs('old rule', ALL)).toEqual([]);
  });
});
