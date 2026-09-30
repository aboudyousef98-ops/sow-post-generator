import { useEffect, useMemo, useRef, useState } from 'react';
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
  onNewPost: () => void;
}

/** Phase 8: the Readiness column. Three states, from missingRequired(). */
function readiness(missing: string[]): { text: string; state: 'ready' | 'nearly' | 'missing' } {
  if (missing.length === 0) return { text: 'Ready', state: 'ready' };
  if (missing.length === 1) return { text: `Missing ${missing[0].toLowerCase()}`, state: 'nearly' };
  return { text: `Missing ${missing.length} fields`, state: 'missing' };
}

/** Per-row ··· menu: the actions that are not the common one. */
function RowMenu({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="more-menu" ref={ref}>
      <button
        type="button"
        className="btn small secondary more-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        title="Duplicate · Delete"
        onClick={() => setOpen((v) => !v)}
      >
        ···
      </button>
      {open && (
        <div className="more-panel" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDuplicate(); }}>
            Duplicate
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function DraftsTab({ drafts, onOpen, onDuplicate, onDelete, onMarkDone, onNewPost }: Props) {
  const [query, setQuery] = useState(() => defaultQuery('updated'));
  // Two-step confirm: marking done freezes the post text, so it must not be a
  // single stray click. Inline rather than window.confirm (Aboud: simple UI).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const shown = useMemo(() => applyQuery(drafts, query), [drafts, query]);

  return (
    <div className="list-page">
      <div className="list-head">
        <h1>Drafts</h1>
        <span className="muted">
          {drafts.length === 0
            ? 'nothing in progress'
            : `${drafts.length} in progress · saved automatically`}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={onNewPost}>
          + New post
        </button>
      </div>

      {drafts.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No drafts yet. A draft is saved automatically as soon as you fill in any field in Compose — or
            click <b>💾 Save</b> to save it right away.
          </p>
        </div>
      ) : (
        <div className="card list-card">
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
                <th>Install</th>
                <th>Level</th>
                <th>Readiness</th>
                <th>Edited</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const missing = missingRequired(d);
                const r = readiness(missing);
                return (
                  <tr key={d.id} className="row" onClick={() => onOpen(d.id)}>
                    <td>
                      <div className={d.sf.customerName ? 'cell-name' : 'cell-name muted'}>
                        {d.sf.customerName || 'Untitled draft'}
                      </div>
                      <div className="cell-meta">{[d.sf.region, d.author].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="nowrap">
                      {d.sf.installScheduledDate ? isoToUs(d.sf.installScheduledDate) : '—'}
                    </td>
                    <td>
                      <span className={`level-badge l${d.level}`}>L{d.level}</span>
                    </td>
                    <td>
                      <span className={`readiness-cell ${r.state}`}>
                        <span className="readiness-cell-dot" />
                        {r.text}
                      </span>
                    </td>
                    <td className="nowrap cell-meta">
                      {new Date(d.updatedAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="nowrap">
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
                            Yes, mark as posted
                          </button>
                          <button type="button" className="btn small secondary" onClick={() => setConfirmId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="row-actions">
                          {missing.length === 0 && (
                            <button
                              type="button"
                              className="btn small primary"
                              title="Freeze the post and send it to History"
                              onClick={() => setConfirmId(d.id)}
                            >
                              Mark as posted
                            </button>
                          )}
                          <button type="button" className="btn small secondary" onClick={() => onOpen(d.id)}>
                            Open
                          </button>
                          <RowMenu onDuplicate={() => onDuplicate(d.id)} onDelete={() => onDelete(d.id)} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
