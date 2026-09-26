import { describe, expect, it } from 'vitest';
import { metroCityName, nearestMetro } from './geo';

describe('nearestMetro', () => {
  it('Corpus Christi → Near Houston (the real case from SF)', () => {
    expect(nearestMetro('Corpus Christi')?.metro).toBe('HOU');
  });

  it('works on full addresses and jurisdiction strings', () => {
    expect(nearestMetro('4014 Marion St, Corpus Christi, TX 78411')?.metro).toBe('HOU');
    expect(nearestMetro('Waco, McLennan County')?.metro).toBe('DFW');
  });

  it('classic splits: Austin/San Antonio → HOU; Tyler/Abilene/Wichita Falls → DFW', () => {
    expect(nearestMetro('Austin')?.metro).toBe('HOU');
    expect(nearestMetro('San Antonio')?.metro).toBe('HOU');
    expect(nearestMetro('Tyler')?.metro).toBe('DFW');
    expect(nearestMetro('Abilene')?.metro).toBe('DFW');
    expect(nearestMetro('Wichita Falls')?.metro).toBe('DFW');
  });

  it('longest city-name match wins (San Angelo is not Angelo)', () => {
    expect(nearestMetro('San Angelo TX')?.metro).toBe('DFW');
  });

  it('unknown places return null (AI fallback territory)', () => {
    expect(nearestMetro('Some Ranch Road 123')).toBeNull();
    expect(nearestMetro('')).toBeNull();
  });

  it('metro city names', () => {
    expect(metroCityName('HOU')).toBe('Houston');
    expect(metroCityName('DFW')).toBe('Dallas');
  });
});
