import { useMemo, useState } from 'react';
import { isoToUs } from '../lib/dates';
import { applyQuery, authorsIn, defaultQuery } from '../lib/listQuery';
import { missingRequired } from '../lib/template';
import type { PostRecord } from '../types';
import ListControls from './ListControls';

interface Props {
  drafts: PostRecord[];
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Freeze the draft and send it to History, without opening it in Compose. */
  onMarkDone: (id: string) => void;
}

export default function DraftsTab({ drafts, onOpen, onDuplicate, onDelete, onMarkDone }: Props) {
  const [query, setQuery] = useState(() => defaultQuery('updated'));
  // Two-step confirm: marking done freezes the post text, so it must not be a
  // single stray click. Inline rather than window.confirm (Aboud: simple UI).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const shown = useMemo(() => applyQuery(drafts, query), [drafts, query]);

  if (drafts.length === 0) {
    return (
      <div className="card">
        <h3>Drafts</h3>
        <p className="muted">
          No drafts yet. A draft is saved automatically as soon as you fill in any field in Compose — or
          click <b>💾 Save as Draft</b> to save it right away.
        </p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>Drafts</h3>
      <ListControls
        query={query}
        onChange={setQuery}
        authors={authorsIn(drafts)}
        sortOptions={['updated', 'installDate', 'customer', 'level', 'region', 'author']}
        count={shown.length}
        total={drafts.length}
      />
      <table className="list">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Install date</th>
            <th>Level</th>
            <th>Author</th>
            <th>Last edited</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => {
            const missing = missingRequired(d);
            return (
              <tr key={d.id} className="row" onClick={() => onOpen(d.id)}>
                <td>{d.sf.customerName || <span className="muted">Untitled draft</span>}</td>
                <td>{d.sf.installScheduledDate ? isoToUs(d.sf.installScheduledDate) : '—'}</td>
                <td>L{d.level}</td>
                <td>{d.author}</td>
                <td>{new Date(d.updatedAt).toLocaleString()}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {confirmId === d.id ? (
                    <div className="row-actions">
                      <span className="muted">
                        Send <b>{d.sf.customerName || 'this draft'}</b> (L{d.level}) to History?
                      </span>
                      <button
                        type="button"
                        className="btn small primary"
                        onClick={() => {
                          onMarkDone(d.id);
                          setConfirmId(null);
                        }}
                      >
                        Yes, mark as done
                      </button>
                      <button type="button" className="btn small secondary" onClick={() => setConfirmId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={missing.length > 0}
                        title={
                          missing.length
                            ? `Missing before this can be posted: ${missing.join(', ')}`
                            : 'Freeze the post and send it to History'
                        }
                        onClick={() => setConfirmId(d.id)}
                      >
                        ✅ Mark as done
                      </button>
                      <button type="button" className="btn small secondary" onClick={() => onOpen(d.id)}>
                        Open
                      </button>
                      <button type="button" className="btn small secondary" onClick={() => onDuplicate(d.id)}>
                        Duplicate
                      </button>
                      <button type="button" className="btn small danger" onClick={() => onDelete(d.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
