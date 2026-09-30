import { describe, expect, it } from 'vitest';
import { layoutSeed, LEVEL_INFO, LEVEL_NAMES, suggestDriversFromText, suggestLevel } from './classify';
import type { DriverId } from '../types';

const set = (...ids: DriverId[]) => new Set<DriverId>(ids);

describe('suggestLevel — decision sequence L4 → L1', () => {
  it('no drivers → L1', () => {
    expect(suggestLevel(set()).level).toBe(1);
  });

  it('routing driver → L2', () => {
    const r = suggestLevel(set('attic_run'));
    expect(r.level).toBe(2);
    expect(r.reason).toContain('attic run');
  });

  it('mpu + relocation ≤ 20 ft → L3 (acceptance case)', () => {
    const r = suggestLevel(set('mpu', 'relocation_le_20ft'));
    expect(r.level).toBe(3);
    expect(r.reason).toContain('MPU');
  });

  it('any L4 driver wins over L3 and L2', () => {
    expect(suggestLevel(set('mpu', 'attic_run', 'dirt_trench')).level).toBe(4);
  });

  it('level names are the official verbatim names', () => {
    expect(LEVEL_NAMES[1]).toBe('Standard Installation');
    expect(LEVEL_NAMES[2]).toBe('Extended Routing & Integration');
    expect(LEVEL_NAMES[3]).toBe('Service Equipment Modification');
    expect(LEVEL_NAMES[4]).toBe('Major Electrical & Civil Construction');
  });
});

describe('layoutSeed', () => {
  it('mpu + relocation → mentions "MPU with relocation" (acceptance case)', () => {
    const seed = layoutSeed(set('mpu', 'relocation_le_20ft'));
    expect(seed).toContain('MPU with relocation');
  });

  it('drops clauses with no data', () => {
    expect(layoutSeed(set())).toBe('');
  });

  it('builds clauses in the fixed order', () => {
    const seed = layoutSeed(set('attic_run', 'dirt_trench'), {
      backToBack: true,
      walls: '2',
      wallOrientations: 'South-West and South-East',
      stories: '1',
      batteries: 2,
      inverterIndoors: true,
    });
    expect(seed).toBe(
      'Back-to-back installation. ' +
        'The installation will be carried out on two walls (South-West and South-East). ' +
        '1-story house. Attic run. Dirt trenching required. ' +
        '2 batteries; inverter located indoors.',
    );
  });
});

describe('suggestDriversFromText — keyword table', () => {
  it('detects MPU, FSU, FTP, attic run, generator', () => {
    const d = suggestDriversFromText('MPU needed, full service upgrade, FTP, attic run, generator hookup');
    expect(d).toEqual(expect.arrayContaining(['mpu', 'fsu', 'ftp', 'attic_run', 'generator']));
  });

  it('trench + dirt → dirt_trench; trench + concrete → concrete_trench; trench alone → manual', () => {
    expect(suggestDriversFromText('dirt trench on the solar side')).toContain('dirt_trench');
    expect(suggestDriversFromText('trench with concrete saw cut')).toContain('concrete_trench');
    expect(suggestDriversFromText('short trench to the garage')).toContain('manual_trench_short');
  });

  it('relocation keyword suggests the ≤ 20 ft driver (user confirms distance)', () => {
    expect(suggestDriversFromText('meter relocation required')).toContain('relocation_le_20ft');
  });

  it('existing PV integration', () => {
    expect(suggestDriversFromText('integration with existing PV array')).toContain(
      'existing_system_integration',
    );
  });
});

describe('LEVEL_INFO planning windows match the 2026 standard (spec/10 §12.2)', () => {
  it('uses the PDF wording character-for-character', () => {
    expect(LEVEL_INFO[1].window).toBe('1 crew-day');
    expect(LEVEL_INFO[2].window).toBe('1 to 1.5 crew-days');
    expect(LEVEL_INFO[3].window).toBe('1.5 to 2 crew-days');
    expect(LEVEL_INFO[4].window).toBe('Site-specific, minimum 2 days');
  });

  it('keeps the Level 4 pre-construction control in scope, not in the window', () => {
    expect(LEVEL_INFO[4].window).not.toMatch(/field verification/i);
    expect(LEVEL_INFO[4].scope).toMatch(/field verification before scheduling/i);
  });
});
