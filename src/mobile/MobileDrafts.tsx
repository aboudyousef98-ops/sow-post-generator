// Mobile Drafts (iPhone design handoff 2026-10-06): card list → review screen
// with a readiness checklist, the real Slack preview (buildPostText), and a
// pinned "Copy for Slack / Mark posted" bar. Editing fields stays a desktop
// Compose job — the phone is for reviewing and shipping.

import { useEffect, useState } from 'react';
import type { Ahj, PostRecord, Settings } from '../types';
import { matchAhj } from '../lib/ahj';
import { isoToUs, relativeTime } from '../lib/dates';
import { LEVEL_NAMES } from '../lib/classify';
import { buildPostText, missingRequired } from '../lib/template';
import BottomSheet from './BottomSheet';

interface Props {
  drafts: PostRecord[]; // live drafts, newest first (App's allDrafts)
  settings: Settings;
  ahjs: Ahj[];
  /** Id of the draft to open directly (from the Board's Post cell), consumed once. */
  openId: string | null;
  onOpenConsumed: () => void;
  markPostedById: (id: string) => void;
  duplicateDraft: (id: string) => void;
  deleteRecord: (id: string) => void;
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
}

const LEVEL_PILL: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#6baa3d', fg: '#1a1a1a' },
  2: { bg: '#f2b32b', fg: '#1a1a1a' },
  3: { bg: '#e8792b', fg: '#fff' },
  4: { bg: '#c1121f', fg: '#fff' },
};

export default function MobileDrafts({
  drafts,
  settings,
  ahjs,
  openId,
  onOpenConsumed,
  markPostedById,
  duplicateDraft,
  deleteRecord,
  toast,
}: Props) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // A board "Open draft" tap lands here with the draft preselected.
  useEffect(() => {
    if (openId) {
      setCurrentId(openId);
      onOpenConsumed();
    }
  }, [openId, onOpenConsumed]);

  const current = currentId ? drafts.find((d) => d.id === currentId) : undefined;

  if (!current) {
    return (
      <div className="m-screen">
        <header className="m-head">
          <div className="m-head-row">
            <h1>Drafts</h1>
            <span className="m-head-sub">{drafts.length} in progress · saved automatically</span>
          </div>
        </header>
        <div className="m-list-scroll">
          {drafts.length === 0 && <p className="m-empty">No drafts — start one on desktop Compose.</p>}
          {drafts.map((d) => {
            const missing = missingRequired(d);
            const ready = missing.length === 0;
            return (
              <button key={d.id} className="m-card m-draft-card" onClick={() => setCurrentId(d.id)}>
                <div className="m-draft-top">
                  <span className={`m-draft-name ${d.sf.customerName ? '' : 'muted'}`}>
                    {d.sf.customerName || 'Untitled draft'}
                  </span>
                  <span
                    className="m-level-pill"
                    style={{ background: LEVEL_PILL[d.level].bg, color: LEVEL_PILL[d.level].fg }}
                  >
                    L{d.level}
                  </span>
                </div>
                <div className="m-draft-meta">
                  {[d.sf.region, d.author].filter(Boolean).join(' · ')} · Install{' '}
                  {d.sf.installScheduledDate ? isoToUs(d.sf.installScheduledDate) : '—'}
                </div>
                <div className="m-draft-bottom">
                  <span className={`m-ready ${ready ? 'ok' : 'warn'}`}>
                    <span className="m-ready-dot" />
                    {ready
                      ? 'Ready'
                      : missing.length === 1
                        ? `Missing ${missing[0].toLowerCase()}`
                        : `Missing ${missing.length} fields`}
                  </span>
                  <span className="m-spacer" />
                  <span className="m-draft-edited">{relativeTime(d.updatedAt)}</span>
                  <span className="m-chev">›</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const missing = missingRequired(current);
  const ready = missing.length === 0;
  const ahjMatch = matchAhj(current.sf.jurisdiction, ahjs);
  const postText = buildPostText(current, settings, ahjs);

  const checks: { label: string; done: boolean }[] = [
    { label: 'Customer name', done: !missing.includes('Customer name') },
    { label: 'Jurisdiction', done: !missing.includes('Jurisdiction') },
    { label: 'Site address', done: !missing.includes('Site address') },
    { label: `Level ${current.level} chosen · ${LEVEL_NAMES[current.level]}`, done: true },
    {
      label: ahjMatch ? `${ahjMatch.ahj.name} requirements on file` : 'No AHJ board on file',
      done: true,
    },
  ];

  const copySlack = async () => {
    if (!ready) {
      toast(`Fill in: ${missing.join(', ')} first.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(postText);
      toast('Copied. Paste into Slack, then re-type the @mentions if they appear as plain text.');
    } catch {
      toast('Could not copy to the clipboard.');
    }
  };

  return (
    <div className="m-screen">
      <header className="m-head m-head-nav">
        <button className="m-back" onClick={() => setCurrentId(null)}>
          <span>‹</span>Drafts
        </button>
        <span className="m-head-title">{current.sf.customerName || 'Untitled draft'}</span>
        <button className="m-more" onClick={() => setMoreOpen(true)}>
          ···
        </button>
      </header>

      <div className="m-list-scroll m-review-scroll">
        <div className="m-card m-pad">
          <div className="m-review-ready">
            <span className={`m-review-mark ${ready ? 'ok' : 'warn'}`}>{ready ? '✓' : missing.length}</span>
            <div>
              <div className="m-review-title">
                {ready ? 'Ready to post' : `${missing.length} thing${missing.length === 1 ? '' : 's'} before posting`}
              </div>
              <div className="m-review-sub">
                {ready ? 'Every required field is filled' : `Missing: ${missing.join(', ')}`}
              </div>
            </div>
          </div>
          <ul className="m-checklist">
            {checks.map((c) => (
              <li key={c.label} className={c.done ? 'done' : ''}>
                <span className="m-check-ring">{c.done ? '✓' : ''}</span>
                <span>{c.label}</span>
                {!c.done && <span className="m-check-action">Fill in on desktop</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="m-card">
          <div className="m-card-strip">
            <span>Slack preview</span>
          </div>
          <pre className="m-preview">{postText}</pre>
        </div>
      </div>

      <div className="m-pinned-bar">
        <button className="m-btn-orange" style={{ opacity: ready ? 1 : 0.55 }} onClick={() => void copySlack()}>
          Copy for Slack
        </button>
        <button
          className="m-btn-ghost"
          style={{ opacity: ready ? 1 : 0.55 }}
          onClick={() => {
            if (!ready) {
              toast(`Fill in: ${missing.join(', ')} first.`);
              return;
            }
            markPostedById(current.id);
            setCurrentId(null);
          }}
        >
          Mark posted
        </button>
      </div>

      {moreOpen && (
        <BottomSheet title="More" sub={current.sf.customerName || 'Untitled draft'} onClose={() => setMoreOpen(false)}>
          <div className="m-sheet-list">
            <button
              className="m-sheet-item"
              onClick={() => {
                setMoreOpen(false);
                void navigator.clipboard.writeText(postText).then(
                  () => toast('Plain text copied.'),
                  () => toast('Could not copy.'),
                );
              }}
            >
              Copy plain text
            </button>
            <button
              className="m-sheet-item"
              onClick={() => {
                setMoreOpen(false);
                duplicateDraft(current.id);
              }}
            >
              Duplicate draft
            </button>
            <button
              className="m-sheet-item danger"
              onClick={() => {
                setMoreOpen(false);
                setCurrentId(null);
                deleteRecord(current.id);
              }}
            >
              Delete draft
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
