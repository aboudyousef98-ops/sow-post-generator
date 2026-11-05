// Board automations — "when this happens, do that".
//
// Aboud 2026-11-05: "why I can't create my own automations inside the website
// for the board? and have the current automation appear there editable?"
//
// THE SHAPE, and why it is this small.
//
// There is no server here that can run a job: Netlify Functions + Blobs and a
// client that syncs by polling (same constraint the notification bell was
// designed around — see lib/notifications.ts). That rules out time-based
// triggers like "nothing happened for 7 days": they could only ever fire when
// somebody happens to have the board open, and three open browsers would each
// fire them, so they would need a dedup table in the blob to stay honest.
//
// So v1 triggers on CHANGES only. Every change already funnels through one
// place (BoardTab.applyPatch), it runs on the client that made the change, and
// it therefore fires exactly once with no bookkeeping at all. Time-based rules
// are a later, bigger conversation.
//
// The other half of the ask — "have the current automation appear there
// editable" — is builtInRules() below: the seven behaviours the board has
// always had, described in the same words as the custom ones, each pointing at
// the control that edits it. They are NOT reimplemented as rules; that would
// be a rewrite of working code for no gain. They are made visible.

import type {
  AutomationRule,
  BoardLabel,
  BoardProject,
  ProjectUpdate,
} from '../board/types';
import { labelById, type ProjectPatch } from './board';
import { newUpdate } from './updates';
import { isOutOfScopeLabel, isReviewLabel } from './board';
import { RATING_NEEDS_REASON, labelRequiresNote } from './updates';

/**
 * "Whoever made the change" — stored instead of a name so a rule like "when a
 * project goes to Installation Review, make me the reviewer" keeps meaning the
 * person who moved it, not whoever happened to write the rule.
 */
export const ACTOR = '__actor__';

export function liveRules(rules: AutomationRule[] | undefined): AutomationRule[] {
  return (rules ?? [])
    .filter((r) => !r.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Rules that are actually allowed to fire. */
export function enabledRules(rules: AutomationRule[] | undefined): AutomationRule[] {
  return liveRules(rules).filter((r) => r.enabled);
}

export function newRule(actor: string, now: string = new Date().toISOString()): AutomationRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    trigger: { kind: 'status-to' },
    action: { kind: 'require-note' },
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  };
}

/**
 * A rule is only savable once every field its own trigger and action need is
 * filled. Half a rule that fires on "any status" would be a trap.
 */
export function ruleIsComplete(rule: AutomationRule): boolean {
  const { trigger, action } = rule;
  if (trigger.kind === 'status-to' && !trigger.statusId) return false;
  if (trigger.kind === 'rating-at-least' && !trigger.rating) return false;
  if (action.kind === 'set-status' && !action.statusId) return false;
  if (action.kind === 'set-phase' && !action.phaseId) return false;
  if ((action.kind === 'set-coordinator' || action.kind === 'set-reviewer') && !action.person) return false;
  if (action.kind === 'post-update' && !action.text?.trim()) return false;
  return true;
}

// ---- matching ---------------------------------------------------------------

function triggerFires(rule: AutomationRule, before: BoardProject | null, patch: ProjectPatch): boolean {
  const t = rule.trigger;
  if (t.kind === 'project-created') return before === null;
  // Every other trigger is about a change to an existing row.
  if (before === null) return false;
  if (t.kind === 'status-to') {
    return 'statusId' in patch && Boolean(t.statusId) && patch.statusId === t.statusId;
  }
  if (t.kind === 'rating-at-least') {
    const next = patch.rating;
    return 'rating' in patch && typeof next === 'number' && typeof t.rating === 'number' && next >= t.rating;
  }
  return false;
}

/**
 * Conditions are read against the row AS IT WILL BE, patch applied — asking
 * "is the coordinator Omar" about the row before the change would answer the
 * wrong question when the change IS the coordinator.
 */
