import { describe, expect, it } from 'vitest';
import type { PostRecord } from '../types';
import { makeRecord } from './__fixtures__/makeRecord';
import { CLEARANCE_LINE } from './sfSubmission';
import { hasContent } from './record';
import {
  ASK_LINES,
  buildSvtPostHtml,
  buildSvtPostText,
  buildSvtSfText,
  BATTERY_WIDTH,
  HO_UNKNOWN_LINE,
  STACK_KWH,
  wallNeeded,
} from './svtPost';

// The pre-design fields mined from #sow-svt-collab (Aboud 2026-11-17).
//
// Every sentence here is pinned to a real note in the channel, so a reword has
// to be deliberate rather than accidental. The sources, all 2026-11-13..17:
//   - Omar Rajab, Louis Fritz / Main House   → the blanket clearance claim,
//                                              cost direction + driver
//   - Omar Rajab, Louis Fritz / Garage+Shop  → the clearance arithmetic,
//                                              "clear the garage"
//   - Omar Rajab, William Giles              → "no stated preference",
//                                              "remove or relocate plants"
//   - Ya'rob Nabulsi                         → the 2-vs-3 battery stacks blocker
//
// Kept in its own file rather than appended to svtPost.test.ts: that file pins
// the post's original four bullets, this one pins the nine-bullet shape.

function svtRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  const base = makeRecord(overrides);
  base.sf.systemSizeKw = base.sf.systemSizeKw ?? 8.2;
  base.sf.utility = base.sf.utility ?? 'Oncor';
  return base;
}

describe('clearance check', () => {
  it('reproduces the Louis Fritz / Garage arithmetic', () => {
    // "The inverter is 11.9" deep and only 40" of space is available, which
    // leaves about 28" of clearance" — against the required 36".
    const text = buildSvtPostText(
      svtRecord({ svt: { clearEquipment: 'inverter', clearAvailable: 40, clearDepth: 11.9 } }),
    );
    expect(text).toContain(
      '*Clearance:* The wall has 40" of space and the inverter is 11.9" deep, leaving about 28" — short of the 36" required.',
    );
  });

  it('a clearing measurement reads as met', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { clearEquipment: 'battery', clearAvailable: 50, clearDepth: 12 } }),
    );
    expect(text).toContain('the battery is 12" deep, leaving about 38" — the 36" requirement is met.');
  });

  it('exactly the required clearance counts as met', () => {
    const text = buildSvtPostText(svtRecord({ svt: { clearAvailable: 48, clearDepth: 12 } }));
    expect(text).toContain('leaving about 36" — the 36" requirement is met.');
  });

  it('honours a per-record required clearance instead of the 36-inch default', () => {
    const text = buildSvtPostText(svtRecord({ svt: { clearAvailable: 40, clearDepth: 11.9, clearRequired: 24 } }));
    expect(text).toContain('leaving about 28" — the 24" requirement is met.');
  });

  it('defaults the equipment word when no piece is picked', () => {
    const text = buildSvtPostText(svtRecord({ svt: { clearAvailable: 40, clearDepth: 10 } }));
    expect(text).toContain('the equipment is 10" deep');
  });

  it('one number alone says nothing', () => {
    expect(buildSvtPostText(svtRecord({ svt: { clearAvailable: 40 } }))).not.toContain('Clearance');
    expect(buildSvtPostText(svtRecord({ svt: { clearDepth: 11.9 } }))).not.toContain('Clearance');
  });

  it('the blanket tick prints the SOW post own clearance sentence', () => {
    const text = buildSvtPostText(svtRecord({ svt: { clearanceAllMet: true } }));
    expect(text).toContain(`*Clearance:* ${CLEARANCE_LINE}`);
  });

  it('a short measurement and the blanket tick both print — the UI flags it, nothing is dropped', () => {
    const text = buildSvtPostText(svtRecord({ svt: { clearAvailable: 40, clearDepth: 11.9, clearanceAllMet: true } }));
    expect(text).toContain('short of the 36" required.');
    expect(text).toContain(CLEARANCE_LINE);
  });
});

describe('homeowner has no stated preference', () => {
  it('prints the William Giles sentence', () => {
    const text = buildSvtPostText(svtRecord({ svt: { hoAgrees: 'unknown' } }));
    expect(text).toContain(HO_UNKNOWN_LINE);
    expect(text).not.toContain('prefers a different location');
    expect(text).not.toContain('agrees with the proposed');
  });

  it('is distinct from an unanswered question', () => {
    expect(buildSvtPostText(svtRecord({ svt: {} }))).not.toContain('no stated preference');
  });
});

