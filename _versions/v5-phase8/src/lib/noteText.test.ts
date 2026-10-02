import { describe, expect, it } from 'vitest';
import { effectiveText, noteLines, punctuate, stripBullet } from './noteText';

describe('punctuate', () => {
  it('adds a period only when one is missing', () => {
    expect(punctuate('All good')).toBe('All good.');
    expect(punctuate('All good.')).toBe('All good.');
    expect(punctuate('Really?')).toBe('Really?');
    expect(punctuate('   ')).toBe('');
  });
});

describe('stripBullet', () => {
  it('strips bullet glyphs and dash/asterisk followed by a space', () => {
    expect(stripBullet('• first')).toBe('first');
    expect(stripBullet('  - second')).toBe('second');
    expect(stripBullet('* third')).toBe('third');
  });

  it('keeps a dash or asterisk that is part of the value', () => {
    expect(stripBullet('-20 ft drop')).toBe('-20 ft drop');
    expect(stripBullet('*2 AWG')).toBe('*2 AWG');
  });
});

describe('noteLines', () => {
  it('one source line becomes one punctuated bullet, blanks dropped', () => {
    expect(noteLines('tag wrong on PV-2\n\n- missing expansion unit')).toEqual([
      'tag wrong on PV-2.',
      'missing expansion unit.',
    ]);
  });

  it('empty text yields no bullets', () => {
    expect(noteLines('   \n  ')).toEqual([]);
  });
});

describe('effectiveText', () => {
  const raw = 'my draft';
  it('uses the polished text when present and not reverted', () => {
    expect(effectiveText(raw, 'design', { polished: { design: 'Polished.' }, usePolished: {} })).toBe('Polished.');
  });

  it('an absent usePolished key means ON', () => {
    expect(effectiveText(raw, 'design', { polished: { design: 'Polished.' }, usePolished: {} })).toBe('Polished.');
  });

  it('an explicit false reverts to the raw draft', () => {
    expect(
      effectiveText(raw, 'design', { polished: { design: 'Polished.' }, usePolished: { design: false } }),
    ).toBe('my draft');
  });

  it('falls back to raw when nothing was polished', () => {
    expect(effectiveText(raw, 'design', { usePolished: {} })).toBe('my draft');
  });
});

describe('noteLines — a line with nothing to say', () => {
  it('drops a line that is only punctuation, so the post never shows a bare "-."', () => {
    expect(noteLines('-')).toEqual([]);
    expect(noteLines('*')).toEqual([]);
    expect(noteLines('...')).toEqual([]);
    expect(noteLines('real line\n-\nanother line')).toEqual(['real line.', 'another line.']);
  });

  it('keeps a line that carries a number or a letter, however short', () => {
    expect(noteLines('200A')).toEqual(['200A.']);
    expect(noteLines('-20 ft drop')).toEqual(['-20 ft drop.']);
    expect(noteLines('2" PVC')).toEqual(['2" PVC.']);
  });
});
