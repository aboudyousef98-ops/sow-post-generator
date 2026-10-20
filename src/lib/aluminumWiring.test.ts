// Aluminum wiring stance lookup (Othman's 509-jurisdiction list, 2026-10-20).
// The dataset module is GENERATED — regenerate with:
//   node scripts/import-aluminum-xlsx.mjs <path-to-xlsx>

import { describe, expect, it } from 'vitest';
import { matchAluminum } from './aluminumWiring';
import { ALUMINUM_WIRING } from './aluminumWiringData';

const entries = [
  { name: 'Addison', requirement: 'Restricted: Aluminum #8 AWG or larger only' },
  { name: 'City of Lucas', requirement: 'Unknown; call city' },
  { name: 'Anderson County', requirement: 'No local electrical code' },
];

describe('matchAluminum', () => {
  it('matches a jurisdiction name case- and whitespace-insensitively', () => {
    expect(matchAluminum('  aDDison ', entries)?.requirement).toContain('#8 AWG');
  });

  it('matches when Salesforce says "City of X" and the list says "X"', () => {
    expect(matchAluminum('City of Addison', entries)?.name).toBe('Addison');
  });

  it('matches when the list says "City of X" and Salesforce says "X"', () => {
    expect(matchAluminum('Lucas', entries)?.name).toBe('City of Lucas');
  });

  it('never guesses between two real jurisdictions that differ only by prefix', () => {
    // The sheet has BOTH "City of Lakeside" and "Town of Lakeside" (different
    // Texas jurisdictions). Exact spellings must resolve; bare "Lakeside" is
    // ambiguous and must match nothing rather than pick one.
    const twins = [
      { name: 'City of Lakeside', requirement: 'Unknown; call city' },
      { name: 'Town of Lakeside', requirement: 'Not allowed: example' },
    ];
    expect(matchAluminum('Town of Lakeside', twins)?.requirement).toMatch(/^Not allowed/);
    expect(matchAluminum('City of Lakeside', twins)?.requirement).toMatch(/^Unknown/);
    expect(matchAluminum('Lakeside', twins)).toBeNull();
  });

  it('returns null for unknown, empty and missing jurisdictions', () => {
    expect(matchAluminum('Houston', entries)).toBeNull();
    expect(matchAluminum('', entries)).toBeNull();
    expect(matchAluminum(undefined, entries)).toBeNull();
  });
});

describe('ALUMINUM_WIRING dataset', () => {
  it('carries every row of the source sheet, none blank', () => {
    expect(ALUMINUM_WIRING.length).toBe(509);
    for (const e of ALUMINUM_WIRING) {
      expect(e.name.trim()).not.toBe('');
      expect(e.requirement.trim()).not.toBe('');
    }
  });

  it('resolves the fixture jurisdiction (Pasadena) to its Restricted stance', () => {
    expect(matchAluminum('Pasadena')?.requirement).toMatch(/^Restricted/);
  });
});