describe('site conditions', () => {
  it('prints the conditions that justify a route', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { atticAccessible: true, detachedStructure: true, hoa: false, batteryStacks: 3 } }),
    );
    expect(text).toContain('The attic is accessible, so wires can be routed through it.');
    expect(text).toContain('The property has detached buildings.');
    expect(text).toContain('HOA: no.');
    expect(text).toContain('Sold with 3 battery stacks (60 kWh).');
  });

  it('one pick writes both the stack count and the kWh', () => {
    // Daniel Beier, 2026-11-16: 20 kWh = 1 stack, 40 = 2, 60 = 3.
    expect(buildSvtPostText(svtRecord({ svt: { batteryStacks: 1 } }))).toContain(
      'Sold with 1 battery stack (20 kWh).',
    );
    expect(buildSvtPostText(svtRecord({ svt: { batteryStacks: 2 } }))).toContain(
      'Sold with 2 battery stacks (40 kWh).',
    );
  });

  it('the kWh mapping is the one the team published', () => {
    expect(STACK_KWH).toEqual({ 1: 20, 2: 40, 3: 60 });
  });
});

describe('wall fit', () => {
  // Body width is measured exactly (23.57"). The gap is ROUNDED UP from the
  // drawn 3.76"/3.97" to a flat 4", so the answer is deliberately ~0.3"
  // conservative against the template's own 50.9" and 78.44" runs — erring
  // toward "needs more wall" is the safe direction for a fit check.
  it('stays within a third of an inch of the runs the drawing contains', () => {
    expect(Math.round(wallNeeded(2) * 100) / 100).toBe(51.14);
    expect(Math.round(wallNeeded(3) * 100) / 100).toBe(78.71);
    expect(wallNeeded(1)).toBe(BATTERY_WIDTH);
    // Conservative, never optimistic, against what the template draws.
    expect(wallNeeded(2)).toBeGreaterThan(50.9);
    expect(wallNeeded(2) - 50.9).toBeLessThan(0.33);
    expect(wallNeeded(3)).toBeGreaterThan(78.44);
    expect(wallNeeded(3) - 78.44).toBeLessThan(0.33);
  });

  it('a run that fits says how much is spare', () => {
    const text = buildSvtPostText(svtRecord({ svt: { batteryStacks: 3, wallAvailable: 96 } }));
    expect(text).toContain(
      '*Wall Fit:* 3 stacks need 78.7" of wall (23.6" each, 4" gaps); 96" available — fits, with 17.3" to spare.',
    );
  });

  it('a run that does not fit says how short it is', () => {
    const text = buildSvtPostText(svtRecord({ svt: { batteryStacks: 3, wallAvailable: 72 } }));
    expect(text).toContain('only 72" available — short by 6.7".');
  });

  it('exactly enough wall counts as a fit', () => {
    const text = buildSvtPostText(svtRecord({ svt: { batteryStacks: 2, wallAvailable: 51.14 } }));
    expect(text).toContain('fits, with 0" to spare.');
  });

  it('one stack has no gaps to mention', () => {
    const text = buildSvtPostText(svtRecord({ svt: { batteryStacks: 1, wallAvailable: 40 } }));
    expect(text).toContain('1 stack need 23.6" of wall (23.6" each);');
    expect(text).not.toContain('gaps');
  });

  it('a stack count with no measured wall prints nothing', () => {
    expect(buildSvtPostText(svtRecord({ svt: { batteryStacks: 3 } }))).not.toContain('Wall Fit');
  });

  it('a measured wall with no stack count prints nothing', () => {
    expect(buildSvtPostText(svtRecord({ svt: { wallAvailable: 96 } }))).not.toContain('Wall Fit');
  });

  it('prints before Clearance — width decides the wall, clearance the standing room', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { batteryStacks: 2, wallAvailable: 96, clearanceAllMet: true } }),
    );
    expect(text.indexOf('Wall Fit')).toBeLessThan(text.indexOf('Clearance'));
  });

  it('"no" is a finding, not a blank', () => {
    const text = buildSvtPostText(svtRecord({ svt: { atticAccessible: false, detachedStructure: false } }));
    expect(text).toContain('The attic is not accessible.');
    expect(text).toContain('No detached buildings on the property.');
  });

  it('unanswered conditions print nothing', () => {
    expect(buildSvtPostText(svtRecord({ svt: {} }))).not.toContain('Site Conditions');
  });

  it('prints beside the conduit path, before clearance', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { pathAttic: true, atticAccessible: true, clearanceAllMet: true } }),
    );
    expect(text.indexOf('Most Likely Conduit Path')).toBeLessThan(text.indexOf('Site Conditions'));
    expect(text.indexOf('Site Conditions')).toBeLessThan(text.indexOf('Clearance'));
  });
});

