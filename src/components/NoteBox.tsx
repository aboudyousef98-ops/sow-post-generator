// One labelled free-text box: textarea + quick-insert chips + the polished
// preview, the two AI guards, and the per-box revert link. Extracted from
// ComposeTab in Phase 7 so Installation Notes and Feedback share one
// implementation instead of two copies.

import React from 'react';
import type { PolishKey, RewriteMode } from '../types';

interface Props {
  label: string;
  polishKey: PolishKey;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  rows?: number;
  chips?: string[];
  onChip?: (phrase: string) => void;
  polished?: string;
  /** Absent usePolished key means ON — the parent resolves that before passing. */
  usePolished: boolean;
  onToggle: (usePolished: boolean) => void;
  dropped?: string[];
  drift?: { from: number; to: number };
  /** Which AI mode produced `polished`; drives the preview marker. */
  mode?: RewriteMode;
}

export default function NoteBox({
  label,
  polishKey,
  value,
  onChange,
  onKeyDown,
  placeholder,
  rows = 3,
  chips,
  onChip,
  polished,
  usePolished,
  onToggle,
  dropped,
  drift,
  mode,
}: Props) {
  const hasPolished = polished !== undefined && value.trim() !== '';

  return (
    <div className="note-block" data-polish-key={polishKey}>
      <div className="note-head">
        <label className="field" style={{ marginBottom: 0 }}>
          {label}
        </label>
        {hasPolished && (
          <button type="button" className="btn link small" onClick={() => onToggle(!usePolished)}>
            {usePolished ? 'Revert to my draft' : 'Use polished'}
          </button>
        )}
      </div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      {hasPolished && usePolished && (
        <div className="muted" style={{ marginTop: 3, whiteSpace: 'pre-wrap' }}>
          {mode === 'rewrite' ? '🔄' : '✨'} {polished}
        </div>
      )}
      {dropped && dropped.length > 0 && (
        <div className="dropped-tokens">
          AI output dropped: {dropped.map((t) => `\`${t}\``).join(', ')} — check before posting
        </div>
      )}
      {drift && (
        <div className="dropped-tokens">
          AI returned {drift.to} bullet{drift.to === 1 ? '' : 's'} instead of {drift.from} — check it
          before posting, or "Revert to my draft".
        </div>
      )}
      {chips && chips.length > 0 && onChip && (
        <div className="chips">
          {chips.map((c) => (
            <button type="button" key={c} className="chip" title={c} onClick={() => onChip(c)}>
              {c.length > 48 ? `${c.slice(0, 48)}…` : c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
