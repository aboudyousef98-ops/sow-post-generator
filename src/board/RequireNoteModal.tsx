// A change that cannot land without an explanation.
//
// Two of Aboud's 2026-10-17 asks are the same interaction:
//   #3 rating a project 4 or 5 stars must say why ("this project has trench and
//      external long run") so an AI search over updates can find it later.
//   #6 moving to "Pending additional information" must say WHAT is missing —
//      "This is a must".
//
// Both write a tagged update onto the project's thread, which is where he
// asked the rating comment to live. Cancel abandons the edit entirely: a
// half-applied change with no reason is exactly what this exists to prevent.

import { useEffect, useRef, useState } from 'react';
import FormatToolbar, { continueList, formatHotkey } from '../components/FormatToolbar';
import type { NoteGate } from './types';

// NoteGate moved to ./types on 2026-11-05 so lib/updates.statusGate can build
// one without a lib file importing a component. Re-exported here because that
// is where every caller already looks for it.
export type { NoteGate };

export default function RequireNoteModal({
  gate,
  projectName,
  onConfirm,
  onCancel,
}: {
  gate: NoteGate;
  projectName: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const ready = text.trim().length > 0;
  const confirm = () => {
    if (ready) onConfirm(text.trim());
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, textTransform: 'none', letterSpacing: 0 }}>{gate.title}</h3>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          {gate.prompt} <strong>{projectName}</strong>
        </p>

        <FormatToolbar taRef={ref} value={text} onChange={setText} label="Reason" />
        <textarea
          ref={ref}
          value={text}
          aria-label="Reason"
          rows={4}
          placeholder={gate.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              confirm();
              return;
            }
            if (e.key === 'Escape') {
              onCancel();
              return;
            }
            if (formatHotkey(e, ref, text, setText)) return;
            continueList(e, ref, text, setText);
          }}
          style={{ marginTop: 0 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          This is posted to the project's Updates, so it can be searched later.
        </span>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!ready} onClick={confirm}>
            {gate.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
