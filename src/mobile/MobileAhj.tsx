// Mobile AHJ Requirements (iPhone design handoff 2026-10-06): searchable list
// (name/alias + full-text post hits with a highlight) → requirements board
// with a composer, pinned-first posts, pin/unpin and delete with Undo.
// Renames, aliases, history and trash stay desktop jobs.

import { useMemo, useState } from 'react';
import type { Ahj, AhjPost } from '../types';
import { ahjLastActivity, livePosts, searchAhjs } from '../lib/ahj';
import { relativeTime } from '../lib/dates';

interface Props {
  ahjs: Ahj[];
  setAhjs: (a: Ahj[]) => void;
  me: string;
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MobileAhj({ ahjs, setAhjs, me, toast }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'updated'>('name');
  const [selId, setSelId] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);

  const live = useMemo(() => ahjs.filter((a) => !a.deleted), [ahjs]);
  const q = query.trim();
  const hits = useMemo(() => searchAhjs(q, ahjs).filter((h) => h.kind === 'post'), [q, ahjs]);

  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return live
      .filter(
        (a) =>
          !needle ||
          a.name.toLowerCase().includes(needle) ||
          a.aliases.some((al) => al.toLowerCase().includes(needle)),
      )
      .sort(
        sort === 'name'
          ? (a, b) => a.name.localeCompare(b.name)
          : (a, b) => (ahjLastActivity(b)?.at ?? b.updatedAt).localeCompare(ahjLastActivity(a)?.at ?? a.updatedAt),
      );
  }, [live, q, sort]);

  const sel = selId ? live.find((a) => a.id === selId) : undefined;

  const mutatePost = (ahj: Ahj, postId: string, fn: (p: AhjPost) => Partial<AhjPost>) => {
    const now = new Date().toISOString();
    setAhjs(
      ahjs.map((a) =>
        a.id !== ahj.id
          ? a
          : { ...a, posts: a.posts.map((p) => (p.id === postId ? { ...p, ...fn(p), updatedAt: now } : p)) },
      ),
    );
  };

  if (!sel) {
    return (
      <div className="m-screen">
        <header className="m-head">
          <div className="m-head-row">
            <h1>AHJ Requirements</h1>
            <span className="m-spacer" />
          </div>
          <input
            type="search"
            className="m-search"
            placeholder="Search AHJs and posts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="m-segment bordered">
            <button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>
              Name
            </button>
            <button className={sort === 'updated' ? 'on' : ''} onClick={() => setSort('updated')}>
              Last updated
            </button>
          </div>
        </header>
        <div className="m-list-scroll">
          {q.length >= 2 && (
            <>
              <div className="m-section-label">Posts matching “{q}”</div>
              <div className="m-hit-list">
                {hits.map((h, i) =>
                  h.kind === 'post' ? (
                    <button
                      key={i}
                      className="m-hit"
                      onClick={() => {
                        setSelId(h.ahj.id);
                        setFlashId(h.post.id);
                        setQuery('');
                      }}
                    >
                      <span className="m-hit-top">
                        <strong>{h.ahj.name}</strong>
                        <span>Post by {h.post.by}</span>
                      </span>
                      <span className="m-hit-text">
                        {h.pre}
                        <mark>{h.match}</mark>
                        {h.after}
                      </span>
                    </button>
                  ) : null,
                )}
                {hits.length === 0 && <div className="m-hit-none">Nothing mentions “{q}”.</div>}
              </div>
            </>
          )}
          <div className="m-card">
            {list.map((a) => {
              const posts = livePosts(a);
              const last = ahjLastActivity(a);
              return (
                <button
                  key={a.id}
                  className="m-ahj-row"
                  onClick={() => {
                    setSelId(a.id);
                    setComposer('');
                    setFlashId(null);
                  }}
                >
                  <span className="m-ahj-main">
                    <span className="m-ahj-name">{a.name}</span>
                    <span className="m-ahj-sub">
                      {a.aliases.length ? a.aliases.join(', ') : 'No aliases'}
                      {last ? ` · Updated ${relativeTime(last.at)}` : ''}
                    </span>
                  </span>
                  <span className="m-ahj-count">{posts.length}</span>
                  <span className="m-chev">›</span>
                </button>
              );
            })}
            {list.length === 0 && <p className="m-empty">No AHJ boards yet — add them on desktop.</p>}
          </div>
        </div>
      </div>
    );
  }

  const posts = livePosts(sel).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at.localeCompare(a.at));
  const last = ahjLastActivity(sel);

  const addPost = () => {
    const text = composer.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const post: AhjPost = {
      id: crypto.randomUUID(),
      text,
      by: me,
      at: now,
      history: [],
      pinned: false,
      updatedAt: now,
    };
    setAhjs(ahjs.map((a) => (a.id !== sel.id ? a : { ...a, posts: [...a.posts, post] })));
    setComposer('');
    setFlashId(post.id);
    toast('Requirement posted.');
  };

  return (
    <div className="m-screen">
      <header className="m-head m-head-nav">
        <button className="m-back" onClick={() => setSelId(null)}>
          <span>‹</span>AHJs
        </button>
        <span className="m-head-title">{sel.name}</span>
        <span className="m-head-pad" />
      </header>

      <div className="m-list-scroll">
        <div className="m-card m-pad">
          <div className="m-card-label">Requirements board</div>
          <div className="m-ahj-title">{sel.name}</div>
          {sel.aliases.length > 0 && (
            <div className="m-alias-row">
              {sel.aliases.map((al) => (
                <span key={al}>{al}</span>
              ))}
            </div>
          )}
          <div className="m-ahj-meta">
            {posts.length} requirement{posts.length === 1 ? '' : 's'}
            {last ? ` · Last edited by ${last.by} · ${when(last.at)}` : ''}
          </div>
        </div>

        <div className="m-card m-pad m-composer">
          <span className="m-avatar">{initials(me)}</span>
          <div className="m-composer-main">
            <textarea
              rows={3}
              placeholder={`Post a new requirement for ${sel.name}…`}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
            />
            <div className="m-composer-row">
              <span>
                Posting as <strong>{me}</strong>
              </span>
              <button
                className="m-btn-orange small"
                style={{ opacity: composer.trim() ? 1 : 0.55 }}
                onClick={addPost}
              >
                Post
              </button>
            </div>
          </div>
        </div>

        <div className="m-section-row">
          <span className="m-section-label">Requirements ({posts.length})</span>
          <span className="m-section-note">Pinned first, then newest</span>
        </div>

        {posts.map((p) => (
          <article key={p.id} className={`m-card m-pad m-post ${flashId === p.id ? 'flash' : ''}`}>
            <div className="m-post-head">
              <span className="m-avatar">{initials(p.by)}</span>
              <div className="m-post-by">
                <span>{p.by}</span>
                <span className="m-post-when">{when(p.at)}</span>
              </div>
              {p.pinned && <span className="m-pinned-pill">Pinned</span>}
            </div>
            <div className="m-post-text">{p.text}</div>
            <div className="m-post-actions">
              <button
                onClick={() => {
                  mutatePost(sel, p.id, (x) => ({ pinned: !x.pinned }));
                  toast(p.pinned ? 'Unpinned.' : 'Pinned to top.');
                }}
              >
                {p.pinned ? 'Unpin' : 'Pin to top'}
              </button>
              <button
                className="danger"
                onClick={() => {
                  const now = new Date().toISOString();
                  mutatePost(sel, p.id, () => ({ deleted: { at: now, by: me } }));
                  toast('Post moved to Trash.', {
                    label: 'Undo',
                    fn: () => mutatePost(sel, p.id, () => ({ deleted: undefined })),
                  });
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        {posts.length === 0 && (
          <div className="m-empty-box">No requirements posted for {sel.name} yet. Write the first one above.</div>
        )}
      </div>
    </div>
  );
}
