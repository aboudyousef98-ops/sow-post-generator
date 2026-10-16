// The formatting toolbar for the notes / requirements composers.
//
// It edits the textarea's plain text — there is no rich-text editing model and
// no contenteditable. What you see in the box is the literal Slack markup, so
// nothing can desync between what is stored and what is drawn.
//
// Not used on the Compose feedback boxes: those go through the AI polish path,
// where marks collide with the bullet-count guard (Aboud 2026-10-08, out of scope).

import type { RefObject } from 'react';

type Leader = 'bullet' | 'number' | 'check';

interface Props {
  taRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  /** Labels the control group for screen readers, e.g. "New note". */
  label: string;
}

const MARK = { bold: '*', italic: '_', strike: '~' } as const;
type MarkKey = keyof typeof MARK;

/** The leader a line already carries, if any. */
function leaderOf(line: string): { kind: Leader | null; len: number } {
  let m = /^\s*[•◦·]\s+/.exec(line);
  if (m) return { kind: 'bullet', len: m[0].length };
  m = /^\s*\d{1,3}[.)]\s+/.exec(line);
  if (m) return { kind: 'number', len: m[0].length };
  m = /^\s*(?:\[[ xX]\]|[☐☑])\s+/.exec(line);
  if (m) return { kind: 'check', len: m[0].length };
  return { kind: null, len: 0 };
}

/** Expand a collapsed caret to the whole word, so bold works without selecting. */
function wordAt(text: string, start: number, end: number): [number, number] {
  if (start !== end) return [start, end];
  const w = /[\p{L}\p{N}_]/u;
  let s = start;
  let e = end;
  while (s > 0 && w.test(text[s - 1])) s--;
  while (e < text.length && w.test(text[e])) e++;
  return [s, e];
}

export default function FormatToolbar({ taRef, value, onChange, label }: Props) {
  /** Re-focus and restore the selection after React re-renders the value. */
  const commit = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  };

  const toggleMark = (key: MarkKey) => {
    const ta = taRef.current;
    if (!ta) return;
    const ch = MARK[key];
    const [s, e] = wordAt(value, ta.selectionStart, ta.selectionEnd);
    if (s === e) return; // nothing to mark
    const inner = value.slice(s, e);
    const wrapped = value.slice(s - 1, s) === ch && value.slice(e, e + 1) === ch;

    if (wrapped) {
      const next = value.slice(0, s - 1) + inner + value.slice(e + 1);
      commit(next, s - 1, e - 1);
      return;
    }
    const next = `${value.slice(0, s)}${ch}${inner}${ch}${value.slice(e)}`;
    commit(next, s + 1, e + 1);
  };

  /**
   * Apply (or remove) a line leader across every line the selection touches.
   * Toggling off restores the bare line; numbers always renumber from 1.
   */
  const toggleLeader = (kind: Leader) => {
    const ta = taRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const from = value.lastIndexOf('\n', selStart - 1) + 1;
    const toRaw = value.indexOf('\n', selEnd);
    const to = toRaw === -1 ? value.length : toRaw;

    const lines = value.slice(from, to).split('\n');
    // If every touched line already has this leader, the button turns it off.
    const allHave = lines.filter((l) => l.trim()).every((l) => leaderOf(l).kind === kind);

    let n = 0;
    const next = lines
      .map((l) => {
        const { len } = leaderOf(l);
        const bare = l.slice(len);
        if (!bare.trim() && !l.trim()) return l;
        if (allHave) return bare;
        n++;
        const lead = kind === 'bullet' ? '• ' : kind === 'number' ? `${n}. ` : '☐ ';
        return lead + bare;
      })
      .join('\n');

    const merged = value.slice(0, from) + next + value.slice(to);
    const delta = merged.length - value.length;
    commit(merged, from, Math.max(from, selEnd + delta));
  };

  /** Tick / untick the checkbox on the caret's line. */
  const toggleDone = () => {
    const ta = taRef.current;
    if (!ta) return;
    const from = value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    const toRaw = value.indexOf('\n', from);
    const to = toRaw === -1 ? value.length : toRaw;
    const line = value.slice(from, to);
    if (leaderOf(line).kind !== 'check') return toggleLeader('check');
    const flipped = line.includes('☑') || /\[[xX]\]/.test(line)
      ? line.replace('☑', '☐').replace(/\[[xX]\]/, '[ ]')
      : line.replace('☐', '☑').replace(/\[ \]/, '[x]');
    commit(value.slice(0, from) + flipped + value.slice(to), ta.selectionStart, ta.selectionEnd);
  };

  const B = ({ on, title, children }: { on: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" className="fmt-btn" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={on}>
      {children}
    </button>
  );

  return (
    <div className="fmt-bar" role="group" aria-label={`Formatting for ${label}`}>
      <B on={() => toggleMark('bold')} title="Bold (Ctrl+B)"><strong>B</strong></B>
      <B on={() => toggleMark('italic')} title="Italic (Ctrl+I)"><em>I</em></B>
      <B on={() => toggleMark('strike')} title="Strikethrough"><s>S</s></B>
      <span className="fmt-sep" />
      <B on={() => toggleLeader('bullet')} title="Bulleted list">•&#8203;—</B>
      <B on={() => toggleLeader('number')} title="Numbered list">1.</B>
      <B on={toggleDone} title="Checkbox">☐</B>
    </div>
  );
}

