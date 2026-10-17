// "View activity" — the field-level history of one board row, newest first
// (spec §6.5). Values were resolved to display strings when the entry was
// written, so renamed labels/people keep their historical wording.
//
// Reached from the "Last update" cell (Aboud 2026-10-17). Laid out to match
// UpdatesModal: header / scrolling list / footer, ONE line per change. The
// first cut stacked "<name> changed" above a bulleted "<field>: a → b", which
// cost two rows and a bullet glyph to say one thing.

import { fieldLabel } from '../lib/board';
import { relativeTime } from '../lib/dates';
import type { BoardActivity, BoardProject } from './types';

const ACTION_TEXT: Record<BoardActivity['action'], string> = {
  create: 'created the project',
  update: 'changed',
  archive: 'archived the project',
  restore: 'restored the project',
  delete: 'deleted the project',
  'update-post': 'posted an update',
  'update-edit': 'edited an update',
  'update-delete': 'deleted an update',
};

const initials = (n: string) =>
  (n || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function ActivityModal({
  project,
  activity,
  onClose,
}: {
  project: BoardProject;
  activity: BoardActivity[];
  onClose: () => void;
}) {
  const entries = activity.filter((a) => a.projectId === project.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide act-modal" onClick={(e) => e.stopPropagation()}>
        <div className="act-top">
          <h3>Activity — {project.name}</h3>
          <span className="muted">
            {entries.length} action{entries.length === 1 ? '' : 's'} · newest first
          </span>
        </div>

        <div className="act-list">
          {entries.length === 0 && <p className="muted">No recorded activity yet.</p>}

          {entries.map((e) => {
            // A field change is listed inline; several in one entry wrap onto
            // the following lines rather than becoming a bulleted list.
            const changes = e.action === 'update' ? Object.entries(e.changes ?? {}) : [];
            return (
              <div key={e.id} className="act-row">
                <span className="act-avatar" title={e.actor || 'Unknown'}>
                  {initials(e.actor)}
                </span>
                <div className="act-body">
                  <span className="act-who">{e.actor || 'Unknown'}</span>{' '}
                  {changes.length === 0 ? (
                    <span className="act-what">{ACTION_TEXT[e.action] ?? e.action}</span>
                  ) : (
                    changes.map(([key, c], i) => (
                      <span key={key} className="act-what">
                        {i > 0 && <span className="act-sep"> · </span>}
                        {fieldLabel(key)}: <span className="muted">{c.old}</span> → <b>{c.new}</b>
                      </span>
                    ))
                  )}
                </div>
                <span className="act-when nowrap" title={new Date(e.at).toLocaleString()}>
                  {relativeTime(e.at)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
