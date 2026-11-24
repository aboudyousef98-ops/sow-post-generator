import { describe, expect, it } from 'vitest';
import { makeRecord } from './__fixtures__/makeRecord';
import { defaultSettings } from './storage';
import { effectiveNoteLines } from './template';
import { SHARED_FOLDER_REMINDER, TEMPLATE_REMINDER, designQaLines } from './designQa';

// Design process QA (Aboud 2026-11-24): two tri-state checks whose "No" adds a
// reminder to Design Feedback, the same mechanism as the wire verdict. A blank
// or "Yes" prints nothing — a brand-new draft must never flag the designer.

describe('designQaLines', () => {
  it('prints nothing when unanswered', () => {
    expect(designQaLines(makeRecord())).toEqual([]);
    expect(designQaLines(makeRecord({ designQa: {} }))).toEqual([]);
  });

  it('prints nothing when both answers are yes', () => {
    expect(designQaLines(makeRecord({ designQa: { sharedFolder: true, usedTemplate: true } }))).toEqual([]);
  });

  it('a shared-folder "no" prints the shared-folder reminder', () => {
    expect(designQaLines(makeRecord({ designQa: { sharedFolder: false } }))).toEqual([SHARED_FOLDER_REMINDER]);
  });

  it('a template "no" prints the template reminder', () => {
    expect(designQaLines(makeRecord({ designQa: { usedTemplate: false } }))).toEqual([TEMPLATE_REMINDER]);
  });

  it('both "no" print both, shared folder first', () => {
    expect(designQaLines(makeRecord({ designQa: { sharedFolder: false, usedTemplate: false } }))).toEqual([
      SHARED_FOLDER_REMINDER,
      TEMPLATE_REMINDER,
    ]);
  });
});

describe('design QA lines ride Design Feedback, after the wire verdict', () => {
  it('a reminder suppresses the "All good." default and leads the typed bullets', () => {
    const rec = makeRecord({
      designQa: { sharedFolder: false },
      notes: { layout: '', siteSurvey: '', design: 'Solar tag should read PVC.', homeowner: '' },
    });
    const lines = effectiveNoteLines(rec, 'design', defaultSettings());
    expect(lines[0]).toBe(SHARED_FOLDER_REMINDER);
    expect(lines).toContain('Solar tag should read PVC.');
    expect(lines).not.toContain('All good.');
  });

  it('a reminder alone (no typed feedback) still prints, no "All good." fallback', () => {
    const rec = makeRecord({ designQa: { usedTemplate: false } });
    expect(effectiveNoteLines(rec, 'design', defaultSettings())).toEqual([TEMPLATE_REMINDER]);
  });

  it('neither check answered falls back to the "All good." default', () => {
    expect(effectiveNoteLines(makeRecord(), 'design', defaultSettings())).toEqual(['All good.']);
  });

  it('design QA only touches Design Feedback, not the other two boxes', () => {
    const rec = makeRecord({ designQa: { sharedFolder: false, usedTemplate: false } });
    expect(effectiveNoteLines(rec, 'siteSurvey', defaultSettings())).not.toContain(SHARED_FOLDER_REMINDER);
    expect(effectiveNoteLines(rec, 'homeowner', defaultSettings())).not.toContain(TEMPLATE_REMINDER);
  });
});
