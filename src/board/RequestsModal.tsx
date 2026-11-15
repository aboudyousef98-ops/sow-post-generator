// Slack-captured designer requests — the three surfaces (Aboud's 2026-11-06
// design, built 2026-11-15):
//   1. PasteFromSlackModal — batch capture: paste messages, fuzzy-matched to
//      rows, a human confirms every match; unmatched park in the inbox here.
//   2. RequestsViewerModal — the amber chip's list, and the soft popup when a
//      row moves to "Working on it". Read + resolve, nothing blocked.
//   3. RequestsGateModal — the hard gate at "Ready to submit"/"Done": every
//      open request must be marked resolved before the status change lands.

import { useMemo, useState } from 'react';
import type { BoardProject, ProjectRequest } from '../board/types';
import { liveProjects } from '../lib/board';
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

function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: BoardProject[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select aria-label="Attach to project" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— no match yet (keep in the inbox)</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
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
                  <ProjectPicker
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
                    <ProjectPicker
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

/** The amber chip's list, also the soft popup at "Working on it". */
export function RequestsViewerModal({
  project,
  requests,
  me,
  soft,
  onPut,
  onClose,
}: {
  project: BoardProject;
  requests: ProjectRequest[];
  me: string;
  /** True when this opened on its own because work just started. */
  soft?: boolean;
  onPut: (items: ProjectRequest[]) => void;
  onClose: () => void;
}) {
  const mine = requests.filter((r) => r.projectId === project.id && !r.deleted);
  const open = mine.filter((r) => !r.resolvedAt);
  const resolved = mine.filter((r) => r.resolvedAt);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Slack requests" onClick={(e) => e.stopPropagation()}>
        <h3>
          Slack requests — {project.name}
        </h3>
        {soft && (
          <p className="muted" style={{ marginTop: -8 }}>
            Work is starting — the designers asked for these. They must be resolved before
            “Ready to submit” / “Done”.
          </p>
        )}
        <div className="req-confirm-list">
          {open.map((r) => (
            <div key={r.id} className="req-confirm">
              <div className="req-text">{r.text}</div>
              <div className="req-meta">
                added by {r.addedBy} ·{' '}
                <button type="button" className="btn small secondary" onClick={() => onPut([resolveRequest(r, me)])}>
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
          {resolved.map((r) => (
            <div key={r.id} className="req-confirm req-done">
              <div className="req-text">{r.text}</div>
              <div className="req-meta">✓ resolved by {r.resolvedBy}</div>
            </div>
          ))}
          {mine.length === 0 && <p className="muted">Nothing here.</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            {soft ? 'Got it' : 'Close'}
          </button>
        </div>
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
