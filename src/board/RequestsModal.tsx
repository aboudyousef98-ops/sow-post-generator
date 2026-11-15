// Slack-captured designer requests — the three surfaces (Aboud's 2026-11-06
// design, built 2026-11-15):
//   1. PasteFromSlackModal — batch capture: paste messages, fuzzy-matched to
//      rows, a human confirms every match; unmatched park in the inbox here.
//   2. RequestsViewerModal — the amber chip's list, and the soft popup when a
//      row moves to "Working on it". Read + resolve, nothing blocked.
//   3. RequestsGateModal — the hard gate at "Ready to submit"/"Done": every
//      open request must be marked resolved before the status change lands.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardProject, ProjectRequest } from '../board/types';
import { liveProjects, nameKey } from '../lib/board';
import {
  attachRequest,
  deleteRequest,
  inboxRequests,
  newRequest,
  parseSlackPaste,
  resolveRequest,
  suggestProject,
} from '../lib/requests';

/** One parsed message awaiting its match confirmation. */
interface Draft {
  text: string;
  /** '' = park in the inbox. */
  projectId: string;
}

/**
 * Type-ahead project search (Aboud 2026-11-15: "a search engine to find the
 * project by its name, start searching by the first letter") — a 400-row
 * board outgrows a <select>. Names STARTING with the typed letters list
 * first, then names merely containing them; a cleared box = no match (the
 * request keeps waiting in the inbox).
 */
