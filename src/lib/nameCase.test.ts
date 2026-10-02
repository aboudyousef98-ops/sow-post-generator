import { describe, expect, it } from 'vitest';
import { titleCaseName } from './nameCase';

describe('titleCaseName', () => {
  it('fixes the ALL-CAPS Salesforce paste', () => {
    expect(titleCaseName('ANTHONY STEREFF')).toBe('Anthony Stereff');
  });

  it('fixes all-lowercase typing', () => {
    expect(titleCaseName('norca garcia')).toBe('Norca Garcia');
  });

  it('leaves an already-correct name alone', () => {
    expect(titleCaseName('Norca Garcia')).toBe('Norca Garcia');
  });

  it('handles hyphenated and multi-space names without eating the separators', () => {
    expect(titleCaseName('MARY-JANE  DE  LEON')).toBe('Mary-Jane  De  Leon');
  });

  it('empty string stays empty', () => {
    expect(titleCaseName('')).toBe('');
  });
});
