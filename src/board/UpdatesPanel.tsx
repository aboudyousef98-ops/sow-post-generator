// A project's panel, as a Monday-style SIDE PANEL (Aboud 2026-11-15: "open on
// the side panel … with replies under each post"). Grew out of UpdatesModal:
// same thread, same composer, same Slack-requests block — now sliding in from
// the right with the board still live behind it, and each post carrying its
// replies.
//
// Non-modal on purpose: clicking another row's chip just switches the panel
// to that project. Escape or ✕ closes. Activity (machine-written field
// history) stays in its own modal; this is the human half.

import { useEffect, useRef, useState } from 'react';
import FormatToolbar, { continueList, formatHotkey } from '../components/FormatToolbar';
import RichText from '../components/RichText';
import { relativeTime } from '../lib/dates';
import { newRequest, parseSlackPaste, resolveRequest } from '../lib/requests';
import { deleteUpdate, editUpdate, newReply, newUpdate, threadRoots } from '../lib/updates';
import type { BoardProject, ProjectRequest, ProjectUpdate, UpdateKind } from './types';

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

export default function UpdatesPanel({
  project,
  updates,
  requests,
  me,
  isAdmin,
  onPut,
  onPutRequests,
  onClose,
}: {
  project: BoardProject;
  updates: ProjectUpdate[];
  /** Slack-captured requests — the ones for THIS project render here. */
  requests: ProjectRequest[];
  me: string;
  isAdmin: boolean;
  /** Upsert one update — the board owns the write. */
  onPut: (u: ProjectUpdate) => void;
  /** Upsert requests in one board write. */
  onPutRequests: (items: ProjectRequest[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [reqDraft, setReqDraft] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Switching projects clears every half-typed thing — a reply drafted for
  // Glenda must never post under Martha.
  useEffect(() => {
    setDraft('');
    setEditingId(null);
    setEditDraft('');
    setReplyTo(null);
    setReplyDraft('');
    setReqDraft('');
  }, [project.id]);

  // Escape closes the panel — it is non-modal, so this is the keyboard way out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const thread = threadRoots(updates, project.id);
  const myRequests = requests.filter((r) => r.projectId === project.id && !r.deleted);
  const openReqs = myRequests.filter((r) => !r.resolvedAt);
  const resolvedReqs = myRequests.filter((r) => r.resolvedAt);
  const postCount = thread.reduce((n, t) => n + (t.root.deleted ? 0 : 1) + t.replies.length, 0);

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    onPut(newUpdate(project.id, text, me));
    setDraft('');
  };

  const postReply = (root: ProjectUpdate) => {
    const text = replyDraft.trim();
    if (!text) return;
    onPut(newReply(root, text, me));
    setReplyTo(null);
    setReplyDraft('');
  };

  const saveEdit = (u: ProjectUpdate) => {
    const text = editDraft.trim();
    if (!text) return;
    if (text !== u.text) onPut(editUpdate(u, text, me));
    setEditingId(null);
    setEditDraft('');
  };

  /** The project is already known, so a paste here needs no matching at all. */
  const addRequests = () => {
    const chunks = parseSlackPaste(reqDraft);
    const texts = chunks.length ? chunks : reqDraft.trim() ? [reqDraft.trim()] : [];
    if (!texts.length) return;
    onPutRequests(texts.map((t) => newRequest(t, project.id, me)));
    setReqDraft('');
  };

  // You can edit or remove your own post/reply; an admin can remove anyone's.
  const mayEdit = (u: ProjectUpdate) => u.by === me;
  const mayDelete = (u: ProjectUpdate) => u.by === me || isAdmin;

  /** One post or reply: head, body (or the edit box), and its actions. */
  const body = (u: ProjectUpdate) => (
    <>
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
            rows={3}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveEdit(u);
                return;
              }
              if (e.key === 'Escape') {
                e.stopPropagation(); // closes the edit, not the panel
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
    </>
  );

  return (
    <aside className="upd-panel" aria-label={`Project panel — ${project.name}`}>
      <div className="upd-panel-head">
        <h3>{project.name}</h3>
        <button type="button" className="upd-panel-x" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="upd-panel-scroll">
        {/* Slack requests — the designers' asks for THIS project. Resolving is
            what releases the "Ready to submit"/"Done" gate. */}
        <div className="upd-req-block">
          <div className="upd-head">
            <h4>
              Slack requests
              {openReqs.length > 0 && <span className="board-req-chip upd-req-count">● {openReqs.length} open</span>}
            </h4>
          </div>
          {openReqs.map((r) => (
            <div key={r.id} className="req-confirm">
              <div className="req-text">{r.text}</div>
              <div className="req-meta">
                added by {r.addedBy} ·{' '}
                <button type="button" className="btn small secondary" onClick={() => onPutRequests([resolveRequest(r, me)])}>
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
          {resolvedReqs.map((r) => (
            <div key={r.id} className="req-confirm req-done">
              <div className="req-text">{r.text}</div>
              <div className="req-meta">✓ resolved by {r.resolvedBy}</div>
            </div>
          ))}
          <div className="upd-req-add">
            <textarea
              rows={2}
              aria-label="Paste a Slack message for this project"
              placeholder="Paste a designer’s Slack message for this project…"
              value={reqDraft}
              onChange={(e) => setReqDraft(e.target.value)}
            />
            <button type="button" className="btn small primary" disabled={!reqDraft.trim()} onClick={addRequests}>
              Add request
            </button>
          </div>
        </div>

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
            {postCount} update{postCount === 1 ? '' : 's'}
          </h4>
          <span className="muted">Newest first</span>
        </div>

        <div className="upd-thread">
          {thread.length === 0 && <p className="muted">No updates yet — post the first one above.</p>}

          {thread.map(({ root, replies }) => (
            <article key={root.id} className="upd-item">
              {root.deleted ? (
                // The root died but its replies live — keep their context.
                <p className="muted upd-deleted-stub">(update deleted)</p>
              ) : (
                body(root)
              )}

              {(replies.length > 0 || replyTo === root.id) && (
                <div className="upd-replies">
                  {replies.map((r) => (
                    <div key={r.id} className="upd-reply">
                      {body(r)}
                    </div>
                  ))}
                  {replyTo === root.id && (
                    <div className="upd-reply upd-reply-compose">
                      <textarea
                        ref={replyRef}
                        value={replyDraft}
                        aria-label="Reply"
                        rows={2}
                        placeholder={`Reply to ${root.deleted ? 'this update' : root.by}…`}
                        autoFocus
                        onChange={(e) => setReplyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            postReply(root);
                            return;
                          }
                          if (e.key === 'Escape') {
                            e.stopPropagation(); // closes the reply box, not the panel
                            setReplyTo(null);
                          }
                        }}
                      />
                      <div className="upd-actions edit">
                        <button type="button" className="btn primary small" disabled={!replyDraft.trim()} onClick={() => postReply(root)}>
                          Post reply
                        </button>
                        <button type="button" className="btn secondary small" onClick={() => setReplyTo(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {replyTo !== root.id && (
                <button
                  type="button"
                  className="upd-action upd-reply-link"
                  onClick={() => {
                    setReplyTo(root.id);
                    setReplyDraft('');
                  }}
                >
                  Reply
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}
