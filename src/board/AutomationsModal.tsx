// "Automations" — the board's rules, in one place, in plain English.
//
// Aboud 2026-11-05: "why I can't create my own automations inside the website
// for the board? and have the current automation appear there editable?"
//
// Two halves, and they are deliberately different:
//
//   BUILT IN   the seven behaviours the board has always had. DESCRIBED, not
//              reimplemented — each line is generated from the live labels, so
//              it says what this board actually does, and each points at the
//              control that tunes it. Rewriting working code as data would
//              have been a rewrite for no gain.
//   YOURS      rules the team writes, from a fixed vocabulary. The builder
//              shows the sentence the rule will read as, live, so a rule that
//              reads wrong is caught before it is saved.
//
// Dense: one line per rule, no box per row, footer always reachable — Aboud's
// standing preference for lists.
//
// Admin-only to CHANGE. Everyone reads: a rule can block a teammate's edit,
// and a gate with no visible author is the kind of thing people work around
// rather than ask about.

import { useState } from 'react';
import {
  ACTOR,
  builtInRules,
  describeRule,
  liveRules,
  newRule,
  ruleIsComplete,
} from '../lib/automations';
import { labelsFor } from '../lib/board';
import { RATING_NEEDS_REASON } from '../lib/updates';
import type { AutomationRule, BoardLabel, LabelColumnKey } from './types';

interface Props {
  labels: BoardLabel[];
  automations: AutomationRule[] | undefined;
  roster: string[];
  isAdmin: boolean;
  /** Upsert one rule (BoardTab stamps updatedAt/updatedBy). */
  onSave: (rule: AutomationRule) => void;
  /** Tombstone one rule — never a splice, or a sync would resurrect it. */
  onDelete: (rule: AutomationRule) => void;
  /** Open Edit labels on a column, for a built-in rule's knob. */
  onEditLabels: (columnKey: LabelColumnKey) => void;
  me: string;
  onClose: () => void;
}

const TRIGGERS: { kind: AutomationRule['trigger']['kind']; label: string }[] = [
  { kind: 'status-to', label: 'a project moves to a status' },
  { kind: 'rating-at-least', label: 'a project is rated at least' },
  { kind: 'project-created', label: 'a project is added to the board' },
];

const ACTIONS: { kind: AutomationRule['action']['kind']; label: string }[] = [
  { kind: 'require-note', label: 'ask for an update first' },
  { kind: 'set-status', label: 'set the status' },
  { kind: 'set-phase', label: 'set Design/Schedule' },
  { kind: 'set-coordinator', label: 'set the SOW coordinator' },
  { kind: 'set-reviewer', label: 'set the reviewer' },
  { kind: 'post-update', label: 'post an update' },
];

