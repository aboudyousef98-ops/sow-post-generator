// Mobile Board (iPhone design handoff 2026-10-06): sideways-scrolling table
// with a sticky Project column, drag-resizable columns (double-tap a grip to
// reset one, "Reset columns" chip for all), filter chips, and a bottom sheet
// for EVERY cell edit. Mutations go through the same tested funnel as the
// desktop board: patchProject + activityForPatch → setBoard.

import { useMemo, useRef, useState } from 'react';
import type { BoardProject, BoardState } from '../board/types';
import type { PostRecord } from '../types';
import {
  activityEntry,
  activityForPatch,
  autoSortOn,
  cleanName,
  findDuplicate,
  labelById,
  labelsFor,
  labelTextColor,
  linkedPosts,
  liveProjects,
  newProject,
  patchProject,
  withPredesignDefault,
  type ProjectPatch,
} from '../lib/board';
import { sortByStatus, splitSections } from '../lib/boardViews';
import { isoToUs, relativeTime } from '../lib/dates';
import {
  deleteUpdate,
  isPendingInfoLabel,
  labelRequiresNote,
  needsRatingReason,
  newUpdate,
  putUpdate,
  statusGate,
  updateCounts,
  updatesFor,
} from '../lib/updates';
import type { NoteGate, ProjectUpdate, UpdateKind } from '../board/types';
import RichText from '../components/RichText';
import BottomSheet from './BottomSheet';

interface Props {
  board: BoardState;
  setBoard: (b: BoardState) => void;
  records: PostRecord[];
  me: string;
  isAdmin: boolean;
  authors: string[];
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
  /** Open the linked draft in the mobile Drafts review. */
  onOpenDraft: (recordId: string) => void;
}

type SheetKind = 'status' | 'phase' | 'person' | 'rating' | 'date' | 'menu' | 'filterStatus' | 'filterCoord' | 'filterPhase' | 'updates';
interface Sheet {
  kind: SheetKind;
  id?: string;
}

