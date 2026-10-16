import { describe, it, expect } from 'vitest';
import { foldName, matchesSearch } from './boardSearch';

const row = (name: string, coordinator = '') => ({ name, coordinator });

describe('foldName', () => {
  it('drops the apostrophe that nobody types', () => {
    expect(foldName("Ya'rob Alnabelsi")).toBe('yarob alnabelsi');
    expect(foldName('Ya’rob Alnabelsi')).toBe('yarob alnabelsi'); // curly quote
  });
  it('strips accents', () => {
    expect(foldName('José Peña')).toBe('jose pena');
  });
  it('collapses whitespace', () => {
    expect(foldName('  Omar   Rajab ')).toBe('omar rajab');
  });
});

describe('matchesSearch — the reported bug', () => {
  // Aboud 2026-10-17 #9: "when I search by yarobs name nothing appears".
  const r = row('Glenda Hodge', "Ya'rob Alnabelsi");

  it('finds a project by its COORDINATOR, which used to match nothing', () => {
    expect(matchesSearch(r, 'yarob')).toBe(true);
  });
  it('finds him with the apostrophe typed too', () => {
    expect(matchesSearch(r, "ya'rob")).toBe(true);
  });
  it('finds him by surname', () => {
    expect(matchesSearch(r, 'alnabelsi')).toBe(true);
  });
  it('still finds a project by name', () => {
    expect(matchesSearch(r, 'glenda')).toBe(true);
  });
});

describe('matchesSearch — behaviour', () => {
  it('is case insensitive', () => {
    expect(matchesSearch(row('Glenda Hodge'), 'GLENDA')).toBe(true);
  });

  it('requires every term, so more words narrow the result', () => {
    const a = row('Glenda Hodge', 'Omar Rajab');
    expect(matchesSearch(a, 'glenda omar')).toBe(true);
    expect(matchesSearch(a, 'glenda anas')).toBe(false);
  });

  it('ignores term order', () => {
    expect(matchesSearch(row('Glenda Hodge', 'Omar Rajab'), 'rajab glenda')).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(matchesSearch(row('Anything'), '   ')).toBe(true);
  });

  it('does not match an unrelated row', () => {
    expect(matchesSearch(row('Paul Richardson', 'Omar Rajab'), 'yarob')).toBe(false);
  });

  it('tolerates an unassigned coordinator', () => {
    expect(matchesSearch(row('Chad Trader', ''), 'chad')).toBe(true);
    expect(matchesSearch(row('Chad Trader', ''), 'yarob')).toBe(false);
  });
});
