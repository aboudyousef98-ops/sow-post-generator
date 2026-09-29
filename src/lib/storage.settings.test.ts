// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, saveSettings } from './storage';

describe('loadSettings chip merge (spec/10 §7.1)', () => {
  beforeEach(() => localStorage.clear());

  it('new chip keys reach a browser that already has saved settings', () => {
    // Simulate a settings object saved before the new chips existed.
    saveSettings({ ...defaultSettings(), chips: { siteSurvey: ['only the old one'] } });
    const loaded = loadSettings();
    expect(loaded.chips).toEqual(defaultSettings().chips);
  });

  it('an edited default phrase still wins over the built-in default', () => {
    saveSettings({ ...defaultSettings(), defaults: { ...defaultSettings().defaults, design: 'Looks fine.' } });
    const loaded = loadSettings();
    expect(loaded.defaults.design).toBe('Looks fine.');
    expect(loaded.defaults.homeowner).toBe('No feedback.');
  });

  it('other settings keys still merge at the top level', () => {
    saveSettings({ ...defaultSettings(), lastAuthor: 'Omar Rajab' });
    expect(loadSettings().lastAuthor).toBe('Omar Rajab');
  });
});
