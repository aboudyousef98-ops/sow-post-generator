// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadUpdates, saveUpdates } from './dailyUpdates';

const KEY = 'sowpost.dailyUpdates.v1';

describe('daily updates persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips one day’s text', () => {
    saveUpdates('2026-10-08', 'Met the crew\nOrdered rails');
    expect(loadUpdates('2026-10-08')).toBe('Met the crew\nOrdered rails');
  });

  it('is empty for a day nothing was typed on', () => {
    expect(loadUpdates('2026-10-08')).toBe('');
  });

  it('keeps days apart — another date never inherits the text', () => {
    saveUpdates('2026-10-08', 'today');
    expect(loadUpdates('2026-10-07')).toBe('');
    saveUpdates('2026-10-07', 'yesterday');
    expect(loadUpdates('2026-10-08')).toBe('today');
  });

  it('clearing the box removes the entry instead of storing ""', () => {
    saveUpdates('2026-10-08', 'something');
    saveUpdates('2026-10-08', '   ');
    expect(loadUpdates('2026-10-08')).toBe('');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({});
  });

  it('preserves leading/inner whitespace of real content', () => {
    saveUpdates('2026-10-08', 'line one\n\n  indented');
    expect(loadUpdates('2026-10-08')).toBe('line one\n\n  indented');
  });

  it('prunes to the 30 most recent days', () => {
    for (let d = 1; d <= 35; d++) saveUpdates(`2026-10-${String(d).padStart(2, '0')}`, `day ${d}`);
    const store = JSON.parse(localStorage.getItem(KEY)!);
    expect(Object.keys(store)).toHaveLength(30);
    expect(loadUpdates('2026-10-35')).toBe('day 35'); // newest kept
    expect(loadUpdates('2026-10-01')).toBe(''); // oldest dropped
  });

  // Regression (review, 2026-10-08): the prune kept the 30 lexically-highest
  // keys WITHOUT guaranteeing the key just written survived — so editing a
  // date older than the 30 stored days saved nothing at all.
  it('the day being edited survives the prune even when it is the oldest', () => {
    for (let d = 1; d <= 30; d++) saveUpdates(`2026-10-${String(d).padStart(2, '0')}`, `oct ${d}`);
    saveUpdates('2026-01-05', 'a note on a much older day');
    expect(loadUpdates('2026-01-05')).toBe('a note on a much older day');
  });

  it('keeping the edited day still holds the store at the cap', () => {
    for (let d = 1; d <= 30; d++) saveUpdates(`2026-10-${String(d).padStart(2, '0')}`, `oct ${d}`);
    saveUpdates('2026-01-05', 'older day');
    const store = JSON.parse(localStorage.getItem(KEY)!);
    expect(Object.keys(store).length).toBeLessThanOrEqual(30);
    expect(store['2026-01-05']).toBe('older day');
  });

  it('garbage in the key reads as empty, not a crash', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadUpdates('2026-10-08')).toBe('');
    localStorage.setItem(KEY, '["an","array"]');
    expect(loadUpdates('2026-10-08')).toBe('');
  });

  it('ignores non-string values rather than returning them', () => {
    localStorage.setItem(KEY, JSON.stringify({ '2026-10-08': 42 }));
    expect(loadUpdates('2026-10-08')).toBe('');
  });

  it('a later save does not wipe other days', () => {
    saveUpdates('2026-10-06', 'six');
    saveUpdates('2026-10-07', 'seven');
    saveUpdates('2026-10-08', 'eight');
    expect(loadUpdates('2026-10-06')).toBe('six');
    expect(loadUpdates('2026-10-07')).toBe('seven');
  });
});
