import { describe, expect, it } from 'vitest';
import { collapseToOneLine, joinLines, splitIntoLines, type KeyedItem } from './rewriteLines';

const items: KeyedItem[] = [
  { id: 'design', text: 'tag wrong on sheet PV-2\nmissing expansion unit in one line' },
  { id: 'siteSurvey', text: 'All good.' },
];

/** Pretend the model answered every line, uppercasing it. */
function answerAll(split: ReturnType<typeof splitIntoLines>, fn = (t: string) => t.toUpperCase()) {
  return split.modelItems.map((m) => ({ id: m.id, text: fn(m.text) }));
}

describe('splitIntoLines', () => {
  it('sends one model item per line, never a multi-line string', () => {
    const split = splitIntoLines(items);
    expect(split.modelItems).toEqual([
      { id: '0', text: 'tag wrong on sheet PV-2' },
      { id: '1', text: 'missing expansion unit in one line' },
      { id: '2', text: 'All good.' },
    ]);
    for (const m of split.modelItems) expect(m.text).not.toContain('\n');
  });

  it('maps every model item back to its item and line', () => {
    const split = splitIntoLines(items);
    expect(split.refs).toEqual([
      { itemIndex: 0, lineIndex: 0 },
      { itemIndex: 0, lineIndex: 1 },
      { itemIndex: 1, lineIndex: 0 },
    ]);
  });

  it('does not spend a model item on a blank line', () => {
    const split = splitIntoLines([{ id: 'design', text: 'one\n\n   \ntwo' }]);
    expect(split.modelItems.map((m) => m.text)).toEqual(['one', 'two']);
  });

  it('handles an empty note without producing items', () => {
    expect(splitIntoLines([{ id: 'design', text: '' }]).modelItems).toEqual([]);
  });
});

describe('collapseToOneLine', () => {
  it('folds a newline the model slipped in, so one bullet cannot become two', () => {
    expect(collapseToOneLine('Tag wrong on PV-2.\nAlso missing the unit.')).toBe(
      'Tag wrong on PV-2. Also missing the unit.',
    );
  });

  it('folds \\r\\n and runs of blank lines too', () => {
    expect(collapseToOneLine('a\r\n\r\nb')).toBe('a b');
  });

  it('trims but leaves inner spacing alone', () => {
    expect(collapseToOneLine('  2" PVC  run  ')).toBe('2" PVC  run');
  });
});

describe('joinLines', () => {
  it('rebuilds one text per item, with the same number of lines in the same order', () => {
    const split = splitIntoLines(items);
    const out = joinLines(items, split, answerAll(split))!;
    expect(out).toEqual([
      { id: 'design', text: 'TAG WRONG ON SHEET PV-2\nMISSING EXPANSION UNIT IN ONE LINE' },
      { id: 'siteSurvey', text: 'ALL GOOD.' },
    ]);
    expect(out[0].text.split('\n')).toHaveLength(2);
  });

  it('a bullet that comes back with a newline is folded, not allowed to split the note', () => {
    const split = splitIntoLines(items);
    const answers = answerAll(split, (t) => (t.startsWith('tag') ? 'Line one.\nLine two.' : t));
    const out = joinLines(items, split, answers)!;
    expect(out[0].text).toBe('Line one. Line two.\nmissing expansion unit in one line');
    expect(out[0].text.split('\n')).toHaveLength(2); // still 2 bullets, not 3
  });

  it('restores blank lines the model never saw', () => {
    const src = [{ id: 'design', text: 'one\n\ntwo' }];
    const split = splitIntoLines(src);
    const out = joinLines(src, split, answerAll(split))!;
    expect(out[0].text).toBe('ONE\n\nTWO');
  });

  it('returns null when the model skipped a line, so the caller can 502', () => {
    const split = splitIntoLines(items);
    const short = answerAll(split).slice(0, 2); // drops id "2"
    expect(joinLines(items, split, short)).toBeNull();
  });

  it('ignores extra ids the model invented', () => {
    const split = splitIntoLines(items);
    const answers = [...answerAll(split), { id: '99', text: 'invented' }];
    const out = joinLines(items, split, answers)!;
    expect(out).toHaveLength(2);
    expect(out[0].text).not.toContain('invented');
  });

  it('an all-blank note round-trips untouched', () => {
    const src = [{ id: 'design', text: '' }];
    const split = splitIntoLines(src);
    expect(joinLines(src, split, [])).toEqual([{ id: 'design', text: '' }]);
  });

  it('the line count is preserved no matter what the model returns', () => {
    const src = [{ id: 'design', text: 'a\nb\nc\nd' }];
    const split = splitIntoLines(src);
    const answers = answerAll(split, () => 'merged\neverything\ninto\nmany\nlines');
    const out = joinLines(src, split, answers)!;
    expect(out[0].text.split('\n')).toHaveLength(4);
  });
});