function conditionHolds(rule: AutomationRule, before: BoardProject | null, patch: ProjectPatch): boolean {
  const c = rule.condition;
  if (!c) return true;
  const after = { ...(before ?? {}), ...patch } as Partial<BoardProject>;
  if (c.coordinator && (after.coordinator ?? '') !== c.coordinator) return false;
  if (c.phaseId && (after.phaseId ?? null) !== c.phaseId) return false;
  return true;
}

/**
 * Which rules this change fires. `before === null` means a brand-new project.
 *
 * Callers pass the patch the USER asked for, never a follow-up this function
 * produced — see followUpPatch for why there is no cascade.
 */
export function matchingRules(
  rules: AutomationRule[] | undefined,
  before: BoardProject | null,
  patch: ProjectPatch,
): AutomationRule[] {
  return enabledRules(rules).filter(
    (r) => ruleIsComplete(r) && triggerFires(r, before, patch) && conditionHolds(r, before, patch),
  );
}

// ---- what a match does ------------------------------------------------------

/**
 * The field changes the matched rules want, merged into one patch.
 *
 * Merged with the user's patch in a SINGLE write, so the activity log shows one
 * entry reading "Status → Installed, Design/Schedule → Schedule" rather than
 * two events a sync could interleave.
 *
 * SINGLE PASS, NO CASCADE: the result is never fed back through matchingRules.
 * That is the loop guard — "when status → A, set status → B" plus "when status
 * → B, set status → A" would otherwise never settle. The cost is that rules do
 * not chain, which is a price worth paying for a rule engine nobody has to
 * debug.
 */
export function followUpPatch(rules: AutomationRule[], actor: string): ProjectPatch {
  const patch: ProjectPatch = {};
  for (const r of rules) {
    const a = r.action;
    const person = a.person === ACTOR ? actor : a.person;
    if (a.kind === 'set-status' && a.statusId) patch.statusId = a.statusId;
    else if (a.kind === 'set-phase' && a.phaseId) patch.phaseId = a.phaseId;
    else if (a.kind === 'set-coordinator' && person) patch.coordinator = person;
    else if (a.kind === 'set-reviewer' && person) patch.reviewer = person;
  }
  return patch;
}

/** The posts the matched rules want written to the project's thread. */
export function autoUpdates(
  rules: AutomationRule[],
  projectId: string,
  actor: string,
  now: string = new Date().toISOString(),
): ProjectUpdate[] {
  return rules
    .filter((r) => r.action.kind === 'post-update' && r.action.text?.trim())
    .map((r) => newUpdate(projectId, r.action.text as string, actor, 'note', {}, now));
}

/** Rules that must be explained before the change is allowed to land. */
export function gatingRules(rules: AutomationRule[]): AutomationRule[] {
  return rules.filter((r) => r.action.kind === 'require-note');
}

// ---- plain English ----------------------------------------------------------

const TRIGGER_WORDS: Record<AutomationRule['trigger']['kind'], string> = {
  'status-to': 'a project moves to',
  'rating-at-least': 'a project is rated',
  'project-created': 'a project is added to the board',
};

function personWords(person: string | undefined): string {
  if (!person) return 'nobody';
  return person === ACTOR ? 'whoever made the change' : person;
}

/**
 * One sentence describing a rule, used BOTH by the list and by the builder's
 * live preview — so what you read while building is what the list will say,
 * and a rule that reads wrong can be caught before it is saved.
 */
export function describeRule(rule: AutomationRule, labels: BoardLabel[]): string {
  const name = (id: string | undefined) => (id ? (labelById(labels, id)?.name ?? 'a deleted label') : '…');
  const t = rule.trigger;
  let when = TRIGGER_WORDS[t.kind];
  if (t.kind === 'status-to') when += ` “${name(t.statusId)}”`;
  if (t.kind === 'rating-at-least') when += ` ${t.rating ?? '…'}★ or higher`;

  const parts: string[] = [];
  if (rule.condition?.coordinator) parts.push(`the coordinator is ${rule.condition.coordinator}`);
  if (rule.condition?.phaseId) parts.push(`Design/Schedule is “${name(rule.condition.phaseId)}”`);
  const iff = parts.length ? `, and ${parts.join(' and ')}` : '';

  const a = rule.action;
  let then: string;
  switch (a.kind) {
    case 'require-note':
      then = 'ask for an update first, and refuse the change without one';
      break;
    case 'set-status':
      then = `set the status to “${name(a.statusId)}”`;
      break;
    case 'set-phase':
      then = `set Design/Schedule to “${name(a.phaseId)}”`;
      break;
    case 'set-coordinator':
      then = `make ${personWords(a.person)} the SOW coordinator`;
      break;
    case 'set-reviewer':
      then = `make ${personWords(a.person)} the reviewer`;
      break;
    case 'post-update':
      then = `post the update “${a.text?.trim() || '…'}”`;
      break;
  }
  return `When ${when}${iff} → ${then}.`;
}

