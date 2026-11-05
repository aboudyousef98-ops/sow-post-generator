import { describe, expect, it } from 'vitest';
import type { AutomationRule, BoardLabel, BoardProject } from '../board/types';
import { newProject, seedLabels } from './board';
import {
  ACTOR,
  autoUpdates,
  builtInRules,
  describeRule,
  enabledRules,
  followUpPatch,
  gatingRules,
  liveRules,
  matchingRules,
  newRule,
  ruleIsComplete,
} from './automations';

const T0 = '2026-11-05T10:00:00.000Z';
const T1 = '2026-11-05T11:00:00.000Z';

const LABELS: BoardLabel[] = [
  ...seedLabels(),
  {
    id: 's-installed',
    columnKey: 'status',
    name: 'Installed',
    color: '#00C875',
    sortOrder: 170,
    isDefault: false,
    isDone: false,
    isSystem: false,
    archived: false,
    updatedAt: T0,
  },
];

const row = (over: Partial<BoardProject> = {}): BoardProject => ({
  ...newProject('Martha Thompson', 'Aboud Yousef', LABELS, T0),
  id: 'p1',
  ...over,
});

const rule = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  ...newRule('Aboud Yousef', T0),
  id: over.id ?? 'r1',
  trigger: { kind: 'status-to', statusId: 's-installed' },
  action: { kind: 'set-phase', phaseId: 'phase-schedule' },
  ...over,
});

