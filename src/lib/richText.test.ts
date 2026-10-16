import { describe, it, expect } from 'vitest';
import { parseRich, parseSpans, renderMarksHtml, hasFormatting } from './richText';

const plain = (t: string) => parseSpans(t).map((s) => s.text).join('');

describe('parseSpans — inline marks', () => {
  it('reads the three Slack marks', () => {
    expect(parseSpans('*bold*')).toEqual([{ text: 'bold', marks: ['bold'] }]);
    expect(parseSpans('_italic_')).toEqual([{ text: 'italic', marks: ['italic'] }]);
    expect(parseSpans('~gone~')).toEqual([{ text: 'gone', marks: ['strike'] }]);
  });

  it('keeps surrounding text', () => {
    expect(parseSpans('see *this* now')).toEqual([
      { text: 'see ', marks: [] },
      { text: 'this', marks: ['bold'] },
      { text: ' now', marks: [] },
    ]);
  });

  it('nests different marks', () => {
    expect(parseSpans('*_both_*')).toEqual([{ text: 'both', marks: ['bold', 'italic'] }]);
  });
});

describe('parseSpans — what engineers actually type must survive', () => {
  // The whole reason this is not a markdown library.
  const literals = [
    'PV_MOD_01',
    'part_number_here',
    '2*3 = 6',
    'conduit 3/4" * 2',
    'A_1 and B_2',
    '#4 AWG',
    '> 20 ft',
    'rating ~50A',
    'THWN-2 *',
  ];
  it.each(literals)('leaves %s untouched', (s) => {
    expect(plain(s)).toBe(s);
    expect(parseSpans(s).every((x) => x.marks.length === 0)).toBe(true);
  });

  it('an unclosed delimiter stays literal', () => {
    expect(plain('*not closed')).toBe('*not closed');
    expect(parseSpans('*not closed')[0].marks).toEqual([]);
  });

  it('an empty mark stays literal', () => {
    expect(plain('**')).toBe('**');
  });
});

describe('parseRich — line kinds', () => {
  it('detects bullets, numbers and checkboxes', () => {
    const l = parseRich('• one\n2. two\n[ ] three\n[x] four\nplain');
    expect(l.map((x) => x.kind)).toEqual(['bullet', 'number', 'check', 'check-done', 'plain']);
  });

  it('keeps the typed number so sequences survive', () => {
    expect(parseRich('3. third')[0].marker).toBe('3.');
  });

  it('needs the trailing space — a bare marker is prose', () => {
    expect(parseRich('•')[0].kind).toBe('plain');
    expect(parseRich('1.5 kW')[0].kind).toBe('plain');
  });

  it('parses marks inside a bullet', () => {
    expect(parseRich('• a *b*')[0].spans).toEqual([
      { text: 'a ', marks: [] },
      { text: 'b', marks: ['bold'] },
    ]);
  });

  it('preserves blank lines', () => {
    expect(parseRich('a\n\nb')).toHaveLength(3);
  });
});

describe('renderMarksHtml — the Slack clipboard payload', () => {
  it('groups consecutive bullets into one list', () => {
    expect(renderMarksHtml('• a\n• b')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('groups numbers and honours the start', () => {
    expect(renderMarksHtml('3. a\n4. b')).toBe('<ol start="3"><li>a</li><li>b</li></ol>');
    expect(renderMarksHtml('1. a')).toBe('<ol><li>a</li></ol>');
  });

  it('renders checkboxes as glyphs that paste into Slack', () => {
    expect(renderMarksHtml('[ ] todo\n[x] done')).toBe('<ul><li>☐ todo</li><li>☑ done</li></ul>');
  });

  it('emits the mark tags', () => {
    expect(renderMarksHtml('*b* _i_ ~s~')).toBe('<div><strong>b</strong> <em>i</em> <s>s</s></div>');
  });

  it('escapes HTML so a typed < cannot inject', () => {
    expect(renderMarksHtml('a <b> & c')).toBe('<div>a &lt;b&gt; &amp; c</div>');
  });

  it('a blank line becomes a break', () => {
    expect(renderMarksHtml('a\n\nb')).toBe('<div>a</div><br><div>b</div>');
  });

  it('closes a list when the kind changes', () => {
    expect(renderMarksHtml('• a\n1. b')).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
  });
});

describe('hasFormatting', () => {
  it('is false for prose and part numbers', () => {
    expect(hasFormatting('run 2 AWG to PV_MOD_01')).toBe(false);
  });
  it('is true once a mark or a leader appears', () => {
    expect(hasFormatting('• a')).toBe(true);
    expect(hasFormatting('*a*')).toBe(true);
  });
});