/**
 * Enter on a list line carries the leader to the next line; Enter on an EMPTY
 * list line ends the list instead. Returns true if it handled the key.
 */
export function continueList(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  taRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (s: string) => void,
): boolean {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return false;
  const ta = taRef.current;
  if (!ta || ta.selectionStart !== ta.selectionEnd) return false;
  const pos = ta.selectionStart;
  const from = value.lastIndexOf('\n', pos - 1) + 1;
  const line = value.slice(from, pos);
  const { kind, len } = leaderOf(line);
  if (!kind) return false;

  e.preventDefault();
  // Empty item — drop the leader and leave the list.
  if (!line.slice(len).trim()) {
    const next = value.slice(0, from) + value.slice(pos);
    onChange(next);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(from, from);
    });
    return true;
  }
  const num = kind === 'number' ? (parseInt(/\d+/.exec(line)?.[0] ?? '1', 10) || 1) + 1 : 0;
  const lead = kind === 'bullet' ? '• ' : kind === 'number' ? `${num}. ` : '☐ ';
  const next = `${value.slice(0, pos)}\n${lead}${value.slice(pos)}`;
  const caret = pos + 1 + lead.length;
  onChange(next);
  requestAnimationFrame(() => {
    taRef.current?.focus();
    taRef.current?.setSelectionRange(caret, caret);
  });
  return true;
}

/** Ctrl/Cmd+B and Ctrl/Cmd+I, wired by each composer's onKeyDown. */
export function formatHotkey(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  taRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (s: string) => void,
): boolean {
  if (!(e.ctrlKey || e.metaKey)) return false;
  const k = e.key.toLowerCase();
  if (k !== 'b' && k !== 'i') return false;
  e.preventDefault();
  const ta = taRef.current;
  if (!ta) return true;
  const ch = k === 'b' ? '*' : '_';
  const [s, en] = wordAt(value, ta.selectionStart, ta.selectionEnd);
  if (s === en) return true;
  const inner = value.slice(s, en);
  const wrapped = value.slice(s - 1, s) === ch && value.slice(en, en + 1) === ch;
  const next = wrapped
    ? value.slice(0, s - 1) + inner + value.slice(en + 1)
    : `${value.slice(0, s)}${ch}${inner}${ch}${value.slice(en)}`;
  onChange(next);
  const shift = wrapped ? -1 : 1;
  requestAnimationFrame(() => {
    taRef.current?.focus();
    taRef.current?.setSelectionRange(s + shift, en + shift);
  });
  return true;
}
