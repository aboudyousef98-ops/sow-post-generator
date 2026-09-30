import { describe, expect, it } from 'vitest';
import { POLISH_KEYS, RewriteRequest, RewriteResponse } from './rewriteSchema';

const ok = { items: [{ id: 'install.loadRun', text: '18ft thru attic' }, { id: 'siteSurvey', text: 'need height' }] };

describe('RewriteRequest', () => {
  it('accepts a valid keyed payload', () => {
    expect(RewriteRequest.safeParse(ok).success).toBe(true);
  });

  it('rejects an unknown id', () => {
    expect(RewriteRequest.safeParse({ items: [{ id: 'install.walls', text: 'x' }] }).success).toBe(false);
  });

  it('rejects a duplicate id', () => {
    const dup = { items: [{ id: 'design', text: 'a' }, { id: 'design', text: 'b' }] };
    expect(RewriteRequest.safeParse(dup).success).toBe(false);
  });

  it('rejects an empty list and text over 3000 chars', () => {
    expect(RewriteRequest.safeParse({ items: [] }).success).toBe(false);
    expect(RewriteRequest.safeParse({ items: [{ id: 'design', text: 'x'.repeat(3001) }] }).success).toBe(false);
  });

  it('rejects the pre-Phase-7 four-field payload', () => {
    const legacy = { layout: '', siteSurvey: '', design: '', homeowner: '' };
    expect(RewriteRequest.safeParse(legacy).success).toBe(false);
  });
});

describe('rewrite mode (spec/10 §11.2)', () => {
  it('defaults to polish when mode is absent', () => {
    expect(RewriteRequest.parse(ok).mode).toBe('polish');
  });

  it('accepts both modes', () => {
    expect(RewriteRequest.parse({ ...ok, mode: 'rewrite' }).mode).toBe('rewrite');
    expect(RewriteRequest.parse({ ...ok, mode: 'polish' }).mode).toBe('polish');
  });

  it('rejects an unknown mode', () => {
    expect(RewriteRequest.safeParse({ ...ok, mode: 'freestyle' }).success).toBe(false);
  });
});

describe('RewriteResponse', () => {
  it('accepts a well-formed model reply', () => {
    expect(RewriteResponse.safeParse(ok).success).toBe(true);
  });

  it('rejects a reply with an id the client never sends', () => {
    expect(RewriteResponse.safeParse({ items: [{ id: 'nonsense', text: 'x' }] }).success).toBe(false);
  });
});

// The server keeps its own copy of the key list because z.enum needs a const
// tuple. This test is the thing that catches the two drifting apart.
describe('key list stays in sync with the client', () => {
  it('matches POLISH_KEYS in src/lib/installNotes.ts', async () => {
    const client = await import('../../../src/lib/installNotes');
    expect([...POLISH_KEYS]).toEqual(client.POLISH_KEYS);
  });
});
