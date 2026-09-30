// AHJ Requirements tab (Phase 5) — per the Claude Design v2 handoff.
// Each AHJ is a board of requirement posts: searchable picker, global search,
// pin, inline edit with full version history, tombstone Trash with restore.

import { useEffect, useRef, useState } from 'react';
import {
  ahjLastActivity,
  clip,
  livePosts,
  nameConflict,
  normName,
  searchAhjs,
} from '../lib/ahj';
import type { Ahj, AhjPost, Settings } from '../types';
import type { Toast } from './Toast';

interface Props {
  ahjs: Ahj[];
  setAhjs: (a: Ahj[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  toast: (text: string, action?: Toast['action']) => void;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const initials = (n: string) =>
  n
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const lastAct = (p: AhjPost) => p.editedAt ?? p.at;
const lastBy = (p: AhjPost) => p.editedBy ?? p.by;
const parseAliases = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

type Modal = null | 'add' | 'rename' | 'delete' | 'history';

export default function AhjTab({ ahjs, setAhjs, selectedId, onSelect, settings, setSettings, toast }: Props) {
  const author = settings.lastAuthor ?? settings.authors[0] ?? '';

  const [globalQuery, setGlobalQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'updated'>('name');
  const [composer, setComposer] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [formName, setFormName] = useState('');
  const [formAliases, setFormAliases] = useState('');
  const [formError, setFormError] = useState('');
  const [histPostId, setHistPostId] = useState<string | null>(null);
  const [histIndex, setHistIndex] = useState(0);
  const [trashOpen, setTrashOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const pickerInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pickerOpen) pickerInput.current?.focus();
  }, [pickerOpen]);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = (id: string) => {
    clearTimeout(flashTimer.current);
    clearTimeout(scrollTimer.current);
    setFlashId(id);
    flashTimer.current = setTimeout(() => setFlashId(null), 1800);
    scrollTimer.current = setTimeout(
      () => document.getElementById(`ahjpost-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      50,
    );
  };
  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
      clearTimeout(scrollTimer.current);
    },
    [],
  );

  const ahjsRef = useRef(ahjs);
  ahjsRef.current = ahjs;

  // ---- mutations (all timestamps bump the right merge key) -----------------

  const mutAhjMeta = (id: string, fn: (a: Ahj) => Partial<Ahj>) => {
    const now = new Date().toISOString();
    setAhjs(ahjsRef.current.map((a) => (a.id === id ? { ...a, ...fn(a), updatedAt: now } : a)));
  };

  const mutPost = (ahjId: string, postId: string, fn: (p: AhjPost) => Partial<AhjPost>) => {
    const now = new Date().toISOString();
    setAhjs(
      ahjsRef.current.map((a) =>
        a.id !== ahjId ? a : { ...a, posts: a.posts.map((p) => (p.id === postId ? { ...p, ...fn(p), updatedAt: now } : p)) },
      ),
    );
  };

  const select = (id: string | null) => {
    onSelect(id);
    setPickerOpen(false);
    setPickerQuery('');
    setEditingId(null);
  };

  const addPost = () => {
    const text = composer.trim();
    if (!text || !selectedId) return;
    const now = new Date().toISOString();
    const post: AhjPost = { id: crypto.randomUUID(), text, by: author, at: now, history: [], pinned: false, updatedAt: now };
    setAhjs(ahjsRef.current.map((a) => (a.id === selectedId ? { ...a, posts: [...a.posts, post] } : a)));
    setComposer('');
    flash(post.id);
    toast('Requirement posted.');
  };

  const saveEdit = () => {
    const text = editDraft.trim();
    if (!editingId || !selectedId) return;
    if (!text) {
      toast("A post can't be empty. Use Delete instead.");
      return;
    }
    mutPost(selectedId, editingId, (p) =>
      p.text === text
        ? {}
        : {
            text,
            editedAt: new Date().toISOString(),
            editedBy: author,
            history: [{ text: p.text, at: lastAct(p), by: lastBy(p) }, ...p.history],
          },
    );
    setEditingId(null);
    setEditDraft('');
    toast('Post updated.');
  };

  const deletePost = (ahjId: string, postId: string) => {
    mutPost(ahjId, postId, () => ({ deleted: { at: new Date().toISOString(), by: author } }));
    setEditingId(null);
    toast('Post moved to Trash.', { label: 'Undo', fn: () => mutPost(ahjId, postId, () => ({ deleted: undefined })) });
  };

  const submitForm = () => {
    const name = formName.trim();
    // Dedupe aliases (case/space-insensitive) and drop any equal to the name.
    const seenAlias = new Set<string>([normName(name)]);
    const aliases = parseAliases(formAliases).filter((al) => {
      const k = normName(al);
      if (seenAlias.has(k)) return false;
      seenAlias.add(k);
      return true;
    });
    if (!name) {
      setFormError('Enter an AHJ name.');
      return;
    }
    const c = nameConflict([name, ...aliases], ahjs, modal === 'rename' ? (selectedId ?? undefined) : undefined);
    if (c) {
      setFormError(`“${c.term}” is already used by ${c.ahjName}.`);
      return;
    }
    const now = new Date().toISOString();
    if (modal === 'add') {
      const ahj: Ahj = { id: crypto.randomUUID(), name, aliases, posts: [], updatedAt: now, schemaVersion: 1 };
      setAhjs([...ahjsRef.current, ahj]);
      setModal(null);
      select(ahj.id);
      toast(`Added ${name}. Post its first requirement.`);
    } else {
      mutAhjMeta(selectedId as string, () => ({ name, aliases }));
      setModal(null);
      toast('Name and aliases saved.');
    }
  };

  const confirmDelete = () => {
    if (!selectedId) return;
    const a = ahjs.find((x) => x.id === selectedId);
    mutAhjMeta(selectedId, () => ({ deleted: { at: new Date().toISOString(), by: author } }));
    setModal(null);
    onSelect(null);
    setTrashOpen(true);
    if (a) toast(`Moved ${a.name} to Trash.`);
  };

  /** Restore a deleted AHJ; refuses when its name/alias is now taken. */
  const restoreAhj = (id: string): boolean => {
    const a = ahjsRef.current.find((x) => x.id === id);
    if (!a) return false;
    const c = nameConflict([a.name, ...a.aliases], ahjsRef.current, id);
    if (c) {
      toast(`Can't restore: “${c.term}” is now used by ${c.ahjName}.`);
      return false;
    }
    mutAhjMeta(id, () => ({ deleted: undefined }));
    return true;
  };

  const restoreVersion = () => {
    const a = ahjs.find((x) => x.id === selectedId);
    const p = a?.posts.find((x) => x.id === histPostId);
    if (!a || !p || histIndex < 1) return;
    const v = p.history[histIndex - 1];
    mutPost(a.id, p.id, (x) => ({
      text: v.text,
      editedAt: new Date().toISOString(),
      editedBy: author,
      history: [{ text: x.text, at: lastAct(x), by: lastBy(x) }, ...x.history],
    }));
    setModal(null);
    flash(p.id);
    toast(`Restored version from ${fmt(v.at)}.`);
  };

  // ---- derived ------------------------------------------------------------

  const active = ahjs.filter((a) => !a.deleted);
  const sel = active.find((a) => a.id === selectedId);
  const selPosts = sel ? livePosts(sel) : [];
  const selUpd = sel ? ahjLastActivity(sel) : null;

  const pq = pickerQuery.trim().toLowerCase();
  const pickerItems = active
    .filter((a) => !pq || a.name.toLowerCase().includes(pq) || a.aliases.some((al) => al.toLowerCase().includes(pq)))
    .sort(
      sort === 'name'
        ? (a, b) => a.name.localeCompare(b.name)
        : (a, b) => (ahjLastActivity(b)?.at ?? b.updatedAt).localeCompare(ahjLastActivity(a)?.at ?? a.updatedAt),
    );

  const searchHits = searchAhjs(globalQuery, ahjs);
  const showSearch = globalQuery.trim().length >= 2;

  interface TrashItem {
    key: string;
    kind: 'AHJ' | 'Post';
    title: string;
    by: string;
    at: string;
    onRestore: () => void;
  }
  const trash: TrashItem[] = [];
  for (const a of ahjs) {
    if (a.deleted) {
      trash.push({
        key: `ahj-${a.id}`,
        kind: 'AHJ',
        title: `${a.name} · ${a.posts.filter((p) => !p.deleted).length} posts`,
        by: a.deleted.by,
        at: a.deleted.at,
        onRestore: () => {
          if (restoreAhj(a.id)) {
            select(a.id);
            toast(`Restored ${a.name}.`);
          }
        },
      });
    }
    for (const p of a.posts) {
      if (!p.deleted) continue;
      trash.push({
        key: `post-${a.id}-${p.id}`,
        kind: 'Post',
        title: `${a.name}: “${clip(p.text, 70)}”`,
        by: p.deleted.by,
        at: p.deleted.at,
        onRestore: () => {
          if (a.deleted && !restoreAhj(a.id)) return;
          mutPost(a.id, p.id, () => ({ deleted: undefined }));
          select(a.id);
          flash(p.id);
          toast(a.deleted ? `Restored post and ${a.name}.` : 'Post restored.');
        },
      });
    }
  }
  trash.sort((x, y) => y.at.localeCompare(x.at));

  const histPost = sel?.posts.find((p) => p.id === histPostId);
  const versions = histPost
    ? [
        { text: histPost.text, at: lastAct(histPost), by: lastBy(histPost), label: 'Current version' },
        ...histPost.history.map((h, i) => ({
          ...h,
          label: i === histPost.history.length - 1 ? 'Original post' : `Version ${histPost.history.length - i}`,
        })),
      ]
    : [];
  const histView = versions[histIndex] ?? versions[0];

  // ---- render ---------------------------------------------------------------

  return (
    <div className="ahj-page">
      <div className="list-head">
        <h1>AHJ Requirements</h1>
        <span className="muted">Compose shows a board automatically when the Jurisdiction matches</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setModal('add');
            setPickerOpen(false);
            setFormName('');
            setFormAliases('');
            setFormError('');
          }}
        >
          + Add AHJ
        </button>
      </div>

      <div className="ahj-layout">
        {/* Phase 8 (Option A): the AHJ list is a permanent pane, not a
            dropdown — you can see every board and its post count at once. */}
        <div className="card ahj-sidebar">
          <div className="ahj-sidebar-search">
            <input
              type="text"
              ref={pickerInput}
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search AHJs…"
              aria-label="Search AHJs"
            />
          </div>
          <div className="sort-toggle ahj-sidebar-sort">
            <button type="button" className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>
              Name
            </button>
            <button type="button" className={sort === 'updated' ? 'active' : ''} onClick={() => setSort('updated')}>
              Last updated
            </button>
          </div>
          <div className="ahj-sidebar-list">
            {pickerItems.map((a) => {
              const n = livePosts(a).length;
              return (
                <button
                  type="button"
                  key={a.id}
                  className={`ahj-sidebar-item${a.id === selectedId ? ' selected' : ''}`}
                  onClick={() => select(a.id)}
                >
                  <span className="ahj-sidebar-name">
                    <span className="cell-name">{a.name}</span>
                    <span className="cell-meta">{a.aliases.length ? a.aliases.join(', ') : 'No aliases'}</span>
                  </span>
                  <span className="ahj-sidebar-count">{n}</span>
                </button>
              );
            })}
            {pickerItems.length === 0 && (
              <div className="muted" style={{ padding: '12px 14px' }}>No AHJ matches “{pickerQuery}”.</div>
            )}
          </div>
        </div>

        <div className="ahj-board">

      <div className="card">
        <h3>Search all AHJs</h3>
        <input
          type="text"
          value={globalQuery}
          onChange={(e) => setGlobalQuery(e.target.value)}
          placeholder="Search AHJ names, aliases and every post — e.g. square d"
        />
        {showSearch && (
          <>
            <div className="muted" style={{ margin: '10px 0 8px' }}>
              {searchHits.length
                ? `${searchHits.length} result${searchHits.length > 1 ? 's' : ''} for “${globalQuery.trim()}”`
                : `Nothing mentions “${globalQuery.trim()}”.`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {searchHits.map((h, i) => (
                <button
                  type="button"
                  key={i}
                  className="search-hit"
                  onClick={() => {
                    select(h.ahj.id);
                    setGlobalQuery('');
                    if (h.kind === 'post') flash(h.post.id);
                  }}
                >
                  <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--dyn-navy)' }}>{h.ahj.name}</strong>
                    <span className="muted">
                      {h.kind === 'ahj'
                        ? h.via === 'name'
                          ? 'Name match'
                          : `Alias: ${h.via}`
                        : `Post by ${h.post.by} · ${fmtShort(h.post.at)}`}
                    </span>
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                    {h.kind === 'ahj' ? (
                      h.preview
                    ) : (
                      <>
                        {h.pre}
                        <mark>{h.match}</mark>
                        {h.after}
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>


      {sel ? (
        <>
          <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <h3 style={{ marginBottom: 0 }}>Requirements board</h3>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--dyn-ink)', marginTop: 4 }}>{sel.name}</div>
              <div className="chips" style={{ alignItems: 'center' }}>
                {sel.aliases.map((al) => (
                  <span key={al} className="tag-chip">{al}</span>
                ))}
                {sel.aliases.length === 0 && <span className="muted">No aliases</span>}
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                {selUpd
                  ? `${selPosts.length} requirement${selPosts.length === 1 ? '' : 's'} · Last edited by ${selUpd.by} · ${fmt(selUpd.at)}`
                  : 'No requirements yet'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => {
                  setModal('rename');
                  setFormName(sel.name);
                  setFormAliases(sel.aliases.join('\n'));
                  setFormError('');
                }}
              >
                Rename / aliases
              </button>
              <button type="button" className="btn danger small" onClick={() => setModal('delete')}>
                Move AHJ to Trash
              </button>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span className="ahj-avatar">{initials(author)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    addPost();
                  }
                }}
                rows={3}
                placeholder={`Post a new requirement for ${sel.name}…`}
                style={{ marginTop: 0 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Posting as
                  <select
                    value={author}
                    onChange={(e) => setSettings({ ...settings, lastAuthor: e.target.value })}
                    style={{ width: 'auto', marginTop: 0, padding: '4px 8px', fontSize: 12.5 }}
                  >
                    {settings.authors.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  · Ctrl+Enter to post
                </label>
                <button type="button" className="btn primary" disabled={!composer.trim()} onClick={addPost}>
                  Post
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 2px 8px' }}>
            <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--dyn-navy)' }}>
              Requirements ({selPosts.length})
            </h3>
            <span className="muted">Pinned first, then newest</span>
          </div>

          {selPosts.map((p) => (
            <article key={p.id} id={`ahjpost-${p.id}`} className={`card ahj-post${flashId === p.id ? ' flash' : ''}`}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <span className="ahj-avatar">{initials(p.by)}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 700, color: 'var(--dyn-ink)' }}>{p.by}</span>
                  <span className="muted">
                    {fmt(p.at)}
                    {p.editedAt && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          className="ahj-action"
                          style={{ padding: 0, fontWeight: 400, fontSize: 12, textDecoration: 'underline', color: 'var(--dyn-muted)' }}
                          title={`Edited by ${p.editedBy} · ${fmt(p.editedAt)}`}
                          onClick={() => {
                            setModal('history');
                            setHistPostId(p.id);
                            setHistIndex(0);
                          }}
                        >
                          edited
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {p.pinned && <span className="pin-chip">Pinned</span>}
              </div>
              {editingId === p.id ? (
                <>
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        saveEdit();
                      }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    rows={4}
                    style={{ marginTop: 0 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn secondary small" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn primary small" onClick={saveEdit}>
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ahj-post-text">{p.text}</div>
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
                    <button
                      type="button"
                      className="ahj-action"
                      onClick={() => {
                        mutPost(sel.id, p.id, (x) => ({ pinned: !x.pinned }));
                        toast(p.pinned ? 'Unpinned.' : 'Pinned to top.');
                      }}
                    >
                      {p.pinned ? 'Unpin' : 'Pin to top'}
                    </button>
                    <button
                      type="button"
                      className="ahj-action"
                      onClick={() => {
                        setModal('history');
                        setHistPostId(p.id);
                        setHistIndex(0);
                      }}
                    >
                      History ({p.history.length})
                    </button>
                    <button type="button" className="ahj-action danger" onClick={() => deletePost(sel.id, p.id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
          {selPosts.length === 0 && (
            <div className="ahj-empty">No requirements posted for {sel.name} yet. Write the first one above.</div>
          )}
        </>
      ) : (
        <div className="ahj-empty">Pick an AHJ on the left to see its requirement posts, or add a new AHJ.</div>
      )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setTrashOpen(!trashOpen)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
        >
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--dyn-navy)' }}>
              Trash
            </span>
            <span className="tag-chip">{trash.length}</span>
          </span>
          <span className="muted">{trashOpen ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {trashOpen && (
          <div style={{ borderTop: '1px solid var(--dyn-line)', padding: '4px 18px 14px' }}>
            {trash.map((t) => (
              <div key={t.key} className="trash-row">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                    <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                      {t.kind}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--dyn-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </span>
                  </span>
                  <span className="muted">Deleted by {t.by} · {fmt(t.at)}</span>
                </div>
                <button type="button" className="btn secondary small" style={{ flexShrink: 0 }} onClick={t.onRestore}>
                  Restore
                </button>
              </div>
            ))}
            {trash.length === 0 && <div className="muted" style={{ padding: '12px 0' }}>Trash is empty.</div>}
            <p className="muted" style={{ margin: '10px 0 0' }}>
              Deleted AHJs and posts keep their full text and history. Nothing is permanently deleted.
            </p>
          </div>
        )}
      </div>

      {(modal === 'add' || modal === 'rename') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, textTransform: 'none', letterSpacing: 0 }}>
              {modal === 'rename' ? 'Rename AHJ / edit aliases' : 'Add AHJ'}
            </h3>
            <label className="field">
              AHJ name
              <input
                type="text"
                value={formName}
                autoFocus
                onChange={(e) => {
                  setFormName(e.target.value);
                  setFormError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitForm();
                  if (e.key === 'Escape') setModal(null);
                }}
                placeholder="e.g. Corpus Christi"
              />
            </label>
            <label className="field">
              Aliases <span className="badge">optional · one per line · used to match free-text Jurisdiction from Salesforce</span>
              <textarea
                value={formAliases}
                onChange={(e) => {
                  setFormAliases(e.target.value);
                  setFormError('');
                }}
                rows={3}
                placeholder="City of Corpus Christi"
              />
            </label>
            {formError && <div className="error-inline">{formError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={submitForm}>
                {modal === 'rename' ? 'Save' : 'Add AHJ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'delete' && sel && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, textTransform: 'none', letterSpacing: 0 }}>Move {sel.name} to Trash?</h3>
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              All {selPosts.length} of its requirement posts move with it. Anyone on the team can restore it from Trash.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" className="btn secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" style={{ background: 'var(--dyn-danger)' }} onClick={confirmDelete}>
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'history' && histPost && sel && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--dyn-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 17, textTransform: 'none', letterSpacing: 0 }}>Post history — {sel.name}</h3>
              <button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 0, fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--dyn-muted)' }}>
                ×
              </button>
            </div>
            <div className="history-grid">
              <div style={{ borderRight: '1px solid var(--dyn-line)', overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {versions.map((v, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`history-version${i === histIndex ? ' selected' : ''}`}
                    onClick={() => setHistIndex(i)}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--dyn-ink)' }}>{v.label}</span>
                    <span className="muted">{v.by} · {fmt(v.at)}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--dyn-ink)' }}>
                  {histView?.text}
                </div>
                <div style={{ padding: '10px 20px', borderTop: '1px solid var(--dyn-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'var(--dyn-bg)' }}>
                  <span className="muted">
                    {histIndex === 0 ? 'This is the current version.' : histView ? `Saved by ${histView.by} · ${fmt(histView.at)}` : ''}
                  </span>
                  {histIndex > 0 && (
                    <button type="button" className="btn primary small" onClick={restoreVersion}>
                      Restore this version
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