describe('attic continuity between structures', () => {
  // Omar Rajab, 2026-11-17, with an annotated aerial showing two separate
  // Attic boxes joined by a catwalk: "although the buildings are connected by
  // the catwalk, their attics aren't connected."
  it('states the fact that forces the trench', () => {
    const text = buildSvtPostText(svtRecord({ svt: { detachedStructure: true, atticsContinuous: false } }));
    expect(text).toContain('The property has detached buildings.');
    expect(text).toContain('The attics are not continuous between the structures, so wires cannot run attic-to-attic.');
  });

  it('continuous attics read the other way', () => {
    const text = buildSvtPostText(svtRecord({ svt: { detachedStructure: true, atticsContinuous: true } }));
    expect(text).toContain('The attics are continuous between the structures, so wires can be routed attic-to-attic.');
  });

  it('means nothing without a second structure, so it prints nothing', () => {
    const text = buildSvtPostText(svtRecord({ svt: { detachedStructure: false, atticsContinuous: false } }));
    expect(text).toContain('No detached buildings on the property.');
    expect(text).not.toContain('attic-to-attic');
  });

  it('unanswered prints nothing', () => {
    expect(buildSvtPostText(svtRecord({ svt: { detachedStructure: true } }))).not.toContain('attic-to-attic');
  });
});

describe('ruled-out paths', () => {
  // The William Giles round-trip: the note said why the meter wall was best
  // but never why external-only fails, so the question came back.
  it('names the rejected paths and why', () => {
    const text = buildSvtPostText(
      svtRecord({
        svt: {
          pathB2b: true,
          ruledOut: ['pathExternal', 'pathTrench'],
          ruledOutReason: 'only partially external — would still need both attics and a trench',
        },
      }),
    );
    expect(text).toContain(
      'Ruled out: External run, Trench (underground) — only partially external — would still need both attics and a trench.',
    );
  });

  it('rejected paths with no reason still print', () => {
    const text = buildSvtPostText(svtRecord({ svt: { ruledOut: ['pathAttic'] } }));
    expect(text).toContain('Ruled out: Attic run.');
  });

  it('does not double the period when the writer typed one', () => {
    const text = buildSvtPostText(svtRecord({ svt: { ruledOut: ['pathAttic'], ruledOutReason: 'no access.' } }));
    expect(text).toContain('Ruled out: Attic run — no access.');
    expect(text).not.toContain('access..');
  });

  it('a path cannot be both likely and ruled out — the tick wins', () => {
    // SvtCard makes this unstorable, but a hand-edited record must not print
    // a contradiction either.
    const text = buildSvtPostText(svtRecord({ svt: { pathAttic: true, ruledOut: ['pathAttic', 'pathTrench'] } }));
    expect(text).toContain('Attic run.');
    expect(text).toContain('Ruled out: Trench (underground).');
    expect(text).not.toContain('Ruled out: Attic run');
  });

  it('prints inside the conduit path bullet, not its own', () => {
    const text = buildSvtPostText(svtRecord({ svt: { pathB2b: true, ruledOut: ['pathTrench'] } }));
    expect(text).toContain('*Most Likely Conduit Path:*');
    expect(text.indexOf('Ruled out')).toBeGreaterThan(text.indexOf('Most Likely Conduit Path'));
  });

  it('nothing ruled out prints nothing', () => {
    expect(buildSvtPostText(svtRecord({ svt: { pathB2b: true } }))).not.toContain('Ruled out');
  });
});

