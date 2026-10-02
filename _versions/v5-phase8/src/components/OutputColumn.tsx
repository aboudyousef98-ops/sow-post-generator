// The Compose right-hand column (Phase 8, Option A): a readiness card above a
// live Slack preview, both sticky beside the form.
//
// The readiness card replaces the old red "Required before copying: …" line.
// Same source of truth — missingRequired() — shown as a tick-list so you can
// see what is done as well as what is not, with the action beside the gap.

import { useCallback, useEffect, useRef, useState } from 'react';
import { matchAhj } from '../lib/ahj';
import { LEVEL_NAMES } from '../lib/classify';
import { buildPostHtml, buildPostText, missingRequired } from '../lib/template';
import type { Ahj, PostRecord, Settings } from '../types';
import TitleBlockCard from './TitleBlockCard';

interface Props {
  record: PostRecord;
  settings: Settings;
  ahjs?: Ahj[];
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

export default function OutputColumn({ record, settings, ahjs, update, onMarkPosted, toast }: Props) {
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

  const copyForSlack = useCallback(async () => {
    if (missingRequired(record).length) return; // also blocks the Ctrl+Shift+C shortcut
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
  }, [html, text, toast, record]);

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

  const ahjMatch = matchAhj(record.sf.jurisdiction, ahjs ?? []);
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
            disabled={!ready}
            onClick={() => void copyForSlack()}
            title="Ctrl+Shift+C"
          >
            Copy for Slack
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

      {titleBlockOpen && <TitleBlockCard record={record} toast={toast} />}

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
    </aside>
  );
}
