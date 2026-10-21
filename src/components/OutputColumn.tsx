// The Compose right-hand column (Phase 8, Option A): a readiness card above a
// live Slack preview, both sticky beside the form.
//
// The readiness card replaces the old red "Required before copying: …" line.
// Same source of truth — missingRequired() — shown as a tick-list so you can
// see what is done as well as what is not, with the action beside the gap.

import { useCallback, useEffect, useRef, useState } from 'react';
import { boardsOfKind, matchAhj } from '../lib/ahj';
import { LEVEL_NAMES } from '../lib/classify';
import { buildPostHtml, buildPostText, missingRequired } from '../lib/template';
import { noteCheck } from '../lib/api';
import { eligibleNotes, keywordMatches, mergeHits, postHash, triggerIsGrounded, type NoteHit } from '../lib/noteMatch';
import type { BoardProject } from '../board/types';
import type { Ahj, PostRecord, Settings } from '../types';
import TitleBlockCard from './TitleBlockCard';

interface Props {
  record: PostRecord;
  settings: Settings;
  ahjs?: Ahj[];
  /** For the title block's SOW Coordinator cell — see titleBlockCoordinator(). */
  boardProjects: BoardProject[];
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onMarkPosted: () => void;
  onNewPost: () => void;
  onSaveDraft: () => void;
  toast: (text: string) => void;
}

interface Check {
  label: string;
  done: boolean;
  action?: string;
}