// ---- the behaviours the board already had -----------------------------------

/**
 * Where the knob for a built-in rule lives, so the panel can offer a way in
 * rather than just describing something the reader cannot reach.
 */
export type BuiltInKnob = 'rating' | 'status-labels' | 'phase-labels';

export interface BuiltInRule {
  id: string;
  text: string;
  /** Which control edits it, or undefined when there is nothing to tune. */
  knob?: BuiltInKnob;
  knobLabel?: string;
}

/** The qualifying status names, read out loud — or null when there are none. */
const list = (labels: BoardLabel[], pick: (l: BoardLabel) => boolean): string | null => {
  const names = labels.filter((l) => l.columnKey === 'status' && !l.archived && pick(l)).map((l) => `“${l.name}”`);
  if (!names.length) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * One built-in's sentence, with a DIFFERENT sentence when no status qualifies.
 *
 * Splicing a placeholder into the normal sentence produced "When a project
 * moves to nothing yet → move it to the Installation Review section", which is
 * not English and does not tell anyone what to do about it (caught running the
 * real board, 2026-11-05). The empty case says what is missing instead.
 */
const movesTo = (names: string | null, effect: string, flag: string): string =>
  names
    ? `When a project moves to ${names} → ${effect}.`
    : `No status is marked “${flag}” yet — tick one in Edit labels and ${effect}.`;

/**
 * The seven things the board has always done, in the same voice as the custom
 * rules. Read off the live labels, so the panel describes THIS board rather
 * than a documented ideal that may have drifted.
 */
export function builtInRules(labels: BoardLabel[]): BuiltInRule[] {
  return [
    {
      id: 'rating-reason',
      text: `When a project is rated ${RATING_NEEDS_REASON}★ or higher → ask why first, and post the answer to Updates.`,
      knob: 'rating',
      knobLabel: 'threshold',
    },
    {
      id: 'requires-note',
      text: movesTo(
        list(labels, labelRequiresNote),
        'ask for an update first, and refuse the change without one',
        'needs a note',
      ),
      knob: 'status-labels',
      knobLabel: 'which statuses',
    },
    {
      id: 'done',
      text: movesTo(list(labels, (l) => l.isDone), 'move it to the Completed section', 'done'),
      knob: 'status-labels',
      knobLabel: 'which statuses',
    },
    {
      id: 'review',
      text: movesTo(
        list(labels, isReviewLabel),
        'move it to the Installation Review section, where the Reviewer column lives',
        'installation review',
      ),
      knob: 'status-labels',
      knobLabel: 'which statuses',
    },
    {
      id: 'scope',
      text: movesTo(
        list(labels, isOutOfScopeLabel),
        'move it to the Out of SOW scope section',
        'out of scope',
      ),
      knob: 'status-labels',
      knobLabel: 'which statuses',
    },
    {
      id: 'default-status',
      text: (() => {
        const names = list(labels, (l) => l.isDefault);
        return names
          ? `When a project is added to the board → give it ${names}, and make whoever added it the SOW coordinator.`
          : 'When a project is added to the board → make whoever added it the SOW coordinator. No status is marked “default” yet, so it starts blank.';
      })(),
      knob: 'status-labels',
      knobLabel: 'which status',
    },
    {
      id: 'aging',
      text: 'When an install date passes, or nobody touches a project for 14 days → flag it with a dot, and collect it under the "Needs attention" view.',
    },
  ];
}
