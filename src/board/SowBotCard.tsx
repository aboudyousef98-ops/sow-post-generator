// The pinned SOW Bot summary card (Aboud 2026-11-26) — the parsed view of the
// bot's "*SOW Bot notes*" update, shown above the ordinary thread. It never
// replaces that update: Edit/Delete and the raw post still render normally
// further down (rule 7), exactly like any other post in the thread.

import { useState } from 'react';
import RichText from '../components/RichText';
import { formatAmmanTime, parseSowBotNotes, type FieldKey, type FieldState } from '../lib/sowBotNotes';
import type { ProjectUpdate } from './types';

const STATE_LABEL: Record<FieldState, string> = {
  ok: 'ok',
  pending: 'pending',
  blocked: 'blocked',
  unknown: 'unknown',
};

// These two fields get their own treatment (callout, collapsible) — they are
// left out of the plain label/value list so nothing prints twice.
const CALLOUT_FIELDS = new Set<FieldKey>(['blockers', 'latestSlackActivity']);

export default function SowBotCard({ update, duplicate }: { update: ProjectUpdate; duplicate: boolean }) {
  const [activityOpen, setActivityOpen] = useState(false);
  const parsed = parseSowBotNotes(update.text);
  const when = formatAmmanTime(update.at);
  const stamp = new Date(update.at).toLocaleString();

  const head = (
    <div className="sowbot-head">
      <span className="sowbot-avatar" aria-hidden="true">
        SB
      </span>
      <strong className="sowbot-name">SOW Bot</strong>
      {duplicate && (
        <span
          className="sowbot-dup-badge"
          title="More than one SOW Bot note exists for this project — showing the newest and hiding the rest."
        >
          duplicate bot notes
        </span>
      )}
      <span className="sowbot-updated" title={stamp}>
        Updated {when} Amman
      </span>
    </div>
  );

  // Rule 6: a body that doesn't fit the expected shape still shows, as-is —
  // same RichText rendering an ordinary update gets, just inside the pinned
  // card so it's still found at the top of the panel.
  if (!parsed) {
    return (
      <article className="sowbot-card" aria-label="SOW Bot notes">
        {head}
        <div className="sowbot-fallback">
          <RichText text={update.text} />
        </div>
      </article>
    );
  }

  const byKey = Object.fromEntries(parsed.fields.map((f) => [f.key, f])) as Record<
    FieldKey,
    (typeof parsed.fields)[number]
  >;
  const plainFields = parsed.fields.filter((f) => !CALLOUT_FIELDS.has(f.key));
  const blockers = byKey.blockers;
  const activity = byKey.latestSlackActivity;
  const hasActivity = activity.present && activity.value.trim().length > 0;

  return (
    <article className="sowbot-card" aria-label="SOW Bot notes">
      {head}

      <ul className="sowbot-strip" aria-label="Field status">
        {parsed.fields.map((f) => (
          <li key={f.key} className={`sowbot-chip sowbot-chip-${f.state}`} title={f.value || 'No data'}>
            {f.label}
            <span className="visually-hidden"> — {STATE_LABEL[f.state]}</span>
          </li>
        ))}
      </ul>

      <dl className="sowbot-fields">
        {plainFields.map((f) => (
          <div className="sowbot-field" key={f.key}>
            <dt>{f.label}</dt>
            <dd>{f.present && f.value ? <RichText text={f.value} /> : <span className="muted">—</span>}</dd>
          </div>
        ))}
      </dl>

      {blockers.state === 'blocked' ? (
        <div className="sowbot-callout danger">
          <strong>Blockers</strong>
          <RichText text={blockers.value} />
        </div>
      ) : (
        <div className="sowbot-callout ok">
          <strong>All clear</strong> — no blockers reported.
        </div>
      )}

      <div className="sowbot-activity">
        <button
          type="button"
          className="sowbot-activity-toggle"
          aria-expanded={activityOpen}
          onClick={() => setActivityOpen((v) => !v)}
        >
          {activityOpen ? 'Hide' : 'Show more'} — Latest Slack activity
        </button>
        {activityOpen &&
          (hasActivity ? (
            <RichText className="sowbot-activity-body" text={activity.value} />
          ) : (
            <p className="muted sowbot-activity-body">No recent activity reported.</p>
          ))}
      </div>
    </article>
  );
}
