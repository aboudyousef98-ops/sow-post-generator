import { describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { emptyInstallNotes } from './installNotes';
import { buildSvtPostHtml, buildSvtPostText, TWO_DAY_LINE } from './svtPost';

// The SVT pre-design post (Aboud 2026-11-15, #sow-svt-collab taskforce):
// scope-of-work notes within hours of the site survey, BEFORE design, so
// SVT/CLR can make scheduling decisions. Modelled on Omar Rajab's Louis Fritz
// note: equipment placement → routing → HO confirmations → schedule impact.

function svtRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  const base = makeRecord(overrides);
  base.sf.systemSizeKw = base.sf.systemSizeKw ?? 8.2;
  base.sf.utility = base.sf.utility ?? 'Oncor';
  return base;
}

describe('buildSvtPostText', () => {
  it('produces the canonical pre-design example verbatim', () => {
    const rec = svtRecord({
      installNotes: {
        ...emptyInstallNotes(),
        walls: 2,
        orientations: ['East', 'West'],
        stories: 1,
        services: ['MPU'],
        batteryLocation: 'on the north wall',
        specialCases: 'Long SER run adds cost',
      },
      svt: {
        hoAgrees: false,
        hoLocation: 'inside the garage',
        hoReason: 'it blocks the clearance to the gas meter',
        alt1Location: 'east wall near the meter',
        alt1Reason: 'shorter run',
        pathAttic: true,
        pathExternal: true,
        pathNotes: 'external run crosses the pool-view wall',
        twoDay: true,
      },
    });
    expect(buildSvtPostText(rec)).toBe(`*Pre-Design Analysis — Norca Garcia*
8.2 kW | Pasadena | Oncor
• *Battery Location:*
    ◦ Batteries will be installed on the north wall.
    ◦ The homeowner prefers a different location: inside the garage.
    ◦ Why it does not work: it blocks the clearance to the gas meter.
    ◦ Alternative location: east wall near the meter — shorter run.
• *Most Likely Conduit Path:*
    ◦ Attic run, External run.
    ◦ external run crosses the pool-view wall.
• *Installation Notes:*
    ◦ Installation on two walls (East, West).
    ◦ 1-story house.
    ◦ This project requires an MPU.
    ◦ Expected power disconnect duration: 4–6 hours.
    ◦ Special cases: Long SER run adds cost.
• *Scheduling:* ${TWO_DAY_LINE}`);
  });

  it('homeowner agreement prints the agree sentence', () => {
    const rec = svtRecord({
      installNotes: { ...emptyInstallNotes(), batteryLocation: 'on the north wall' },
      svt: { hoAgrees: true },
    });
    const text = buildSvtPostText(rec);
    expect(text).toContain('◦ The homeowner agrees with the proposed battery location.');
    expect(text).not.toContain('prefers a different location');
  });

  it('an unanswered homeowner question prints neither sentence', () => {
    const rec = svtRecord({
      installNotes: { ...emptyInstallNotes(), batteryLocation: 'on the north wall' },
    });
    const text = buildSvtPostText(rec);
    expect(text).toContain('*Battery Location:* Batteries will be installed on the north wall.');
    expect(text).not.toContain('homeowner agrees');
    expect(text).not.toContain('prefers a different location');
  });

  it('both alternatives print as their own lines', () => {
    const rec = svtRecord({
      svt: {
        alt1Location: 'east wall',
        alt1Reason: 'shorter run',
        alt2Location: 'west wall',
        alt2Reason: 'hidden from the street',
      },
    });
    const text = buildSvtPostText(rec);
    expect(text).toContain('◦ Alternative location: east wall — shorter run.');
    expect(text).toContain('◦ Alternative location: west wall — hidden from the street.');
  });

  it('an alternative with no reason is just the location sentence', () => {
    const rec = svtRecord({ svt: { alt1Location: 'east wall' } });
    expect(buildSvtPostText(rec)).toContain('*Battery Location:* Alternative location: east wall.');
  });

  it('a single path tick renders inline', () => {
    const rec = svtRecord({ svt: { pathB2b: true } });
    expect(buildSvtPostText(rec)).toContain('• *Most Likely Conduit Path:* Back-to-back.');
  });

  it('every path tick has its fixed name, in a fixed order', () => {
    const rec = svtRecord({
      svt: { pathB2b: true, pathAttic: true, pathExternal: true, pathTrench: true, pathExisting: true },
    });
    expect(buildSvtPostText(rec)).toContain(
      '• *Most Likely Conduit Path:* Back-to-back, Attic run, External run, Trench (underground), Existing solar tie-in.',
    );
  });

  it('the scheduling bullet appears only when two-day is ticked', () => {
    expect(buildSvtPostText(svtRecord())).not.toContain('*Scheduling:*');
    expect(buildSvtPostText(svtRecord({ svt: { twoDay: true } }))).toContain(`• *Scheduling:* ${TWO_DAY_LINE}`);
  });

  it('drops the kW/utility meta parts that are missing', () => {
    const rec = makeRecord(); // no systemSizeKw, no utility
    const text = buildSvtPostText(rec);
    expect(text.split('\n')[1]).toBe('Pasadena');
  });

  it('uses polished SVT text when present, raw when reverted', () => {
    const rec = svtRecord({
      svt: { hoAgrees: false, hoReason: 'raw reason' },
      polished: { 'svt.hoReason': 'Polished reason' },
    });
    expect(buildSvtPostText(rec)).toContain('Why it does not work: Polished reason.');
    rec.usePolished['svt.hoReason'] = false;
    expect(buildSvtPostText(rec)).toContain('Why it does not work: raw reason.');
  });

  it('an empty record still renders the header and the duration line', () => {
    const text = buildSvtPostText(makeRecord());
    expect(text).toContain('*Pre-Design Analysis — Norca Garcia*');
    expect(text).toContain('• *Installation Notes:* Expected power disconnect duration: 1–2 hours.');
    expect(text).not.toContain('*Battery Location:*');
    expect(text).not.toContain('*Most Likely Conduit Path:*');
  });
});

describe('buildSvtPostHtml', () => {
  it('bolds the header and escapes user text', () => {
    const rec = svtRecord({ svt: { pathNotes: 'route <under> the A&C line' } });
    const html = buildSvtPostHtml(rec);
    expect(html).toContain('<p><strong>Pre-Design Analysis — Norca Garcia</strong></p>');
    expect(html).toContain('route &lt;under&gt; the A&amp;C line.');
    expect(html).not.toContain('<under>');
  });

  it('renders the bullets as nested lists with bold labels', () => {
    const rec = svtRecord({ svt: { pathB2b: true } });
    expect(buildSvtPostHtml(rec)).toContain('<li><strong>Most Likely Conduit Path:</strong> Back-to-back.</li>');
  });
});
