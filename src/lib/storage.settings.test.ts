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

  it('ships the Installation Notes chip keys (spec/10 §7)', () => {
    const chips = defaultSettings().chips;
    expect(chips['install.specialCases']).toEqual([
      'Window to be closed off.',
      'Small junction boxes to be relocated.',
      'Existing equipment to be moved.',
    ]);
    // install.other inherits the old layout chips minus the three the
    // dropdowns now cover (1-story, 2-story, two walls).
    expect(chips['install.other']).toEqual(['Back-to-back installation.', 'Attic run.']);
    // The old combined chip is split in two.
    expect(chips.siteSurvey).not.toContain(
      'Please take sufficient measurements of all walls and wide-angle photos of each wall.',
    );
    expect(chips.siteSurvey).toContain('Please take sufficient measurements of all walls.');
    expect(chips.siteSurvey).toContain('Please add a wide-angle photo of each wall.');
    expect(chips.siteSurvey).toContain('Please provide the wall height.');
    expect(chips.design).toContain('Please review the one-line diagram against the elevation.');
    expect(chips.design).toContain('The one-line diagram is missing the {component}.');
  });

  it('a browser with stale saved chips still gets the new keys', () => {
    saveSettings({ ...defaultSettings(), chips: { siteSurvey: ['only the old one'] } });
    expect(loadSettings().chips['install.specialCases']).toBeDefined();
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
