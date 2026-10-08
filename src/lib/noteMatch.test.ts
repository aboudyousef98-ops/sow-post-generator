import { describe, expect, it } from 'vitest';
import type { Ahj, AhjPost, PostRecord } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import {
  eligibleNotes,
  keyTerms,
  keywordMatches,
  mergeHits,
  postHash,
  type EligibleNote,
} from './noteMatch';

const T = '2026-10-08T09:00:00.000Z';

function note(id: string, text: string, over: Partial<AhjPost> = {}): AhjPost {
  return { id, text, by: 'Aboud Yousef', at: T, history: [], pinned: false, updatedAt: T, ...over };
}

function board(id: string, name: string, kind: Ahj['kind'], posts: AhjPost[]): Ahj {
  return { id, name, aliases: [], kind, posts, updatedAt: T, schemaVersion: 1 };
}

const harris = board('a1', 'Harris County', undefined, [note('n-trench', 'Trench depth minimum 24 inches.')]);
const dallas = board('a2', 'Dallas', 'ahj', [note('n-dallas', 'Dallas trench shoring rules apply.')]);
const centerpoint = board('u1', 'CenterPoint Energy', 'utility', [note('n-meter', 'Meter clearance 3 ft from the gas riser.')]);
const oncor = board('u2', 'Oncor', 'utility', [note('n-oncor', 'Oncor wants a separate disconnect photo.')]);
const solrite = board('f1', 'Solrite', 'funding', [note('n-ntp', 'Upload the signed NTP before scheduling.')]);
const general = board('g1', 'SOW General Notes', 'general', [note('n-title', 'Always Title Case customer names.')]);
const ALL = [harris, dallas, centerpoint, oncor, solrite, general];

function rec(over: Partial<PostRecord['sf']> = {}): PostRecord {
  const r = makeRecord();
  r.sf = { ...r.sf, jurisdiction: 'Harris County', utility: 'CenterPoint Energy', ...over };
  return r;
}

describe('eligibleNotes', () => {
  it('includes the matched AHJ, matched Utility, funding and SOW general notes', () => {
    expect(eligibleNotes(rec(), ALL).map((n) => n.noteId).sort()).toEqual(
      ['n-meter', 'n-ntp', 'n-title', 'n-trench'].sort(),
    );
  });

  it('EXCLUDES other jurisdictions and other utilities — the whole point of the scoping choice', () => {
    const ids = eligibleNotes(rec(), ALL).map((n) => n.noteId);
    expect(ids).not.toContain('n-dallas');
    expect(ids).not.toContain('n-oncor');
  });

  it('labels each note with the board it came from', () => {
    const byId = new Map(eligibleNotes(rec(), ALL).map((n) => [n.noteId, n.board]));
    expect(byId.get('n-trench')).toBe('AHJ: Harris County');
    expect(byId.get('n-meter')).toBe('Utility: CenterPoint Energy');
    expect(byId.get('n-ntp')).toBe('Funding: Solrite');
    expect(byId.get('n-title')).toBe('SOW Notes');
  });

  it('a board with no kind counts as an AHJ (everything created before the split)', () => {
    expect(eligibleNotes(rec(), [harris]).map((n) => n.noteId)).toEqual(['n-trench']);
  });

  it('funding and general still apply when nothing matches the jurisdiction', () => {
    const ids = eligibleNotes(rec({ jurisdiction: 'Nowhere', utility: '' }), ALL).map((n) => n.noteId);
    expect(ids.sort()).toEqual(['n-ntp', 'n-title']);
  });

  it('skips deleted boards and deleted notes', () => {
    const deadBoard = { ...solrite, deleted: { at: T, by: 'Aboud Yousef' } };
    const deadNote = board('g2', 'Gone', 'general', [note('n-gone', 'Dead note.', { deleted: { at: T, by: 'x' } })]);
    const ids = eligibleNotes(rec(), [harris, deadBoard, deadNote]).map((n) => n.noteId);
    expect(ids).toEqual(['n-trench']);
  });

  it('is empty when there are no boards at all', () => {
    expect(eligibleNotes(rec(), [])).toEqual([]);
    expect(eligibleNotes(rec(), undefined)).toEqual([]);
  });
});

describe('keyTerms', () => {
  it('keeps distinctive words', () => {
    expect(keyTerms('Trench depth minimum 24 inches.')).toContain('trench');
    expect(keyTerms('Trench depth minimum 24 inches.')).toContain('minimum');
  });

  it('drops stopwords, short words and bare numbers', () => {
    const t = keyTerms('The trench must be at 24 ft');
    expect(t).not.toContain('the');
    expect(t).not.toContain('must');
    expect(t).not.toContain('24');
    expect(t).not.toContain('ft');
  });

  it('drops domain words that appear on every post', () => {
    const t = keyTerms('Installation notes for the project site');
    for (const w of ['installation', 'notes', 'project', 'site']) expect(t).not.toContain(w);
  });

  it('does not repeat a term', () => {
    expect(keyTerms('trench trench trench').filter((w) => w === 'trench')).toHaveLength(1);
  });
});