describe('scope boundary', () => {
  // Allie Mullen asked whether SOW checks panel fit and production range.
  it('groups the items that share a team into one sentence', () => {
    const text = buildSvtPostText(svtRecord({ svt: { notReviewed: ['panel fit', 'production range'] } }));
    expect(text).toContain(
      '*Not Covered Here:* Not covered by this note: panel fit and production range — please check with the PR team.',
    );
  });

  it('a single item reads without the list join', () => {
    const text = buildSvtPostText(svtRecord({ svt: { notReviewed: ['panel fit'] } }));
    expect(text).toContain('Not covered by this note: panel fit — please check with the PR team.');
  });

  it('an item with no known team prints without inventing one', () => {
    const text = buildSvtPostText(svtRecord({ svt: { notReviewed: ['structural'] } }));
    expect(text).toContain('Not covered by this note: structural.');
    expect(text).not.toContain('please check with');
  });

  it('mixed items split into one line per team', () => {
    const text = buildSvtPostText(svtRecord({ svt: { notReviewed: ['panel fit', 'structural'] } }));
    expect(text).toContain('Not covered by this note: panel fit — please check with the PR team.');
    expect(text).toContain('Not covered by this note: structural.');
  });

  it('drops a stored item this build no longer offers', () => {
    expect(buildSvtPostText(svtRecord({ svt: { notReviewed: ['astrology'] } }))).not.toContain('Not Covered Here');
  });

  it('sits immediately before the ask', () => {
    const text = buildSvtPostText(svtRecord({ svt: { notReviewed: ['panel fit'], ask: 'goodToGo' } }));
    expect(text.indexOf('Not Covered Here')).toBeLessThan(text.indexOf('The Ask'));
  });
});

describe('cost impact', () => {
  it('names the direction and the drivers', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { costDirection: 'adds', costDrivers: ['long SER run', 'external conduit length'] } }),
    );
    expect(text).toContain('*Cost Impact:* Adds cost — long SER run, external conduit length.');
  });

  it('saves cost reads the same way', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { costDirection: 'saves', costDrivers: ['external conduit length'] } }),
    );
    expect(text).toContain('*Cost Impact:* Saves cost — external conduit length.');
  });

  it('a direction with no driver still prints', () => {
    expect(buildSvtPostText(svtRecord({ svt: { costDirection: 'adds' } }))).toContain('*Cost Impact:* Adds cost.');
  });

  it('neutral is a whole sentence and takes no driver', () => {
    const text = buildSvtPostText(svtRecord({ svt: { costDirection: 'neutral', costDrivers: ['trenching'] } }));
    expect(text).toContain('*Cost Impact:* No significant cost change expected.');
    expect(text).not.toContain('trenching');
  });

  it('drops a stored driver this build no longer offers', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { costDirection: 'adds', costDrivers: ['long SER run', 'moon rental'] } }),
    );
    expect(text).toContain('Adds cost — long SER run.');
    expect(text).not.toContain('moon rental');
  });

  it('a typed driver joins the driver list', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { costDirection: 'adds', costDrivers: ['trenching'], costNotes: 'second meter pedestal' } }),
    );
    expect(text).toContain('*Cost Impact:* Adds cost — trenching, second meter pedestal.');
  });

  it('a typed driver alone still names the direction', () => {
    const text = buildSvtPostText(svtRecord({ svt: { costDirection: 'adds', costNotes: 'second meter pedestal.' } }));
    expect(text).toContain('*Cost Impact:* Adds cost — second meter pedestal.');
    expect(text).not.toContain('pedestal..');
  });

  it('text with no direction is printed rather than lost', () => {
    const text = buildSvtPostText(svtRecord({ svt: { costNotes: 'second meter pedestal' } }));
    expect(text).toContain('second meter pedestal.');
  });
});

describe('homeowner actions', () => {
  it('nests the picked actions under one lead line', () => {
    const text = buildSvtPostText(
      svtRecord({
        svt: {
          hoActions: ['clear the garage', 'remove or relocate plants and landscaping in the installation area'],
        },
      }),
    );
    expect(text).toContain('The homeowner will need to:');
    expect(text).toContain('Clear the garage.');
    expect(text).toContain('Remove or relocate plants and landscaping in the installation area.');
  });

  it('a typed action joins the same list', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { hoActions: ['clear the garage'], hoActionsOther: 'unlock the side gate' } }),
    );
    expect(text).toContain('Clear the garage.');
    expect(text).toContain('Unlock the side gate.');
  });

  it('drops a stored action this build no longer offers', () => {
    const text = buildSvtPostText(svtRecord({ svt: { hoActions: ['juggle the cat'] } }));
    expect(text).not.toContain('Homeowner Actions');
  });

  it('nothing picked prints no bullet', () => {
    expect(buildSvtPostText(svtRecord({ svt: {} }))).not.toContain('Homeowner Actions');
  });
});