function ProjectSearchPicker({
  projects,
  value,
  onChange,
}: {
  projects: BoardProject[];
  /** Selected project id, '' = none. */
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = projects.find((p) => p.id === value) ?? null;
  const [text, setText] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // External changes (the fuzzy pre-fill, an attach elsewhere) refresh the box.
  useEffect(() => {
    setText(selected?.name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Click anywhere else closes the list and restores the selected name.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setText(selected?.name ?? '');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, selected]);

  const q = nameKey(text);
  const results = useMemo(() => {
    if (!q) return [];
    const starts: BoardProject[] = [];
    const contains: BoardProject[] = [];
    for (const p of projects) {
      const key = nameKey(p.name);
      if (key.startsWith(q)) starts.push(p);
      else if (key.includes(q)) contains.push(p);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [q, projects]);

  const pick = (p: BoardProject) => {
    onChange(p.id);
    setText(p.name);
    setOpen(false);
  };

  return (
    <div className="req-picker" ref={wrapRef}>
      <input
        type="text"
        aria-label="Attach to project"
        placeholder="Type the project name…"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          // Emptying the box un-attaches: back to "no match yet".
          if (!e.target.value.trim() && value) onChange('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length) {
            e.preventDefault();
            pick(results[0]);
          }
          if (e.key === 'Escape') {
            setOpen(false);
            setText(selected?.name ?? '');
          }
        }}
      />
      {!value && !text && <span className="req-picker-hint">— no match yet (keep in the inbox)</span>}
      {open && results.length > 0 && (
        <div className="req-picker-list" role="listbox" aria-label="Matching projects">
          {results.map((p) => (
            <button type="button" key={p.id} role="option" aria-selected={p.id === value} onClick={() => pick(p)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PasteFromSlackModal({
  projects,
  requests,
  me,
  onPut,
  toast,
  onClose,
}: {
  projects: BoardProject[];
  requests: ProjectRequest[];
  me: string;
  /** Upsert the given requests in ONE board write. */
  onPut: (items: ProjectRequest[]) => void;
  toast: (text: string) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const rows = useMemo(() => liveProjects(projects).sort((a, b) => a.name.localeCompare(b.name)), [projects]);
  const inbox = inboxRequests(requests);

  const parse = () => {
    const chunks = parseSlackPaste(raw);
    if (!chunks.length) {
      toast('Nothing usable in the paste — each message needs at least a short sentence.');
      return;
    }
    setDrafts(chunks.map((text) => ({ text, projectId: suggestProject(text, rows)?.id ?? '' })));
  };

  const add = () => {
    if (!drafts?.length) return;
    onPut(drafts.map((d) => newRequest(d.text, d.projectId || null, me)));
    const parked = drafts.filter((d) => !d.projectId).length;
    toast(
      parked
        ? `${drafts.length} request${drafts.length === 1 ? '' : 's'} added — ${parked} parked in the inbox until their rows exist.`
        : `${drafts.length} request${drafts.length === 1 ? '' : 's'} added to the board.`,
    );
    setRaw('');
    setDrafts(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal board-labels" onClick={(e) => e.stopPropagation()}>
        <h3>Paste from Slack</h3>
        <p className="muted" style={{ marginTop: -8 }}>
          Copy the designers’ request messages from Slack — several at once is fine — and paste them here.
          Each message becomes a request on its project: an amber chip on the row, shown when work starts,
          and required resolved before “Ready to submit” / “Done”.
        </p>

        {drafts === null ? (
          <>
            <textarea
              rows={6}
              aria-label="Pasted Slack messages"
              placeholder={'e.g. “for Rebecca Post we will need to special order Cu SER wires — make sure that is in the BOS”\n\n(blank line between messages)'}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn primary" disabled={!raw.trim()} onClick={parse}>
                Match messages
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="req-confirm-list">
              {drafts.map((d, i) => (
                <div key={i} className="req-confirm">
                  <div className="req-text">{d.text}</div>
                  <ProjectSearchPicker
                    projects={rows}
                    value={d.projectId}
                    onChange={(projectId) => setDrafts((ds) => ds!.map((x, j) => (j === i ? { ...x, projectId } : x)))}
                  />
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setDrafts(null)}>
                Back
              </button>
              <button type="button" className="btn primary" onClick={add}>
                Add {drafts.length} request{drafts.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        {inbox.length > 0 && (
          <>
            <div className="install-subhead">Inbox — waiting for their rows ({inbox.length})</div>
            <div className="req-confirm-list">
              {inbox.map((r) => (
                <div key={r.id} className="req-confirm">
                  <div className="req-text">{r.text}</div>
                  <div className="req-inbox-actions">
                    <ProjectSearchPicker
                      projects={rows}
                      value={suggestProject(r.text, rows)?.id ?? ''}
                      onChange={(projectId) => {
                        if (projectId) {
                          onPut([attachRequest(r, projectId)]);
                          toast('Attached.');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn small secondary"
                      title="Remove this parked request"
                      onClick={() => onPut([deleteRequest(r, me)])}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The hard gate: the status change is HELD until every open request is
 * marked resolved. Cancel leaves everything exactly as it was. */
export function RequestsGateModal({
  project,
  open,
  me,
  targetName,
  onConfirm,
  onCancel,
}: {
  project: BoardProject;
  open: ProjectRequest[];
  me: string;
  /** The status the row is trying to reach, for the headline. */
  targetName: string;
  /** Called with every request resolved — the caller writes them AND applies
   * the held status change. */
  onConfirm: (resolved: ProjectRequest[]) => void;
  onCancel: () => void;
}) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const allTicked = open.every((r) => ticked[r.id]);
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Open Slack requests" onClick={(e) => e.stopPropagation()}>
        <h3>
          {open.length} open Slack request{open.length === 1 ? '' : 's'} on {project.name}
        </h3>
        <p className="muted" style={{ marginTop: -8 }}>
          The designers asked for these. Confirm each one is actually DONE — the wire ordered, the call
          made — before the project moves to “{targetName}”.
        </p>
        <div className="req-confirm-list">
          {open.map((r) => (
            <div key={r.id} className={`req-confirm ${ticked[r.id] ? 'req-done' : ''}`}>
              <div className="req-text">{r.text}</div>
              <label className="service-tick req-meta">
                <input
                  type="checkbox"
                  checked={ticked[r.id] ?? false}
                  onChange={(e) => setTicked((t) => ({ ...t, [r.id]: e.target.checked }))}
                />
                Resolved — this is done
              </label>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!allTicked}
            onClick={() => onConfirm(open.map((r) => resolveRequest(r, me)))}
          >
            Resolve {open.length === 1 ? 'it' : 'all'} and set “{targetName}”
          </button>
        </div>
      </div>
    </div>
  );
}