describe('keywordMatches', () => {
  const notes: EligibleNote[] = eligibleNotes(rec(), ALL);

  it('surfaces the trench note when the post says trench — Aboud’s example', () => {
    const hits = keywordMatches('We will trench along the north fence.', notes);
    expect(hits.map((h) => h.noteId)).toContain('n-trench');
    expect(hits.find((h) => h.noteId === 'n-trench')!.why).toContain('trench');
  });

  it('says WHY it surfaced, using the most distinctive term', () => {
    const hits = keywordMatches('Meter clearance needs checking.', notes);
    expect(hits.find((h) => h.noteId === 'n-meter')!.why).toBe('matched “clearance”');
  });

  it('surfaces nothing for an unrelated post', () => {
    expect(keywordMatches('Standard back-to-back layout, nothing unusual.', notes)).toEqual([]);
  });

  it('matches whole words only — "trench" must not fire on "trenchless"', () => {
    expect(keywordMatches('A trenchless bore is planned.', notes).map((h) => h.noteId)).not.toContain('n-trench');
  });

  it('is case-insensitive', () => {
    expect(keywordMatches('TRENCH work scheduled.', notes).map((h) => h.noteId)).toContain('n-trench');
  });

  it('a note can never surface for a project it is not eligible for', () => {
    // The post literally says "Dallas", but Dallas is not this project's AHJ.
    const hits = keywordMatches('Crew is driving from Dallas with shoring gear.', notes);
    expect(hits.map((h) => h.noteId)).not.toContain('n-dallas');
  });
});

describe('mergeHits', () => {
  const k = { noteId: 'n1', board: 'AHJ: X', text: 't', why: 'matched “trench”' };
  const a = { noteId: 'n1', board: 'AHJ: X', text: 't', why: 'AI: mentions excavation' };

  it('dedupes by note id', () => {
    expect(mergeHits([k], [a])).toHaveLength(1);
  });

  it('prefers the keyword reason — the reader can verify it themselves', () => {
    expect(mergeHits([k], [a])[0].why).toBe('matched “trench”');
  });

  it('keeps AI-only hits', () => {
    const other = { ...a, noteId: 'n2' };
    expect(mergeHits([k], [a, other]).map((h) => h.noteId).sort()).toEqual(['n1', 'n2']);
  });

  it('handles either side being empty', () => {
    expect(mergeHits([], [a])).toHaveLength(1);
    expect(mergeHits([k], [])).toHaveLength(1);
    expect(mergeHits([], [])).toEqual([]);
  });
});

describe('postHash', () => {
  it('is stable for the same text', () => {
    expect(postHash('hello')).toBe(postHash('hello'));
  });

  it('changes when the post changes — this is what voids a confirmation', () => {
    expect(postHash('Trench along the fence.')).not.toBe(postHash('Trench along the fence!'));
  });

  it('catches the empty-draft-then-write trick', () => {
    expect(postHash('')).not.toBe(postHash('Now the real post.'));
  });
});

// Precision guards. Found by running the real thing locally (2026-10-08): the
// first version surfaced 3 notes for a post about a trench, 2 of them noise.
describe('keywordMatches — precision', () => {
  const notes: EligibleNote[] = [
    { noteId: 'n-clear', board: 'Utility: CenterPoint', text: 'Meter clearance 3 ft from the gas riser.' },
    { noteId: 'n-wall', board: 'Utility: CenterPoint', text: 'Meter must be on the south wall.' },
    { noteId: 'n-trench', board: 'AHJ: Harris', text: 'Trench depth minimum 24 inches.' },
  ];

  // The template prints this on EVERY post, so matching it fires every time.
  const boilerplate =
    'Hello Team,\n• *Clearance:* All required clearance requirements have been met.\n• *Site Survey Feedback:* All good.';

  it('does not fire on the template’s own boilerplate', () => {
    expect(keywordMatches(boilerplate, notes)).toEqual([]);
  });

  it('a single short word is not evidence — "wall" alone must not surface a note', () => {
    expect(keywordMatches('Installation on one wall.', notes).map((h) => h.noteId)).not.toContain('n-wall');
  });

  it('one distinctive word IS enough', () => {
    expect(keywordMatches('We will trench to the array.', notes).map((h) => h.noteId)).toEqual(['n-trench']);
  });

  it('two short words together are enough', () => {
    // "meter" (5) + "wall" (4): neither is distinctive alone, both together are.
    expect(keywordMatches('Moving the meter to the north wall.', notes).map((h) => h.noteId)).toContain('n-wall');
  });

  it('the real-world case: a trench post surfaces ONLY the trench note', () => {
    const post = `${boilerplate}\n• *Site Survey Feedback:* We will trench along the north fence.`;
    expect(keywordMatches(post, notes).map((h) => h.noteId)).toEqual(['n-trench']);
  });
});
