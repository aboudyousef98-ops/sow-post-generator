// "View activity" — the field-level history of one board row, newest first
// (spec §6.5). Values were resolved to display strings when the entry was
// written, so renamed labels/people keep their historical wording.

import { fieldLabel } from '../lib/board';
import { relativeTime } from '../lib/dates';
import type { BoardActivity, BoardProject } from './types';

const ACTION_TEXT: Record<BoardActivity['action'], string> = {
  create: 'created the project',
  update: 'changed',
  archive: 'archived the project',
  restore: 'restored the project',
  delete: 'deleted the project',
};

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
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Activity — {project.name}</h3>
        {entries.length === 0 ? (
          <p className="muted">No recorded activity yet.</p>
        ) : (
          <div className="board-activity">
            {entries.map((e) => (
              <div key={e.id} className="board-activity-row">
                <div>
                  <b>{e.actor || 'Unknown'}</b> {ACTION_TEXT[e.action]}
                  {e.action === 'update' && e.changes && (
                    <ul>
                      {Object.entries(e.changes).map(([key, change]) => (
                        <li key={key}>
                          {fieldLabel(key)}: <span className="muted">{change.old}</span> → <b>{change.new}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className="cell-meta nowrap" title={new Date(e.at).toLocaleString()}>
                  {relativeTime(e.at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
