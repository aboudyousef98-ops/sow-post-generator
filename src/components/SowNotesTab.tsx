// SOW General Notes — ONE shared panel, no categories (Aboud 2026-10-08:
// "we dont need to divide them into categories, we just need one general
// notes panel"). Team reference only: nothing here ever reaches a post.
//
// It reuses the `Ahj` entity (kind 'general') so it rides the existing Blobs
// store, merge and sync with no new plumbing — but it keeps exactly ONE board
// and never shows a picker, a name, or aliases.

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { boardsOfKind, livePosts } from '../lib/ahj';
import type { Ahj, AhjPost, Settings } from '../types';
import type { Toast } from './Toast';

interface Props {
  ahjs: Ahj[];
  setAhjs: (a: Ahj[]) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  toast: (text: string, action?: Toast['action']) => void;
  lockedAuthor?: string;
}

/** Fixed id so two people writing the first note concurrently converge on one
 *  board instead of each creating their own. */
export const SOW_NOTES_ID = 'sow-general-notes';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const initials = (n: string) =>
  n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function SowNotesTab({ ahjs, setAhjs, settings, setSettings, toast, lockedAuthor }: Props) {
  const author = lockedAuthor ?? settings.lastAuthor ?? settings.authors[0] ?? '';
  const [composer, setComposer] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [printing, setPrinting] = useState(false);
  const ahjsRef = useRef(ahjs);
  ahjsRef.current = ahjs;

  // The single general board. Older/duplicate general boards (if any ever got
  // made) are tolerated — the first live one wins and the rest stay dormant.
  const board = boardsOfKind(ahjs, 'general').find((b) => !b.deleted);
  const notes = board ? livePosts(board) : [];

  const mutPost = (postId: string, fn: (p: AhjPost) => Partial<AhjPost>) => {
    const now = new Date().toISOString();
    setAhjs(
      ahjsRef.current.map((a) =>
        a.id !== board?.id
          ? a
          : { ...a, posts: a.posts.map((p) => (p.id === postId ? { ...p, ...fn(p), updatedAt: now } : p)) },
      ),
    );
  };

  const addNote = () => {
    const text = composer.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const post: AhjPost = { id: crypto.randomUUID(), text, by: author, at: now, history: [], pinned: false, updatedAt: now };
    const cur = ahjsRef.current;
    const existing = boardsOfKind(cur, 'general').find((b) => !b.deleted);
    if (existing) {
      setAhjs(cur.map((a) => (a.id === existing.id ? { ...a, posts: [...a.posts, post] } : a)));
    } else {
      // First note ever — create the one and only general board.
      setAhjs([
        ...cur,
        {
          id: SOW_NOTES_ID,
          name: 'SOW General Notes',
          aliases: [],
          kind: 'general',
          posts: [post],
          updatedAt: now,
          schemaVersion: 1,
        },
      ]);
    }
    setComposer('');
    toast('Note added.');
  };

  const saveEdit = () => {
    const text = editDraft.trim();
    if (!editingId) return;
    if (!text) {
      toast("A note can't be empty. Use Delete instead.");
      return;
    }
    mutPost(editingId, (p) =>
      p.text === text
        ? {}
        : {
            text,
            editedAt: new Date().toISOString(),
            editedBy: author,
            history: [{ text: p.text, at: p.editedAt ?? p.at, by: p.editedBy ?? p.by }, ...p.history],
          },
    );
    setEditingId(null);
    setEditDraft('');
    toast('Note updated.');
  };

  const removeNote = (p: AhjPost) => {
    mutPost(p.id, () => ({ deleted: { at: new Date().toISOString(), by: author } }));
    setEditingId(null);
    toast('Note deleted.', { label: 'Undo', fn: () => mutPost(p.id, () => ({ deleted: undefined })) });
  };

  /** Same print technique as the requirements boards — see AhjTab.printPdf. */
  const printPdf = () => {
    if (notes.length === 0) {
      toast('Nothing to export yet.');
      return;
    }
    flushSync(() => setPrinting(true));
    document.body.classList.add('req-printing');
    const done = () => {
      document.body.classList.remove('req-printing');
      setPrinting(false);
    };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    done();
  };

  return (
    <div className="ahj-page">
      <div className="list-head">
        <h1>SOW General Notes</h1>
        <span className="muted">Shared reference for the team — never added to a post</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn secondary" disabled={notes.length === 0} onClick={printPdf}>
          Export PDF
        </button>
      </div>

      <div className="ahj-board">
        <div className="card ahj-composer">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className="ahj-avatar">{initials(author || '?')}</span>
            <textarea
              value={composer}
              aria-label="New note"
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  addNote();
                }
              }}
              rows={3}
              placeholder="Add a general note for the team…"
              style={{ marginTop: 0 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Posting as
              {lockedAuthor ? (
                <strong>{author}</strong>
              ) : (
                <select
                  value={author}
                  onChange={(e) => setSettings({ ...settings, lastAuthor: e.target.value })}
                  style={{ width: 'auto', marginTop: 0, padding: '4px 8px', fontSize: 12.5 }}
                >
                  {settings.authors.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              )}
              · Ctrl+Enter to post
            </label>
            <button type="button" className="btn primary" disabled={!composer.trim()} onClick={addNote}>
              Add note
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 2px 8px' }}>
          <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--dyn-navy)' }}>
            Notes ({notes.length})
          </h3>
          <span className="muted">Pinned first, then newest</span>
        </div>

        {notes.length === 0 && (
          <p className="muted" style={{ padding: '18px 2px' }}>
            No notes yet — add the first one above.
          </p>
        )}

        {notes.map((p) => (
          <article key={p.id} className="card ahj-post">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <span className="ahj-avatar">{initials(p.by)}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--dyn-ink)' }}>{p.by}</span>
                <span className="muted">
                  {fmt(p.at)}
                  {p.editedAt && ' · edited'}
                </span>
              </div>
              {p.pinned && <span className="pin-chip">Pinned</span>}
            </div>

            {editingId === p.id ? (
              <>
                <textarea
                  value={editDraft}
                  aria-label="Edit note"
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={4}
                  style={{ marginTop: 0 }}
                />
                <div className="ahj-post-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="ahj-action" onClick={saveEdit}>
                    Save
                  </button>
                  <button type="button" className="ahj-action" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, color: 'var(--dyn-ink)' }}>{p.text}</div>
                <div className="ahj-post-actions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="ahj-action"
                    onClick={() => {
                      setEditingId(p.id);
                      setEditDraft(p.text);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="ahj-action" onClick={() => mutPost(p.id, () => ({ pinned: !p.pinned }))}>
                    {p.pinned ? 'Unpin' : 'Pin to top'}
                  </button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="ahj-action danger" onClick={() => removeNote(p)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>

      {/* Print-only, mounted only while printing — see AhjTab for why. */}
      {printing && (
        <div className="req-print">
          <h1>SOW General Notes</h1>
          <p className="req-print-meta">
            {notes.length} note{notes.length === 1 ? '' : 's'} · Exported {fmtShort(new Date().toISOString())}
          </p>
          <ol className="req-print-list">
            {notes.map((p) => (
              <li key={p.id}>
                <div className="req-print-text">{p.text}</div>
                <div className="req-print-byline">
                  {p.pinned ? 'Pinned · ' : ''}
                  {p.editedBy ?? p.by} · {fmtShort(p.editedAt ?? p.at)}
                  {p.editedAt ? ' · edited' : ''}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
