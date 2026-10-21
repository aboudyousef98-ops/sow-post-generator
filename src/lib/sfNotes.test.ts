// Salesforce note fields (Scheduling Alerts! + AHJ/utility requirements) —
// Aboud 2026-10-21: "i want the alerts, ahj notes, all the notes to appear on
// the compose as alerts for us to read". These helpers are shared by the
// xlsx parser, the import reconciler, the activity log and the Compose banner.

import { describe, expect, it } from 'vitest';
import { hasSfNotes, sfNotesEqual, sfNotesSections, sfNotesSummary, type SfNotes } from './sfNotes';

const FULL: SfNotes = {
  alerts: 'Roof is fine.\n4x tree trims needed.',
  ahjDesign: 'Wind load 180 mph.',
  ahjBattery: 'Battery outside only.',
  utilityDesign: 'Requires a main breaker.',
  utilityBattery: 'Apply through portal.',
};

describe('sfNotesSections', () => {
  it('returns only the filled sections, in canonical order with human labels', () => {
    const sections = sfNotesSections({ utilityDesign: 'Main breaker.', alerts: 'Tree trims.' });
    expect(sections.map((s) => s.label)).toEqual(['Scheduling alerts', 'Utility — design requirements']);
    expect(sections.map((s) => s.text)).toEqual(['Tree trims.', 'Main breaker.']);
  });

  it('covers all five sections', () => {
    expect(sfNotesSections(FULL).map((s) => s.label)).toEqual([
      'Scheduling alerts',
      'AHJ — design requirements',
      'AHJ — battery requirements',
      'Utility — design requirements',
      'Utility — battery requirements',
    ]);
  });

  it('is empty for undefined, {} and whitespace-only values', () => {
    expect(sfNotesSections(undefined)).toEqual([]);
    expect(sfNotesSections({})).toEqual([]);
    expect(sfNotesSections({ alerts: '  ' })).toEqual([]);
  });
});

describe('hasSfNotes', () => {
  it('is true only when at least one section has text', () => {
    expect(hasSfNotes(FULL)).toBe(true);
    expect(hasSfNotes({ ahjBattery: 'x' })).toBe(true);
    expect(hasSfNotes({})).toBe(false);
    expect(hasSfNotes(undefined)).toBe(false);
    expect(hasSfNotes({ alerts: '' })).toBe(false);
  });
});

describe('sfNotesEqual', () => {
  it('treats undefined, {} and empty strings as the same emptiness', () => {
    expect(sfNotesEqual(undefined, {})).toBe(true);
    expect(sfNotesEqual({ alerts: '' }, undefined)).toBe(true);
  });

  it('is true for the same text and false when any field differs', () => {
    expect(sfNotesEqual({ ...FULL }, { ...FULL })).toBe(true);
    expect(sfNotesEqual(FULL, { ...FULL, ahjDesign: 'Wind load 150 mph.' })).toBe(false);
    expect(sfNotesEqual(FULL, { ...FULL, alerts: undefined })).toBe(false);
  });
});

describe('sfNotesSummary', () => {
  it('names the filled sections for the activity log', () => {
    expect(sfNotesSummary({ alerts: 'x', utilityBattery: 'y' })).toBe(
      'Scheduling alerts · Utility — battery requirements',
    );
  });

  it('is an em dash when there is nothing', () => {
    expect(sfNotesSummary(undefined)).toBe('—');
    expect(sfNotesSummary({})).toBe('—');
  });
});