const COL_DEFS: [string, string][] = [
  ['name', 'Project'],
  ['coordinator', 'Coordinator'],
  ['status', 'Status'],
  ['date', 'Designed'],
  ['phase', 'Design/Schedule'],
  ['rating', 'Rating'],
  ['post', 'Post'],
];
const DEFAULT_WIDTHS: Record<string, number> = {
  name: 150, coordinator: 140, status: 130, date: 120, phase: 120, rating: 120, post: 130,
};
const MIN_WIDTHS: Record<string, number> = {
  name: 110, coordinator: 90, status: 90, date: 90, phase: 90, rating: 110, post: 90,
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export default function MobileBoard({ board, setBoard, records, me, isAdmin, authors, toast, onOpenDraft }: Props) {
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [coordFilter, setCoordFilter] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [predesignOpen, setPredesignOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({ ...DEFAULT_WIDTHS });
  const [resizing, setResizing] = useState<string | null>(null);
  const [gate, setGate] = useState<{
    project: BoardProject;
    patch: ProjectPatch;
    kind: UpdateKind;
    rating?: 1 | 2 | 3 | 4 | 5;
    /** Copy for the sheet — built by lib so it matches the desktop word for word. */
    copy: NoteGate;
  } | null>(null);
  const [gateText, setGateText] = useState('');
  const [updDraft, setUpdDraft] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  const updateCountById = useMemo(() => updateCounts(board.updates), [board.updates]);

  const statusLabels = labelsFor(board.labels, 'status');
  const phaseLabels = labelsFor(board.labels, 'phase');

  // Same mutation funnel as BoardTab.applyPatch — one row, one activity entry.
  const applyPatch = (project: BoardProject, rawPatch: ProjectPatch, withUpdate?: ProjectUpdate) => {
    // Entering Pre-Design seeds the sub-status default here too (2026-11-15).
    const patch = withPredesignDefault(project, rawPatch, board.labels);
    const patched = patchProject(project, patch, me);
    const act = activityForPatch(project, patch, me, board.labels);
    const extra = withUpdate ? [activityEntry(project.id, me, 'update-post')] : [];
    setBoard({
      ...board,
      projects: board.projects.map((p) => (p.id === project.id ? patched : p)),
      activity: [...(act ? [act] : []), ...extra, ...board.activity],
      updates: withUpdate ? putUpdate(board.updates, withUpdate) : (board.updates ?? []),
    });
  };

  /** Upsert one update on its own, logged — mirrors BoardTab.putUpdateOnBoard. */
  const putUpdateHere = (u: ProjectUpdate) => {
    const existed = (board.updates ?? []).some((x) => x.id === u.id);
    const action = u.deleted ? 'update-delete' : existed ? 'update-edit' : 'update-post';
    setBoard({
      ...board,
      updates: putUpdate(board.updates, u),
      activity: [activityEntry(u.projectId, me, action), ...board.activity],
    });
  };

  /**
   * The two gates, identical in effect to the desktop board (#3 and #6). They
   * were MISSING here, so a 4-star rating or a move to "Pending Additional
   * Information" could be made from a phone with no explanation at all —
   * exactly the rule Aboud called "a must".
   */
  const guardedPatch = (project: BoardProject, patch: ProjectPatch) => {
    if ('rating' in patch && needsRatingReason(patch.rating as number | null)) {
      const stars = patch.rating as 1 | 2 | 3 | 4 | 5;
      setGate({
        project,
        patch,
        kind: 'rating',
        rating: stars,
        copy: {
          title: `Why is this ${stars} stars?`,
          prompt: '',
          placeholder: 'e.g. this project has trench and external long run',
          confirmLabel: `Rate ${stars}★ and post`,
        },
      });
      return;
    }
    if ('statusId' in patch) {
      // Reads the same label flag the desktop board reads, so a status the
      // team gates is gated on a phone too — "Pending Update" included.
      const label = labelById(board.labels, (patch.statusId as string) ?? null);
      if (label && labelRequiresNote(label)) {
        setGate({
          project,
          patch,
          kind: isPendingInfoLabel(label.name) ? 'pending-info' : 'status',
          copy: statusGate(label),
        });
        return;
      }
    }
    applyPatch(project, patch);
  };

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      liveProjects(board.projects)
        .filter((p) => !needle || p.name.toLowerCase().includes(needle))
        .filter((p) => !mine || p.coordinator === me)
        .filter((p) => !coordFilter || p.coordinator === coordFilter)
        .filter((p) => !statusFilter || p.statusId === statusFilter)
        .filter((p) => !phaseFilter || p.phaseId === phaseFilter)
        .sort((a, b) => b.position - a.position),
    [board.projects, needle, mine, me, coordFilter, statusFilter, phaseFilter],
  );
  // Same sections as the desktop board, same rules (lib/boardViews).
  // (Installation Review rows are still not listed here — a pre-existing
  // mobile gap; Pre-Design joined 2026-11-15 because a phone user picking the
  // new status otherwise watched the row vanish from their own screen.)
  const {
    active: activeUnsorted,
    preDesign,
    outOfScope,
    completed,
  } = useMemo(() => splitSections(visible, board.labels), [visible, board.labels]);

  /**
   * Auto-sort is TEAM state, so a phone reads the same ordered board as a
   * laptop (Aboud 2026-11-05). There is no column sort here to defer to, and
   * no drag to reorder, so it simply applies when it is on.
   */
  const active = useMemo(
    () => (autoSortOn(board) ? sortByStatus(activeUnsorted, board.labels) : activeUnsorted),
    [board, activeUnsorted],
  );

  const startResize = (key: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key];
    const min = MIN_WIDTHS[key];
    const onMove = (ev: PointerEvent) =>
      setColWidths((w) => ({ ...w, [key]: Math.max(min, Math.min(400, startW + ev.clientX - startX)) }));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setResizing(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    setResizing(key);
  };

  const create = () => {
    const name = cleanName(addName);
    if (!name) return;
    const dup = findDuplicate(board.projects, name);
    if (dup) {
      const label = labelById(board.labels, dup.statusId)?.name ?? '—';
      toast(`Already on the board · ${label} · ${dup.coordinator || 'unassigned'}`);
      return;
    }
    const project = newProject(name, me, board.labels);
    setBoard({
      ...board,
      projects: [...board.projects, project],
      activity: [activityEntry(project.id, me, 'create'), ...board.activity],
    });
    setAddName('');
    toast(`Added ${name}.`);
  };

  const target = sheet?.id ? board.projects.find((p) => p.id === sheet.id) : undefined;
  const close = () => setSheet(null);

  const tableWidth = COL_DEFS.reduce((n, [k]) => n + colWidths[k], 0);

  const postCell = (p: BoardProject) => {
    const lp = linkedPosts(records, p.id);
    if (lp.posted) {
      return {
        text: `Posted ${lp.posted.postedAt ? isoToUs(lp.posted.postedAt.slice(0, 10)) : ''} ✓`,
        cls: 'm-post-posted',
        onTap: () => toast(`${p.name} is posted — it lives in History.`),
      };
    }
    if (lp.draft) {
      return {
        text: `Draft · ${initials(lp.draft.author)} · ${relativeTime(lp.draft.updatedAt)}`,
        cls: 'm-post-draft',
        onTap: () => onOpenDraft(lp.draft!.id),
      };
    }
    return { text: '—', cls: '', onTap: () => toast(`Start a post for ${p.name} on desktop Compose.`) };
  };

  return (
    <div className="m-screen">
      <header className="m-head">
        <div className="m-head-row">
          <img src="/dyn-logo.png" alt="Dynamic EcoHome" className="m-logo" />
          <span className="m-spacer" />
          <span className="m-avatar">{initials(me)}</span>
        </div>
        <div className="m-head-row">
          <h1>Board</h1>
          <span className="m-head-sub">{active.length} active</span>
          <span className="m-spacer" />
          <button className="m-btn-orange small" onClick={() => addRef.current?.focus()}>
            + New
          </button>
        </div>
        <input
          type="search"
          className="m-search"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="m-chips">
          <button className={`m-chip ${mine ? 'on' : ''}`} onClick={() => setMine(!mine)}>
            My projects
          </button>
          <button className={`m-chip ${statusFilter ? 'on' : ''}`} onClick={() => setSheet({ kind: 'filterStatus' })}>
            {statusFilter ? labelById(board.labels, statusFilter)?.name : 'Status'} ▾
          </button>
          <button className={`m-chip ${coordFilter ? 'on' : ''}`} onClick={() => setSheet({ kind: 'filterCoord' })}>
            {coordFilter ?? 'Coordinator'} ▾
          </button>
          <button className={`m-chip ${phaseFilter ? 'on' : ''}`} onClick={() => setSheet({ kind: 'filterPhase' })}>
            {phaseFilter ? labelById(board.labels, phaseFilter)?.name : 'Design/Schedule'} ▾
          </button>
          <button
            className="m-chip muted"
            onClick={() => {
              setColWidths({ ...DEFAULT_WIDTHS });
              toast('Column widths reset.');
            }}
          >
            Reset columns
          </button>
        </div>
      </header>

      <div className="m-board-scroll">
        <table
          className="m-board-table"
          style={{ width: tableWidth, userSelect: resizing ? 'none' : undefined }}
        >
          <thead>
            <tr>
              {COL_DEFS.map(([key, label], i) => (
                <th key={key} className={i === 0 ? 'm-col-sticky' : ''} style={{ width: colWidths[key] }}>
                  {label}
                  <div
                    className="m-col-grip"
                    title="Drag to resize · double-tap to reset"
                    onPointerDown={(e) => startResize(key, e)}
                    onDoubleClick={() => setColWidths((w) => ({ ...w, [key]: DEFAULT_WIDTHS[key] }))}
                  >
                    <span className={resizing === key ? 'on' : ''} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((p) => {
              const st = labelById(board.labels, p.statusId);
              const ph = labelById(board.labels, p.phaseId);
              const post = postCell(p);
              return (
                <tr key={p.id}>
                  <td className="m-col-sticky m-cell-name" onClick={() => setSheet({ kind: 'menu', id: p.id })}>
                    <span className="m-cell-name-text">{p.name}</span>
                    <span className="m-cell-dots">⋯</span>
                  </td>
                  <td onClick={() => setSheet({ kind: 'person', id: p.id })}>
                    <span className="m-cell-person">
                      {p.coordinator ? (
                        <>
                          <span className="m-avatar tiny">{initials(p.coordinator)}</span>
                          <span className="m-cell-person-name">{p.coordinator}</span>
                        </>
                      ) : (
                        <span className="m-cell-muted">Unassigned</span>
                      )}
                    </span>
                  </td>
                  <td
                    className="m-cell-label"
                    style={st ? { background: st.color, color: labelTextColor(st.color) } : undefined}
                    onClick={() => setSheet({ kind: 'status', id: p.id })}
                  >
                    {st?.name ?? '—'}
                  </td>
                  <td
                    className={p.designedDate ? '' : 'm-cell-muted'}
                    onClick={() => setSheet({ kind: 'date', id: p.id })}
                  >
                    {p.designedDate ? isoToUs(p.designedDate) : '—'}
                  </td>
                  <td
                    className="m-cell-label"
                    style={ph ? { background: ph.color, color: labelTextColor(ph.color) } : undefined}
                    onClick={() => setSheet({ kind: 'phase', id: p.id })}
                  >
                    {ph?.name ?? '—'}
                  </td>
                  <td className="m-cell-stars" onClick={() => setSheet({ kind: 'rating', id: p.id })}>
                    <span className="on">{'★'.repeat(p.rating ?? 0)}</span>
                    <span className="off">{'★'.repeat(5 - (p.rating ?? 0))}</span>
                  </td>
                  <td className={`m-cell-post ${post.cls}`} onClick={post.onTap}>
                    {post.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {active.length === 0 && <p className="m-empty">Nothing matches the filters.</p>}

        <div className="m-add-row">
          <span className="m-add-plus">+</span>
          <input
            ref={addRef}
            placeholder="Add project"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
          <button className="m-btn-orange small" disabled={!addName.trim()} onClick={create}>
            Add
          </button>
        </div>

        {/* Pre-Design, then Out of SOW scope, then Completed — the desktop
            order, so the two boards read the same way (Aboud 2026-10-19 /
            2026-11-15). */}
        <div className="m-done-wrap">
          <div className="m-card m-predesign">
            <button className="m-done-toggle" onClick={() => setPredesignOpen(!predesignOpen)}>
              <span className={`m-caret ${predesignOpen ? 'open' : ''}`}>▸</span>
              Pre-Design
              <span className="m-done-count">{preDesign.length}</span>
            </button>
            {predesignOpen && (
              <div className="m-done-list">
                {preDesign.map((c) => (
                  <div key={c.id} className="m-done-item">
                    <span className="m-done-name">{c.name}</span>
                    <span className="m-done-coord">{c.coordinator}</span>
                    <span className="m-done-pill">
                      {labelById(board.labels, c.preDesignStatusId ?? null)?.name ?? 'Pre-Design'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="m-card m-scope">
            <button className="m-done-toggle" onClick={() => setScopeOpen(!scopeOpen)}>
              <span className={`m-caret ${scopeOpen ? 'open' : ''}`}>▸</span>
              Out of SOW scope
              <span className="m-done-count">{outOfScope.length}</span>
            </button>
            {scopeOpen && (
              <div className="m-done-list">
                {outOfScope.map((c) => (
                  <div key={c.id} className="m-done-item">
                    <span className="m-done-name">{c.name}</span>
                    <span className="m-done-coord">{c.coordinator}</span>
                    <span className="m-done-pill">{labelById(board.labels, c.statusId)?.name ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="m-card">
            <button className="m-done-toggle" onClick={() => setDoneOpen(!doneOpen)}>
              <span className={`m-caret ${doneOpen ? 'open' : ''}`}>▸</span>
              Completed projects
              <span className="m-done-count">{completed.length}</span>
            </button>
            {doneOpen && (
              <div className="m-done-list">
                {completed.map((c) => (
                  <div key={c.id} className="m-done-item">
                    <span className="m-done-name">{c.name}</span>
                    <span className="m-done-coord">{c.coordinator}</span>
                    <span className="m-done-pill">Done</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {sheet && (sheet.kind === 'status' || sheet.kind === 'phase') && target && (
        <BottomSheet
          title={sheet.kind === 'status' ? 'Status' : 'Design/Schedule'}
          sub={target.name}
          onClose={close}
        >
          <div className="m-label-grid">
            {(sheet.kind === 'status' ? statusLabels : phaseLabels).map((l) => {
              const key = sheet.kind === 'status' ? 'statusId' : 'phaseId';
              const cur = target[key];
              return (
                <button
                  key={l.id}
                  className={cur === l.id ? 'selected' : ''}
                  style={{ background: l.color, color: labelTextColor(l.color) }}
                  onClick={() => {
                    const next = cur === l.id ? null : l.id;
                    close();
                    if (key === 'statusId') guardedPatch(target, { statusId: next });
                    else applyPatch(target, { phaseId: next });
                  }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
          <button
            className="m-sheet-clear"
            onClick={() => {
              applyPatch(target, { [sheet.kind === 'status' ? 'statusId' : 'phaseId']: null });
              close();
            }}
          >
            Clear
          </button>
        </BottomSheet>
      )}

      {sheet?.kind === 'person' && target && (
        <BottomSheet title="SOW coordinator" sub={target.name} onClose={close}>
          <div className="m-sheet-list">
            <button
              className="m-sheet-item strong"
              onClick={() => {
                applyPatch(target, { coordinator: me });
                close();
              }}
            >
              Assign to me
            </button>
            {authors.map((a) => (
              <button
                key={a}
                className={`m-sheet-item ${target.coordinator === a ? 'current' : ''}`}
                onClick={() => {
                  applyPatch(target, { coordinator: a });
                  close();
                }}
              >
                <span className="m-avatar tiny">{initials(a)}</span>
                {a}
              </button>
            ))}
            <button
              className="m-sheet-item muted"
              onClick={() => {
                applyPatch(target, { coordinator: '' });
                close();
              }}
            >
              Unassigned
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === 'rating' && target && (
        <BottomSheet title="Rating" sub={target.name} onClose={close}>
          <div className="m-rating-row">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                className={target.rating != null && n <= target.rating ? 'on' : ''}
                onClick={() => {
                  const next = target.rating === n ? null : n;
                  close();
                  guardedPatch(target, { rating: next });
                }}
              >
                ★
              </button>
            ))}
          </div>
          <p className="m-sheet-hint">Tap the current star again to clear</p>
        </BottomSheet>
      )}

      {sheet?.kind === 'date' && target && (
        <BottomSheet title="Designed date" sub={target.name} onClose={close}>
          <input
            type="date"
            className="m-sheet-date"
            aria-label="Designed date"
            value={target.designedDate ?? ''}
            onChange={(e) => {
              applyPatch(target, { designedDate: e.target.value || null });
              if (e.target.value) close();
            }}
          />
          <div className="m-sheet-btn-row">
            <button
              onClick={() => {
                const d = new Date();
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                applyPatch(target, { designedDate: iso });
                close();
              }}
            >
              Today
            </button>
            <button
              onClick={() => {
                applyPatch(target, { designedDate: null });
                close();
              }}
            >
              Clear
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === 'updates' && target && (
        <BottomSheet title="Updates" sub={target.name} onClose={close}>
          <div className="m-upd-composer">
            <textarea
              value={updDraft}
              aria-label="New update"
              rows={3}
              placeholder="Post an update for the team…"
              onChange={(e) => setUpdDraft(e.target.value)}
            />
            <button
              className="m-sheet-primary"
              disabled={!updDraft.trim()}
              onClick={() => {
                putUpdateHere(newUpdate(target.id, updDraft, me));
                setUpdDraft('');
                toast('Update posted.');
              }}
            >
              Post update
            </button>
          </div>
          <div className="m-upd-thread">
            {updatesFor(board.updates, target.id).length === 0 && (
              <p className="m-sheet-hint">No updates yet.</p>
            )}
            {updatesFor(board.updates, target.id).map((u) => (
              <div key={u.id} className="m-upd-item">
                <div className="m-upd-head">
                  <strong>{u.by}</strong>
                  <span className="m-upd-when">{relativeTime(u.at)}</span>
                  {u.kind !== 'note' && (
                    <span className={`upd-badge upd-badge-${u.kind}`}>
                      {u.kind === 'rating'
                        ? `Rating${u.rating ? ` · ${u.rating}★` : ''}`
                        : u.kind === 'pending-info'
                          ? 'Missing info'
                          : 'Status reason'}
                    </span>
                  )}
                </div>
                <RichText text={u.text} />
                {(u.by === me || isAdmin) && (
                  <button
                    className="m-upd-del"
                    onClick={() => {
                      putUpdateHere(deleteUpdate(u, me));
                      toast('Update deleted.');
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* The gates (#3, #6). The patch is held until a reason is written;
          dismissing the sheet abandons the change entirely. */}
      {gate && (
        <BottomSheet
          title={gate.copy.title}
          sub={gate.project.name}
          onClose={() => {
            setGate(null);
            setGateText('');
          }}
        >
          <div className="m-upd-composer">
            <textarea
              value={gateText}
              aria-label="Reason"
              rows={4}
              placeholder={gate.copy.placeholder}
              onChange={(e) => setGateText(e.target.value)}
            />
            <p className="m-sheet-hint">Posted to this project's Updates, so it can be searched later.</p>
            <button
              className="m-sheet-primary"
              disabled={!gateText.trim()}
              onClick={() => {
                const u = newUpdate(
                  gate.project.id,
                  gateText,
                  me,
                  gate.kind,
                  gate.rating ? { rating: gate.rating } : {},
                );
                applyPatch(gate.project, gate.patch, u);
                setGate(null);
                setGateText('');
                toast('Update posted.');
              }}
            >
              {gate.copy.confirmLabel}
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === 'menu' && target && (
        <BottomSheet title={target.name} onClose={close}>
          <div className="m-sheet-list">
            <button
              className="m-sheet-item strong"
              onClick={() => {
                close();
                const lp = linkedPosts(records, target.id);
                if (lp.draft) onOpenDraft(lp.draft.id);
                else if (lp.posted) toast(`${target.name} is posted — it lives in History.`);
                else toast(`Compose opens on desktop — no draft linked to ${target.name} yet.`);
              }}
            >
              Open draft
            </button>
            <button
              className="m-sheet-item"
              onClick={() => {
                close();
                void navigator.clipboard.writeText(target.name).then(
                  () => toast('Name copied.'),
                  () => toast('Could not copy.'),
                );
              }}
            >
              Copy name
            </button>
            <button
              className="m-sheet-item"
              onClick={() => setSheet({ kind: 'updates', id: target.id })}
            >
              Updates ({updateCountById.get(target.id) ?? 0})
            </button>
            <button
              className="m-sheet-item"
              onClick={() => {
                close();
                const act = board.activity.find((a) => a.projectId === target.id);
                toast(act ? `Latest: ${act.actor} · ${act.action} · ${relativeTime(act.at)}` : 'No activity yet.');
              }}
            >
              View activity
            </button>
            <button
              className="m-sheet-item"
              onClick={() => {
                close();
                applyPatch(target, { archivedAt: new Date().toISOString() });
                toast(`Archived — ${target.name}.`, {
                  label: 'Undo',
                  fn: () => applyPatch({ ...target, archivedAt: new Date().toISOString() }, { archivedAt: undefined }),
                });
              }}
            >
              Archive
            </button>
            <button
              className="m-sheet-item danger"
              onClick={() => {
                close();
                if (!isAdmin) {
                  toast('Deleting is admin-only; archive is usually enough.');
                  return;
                }
                applyPatch(target, { deletedAt: new Date().toISOString() });
                toast(`Deleted permanently — ${target.name}.`, {
                  label: 'Undo',
                  fn: () => applyPatch({ ...target, deletedAt: new Date().toISOString() }, { deletedAt: undefined }),
                });
              }}
            >
              Delete permanently
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === 'filterStatus' && (
        <BottomSheet title="Filter by status" onClose={close}>
          <div className="m-sheet-list">
            {statusLabels.map((l) => (
              <button
                key={l.id}
                className="m-sheet-item"
                onClick={() => {
                  setStatusFilter(statusFilter === l.id ? null : l.id);
                  close();
                }}
              >
                <span className="m-swatch" style={{ background: l.color }} />
                <span className="m-sheet-item-label">{l.name}</span>
                {statusFilter === l.id && <span className="m-tick">✓</span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === 'filterPhase' && (
        <BottomSheet title="Filter by Design/Schedule" onClose={close}>
          <div className="m-sheet-list">
            {phaseLabels.map((l) => (
              <button
                key={l.id}
                className="m-sheet-item"
                onClick={() => {
                  setPhaseFilter(phaseFilter === l.id ? null : l.id);
                  close();
                }}
              >
                <span className="m-swatch" style={{ background: l.color }} />
                <span className="m-sheet-item-label">{l.name}</span>
                {phaseFilter === l.id && <span className="m-tick">✓</span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === 'filterCoord' && (
        <BottomSheet title="Coordinator" onClose={close}>
          <div className="m-sheet-list">
            {authors.map((a) => (
              <button
                key={a}
                className="m-sheet-item"
                onClick={() => {
                  setCoordFilter(coordFilter === a ? null : a);
                  close();
                }}
              >
                <span className="m-avatar tiny">{initials(a)}</span>
                <span className="m-sheet-item-label">{a}</span>
                {coordFilter === a && <span className="m-tick">✓</span>}
              </button>
            ))}
            <button
              className="m-sheet-item muted"
              onClick={() => {
                setCoordFilter(null);
                close();
              }}
            >
              Everyone
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
