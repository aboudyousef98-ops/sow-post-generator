// Board cell editors — one component per column type (spec §6.2). Each editor
// commits a single-field patch via onPatch; the optimistic write and the
// activity entry happen in BoardTab, so these stay dumb.

import { useEffect, useRef, useState } from 'react';
import { isoToUs, relativeTime, todayIso } from '../lib/dates';
import { labelTextColor, labelsFor } from '../lib/board';
import type { BoardLabel, BoardProject, LabelColumnKey } from './types';
import Popover from './Popover';

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// ---- Project name: click → inline input ------------------------------------

export function NameCell({
  project,
  onRename,
}: {
  project: BoardProject;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(project.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, project.name]);

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== project.name) onRename(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="board-name-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        aria-label="Project name"
      />
    );
  }
  return (
    <button type="button" className="board-name" onClick={() => setEditing(true)} title={project.name}>
      {project.name}
    </button>
  );
}

// ---- Status / Design-Schedule: full-color block + label grid ----------------

export function LabelCell({
  labels,
  columnKey,
  valueId,
  onPick,
  onEditLabels,
}: {
  labels: BoardLabel[];
  columnKey: LabelColumnKey;
  valueId: string | null;
  onPick: (id: string | null) => void;
  onEditLabels: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = valueId ? labels.find((l) => l.id === valueId) : undefined;
  const options = labelsFor(labels, columnKey);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        current ? (
          <button
            type="button"
            className="board-label-cell"
            style={{ background: current.color, color: labelTextColor(current.color) }}
          >
            {current.name}
          </button>
        ) : (
          <button type="button" className="board-label-cell empty">
            —
          </button>
        )
      }
    >
      <div className="board-label-grid" role="listbox" aria-label={columnKey}>
        {options.map((l) => (
          <button
            key={l.id}
            type="button"
            role="option"
            aria-selected={l.id === valueId}
            className="board-label-option"
            style={{ background: l.color, color: labelTextColor(l.color) }}
            onClick={() => {
              setOpen(false);
              // monday behaviour: clicking the current label clears it.
              onPick(l.id === valueId ? null : l.id);
            }}
          >
            {l.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="board-popover-footer"
        onClick={() => {
          setOpen(false);
          onEditLabels();
        }}
      >
        ✎ Edit labels
      </button>
    </Popover>
  );
}

// ---- SOW coordinator: person picker -----------------------------------------

export function PersonCell({
  value,
  authors,
  me,
  onPick,
}: {
  value: string;
  authors: string[];
  me: string;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // A coordinator removed from the roster must stay visible on the row.
  const options = value && !authors.includes(value) ? [value, ...authors] : authors;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      matchWidth
      trigger={
        <button type="button" className={value ? 'board-person' : 'board-person empty'}>
          {value ? (
            <>
              <span className="board-avatar">{initialsOf(value)}</span>
              <span className="board-person-name">{value}</span>
            </>
          ) : (
            '—'
          )}
        </button>
      }
    >
      <div className="board-menu" role="listbox" aria-label="SOW coordinator">
        {me && value !== me && (
          <button type="button" className="board-menu-item strong" onClick={() => { setOpen(false); onPick(me); }}>
            Assign to me
          </button>
        )}
        {options.map((a) => (
          <button
            key={a}
            type="button"
            role="option"
            aria-selected={a === value}
            className={`board-menu-item ${a === value ? 'active' : ''}`}
            onClick={() => { setOpen(false); onPick(a); }}
          >
            <span className="board-avatar">{initialsOf(a)}</span> {a}
          </button>
        ))}
        <button type="button" className="board-menu-item muted" onClick={() => { setOpen(false); onPick(''); }}>
          Unassigned
        </button>
      </div>
    </Popover>
  );
}

// ---- Designed date: native date input in a popover --------------------------

export function DateCell({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className={value ? 'board-date' : 'board-date empty'}>
          {value ? isoToUs(value) : '—'}
        </button>
      }
    >
      <div className="board-date-pop">
        <input
          type="date"
          aria-label="Designed date"
          value={value ?? ''}
          autoFocus
          onChange={(e) => {
            // The native input yields 'YYYY-MM-DD' as a string — never a Date
            // object, so no UTC shift is possible here (T8).
            onPick(e.target.value || null);
            if (e.target.value) setOpen(false);
          }}
        />
        <div className="board-date-actions">
          <button type="button" className="btn small secondary" onClick={() => { onPick(todayIso()); setOpen(false); }}>
            Today
          </button>
          <button type="button" className="btn small secondary" onClick={() => { onPick(null); setOpen(false); }}>
            Clear
          </button>
        </div>
      </div>
    </Popover>
  );
}

// ---- Rating: 1–3 stars -------------------------------------------------------

export function RatingCell({
  value,
  onPick,
}: {
  value: 1 | 2 | 3 | null;
  onPick: (rating: 1 | 2 | 3 | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div
      className="board-rating"
      role="slider"
      aria-label="Rating"
      aria-valuemin={0}
      aria-valuemax={3}
      aria-valuenow={value ?? 0}
      tabIndex={0}
      onMouseLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === '0') onPick(null);
        if (e.key === '1' || e.key === '2' || e.key === '3') onPick(Number(e.key) as 1 | 2 | 3);
      }}
    >
      {([1, 2, 3] as const).map((n) => (
        <button
          key={n}
          type="button"
          tabIndex={-1}
          className={`board-star ${n <= shown ? 'on' : ''}`}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onPick(n === value ? null : n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ---- Last update (hidden by default) ----------------------------------------

export function UpdatedCell({ project }: { project: BoardProject }) {
  const when = relativeTime(project.updatedAt);
  return (
    <span className="cell-meta nowrap" title={new Date(project.updatedAt).toLocaleString()}>
      {project.updatedBy ? `${project.updatedBy} · ` : ''}
      {when}
    </span>
  );
}