export default function OutputColumn({ record, settings, ahjs, boardProjects, update, onMarkPosted, toast }: Props) {
  const text = buildPostText(record, settings, ahjs);
  const html = buildPostHtml(record, settings, ahjs);

  // Hand-editing the post (Aboud, 2026-09-30). `draft` holds the text while it
  // is being typed; it is only written to the record on Save, so Cancel really
  // does leave everything alone.
  const [editing, setEditing] = useState<string | null>(null);
  const manual = !!record.manualText?.trim();

  const missing = missingRequired(record);
  const ready = missing.length === 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const [titleBlockOpen, setTitleBlockOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click anywhere else to dismiss the ··· menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // ---- pre-post note check (_PLAN_note_check.md) ---------------------------
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<{ hits: NoteHit[]; source: 'ai' | 'keyword' } | null>(null);

  /** The copy itself, with no checking — every path ends here. */
  const copyNow = useCallback(async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    toast('Copied. Paste into Slack, then re-type the @mentions if they appear as plain text.');
  }, [html, text, toast]);

  const copyForSlack = useCallback(async () => {
    if (missingRequired(record).length) return; // also blocks the Ctrl+Shift+C shortcut
    if (checking) return;

    const hash = postHash(text);
    // Already confirmed THIS exact post — don't nag twice.
    if (record.noteCheck?.postHash === hash) return copyNow();

    const notes = eligibleNotes(record, ahjs);
    if (notes.length === 0) return copyNow(); // nothing on file for this project

    let hits: NoteHit[];
    let source: 'ai' | 'keyword' = 'ai';
    setChecking(true);
    try {
      const res = await noteCheck(
        text,
        notes.map((n) => ({ lineId: n.lineId, text: n.text })),
      );
      const byId = new Map(notes.map((n) => [n.lineId, n]));
      // AI ONLY when the AI answered (Aboud 2026-10-08: "i need it as AI not
      // only to match by keyword but to match by logic"). Unioning in keyword
      // hits put noise like 'matched "elevation"' — from the post's own
      // "elevation drawing" line — beside good reasoning, which made the whole
      // list look untrustworthy.
      hits = res.hits
        // Verify the model's EVIDENCE, not its judgement: the quoted trigger
        // must really appear in the project-specific part of the post. Without
        // this, always-true lines ("install date set, so NTP must exist")
        // surfaced on every routine post — see triggerIsGrounded().
        .filter((h) => triggerIsGrounded(text, h.trigger))
        .map((h) => {
          const n = byId.get(h.lineId);
          return n ? { ...n, why: h.why } : null;
        })
        .filter((h): h is NoteHit => h !== null);
    } catch {
      // AI down → fall back to the local keyword pass so the team is never
      // blocked by OpenAI being unavailable (Aboud's explicit choice).
      source = 'keyword';
      hits = mergeHits(keywordMatches(text, notes), []);
    } finally {
      setChecking(false);
    }
    // Nothing to say → stay invisible, copy exactly as before.
    if (hits.length === 0) return copyNow();
    setPending({ hits, source });
  }, [record, ahjs, text, checking, copyNow]);

  const confirmAndCopy = useCallback(async () => {
    if (!pending) return;
    const stamp = {
      at: new Date().toISOString(),
      by: record.author,
      postHash: postHash(text),
      source: pending.source,
      // Snapshot the text: editing the note later must not rewrite history.
      items: pending.hits.map((h) => ({ noteId: h.lineId, board: h.board, text: h.text, why: h.why })),
    };
    update((r) => ({ ...r, noteCheck: stamp }));
    setPending(null);
    await copyNow();
  }, [pending, record.author, text, update, copyNow]);

  const copyPlain = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    toast('Plain text copied.');
  }, [text, toast]);

  // Ctrl+Shift+C = Copy for Slack (spec/01 UX rules).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        void copyForSlack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyForSlack]);

  // Narrowed to AHJ-kind boards: the store also holds Utility/Funding/General
  // boards since 2026-10-08, and a utility must not match a Jurisdiction.
  const ahjMatch = matchAhj(record.sf.jurisdiction, boardsOfKind(ahjs ?? [], 'ahj'));
  const ahjApproved = !!ahjMatch && record.ahjApprovedId === ahjMatch.ahj.id;
  const checks: Check[] = [
    { label: 'Customer name', done: !missing.includes('Customer name'), action: 'Fill in' },
    { label: 'Jurisdiction', done: !missing.includes('Jurisdiction'), action: 'Fill in' },
    { label: 'Site address', done: !missing.includes('Site address'), action: 'Fill in' },
    { label: `Level ${record.level} chosen · ${LEVEL_NAMES[record.level]}`, done: true },
    {
      label: ahjMatch
        ? ahjApproved
          ? `${ahjMatch.ahj.name} requirements appended`
          : `${ahjMatch.ahj.name} requirements reviewed, not appended`
        : 'No AHJ board on file',
      done: true,
    },
  ];
  if (missing.includes('Region text')) {
    checks.splice(3, 0, { label: 'Region text', done: false, action: 'Fill in' });
  }

  return (
    <aside className="compose-aside">
      <div className="card readiness">
        <div className="readiness-head">
          <span className={`readiness-mark ${ready ? 'ok' : 'warn'}`}>{ready ? '✓' : missing.length}</span>
          <div>
            <div className="readiness-title">{ready ? 'Ready to post' : `${missing.length} ${missing.length === 1 ? 'thing' : 'things'} before posting`}</div>
            <div className="readiness-sub">
              {ready ? 'Every required field is filled' : `Missing: ${missing.join(', ')}`}
            </div>
          </div>
        </div>

        <ul className="readiness-checks">
          {checks.map((c) => (
            <li key={c.label} className={c.done ? 'done' : 'todo'}>
              <span className="check-ring">{c.done ? '✓' : ''}</span>
              <span className="check-label">{c.label}</span>
              {!c.done && c.action && <span className="check-action">{c.action}</span>}
            </li>
          ))}
        </ul>

        <div className="readiness-actions">
          <button
            type="button"
            className="btn primary"
            disabled={!ready || checking}
            onClick={() => void copyForSlack()}
            title="Ctrl+Shift+C"
          >
            {checking ? 'Checking notes…' : 'Copy for Slack'}
          </button>
          <button type="button" className="btn secondary" disabled={!ready} onClick={onMarkPosted}>
            Mark as posted
          </button>
          <div className="more-menu" ref={menuRef}>
            <button
              type="button"
              className="btn secondary more-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More actions"
              title="Copy plain text · AutoCAD title block"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ···
            </button>
            {menuOpen && (
              <div className="more-panel" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!ready}
                  onClick={() => {
                    setMenuOpen(false);
                    void copyPlain();
                  }}
                >
                  Copy plain text
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setTitleBlockOpen((v) => !v);
                  }}
                >
                  AutoCAD title block
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {titleBlockOpen && <TitleBlockCard record={record} boardProjects={boardProjects} toast={toast} />}

      <div className="card preview-card">
        <div className="preview-head">
          <span className="section-label">Slack preview</span>
          {editing === null ? (
            <span className="preview-head-actions">
              <span className="muted">{manual ? 'Edited by hand' : 'Updates as you type'}</span>
              <button type="button" className="btn link small" onClick={() => setEditing(text)}>
                {manual ? 'Edit again' : 'Manual edit'}
              </button>
            </span>
          ) : (
            <span className="preview-head-actions">
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  const next = editing;
                  update((r) => ({ ...r, manualText: next.trim() ? next : undefined }));
                  setEditing(null);
                  toast(next.trim() ? 'Post saved as you typed it.' : 'Back to the generated post.');
                }}
              >
                Save
              </button>
              <button type="button" className="btn small secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </span>
          )}
        </div>

        {/* The one thing a manual edit must never do is lose the generated
            post silently, so say so and keep the way back one click away. */}
        {manual && editing === null && (
          <div className="manual-banner">
            <span>
              This post was edited by hand — the form no longer changes it.
            </span>
            <button
              type="button"
              className="btn link small"
              onClick={() => {
                update((r) => ({ ...r, manualText: undefined }));
                toast('Reverted to the generated post.');
              }}
            >
              Revert to generated
            </button>
          </div>
        )}

        {editing === null ? (
          // buildPostHtml escapes all user text — safe to render.
          <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <textarea
            className="preview-editor"
            value={editing}
            aria-label="Post text"
            onChange={(e) => setEditing(e.target.value)}
            rows={18}
          />
        )}
      </div>

      {/* Pre-post note check. Appears ONLY when something matched — a check
          with nothing to say must stay invisible (_PLAN_note_check.md). */}
      {pending && (
        <div className="modal-overlay" onClick={() => setPending(null)}>
          <div className="modal note-check-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Before posting — {pending.hits.length} note{pending.hits.length === 1 ? '' : 's'} may apply
            </h3>
            {pending.source === 'keyword' && (
              <p className="note-check-degraded">
                ⚠ AI unavailable — showing keyword matches only. The list may be less precise.
              </p>
            )}
            <ul className="note-check-list">
              {pending.hits.map((h) => (
                <li key={h.noteId}>
                  <div className="note-check-top">
                    <span className="note-check-text">{h.text}</span>
                    <span className="note-check-board">{h.board}</span>
                  </div>
                  <div className="note-check-why">{h.why}</div>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void confirmAndCopy()}>
                Confirm and copy to Slack
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