describe('the ask', () => {
  it('closes with the picked sentence', () => {
    expect(buildSvtPostText(svtRecord({ svt: { ask: 'goodToGo' } }))).toContain(
      '*The Ask:* The project is good to go.',
    );
    expect(buildSvtPostText(svtRecord({ svt: { ask: 'hoConfirm' } }))).toContain(
      'Please confirm with the homeowner and let us know how they prefer to proceed.',
    );
    expect(buildSvtPostText(svtRecord({ svt: { ask: 'hoConvince' } }))).toContain(
      'Please let us know whether we can convince the homeowner to go with this approach.',
    );
  });

  it('blocked names what is needed — the battery-stacks blocker', () => {
    const text = buildSvtPostText(
      svtRecord({ svt: { ask: 'blocked', blockedOn: 'confirmation of 2 vs 3 stacks sold' } }),
    );
    expect(text).toContain(
      '*The Ask:* Blocked — we need the following before this can be finalized: confirmation of 2 vs 3 stacks sold.',
    );
  });

  it('blocked with nothing named falls back to the generic line', () => {
    expect(buildSvtPostText(svtRecord({ svt: { ask: 'blocked' } }))).toContain(ASK_LINES.blocked);
  });

  it('does not double the period when the writer typed one', () => {
    const text = buildSvtPostText(svtRecord({ svt: { ask: 'blocked', blockedOn: 'the utility account number.' } }));
    expect(text).toContain('finalized: the utility account number.');
    expect(text).not.toContain('number..');
  });

  it('prints last, after the homeowner actions', () => {
    const text = buildSvtPostText(svtRecord({ svt: { ask: 'goodToGo', hoActions: ['clear the garage'] } }));
    expect(text.indexOf('Homeowner Actions')).toBeLessThan(text.indexOf('The Ask'));
    expect(text.trimEnd().endsWith('The project is good to go.')).toBe(true);
  });

  it('unanswered prints nothing', () => {
    expect(buildSvtPostText(svtRecord({ svt: {} }))).not.toContain('The Ask');
  });
});

describe('the SF and rich-clipboard versions carry the new bullets', () => {
  it('SF renders them with dashed underlines', () => {
    const text = buildSvtSfText(
      svtRecord({ svt: { clearanceAllMet: true, costDirection: 'adds', ask: 'goodToGo', hoa: true } }),
    );
    expect(text).toContain('Site Conditions\n---------------\n- HOA: yes.');
    expect(text).toContain(`Clearance\n---------\n- ${CLEARANCE_LINE}`);
    expect(text).toContain('Cost Impact\n-----------\n- Adds cost.');
    expect(text).toContain('The Ask\n-------\n- The project is good to go.');
  });

  it('SF nests the homeowner actions under their lead line', () => {
    const text = buildSvtSfText(svtRecord({ svt: { hoActions: ['clear the garage'] } }));
    expect(text).toContain('- The homeowner will need to:\n  - Clear the garage.');
  });

  it('HTML nests the homeowner actions as a sub-list', () => {
    const html = buildSvtPostHtml(svtRecord({ svt: { hoActions: ['clear the garage'] } }));
    expect(html).toContain('<strong>Homeowner Actions:</strong>');
    expect(html).toContain('<li>Clear the garage.</li>');
  });
});

describe('hasContent counts the pre-design picks', () => {
  // A draft holding ONLY one of these must still be saved. `false` and the
  // numbers are real answers, so a truthiness check would throw the work away.
  const onlySvt = (svt: PostRecord['svt']) => {
    const r = makeRecord();
    r.sf.customerName = '';
    r.sf.jurisdiction = '';
    r.sf.siteAddress = '';
    r.sf.installScheduledDate = '';
    r.sf.installRegionRaw = '';
    r.sf.recordTitle = '';
    r.sf.systemSizeKw = undefined;
    r.installNotes = undefined;
    r.notes = { layout: '', siteSurvey: '', design: '', homeowner: '' };
    r.designerTag = undefined;
    return hasContent({ ...r, svt });
  };

  it('an empty record is still empty', () => {
    expect(onlySvt({})).toBe(false);
  });

  it.each([
    ['hoa false', { hoa: false }],
    ['attic not accessible', { atticAccessible: false }],
    ['no detached buildings', { detachedStructure: false }],
    ['battery stacks', { batteryStacks: 2 as const }],
    ['a clearance measurement', { clearAvailable: 40 }],
    ['the clearance tick', { clearanceAllMet: true }],
    ['a cost direction', { costDirection: 'adds' as const }],
    ['a cost driver', { costDrivers: ['trenching'] }],
    ['a homeowner action', { hoActions: ['clear the garage'] }],
    ['an ask', { ask: 'goodToGo' as const }],
    ['a typed blocker', { blockedOn: 'the stacks count' }],
  ])('keeps a draft holding only %s', (_label, svt) => {
    expect(onlySvt(svt)).toBe(true);
  });
});
