// A project's Updates thread (Aboud 2026-10-17 #2, "like Monday.com").
//
// It shares the notes composers' formatting toolbar and renderer, so an update
// written here looks the same as a SOW note and pastes into Slack the same way.
//
// Activity (machine-written field history) stays in its own modal. This is the
// human half: prose, edited and deleted by the person who wrote it.

import { useRef, useState } from 'react';
import FormatToolbar, { continueList, formatHotkey } from '../components/FormatToolbar';
import RichText from '../components/RichText';
import { relativeTime } from '../lib/dates';
import { deleteUpdate, editUpdate, newUpdate, updatesFor } from '../lib/updates';
import type { BoardProject, ProjectUpdate, UpdateKind } from './types';

const KIND_BADGE: Partial<Record<UpdateKind, string>> = {
  rating: 'Rating reason',
  'pending-info': 'Missing info',
  // Any other status the team flagged "needs a note" (Aboud 2026-11-05).
  status: 'Status reason',
};

const initials = (n: string) =>
  (n || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function UpdatesModal({
  project,
  updates,
  me,
  isAdmin,
  onPut,
  onClose,
}: {
  project: BoardProject;
  updates: ProjectUpdate[];
  me: string;
  isAdmin: boolean;
  /** Upsert one update — the board owns the write. */
  onPut: (u: ProjectUpdate) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const thread = updatesFor(updates, project.id);

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    onPut(newUpdate(project.id, text, me));
    setDraft('');
  };

  const saveEdit = (u: ProjectUpdate) => {
    const text = editDraft.trim();
    if (!text) return;
    if (text !== u.text) onPut(editUpdate(u, text, me));
    setEditingId(null);
    setEditDraft('');
  };

  // You can edit or remove your own update; an admin can remove anyone's.
  const mayEdit = (u: ProjectUpdate) => u.by === me;
  const mayDelete = (u: ProjectUpdate) => u.by === me || isAdmin;

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* `.modal.wide` is padding:0 / overflow:hidden, so this lays itself out
          as header + composer / scrolling thread / footer. Letting the thread
          grow the modal pushed Close off the bottom of the screen. */}
      <div className="modal wide upd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upd-top">
          <h3>Updates — {project.name}</h3>

        <div className="upd-composer">
          <FormatToolbar taRef={composerRef} value={draft} onChange={setDraft} label="New update" />
          <textarea
            ref={composerRef}
            value={draft}
            aria-label="New update"
            rows={3}
            placeholder="Post an update for the team…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                post();
                return;
              }
              if (formatHotkey(e, composerRef, draft, setDraft)) return;
              continueList(e, composerRef, draft, setDraft);
            }}
            style={{ marginTop: 0 }}
          />
          <div className="upd-composer-foot">
            <span className="muted">
              Posting as <strong>{me}</strong> · Ctrl+Enter to post
            </span>
            <button type="button" className="btn primary small" disabled={!draft.trim()} onClick={post}>
              Post update
            </button>
          </div>
        </div>

          <div className="upd-head">
            <h4>
              {thread.length} update{thread.length === 1 ? '' : 's'}
            </h4>
            <span className="muted">Newest first</span>
          </div>
        </div>

        <div className="upd-thread">
          {thread.length === 0 && <p className="muted">No updates yet — post the first one above.</p>}

          {thread.map((u) => (
            <article key={u.id} className="upd-item">
              {/* Who, when and the tag all on ONE line — this used to stack
                  into three rows for a single line of text. */}
              <div className="upd-item-head">
                <span className="upd-avatar">{initials(u.by)}</span>
                <strong className="upd-who">{u.by}</strong>
                <span className="muted nowrap" title={new Date(u.at).toLocaleString()}>
                  {relativeTime(u.at)}
                  {u.editedAt && ' · edited'}
                </span>
                {KIND_BADGE[u.kind] && (
                  <span className={`upd-badge upd-badge-${u.kind}`}>
                    {KIND_BADGE[u.kind]}
                    {u.kind === 'rating' && u.rating ? ` · ${u.rating}★` : ''}
                  </span>
                )}
              </div>

              {editingId === u.id ? (
                <>
                  <FormatToolbar taRef={editRef} value={editDraft} onChange={setEditDraft} label="Edit update" />
                  <textarea
                    ref={editRef}
                    value={editDraft}
                    aria-label="Edit update"
                    rows={4}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        saveEdit(u);
                        return;
                      }
                      if (e.key === 'Escape') {
                        setEditingId(null);
                        return;
                      }
                      if (formatHotkey(e, editRef, editDraft, setEditDraft)) return;
                      continueList(e, editRef, editDraft, setEditDraft);
                    }}
                    style={{ marginTop: 0 }}
                  />
                  <div className="upd-actions edit">
                    <button type="button" className="btn primary small" onClick={() => saveEdit(u)}>
                      Save
                    </button>
                    <button type="button" className="btn secondary small" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <RichText text={u.text} />
                  {/* Kept together on the left and dimmed until hover — Edit
                      and Delete were pinned to opposite edges of the row. */}
                  <div className="upd-actions">
                    {mayEdit(u) && (
                      <button
                        type="button"
                        className="upd-action"
                        onClick={() => {
                          setEditingId(u.id);
                          setEditDraft(u.text);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {mayDelete(u) && (
                      <button type="button" className="upd-action danger" onClick={() => onPut(deleteUpdate(u, me))}>
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </article>
          ))}
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