describe('the rule list', () => {
  it('drops tombstones and orders oldest-first, so the list is stable', () => {
    const rules = [
      rule({ id: 'b', createdAt: T1 }),
      rule({ id: 'a', createdAt: T0 }),
      rule({ id: 'gone', deletedAt: T1 }),
    ];
    expect(liveRules(rules).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('tolerates an absent list — every board before 2026-11-05 has none', () => {
    expect(liveRules(undefined)).toEqual([]);
    expect(enabledRules(undefined)).toEqual([]);
  });

  it('a disabled rule is still listed, but never enabled', () => {
    const rules = [rule({ id: 'off', enabled: false })];
    expect(liveRules(rules)).toHaveLength(1);
    expect(enabledRules(rules)).toHaveLength(0);
  });
});

describe('a rule is only savable once it is whole', () => {
  it('rejects a trigger or action with its own field missing', () => {
    expect(ruleIsComplete(rule({ trigger: { kind: 'status-to' } }))).toBe(false);
    expect(ruleIsComplete(rule({ trigger: { kind: 'rating-at-least' } }))).toBe(false);
    expect(ruleIsComplete(rule({ action: { kind: 'set-status' } }))).toBe(false);
    expect(ruleIsComplete(rule({ action: { kind: 'set-phase' } }))).toBe(false);
    expect(ruleIsComplete(rule({ action: { kind: 'set-reviewer' } }))).toBe(false);
    expect(ruleIsComplete(rule({ action: { kind: 'post-update', text: '   ' } }))).toBe(false);
  });

  it('accepts the ones that need no extra field', () => {
    expect(ruleIsComplete(rule({ trigger: { kind: 'project-created' }, action: { kind: 'require-note' } }))).toBe(true);
  });

  it('a blank new rule is NOT complete — it cannot be saved by accident', () => {
    expect(ruleIsComplete(newRule('Aboud Yousef', T0))).toBe(false);
  });
});

describe('matching', () => {
  it('status-to fires only on the status it names', () => {
    const r = [rule()];
    expect(matchingRules(r, row(), { statusId: 's-installed' })).toHaveLength(1);
    expect(matchingRules(r, row(), { statusId: 'status-working' })).toHaveLength(0);
    // A patch that is not about the status at all must not fire it.
    expect(matchingRules(r, row(), { rating: 5 })).toHaveLength(0);
  });

  it('rating-at-least fires at the threshold and above, never below', () => {
    const r = [rule({ trigger: { kind: 'rating-at-least', rating: 4 }, action: { kind: 'require-note' } })];
    expect(matchingRules(r, row(), { rating: 4 })).toHaveLength(1);
    expect(matchingRules(r, row(), { rating: 5 })).toHaveLength(1);
    expect(matchingRules(r, row(), { rating: 3 })).toHaveLength(0);
    // Clearing a rating is not a rating.
    expect(matchingRules(r, row(), { rating: null })).toHaveLength(0);
  });

  it('project-created fires on a new row and nothing else', () => {
    const r = [rule({ trigger: { kind: 'project-created' }, action: { kind: 'require-note' } })];
    expect(matchingRules(r, null, {})).toHaveLength(1);
    expect(matchingRules(r, row(), { statusId: 's-installed' })).toHaveLength(0);
  });

  it('a change trigger never fires on a creation', () => {
    expect(matchingRules([rule()], null, { statusId: 's-installed' })).toHaveLength(0);
  });

  it('a disabled or incomplete rule never fires', () => {
    expect(matchingRules([rule({ enabled: false })], row(), { statusId: 's-installed' })).toHaveLength(0);
    expect(
      matchingRules([rule({ action: { kind: 'set-phase' } })], row(), { statusId: 's-installed' }),
    ).toHaveLength(0);
  });

  it('a tombstoned rule never fires, even while a stale cache still holds it', () => {
    expect(matchingRules([rule({ deletedAt: T1 })], row(), { statusId: 's-installed' })).toHaveLength(0);
  });

  describe('the optional condition', () => {
    const withCoord = rule({ condition: { coordinator: 'Omar Rajab' } });

    it('narrows the trigger', () => {
      expect(matchingRules([withCoord], row({ coordinator: 'Omar Rajab' }), { statusId: 's-installed' })).toHaveLength(1);
      expect(matchingRules([withCoord], row({ coordinator: 'Aboud Yousef' }), { statusId: 's-installed' })).toHaveLength(0);
    });

    it('is read against the row AS IT WILL BE, patch applied', () => {
      // The change IS the coordinator: asking about the old value would answer
      // the wrong question.
      const r = rule({ trigger: { kind: 'project-created' }, action: { kind: 'require-note' }, condition: { coordinator: 'Omar Rajab' } });
      expect(matchingRules([r], null, { coordinator: 'Omar Rajab' })).toHaveLength(1);
      expect(matchingRules([r], null, { coordinator: 'Aboud Yousef' })).toHaveLength(0);
    });

    it('two conditions must both hold', () => {
      const both = rule({ condition: { coordinator: 'Omar Rajab', phaseId: 'phase-design' } });
      const base = row({ coordinator: 'Omar Rajab', phaseId: 'phase-design' });
      expect(matchingRules([both], base, { statusId: 's-installed' })).toHaveLength(1);
      expect(matchingRules([both], row({ coordinator: 'Omar Rajab' }), { statusId: 's-installed' })).toHaveLength(0);
    });
  });
});

describe('what a match does', () => {
  it('merges every set- action into one patch', () => {
    const rules = [
      rule({ id: 'a', action: { kind: 'set-phase', phaseId: 'phase-schedule' } }),
      rule({ id: 'b', action: { kind: 'set-reviewer', person: 'Omar Rajab' } }),
    ];
    expect(followUpPatch(rules, 'Aboud Yousef')).toEqual({
      phaseId: 'phase-schedule',
      reviewer: 'Omar Rajab',
    });
  });

  it('ACTOR resolves to whoever made the change, not whoever wrote the rule', () => {
    const r = [rule({ action: { kind: 'set-reviewer', person: ACTOR } })];
    expect(followUpPatch(r, 'Omar Rajab')).toEqual({ reviewer: 'Omar Rajab' });
    expect(followUpPatch(r, 'Anas Yaghmour')).toEqual({ reviewer: 'Anas Yaghmour' });
  });

  it('a require-note or post-update action contributes no field change', () => {
    const rules = [
      rule({ id: 'a', action: { kind: 'require-note' } }),
      rule({ id: 'b', action: { kind: 'post-update', text: 'installed, awaiting review' } }),
    ];
    expect(followUpPatch(rules, 'Aboud Yousef')).toEqual({});
  });

  it('post-update writes one update per rule, attributed to the actor', () => {
    const rules = [
      rule({ id: 'a', action: { kind: 'post-update', text: '  installed, awaiting review  ' } }),
      rule({ id: 'b', action: { kind: 'set-phase', phaseId: 'phase-schedule' } }),
    ];
    const posts = autoUpdates(rules, 'p1', 'Omar Rajab', T1);
    expect(posts).toHaveLength(1);
    expect(posts[0].text).toBe('installed, awaiting review');
    expect(posts[0].by).toBe('Omar Rajab');
    expect(posts[0].projectId).toBe('p1');
    expect(posts[0].kind).toBe('note');
  });

  it('picks out the rules that must be explained first', () => {
    const rules = [
      rule({ id: 'a', action: { kind: 'require-note' } }),
      rule({ id: 'b', action: { kind: 'set-phase', phaseId: 'phase-schedule' } }),
    ];
    expect(gatingRules(rules).map((r) => r.id)).toEqual(['a']);
  });
});

// The loop guard. Without it, "when status → A set status → B" paired with
// "when status → B set status → A" would never settle.
describe('there is no cascade', () => {
  it('a follow-up patch is not fed back through matching', () => {
    const rules = [
      rule({ id: 'a', trigger: { kind: 'status-to', statusId: 's-installed' }, action: { kind: 'set-status', statusId: 'status-working' } }),
      rule({ id: 'b', trigger: { kind: 'status-to', statusId: 'status-working' }, action: { kind: 'set-status', statusId: 's-installed' } }),
    ];
    const first = matchingRules(rules, row(), { statusId: 's-installed' });
    expect(first.map((r) => r.id)).toEqual(['a']);

    const follow = followUpPatch(first, 'Aboud Yousef');
    expect(follow).toEqual({ statusId: 'status-working' });
    // Rule 'b' WOULD match that follow-up — the engine simply never asks.
    expect(matchingRules(rules, row(), follow).map((r) => r.id)).toEqual(['b']);
  });
});

describe('describeRule', () => {
  it('reads as one plain sentence', () => {
    expect(describeRule(rule(), LABELS)).toBe(
      'When a project moves to “Installed” → set Design/Schedule to “Schedule”.',
    );
  });

  it('names the condition when there is one', () => {
    const r = rule({ condition: { coordinator: 'Omar Rajab' } });
    expect(describeRule(r, LABELS)).toContain('and the coordinator is Omar Rajab');
  });

  it('says what ACTOR means instead of showing the sentinel', () => {
    const r = rule({ action: { kind: 'set-reviewer', person: ACTOR } });
    expect(describeRule(r, LABELS)).toContain('whoever made the change');
    expect(describeRule(r, LABELS)).not.toContain('__actor__');
  });

  it('shows an unfinished rule as a gap rather than inventing a value', () => {
    const r = rule({ trigger: { kind: 'status-to' }, action: { kind: 'set-phase' } });
    expect(describeRule(r, LABELS)).toContain('…');
  });

  it('survives a label that has been deleted under it', () => {
    const r = rule({ trigger: { kind: 'status-to', statusId: 'long-gone' } });
    expect(describeRule(r, LABELS)).toContain('a deleted label');
  });

  it('covers every trigger and action kind — no sentence is missing', () => {
    const triggers: AutomationRule['trigger'][] = [
      { kind: 'status-to', statusId: 's-installed' },
      { kind: 'rating-at-least', rating: 4 },
      { kind: 'project-created' },
    ];
    const actions: AutomationRule['action'][] = [
      { kind: 'require-note' },
      { kind: 'set-status', statusId: 's-installed' },
      { kind: 'set-phase', phaseId: 'phase-design' },
      { kind: 'set-coordinator', person: 'Omar Rajab' },
      { kind: 'set-reviewer', person: ACTOR },
      { kind: 'post-update', text: 'done' },
    ];
    for (const trigger of triggers) {
      for (const action of actions) {
        const text = describeRule(rule({ trigger, action }), LABELS);
        expect(text.startsWith('When ')).toBe(true);
        expect(text).toContain('→');
        expect(text).not.toContain('undefined');
      }
    }
  });
});

// The other half of Aboud's ask: "have the current automation appear there
// editable". These are DESCRIBED from the live labels, not reimplemented.
describe('the behaviours the board already had', () => {
  it('describes all seven', () => {
    expect(builtInRules(LABELS)).toHaveLength(7);
  });

  it('reads the real labels, so it describes THIS board', () => {
    const texts = builtInRules(LABELS).map((r) => r.text);
    expect(texts.some((t) => t.includes('“Done”'))).toBe(true);
    expect(texts.some((t) => t.includes('“New project”'))).toBe(true);
  });

  it('lists several labels readably, with an "and" before the last', () => {
    const withTwo: BoardLabel[] = [
      ...LABELS,
      { ...LABELS[0], id: 'pu', name: 'Pending Update', isDefault: false, isDone: false },
      { ...LABELS[0], id: 'pai', name: 'Pending Additional Information', isDefault: false, isDone: false },
    ];
    const note = builtInRules(withTwo).find((r) => r.id === 'requires-note')!;
    expect(note.text).toContain('“Pending Update”');
    expect(note.text).toContain('and “Pending Additional Information”');
  });

  it('says "nothing yet" rather than trailing off when no label qualifies', () => {
    const bare = LABELS.filter((l) => !l.isDone);
    expect(builtInRules(bare).find((r) => r.id === 'done')!.text).toContain('nothing yet');
  });

  it('points at the control that edits it, where there is one', () => {
    const rules = builtInRules(LABELS);
    expect(rules.find((r) => r.id === 'rating-reason')!.knob).toBe('rating');
    expect(rules.find((r) => r.id === 'review')!.knob).toBe('status-labels');
    // Aging has no knob — saying so beats offering a button that does nothing.
    expect(rules.find((r) => r.id === 'aging')!.knob).toBeUndefined();
  });
});
