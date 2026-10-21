// AutoCAD title block panel (Aboud, 2026-09-28).
//
// The PROJECT INFORMATION table in the title block is pre-printed with its five
// labels, so only the five VALUES are copied across. Two ways out, because
// AutoCAD's acceptance of a browser clipboard is not guaranteed:
//   1. One button per field — always works (paste into the cell, Esc, next cell).
//   2. "Copy all 5" — writes a single-column HTML table plus newline-separated
//      text, so clicking the first value cell and pasting can fill all five.
// If (2) misbehaves in AutoCAD, (1) is the fallback and nothing else changes.

import { useState } from 'react';
import type { BoardProject } from '../board/types';
import { titleBlockFields, titleBlockTsv } from '../lib/template';
import type { PostRecord } from '../types';

interface Props {
  record: PostRecord;
  /** For the SOW Coordinator cell — the linked board row's assignment wins over the author. */
  boardProjects: BoardProject[];
  toast: (text: string) => void;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function TitleBlockCard({ record, boardProjects, toast }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fields = titleBlockFields(record, boardProjects);
  const filled = fields.filter((f) => f.value).length;

  const copyOne = async (label: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
  };

  const copyAll = async () => {
    const text = titleBlockTsv(record, boardProjects);
    const html = `<table>${fields.map((f) => `<tr><td>${esc(f.value)}</td></tr>`).join('')}</table>`;
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
    toast('All 5 values copied. In AutoCAD: double-click the table, click the first value cell, Ctrl+V.');
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>AutoCAD title block</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {filled}/5 filled
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        <button type="button" className="btn link small" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>
            The PROJECT INFORMATION table already has the labels — these are the five values only.
          </p>
          <table className="list">
            <tbody>
              {fields.map((f) => (
                <tr key={f.label}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{f.label}</td>
                  <td style={{ width: '100%' }}>
                    {f.value || <span className="muted">— empty —</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small secondary"
                      disabled={!f.value}
                      onClick={() => void copyOne(f.label, f.value)}
                    >
                      {copied === f.label ? '✓ Copied' : 'Copy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" disabled={filled === 0} onClick={() => void copyAll()}>
              📋 Copy all 5 (paste into the first cell)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
