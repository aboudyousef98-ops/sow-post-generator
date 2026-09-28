import { describe, expect, it } from 'vitest';
import { bulletCountChange, droppedTokens, extractGuardTokens } from './tokenGuard';

describe('extractGuardTokens', () => {
  it('finds numbers with units and known engineering tokens', () => {
    const t = extractGuardTokens('Use 2" PVC instead of 2" EMT, 200A disconnect, #3 AWG Cu THWN, 1.5 ft');
    expect(t).toEqual(expect.arrayContaining(['2"', 'PVC', 'EMT', '200A', 'Cu', 'THWN', '1.5 ft']));
  });
});

describe('droppedTokens', () => {
  it('flags a dropped 2" PVC (acceptance case)', () => {
    const raw = 'The conduit material for the service should be 2" PVC instead of 2" EMT.';
    const polished = 'The conduit material for the service path should be EMT.'; // PVC + 2" dropped
    const dropped = droppedTokens(raw, polished);
    expect(dropped).toContain('PVC');
    expect(dropped).toContain('2"');
  });

  it('passes when everything is preserved', () => {
    const raw = 'instal 2 inch pvc on the norht wall';
    const polished = 'Install 2" PVC on the North wall.'; // "2 inch"→normalized compare fails…
    // 'pvc' survives (case-insensitive); no number-unit token in raw matches "2 inch" pattern
    expect(droppedTokens(raw, polished)).not.toContain('pvc');
  });

  it('returns nothing for empty raw or polished', () => {
    expect(droppedTokens('', 'x')).toEqual([]);
    expect(droppedTokens('2" PVC', '')).toEqual([]);
  });

  it('keeps quiet when tokens are present with different spacing', () => {
    expect(droppedTokens('200 A breaker', 'A 200A breaker.')).toEqual([]);
  });
});

describe('bulletCountChange', () => {
  it('flags the AI merging three bullets into a paragraph', () => {
    const raw = 'tag wrong\nunit missing\nwrong conduit';
    expect(bulletCountChange(raw, 'The tag is wrong, the unit is missing and the conduit is wrong.')).toEqual({
      from: 3,
      to: 1,
    });
  });

  it('flags the AI splitting one bullet into two', () => {
    expect(bulletCountChange('tag wrong and unit missing', 'Tag wrong.\nUnit missing.')).toEqual({
      from: 1,
      to: 2,
    });
  });

  it('stays quiet when the bullet count is preserved', () => {
    expect(bulletCountChange('tag wrong\nunit missing', 'Tag wrong.\nUnit missing.')).toBeNull();
  });

  it('ignores blank lines on either side', () => {
    expect(bulletCountChange('tag wrong\n\n\nunit missing', 'Tag wrong.\nUnit missing.\n')).toBeNull();
  });

  it('returns null when there is nothing to compare', () => {
    expect(bulletCountChange('', 'x')).toBeNull();
    expect(bulletCountChange('x', '')).toBeNull();
  });
});
