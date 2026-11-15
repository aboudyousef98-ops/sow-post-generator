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
import { buildSvtPostHtml, buildSvtPostText, SVT_PATHS } from '../lib/svtPost';
import { noteCheck } from '../lib/api';
import { SHORT, wireStatus } from '../lib/wireMaterial';
import { eligibleNotes, keywordMatches, mergeHits, postHash, triggerIsGrounded, type NoteHit } from '../lib/noteMatch';
import type { BoardProject } from '../board/types';
import type { Ahj, PostRecord, Settings } from '../types';
import SfSubmissionCard from './SfSubmissionCard';
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
  /**
   * Which compose tab is open (Aboud 2026-11-15). 'svt' swaps the output side
   * for the SVT pre-design post — one preview, one copy button; the SF panel,
   * the note check and Mark as posted are full-SOW concerns and stay away.
   */
  mode?: 'sow' | 'svt';
}

interface Check {
  label: string;
  done: boolean;
  action?: string;
  /**
   * An amber "!" ring instead of a tick or an empty ring (Aboud 2026-11-11).
   * A thing worth seeing that is NOT a gap: it never touches `ready`, which
   * stays driven by missingRequired() alone. Built for the wire material
   * check, which this site deliberately does not gate.
   */
  tone?: 'advisory';
}