/** The WHEN / IF / THEN editor for one rule, draft or existing. */
function RuleBuilder({
  draft,
  labels,
  roster,
  onChange,
  onSave,
  onCancel,
}: {
  draft: AutomationRule;
  labels: BoardLabel[];
  roster: string[];
  onChange: (next: AutomationRule) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const statuses = labelsFor(labels, 'status');
  const phases = labelsFor(labels, 'phase');
  const ready = ruleIsComplete(draft);
  const { trigger, action } = draft;

  const people = (
    <>
      <option value="">— pick someone —</option>
      <option value={ACTOR}>whoever made the change</option>
      {roster.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </>
  );

  return (
    <div className="board-auto-builder">
      <div className="board-auto-line">
        <span className="board-auto-kw">When</span>
        <select
          aria-label="Trigger"
          value={trigger.kind}
          onChange={(e) =>
            // Reset the trigger's own fields: a rating left over from a
            // previous choice would make an incomplete rule look complete.
            onChange({ ...draft, trigger: { kind: e.target.value as AutomationRule['trigger']['kind'] } })
          }
        >
          {TRIGGERS.map((t) => (
            <option key={t.kind} value={t.kind}>
              {t.label}
            </option>
          ))}
        </select>
        {trigger.kind === 'status-to' && (
          <select
            aria-label="Trigger status"
            value={trigger.statusId ?? ''}
            onChange={(e) => onChange({ ...draft, trigger: { ...trigger, statusId: e.target.value } })}
          >
            <option value="">— pick a status —</option>
            {statuses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {trigger.kind === 'rating-at-least' && (
          <select
            aria-label="Trigger rating"
            value={trigger.rating ?? ''}
            onChange={(e) => onChange({ ...draft, trigger: { ...trigger, rating: Number(e.target.value) } })}
          >
            <option value="">— pick —</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}★
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="board-auto-line">
        <span className="board-auto-kw">And only if</span>
        <select
          aria-label="Condition coordinator"
          value={draft.condition?.coordinator ?? ''}
          onChange={(e) =>
            onChange({ ...draft, condition: { ...draft.condition, coordinator: e.target.value || undefined } })
          }
        >
          <option value="">any coordinator</option>
          {roster.map((n) => (
            <option key={n} value={n}>
              the coordinator is {n}
            </option>
          ))}
        </select>
        <select
          aria-label="Condition phase"
          value={draft.condition?.phaseId ?? ''}
          onChange={(e) => onChange({ ...draft, condition: { ...draft.condition, phaseId: e.target.value || undefined } })}
        >
          <option value="">any Design/Schedule</option>
          {phases.map((l) => (
            <option key={l.id} value={l.id}>
              Design/Schedule is {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="board-auto-line">
        <span className="board-auto-kw">Then</span>
        <select
          aria-label="Action"
          value={action.kind}
          onChange={(e) => onChange({ ...draft, action: { kind: e.target.value as AutomationRule['action']['kind'] } })}
        >
          {ACTIONS.map((a) => (
            <option key={a.kind} value={a.kind}>
              {a.label}
            </option>
          ))}
        </select>
        {action.kind === 'set-status' && (
          <select
            aria-label="Action status"
            value={action.statusId ?? ''}
            onChange={(e) => onChange({ ...draft, action: { ...action, statusId: e.target.value } })}
          >
            <option value="">— pick a status —</option>
            {statuses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {action.kind === 'set-phase' && (
          <select
            aria-label="Action phase"
            value={action.phaseId ?? ''}
            onChange={(e) => onChange({ ...draft, action: { ...action, phaseId: e.target.value } })}
          >
            <option value="">— pick one —</option>
            {phases.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {(action.kind === 'set-coordinator' || action.kind === 'set-reviewer') && (
          <select
            aria-label="Action person"
            value={action.person ?? ''}
            onChange={(e) => onChange({ ...draft, action: { ...action, person: e.target.value } })}
          >
            {people}
          </select>
        )}
        {action.kind === 'post-update' && (
          <input
            aria-label="Action update text"
            placeholder="the update to post"
            value={action.text ?? ''}
            onChange={(e) => onChange({ ...draft, action: { ...action, text: e.target.value } })}
          />
        )}
      </div>

      {/* The sentence the list will show. Reading the rule back before saving
          is what catches "when status → A, set status → A". */}
      <p className="board-auto-preview" aria-live="polite">
        {describeRule(draft, labels)}
      </p>

      <div className="board-auto-line">
        <button type="button" className="btn small secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn small primary"
          disabled={!ready}
          title={ready ? 'Save this automation for the whole team' : 'Fill in every blank first'}
          onClick={onSave}
        >
          Save automation
        </button>
      </div>
    </div>
  );
}

export default function AutomationsModal({
  labels,
  automations,
  roster,
  isAdmin,
  onSave,
  onDelete,
  onEditLabels,
  me,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<AutomationRule | null>(null);
  const rules = liveRules(automations);
  const built = builtInRules(labels);

  const save = () => {
    if (!draft || !ruleIsComplete(draft)) return;
    onSave(draft);
    setDraft(null);
  };

  return (
    // `.modal.wide` is padding:0 / overflow:hidden on purpose — it expects a
    // padded header, ONE scrolling body, and a padded footer (the .upd-top
    // convention). Laying the content out flat left "Save automation" clipped
    // below the fold on a 812px screen, which made the builder unusable
    // (caught running the real board, 2026-11-05).
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide board-auto-modal" onClick={(e) => e.stopPropagation()}>
        <div className="board-auto-top">
          <h3>Automations</h3>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Everything the board does on its own. These are shared — a rule here applies to the whole team.
            {!isAdmin && ' Only an admin can change them.'}
          </p>
        </div>

        <div className="board-auto-body">
        <h4 className="board-auto-head">Built in</h4>
        <ul className="board-auto-list">
          {built.map((b) => (
            <li key={b.id} className="board-auto-item">
              <span className="board-auto-text">{b.text}</span>
              {/* The one built-in with no UI of its own: saying so beats a
                  button that cannot do anything. */}
              {b.knob === 'rating' && (
                <span className="muted board-auto-knob">fixed at {RATING_NEEDS_REASON}★ and up</span>
              )}
              {(b.knob === 'status-labels' || b.knob === 'phase-labels') && (
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => onEditLabels(b.knob === 'phase-labels' ? 'phase' : 'status')}
                  title={`Edit ${b.knobLabel} in Edit labels`}
                >
                  {b.knobLabel} →
                </button>
              )}
            </li>
          ))}
        </ul>

        <h4 className="board-auto-head">
          Yours
          <span className="board-done-count">{rules.length}</span>
        </h4>

        {rules.length === 0 && !draft && (
          <p className="muted">
            None yet. An automation saves a step you take every time — for example, when a project moves to
            “Installed”, set Design/Schedule to “Schedule”.
          </p>
        )}

        <ul className="board-auto-list">
          {rules.map((r) => (
            <li key={r.id} className={`board-auto-item${r.enabled ? '' : ' off'}`}>
              <label className="board-label-flag" title={r.enabled ? 'On — click to pause' : 'Paused'}>
                <input
                  type="checkbox"
                  aria-label={`Enable ${describeRule(r, labels)}`}
                  checked={r.enabled}
                  disabled={!isAdmin}
                  onChange={(e) => onSave({ ...r, enabled: e.target.checked })}
                />
                on
              </label>
              <span className="board-auto-text">{describeRule(r, labels)}</span>
              <span className="muted board-auto-by">{r.createdBy}</span>
              {isAdmin && (
                <button
                  type="button"
                  className="btn small secondary"
                  aria-label={`Delete ${describeRule(r, labels)}`}
                  title="Delete this automation for the whole team"
                  onClick={() => onDelete(r)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>

        {draft ? (
          <RuleBuilder
            draft={draft}
            labels={labels}
            roster={roster}
            onChange={setDraft}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        ) : (
          isAdmin && (
            <button type="button" className="btn small secondary" onClick={() => setDraft(newRule(me))}>
              + New automation
            </button>
          )
        )}
        </div>

        <div className="modal-actions board-auto-foot">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