export default function OutputColumn({ record, settings, ahjs, boardProjects, update, onMarkPosted, toast, mode = 'sow' }: Props) {
  const text = buildPostText(record, settings, ahjs);
  const html = buildPostHtml(record, settings, ahjs);
  const svtText = buildSvtPostText(record);
  const svtHtml = buildSvtPostHtml(record);

  // Hand-editing the post (Aboud, 2026-09-30). `draft` holds the text while it
  // is being typed; it is only written to the record on Save, so Cancel really
  // does leave everything alone.
  const [editing, setEditing] = useState<string | null>(null);
  const manual = !!record.manualText?.trim();

  const missing = missingRequired(record);
  const ready = missing.length === 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const [titleBlockOpen, setTitleBlockOpen] = useState(false);
  // SF per-field submission replaced the Slack post as the team's submission
  // method (Aboud 2026-10-22). Slack stays one click away for the transition.
  const [view, setView] = useState<'sf' | 'slack'>('sf');
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

  /**
   * Copy the SVT pre-design post (Aboud 2026-11-15). No note check: that gate
   * exists for the design handoff; the pre-design post is written before any
   * notes could contradict it. Same required-fields gate as everything else.
   */
  const copySvt = useCallback(async () => {
    if (missingRequired(record).length) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([svtHtml], { type: 'text/html' }),
          'text/plain': new Blob([svtText], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(svtText);
    }
    toast('SVT post copied — paste it into #sow-svt-collab.');
  }, [record, svtHtml, svtText, toast]);

  // Ctrl+Shift+C = copy for Slack — the post of whichever tab is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (mode === 'svt') void copySvt();
        else void copyForSlack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyForSlack, copySvt, mode]);

  // Narrowed to AHJ-kind boards: the store also holds Utility/Funding/General
  // boards since 2026-10-08, and a utility must not match a Jurisdiction.
  const ahjMatch = matchAhj(record.sf.jurisdiction, boardsOfKind(ahjs ?? [], 'ahj'));
  const ahjApproved = !!ahjMatch && record.ahjApprovedId === ahjMatch.ahj.id;
  // Wire material (Aboud 2026-11-11). Advisory in every state but a clean
  // match: unanswered and mismatched both stay visible here, but neither
  // blocks — the site does not gate fields, so visibility is the whole
  // mechanism. A mismatch is NOT an error: it is a legitimate change that the
  // Design Feedback is now asking the designer to carry into the SLD.
  const wire = record.wire ?? {};
  const wireCheck: Check =
    wireStatus(record) === 'match'
      ? { label: `Wire material matches — ${SHORT[wire.bos!].toLowerCase()}`, done: true }
      : wireStatus(record) === 'mismatch'
        ? {
            label: `Wire material mismatch — SLD ${SHORT[wire.design!].toLowerCase()}, BOS ${SHORT[wire.bos!].toLowerCase()}`,
            done: false,
            tone: 'advisory',
            action: 'In Design Feedback',
          }
        : { label: 'Wire material not confirmed', done: false, tone: 'advisory', action: 'Pick' };

  // The battery installation analysis is deliberately absent from this list
  // (Aboud 2026-11-03) — it is not required, so it must not read as a gap.
  const requiredChecks: Check[] = [
    { label: 'Customer name', done: !missing.includes('Customer name'), action: 'Fill in' },
    { label: 'Jurisdiction', done: !missing.includes('Jurisdiction'), action: 'Fill in' },
    { label: 'Site address', done: !missing.includes('Site address'), action: 'Fill in' },
    ...(missing.includes('Region text')
      ? [{ label: 'Region text', done: false, action: 'Fill in' } as Check]
      : []),
  ];
  // The SVT list describes the SVT post it sits beside (audit 2026-11-15):
  // the SOW-stage rows made no sense at pre-design — the wire advisory had
  // nowhere to be answered (WireCheckRow is a SOW-tab control), and "Level
  // chosen" / "requirements appended" describe the handoff post. All three
  // SVT rows are advisories, never gates — the house rule.
  const checks: Check[] =
    mode === 'svt'
      ? [
          ...requiredChecks,
          {
            label: 'Battery location filled',
            done: !!record.installNotes?.batteryLocation?.trim(),
            tone: 'advisory',
            action: 'Fill in',
          },
          {
            label: 'Homeowner agreement answered',
            done: record.svt?.hoAgrees !== undefined,
            tone: 'advisory',
            action: 'Answer',
          },
          {
            label: 'Conduit path ticked',
            done: SVT_PATHS.some((p) => record.svt?.[p.field]) || !!record.svt?.pathNotes?.trim(),
            tone: 'advisory',
            action: 'Tick',
          },
        ]
      : [
          ...requiredChecks,
          { label: `Level ${record.level} chosen · ${LEVEL_NAMES[record.level]}`, done: true },
          {
            label: ahjMatch
              ? ahjApproved
                ? `${ahjMatch.ahj.name} requirements appended`
                : `${ahjMatch.ahj.name} requirements reviewed, not appended`
              : 'No AHJ board on file',
            done: true,
          },
          wireCheck,
        ];

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
            <li key={c.label} className={c.done ? 'done' : c.tone === 'advisory' ? 'advisory' : 'todo'}>
              <span className="check-ring">{c.done ? '✓' : c.tone === 'advisory' ? '!' : ''}</span>
              <span className="check-label">{c.label}</span>
              {!c.done && c.action && <span className="check-action">{c.action}</span>}
            </li>
          ))}
        </ul>

        <div className="readiness-actions">
          {mode === 'svt' && (
            <button
              type="button"
              className="btn primary"
              disabled={!ready}
              onClick={() => void copySvt()}
              title="Ctrl+Shift+C"
            >
              Copy SVT post
            </button>
          )}
          {mode === 'sow' && (
          <>
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
          </>
          )}
        </div>
      </div>

      {/* SVT pre-design preview (Aboud 2026-11-15): one generated post, no
          manual edit — the pre-design note is short-lived and regenerating it
          from the form is the point. */}
      {mode === 'svt' && (
        <div className="card preview-card">
          <div className="preview-head">
            <span className="section-label">SVT post preview</span>
            <span className="muted">Updates as you type</span>
          </div>
          {/* buildSvtPostHtml escapes all user text — safe to render. */}
          <div className="preview" dangerouslySetInnerHTML={{ __html: svtHtml }} />
        </div>
      )}

      {mode === 'sow' && (
      <>
      {titleBlockOpen && <TitleBlockCard record={record} boardProjects={boardProjects} toast={toast} />}

      <div className="output-view-toggle" role="tablist" aria-label="Output format">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'sf'}
          className={`btn small ${view === 'sf' ? 'primary' : 'secondary'}`}
          onClick={() => setView('sf')}
        >
          Salesforce fields
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'slack'}
          className={`btn small ${view === 'slack' ? 'primary' : 'secondary'}`}
          onClick={() => setView('slack')}
        >
          Slack post
        </button>
      </div>

      {view === 'sf' && <SfSubmissionCard record={record} settings={settings} ahjs={ahjs} toast={toast} />}

      <div className="card preview-card" style={view === 'sf' ? { display: 'none' } : undefined}>
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
      </>
      )}
    </aside>
  );
}
