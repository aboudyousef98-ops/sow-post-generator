// Board tab — the Monday-style shared project table (spec §6).
// Data flows one way: cell editors emit a single-field patch → applyPatch
// writes it optimistically through setBoard (localStorage + debounced push)
// and appends the activity entry. Sync/merge live in App + lib/board.

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Table as TanTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  activityEntry,
  activityForPatch,
  cleanName,
  findDuplicate,
  labelById,
  newProject,
  patchProject,
  type ProjectPatch,
} from '../lib/board';
import type { Toast } from '../components/Toast';
import type { BoardActivity, BoardLabel, BoardProject, BoardState, LabelColumnKey } from './types';
import ActivityModal from './ActivityModal';
import EditLabelsModal from './EditLabelsModal';
import Popover from './Popover';
import { DateCell, LabelCell, NameCell, PersonCell, RatingCell, UpdatedCell, initialsOf } from './cells';

const KEY_WIDTHS = 'sowpost.board.colWidths.v1';
const KEY_VISIBILITY = 'sowpost.board.colVisibility.v1';
const KEY_FILTERS = 'sowpost.board.filters.v1';

interface Filters {
  search: string;
  coordinators: string[];
  statusIds: string[];
  phaseIds: string[];
  mine: boolean;
  showArchived: boolean;
}

const NO_FILTERS: Filters = { search: '', coordinators: [], statusIds: [], phaseIds: [], mine: false, showArchived: false };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

interface Props {
  board: BoardState;
  setBoard: (next: BoardState) => void;
  /** Signed-in display name — actor for every edit, Q4 default coordinator. */
  me: string;
  isAdmin: boolean;
  authors: string[];
  toast: (text: string, action?: Toast['action']) => void;
}

/** Multi-select checkbox filter in a popover (coordinator / status / phase). */
function FilterSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className={`btn small secondary ${selected.length ? 'board-filter-on' : ''}`}>
          {label}
          {selected.length > 0 && ` (${selected.length})`} ▾
        </button>
      }
    >
      <div className="board-menu">
        {options.map((o) => (
          <label key={o.id} className="board-menu-item">
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))
              }
            />
            {o.name}
          </label>
        ))}
        {selected.length > 0 && (
          <button type="button" className="board-menu-item muted" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
    </Popover>
  );
}

function RowMenu({
  project,
  isAdmin,
  onCopyName,
  onActivity,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: BoardProject;
  isAdmin: boolean;
  onCopyName: () => void;
  onActivity: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className="board-row-menu" aria-label="Row actions" title="Actions">
          ⋯
        </button>
      }
    >
      <div className="board-menu" role="menu">
        <button type="button" role="menuitem" className="board-menu-item" onClick={act(onCopyName)}>
          Copy name
        </button>
        <button type="button" role="menuitem" className="board-menu-item" onClick={act(onActivity)}>
          View activity
        </button>
        {project.archivedAt ? (
          <button type="button" role="menuitem" className="board-menu-item" onClick={act(onRestore)}>
            Restore
          </button>
        ) : (
          <button type="button" role="menuitem" className="board-menu-item" onClick={act(onArchive)}>
            Archive
          </button>
        )}
        {isAdmin && (
          <button type="button" role="menuitem" className="board-menu-item danger" onClick={act(onDelete)}>
            Delete permanently
          </button>
        )}
      </div>
    </Popover>
  );
}

// Body split out so it can be memoized while a column is being resized —
// the "Performant Column Resizing" pattern: widths move via CSS variables,
// rows do not re-render during the drag.
function BodyInner({ table, highlightId }: { table: TanTable<BoardProject>; highlightId: string | null }) {
  return (
    <tbody>
      {table.getRowModel().rows.map((row) => (
        <tr
          key={row.id}
          data-project-id={row.original.id}
          className={[
            row.original.archivedAt ? 'board-row-archived' : '',
            row.original.id === highlightId ? 'board-row-highlight' : '',
          ].join(' ')}
        >
          {row.getVisibleCells().map((cell) => (
            <td
              key={cell.id}
              className={cell.column.id === 'name' ? 'board-sticky' : ''}
              style={{ width: `calc(var(--col-${cell.column.id}-size) * 1px)` }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
const MemoBody = memo(BodyInner, (prev, next) => prev.table.options.data === next.table.options.data) as typeof BodyInner;

export default function BoardTab({ board, setBoard, me, isAdmin, authors, toast }: Props) {
  const [filters, setFilters] = useState<Filters>(() => readJson(KEY_FILTERS, NO_FILTERS));
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState(() => readJson<Record<string, number>>(KEY_WIDTHS, {}));
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readJson<VisibilityState>(KEY_VISIBILITY, { updated: false }),
  );
  const [editLabels, setEditLabels] = useState<LabelColumnKey | null>(null);
  const [activityFor, setActivityFor] = useState<BoardProject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BoardProject | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [duplicate, setDuplicate] = useState<BoardProject | null>(null);
  const [columnsMenu, setColumnsMenu] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  // Persist viewer preferences (D7: per-browser, never shared).
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(KEY_WIDTHS, JSON.stringify(columnSizing)), 300);
    return () => clearTimeout(t);
  }, [columnSizing]);
  useEffect(() => {
    localStorage.setItem(KEY_VISIBILITY, JSON.stringify(columnVisibility));
  }, [columnVisibility]);
  useEffect(() => {
    localStorage.setItem(KEY_FILTERS, JSON.stringify(filters));
  }, [filters]);

  const boardRef = useRef(board);
  boardRef.current = board;

  // ---- writes ---------------------------------------------------------------

  /** One-field optimistic write + activity entry. Single source of mutation. */
  const applyPatch = (project: BoardProject, patch: ProjectPatch, extraActivity?: BoardActivity) => {
    const cur = boardRef.current;
    const next = patchProject(project, patch, me);
    const entry = extraActivity ?? activityForPatch(project, patch, me, cur.labels);
    setBoard({
      ...cur,
      projects: cur.projects.map((p) => (p.id === project.id ? next : p)),
      activity: entry ? [entry, ...cur.activity] : cur.activity,
    });
  };

  const archive = (project: BoardProject) => {
    applyPatch(project, { archivedAt: new Date().toISOString() }, activityEntry(project.id, me, 'archive'));
    toast(`Archived — ${project.name}.`, {
      label: 'Undo',
      fn: () => {
        const cur = boardRef.current.projects.find((p) => p.id === project.id);
        if (cur) applyPatch(cur, { archivedAt: undefined }, activityEntry(project.id, me, 'restore'));
      },
    });
  };

  const restore = (project: BoardProject) => {
    applyPatch(project, { archivedAt: undefined }, activityEntry(project.id, me, 'restore'));
    toast(`Restored — ${project.name}.`);
  };

  const deletePermanently = (project: BoardProject) => {
    applyPatch(project, { deletedAt: new Date().toISOString() }, activityEntry(project.id, me, 'delete'));
    setConfirmDelete(null);
    toast(`Deleted permanently — ${project.name}.`);
  };

  const updateLabels = (changed: BoardLabel[]) => {
    const cur = boardRef.current;
    const now = new Date().toISOString();
    const stamped = changed.map((l) => ({ ...l, updatedAt: now }));
    const byId = new Map(cur.labels.map((l) => [l.id, l]));
    for (const l of stamped) byId.set(l.id, l);
    setBoard({ ...cur, labels: [...byId.values()] });
  };

  const archiveLabel = (labelId: string, moveToId: string | null) => {
    const cur = boardRef.current;
    const label = cur.labels.find((l) => l.id === labelId);
    if (!label || label.isSystem) return;
    const now = new Date().toISOString();
    const field: 'statusId' | 'phaseId' = label.columnKey === 'status' ? 'statusId' : 'phaseId';
    const moved = cur.projects.map((p) =>
      p[field] === labelId && !p.deletedAt ? patchProject(p, { [field]: moveToId }, me, now) : p,
    );
    setBoard({
      ...cur,
      labels: cur.labels.map((l) => (l.id === labelId ? { ...l, archived: true, isDefault: false, updatedAt: now } : l)),
      projects: moved,
    });
    toast(`Label "${label.name}" archived.`);
  };

  const create = (force: boolean) => {
    const name = cleanName(addName);
    if (!name) return;
    const cur = boardRef.current;
    if (!force) {
      const dup = findDuplicate(cur.projects, name);
      if (dup) {
        setDuplicate(dup);
        return;
      }
    }
    const project = newProject(name, me, cur.labels);
    setBoard({
      ...cur,
      projects: [...cur.projects, project],
      activity: [activityEntry(project.id, me, 'create', { name: { old: '—', new: project.name } }), ...cur.activity],
    });
    setAddName('');
    setDuplicate(null);
    addRef.current?.focus(); // stays focused for the next one (spec §6.1)
  };

  // ---- data -----------------------------------------------------------------

  const statusOptions = useMemo(
    () => board.labels.filter((l) => l.columnKey === 'status' && !l.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [board.labels],
  );
  const phaseOptions = useMemo(
    () => board.labels.filter((l) => l.columnKey === 'phase' && !l.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [board.labels],
  );

  const visible = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return board.projects
      .filter((p) => !p.deletedAt)
      .filter((p) => (filters.showArchived ? true : !p.archivedAt))
      .filter((p) => (needle ? p.name.toLowerCase().includes(needle) : true))
      .filter((p) => (filters.coordinators.length ? filters.coordinators.includes(p.coordinator) : true))
      .filter((p) => (filters.statusIds.length ? filters.statusIds.includes(p.statusId ?? '') : true))
      .filter((p) => (filters.phaseIds.length ? filters.phaseIds.includes(p.phaseId ?? '') : true))
      .filter((p) => (filters.mine ? p.coordinator === me : true))
      .sort((a, b) => b.position - a.position);
  }, [board.projects, filters, me]);

  const labelSortValue = (labels: BoardLabel[], id: string | null) => labelById(labels, id)?.sortOrder;

  const columns = useMemo<ColumnDef<BoardProject>[]>(
    () => [
      {
        id: 'name',
        header: 'Project name',
        size: 280,
        minSize: 160,
        maxSize: 800,
        accessorFn: (p) => p.name.toLowerCase(),
        cell: ({ row }) => (
          <div className="board-name-wrap">
            <NameCell project={row.original} onRename={(name) => applyPatch(row.original, { name: cleanName(name) })} />
            <RowMenu
              project={row.original}
              isAdmin={isAdmin}
              onCopyName={() => {
                navigator.clipboard?.writeText(row.original.name);
                toast('Name copied.');
              }}
              onActivity={() => setActivityFor(row.original)}
              onArchive={() => archive(row.original)}
              onRestore={() => restore(row.original)}
              onDelete={() => setConfirmDelete(row.original)}
            />
          </div>
        ),
      },
      {
        id: 'coordinator',
        header: 'SOW coordinator',
        size: 170,
        minSize: 110,
        maxSize: 800,
        accessorFn: (p) => p.coordinator || undefined,
        sortUndefined: 'last',
        cell: ({ row }) => (
          <PersonCell
            value={row.original.coordinator}
            authors={authors}
            me={me}
            onPick={(coordinator) => applyPatch(row.original, { coordinator })}
          />
        ),
      },
      {
        id: 'status',
        header: 'Status',
        size: 150,
        minSize: 100,
        maxSize: 800,
        accessorFn: (p) => labelSortValue(board.labels, p.statusId),
        sortUndefined: 'last',
        cell: ({ row }) => (
          <LabelCell
            labels={board.labels}
            columnKey="status"
            valueId={row.original.statusId}
            onPick={(statusId) => applyPatch(row.original, { statusId })}
            onEditLabels={() => setEditLabels('status')}
          />
        ),
      },
      {
        id: 'designedDate',
        header: 'Designed date',
        size: 140,
        minSize: 110,
        maxSize: 800,
        accessorFn: (p) => p.designedDate ?? undefined, // ISO sorts chronologically as text
        sortUndefined: 'last',
        cell: ({ row }) => (
          <DateCell value={row.original.designedDate} onPick={(designedDate) => applyPatch(row.original, { designedDate })} />
        ),
      },
      {
        id: 'phase',
        header: 'Design/Schedule',
        size: 150,
        minSize: 100,
        maxSize: 800,
        accessorFn: (p) => labelSortValue(board.labels, p.phaseId),
        sortUndefined: 'last',
        cell: ({ row }) => (
          <LabelCell
            labels={board.labels}
            columnKey="phase"
            valueId={row.original.phaseId}
            onPick={(phaseId) => applyPatch(row.original, { phaseId })}
            onEditLabels={() => setEditLabels('phase')}
          />
        ),
      },
      {
        id: 'rating',
        header: 'Rating',
        size: 120,
        minSize: 96,
        maxSize: 800,
        accessorFn: (p) => p.rating ?? undefined,
        sortUndefined: 'last',
        cell: ({ row }) => (
          <RatingCell value={row.original.rating} onPick={(rating) => applyPatch(row.original, { rating })} />
        ),
      },
      {
        id: 'updated',
        header: 'Last update',
        size: 150,
        minSize: 120,
        maxSize: 800,
        accessorFn: (p) => p.updatedAt,
        cell: ({ row }) => <UpdatedCell project={row.original} />,
      },
    ],
    // applyPatch/archive/etc. read boardRef, so the defs only need to refresh
    // when the data they RENDER changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.labels, authors, me, isAdmin],
  );

  const table = useReactTable({
    data: visible,
    columns,
    state: { sorting, columnSizing, columnVisibility },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  // Column widths as CSS variables on the table element — cells read them with
  // `calc(var(--col-x-size) * 1px)` so a drag never re-renders the rows.
  const sizingState = table.getState().columnSizing;
  const visibilityState = table.getState().columnVisibility;
  const columnSizeVars = useMemo(() => {
    const vars: Record<string, number> = {};
    for (const header of table.getFlatHeaders()) {
      vars[`--header-${header.id}-size`] = header.getSize();
      vars[`--col-${header.column.id}-size`] = header.column.getSize();
    }
    return vars;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizingState, visibilityState, columns]);

  const isResizing = Boolean(table.getState().columnSizingInfo.isResizingColumn);

  const openDuplicate = () => {
    if (!duplicate) return;
    setFilters((f) => ({ ...f, search: '', mine: false }));
    setHighlightId(duplicate.id);
    setDuplicate(null);
    setAddName('');
    setTimeout(() => {
      document.querySelector(`[data-project-id="${duplicate.id}"]`)?.scrollIntoView({ block: 'center' });
    }, 50);
    setTimeout(() => setHighlightId(null), 2500);
  };

  const liveCount = board.projects.filter((p) => !p.deletedAt && !p.archivedAt).length;
  const dupStatus = duplicate ? labelById(board.labels, duplicate.statusId)?.name : '';

  return (
    <div className="list-page board-page">
      <div className="list-head">
        <h1>Board</h1>
        <span className="muted">
          {liveCount === 0 ? 'no projects yet' : `${visible.length} of ${liveCount} project${liveCount === 1 ? '' : 's'}`}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={() => addRef.current?.focus()}>
          + New project
        </button>
      </div>

      <div className="card list-card">
        <div className="board-toolbar">
          <input
            type="search"
            placeholder="Search projects…"
            aria-label="Search projects"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <FilterSelect
            label="Coordinator"
            options={authors.map((a) => ({ id: a, name: a }))}
            selected={filters.coordinators}
            onChange={(coordinators) => setFilters({ ...filters, coordinators })}
          />
          <FilterSelect
            label="Status"
            options={statusOptions.map((l) => ({ id: l.id, name: l.name }))}
            selected={filters.statusIds}
            onChange={(statusIds) => setFilters({ ...filters, statusIds })}
          />
          <FilterSelect
            label="Design/Schedule"
            options={phaseOptions.map((l) => ({ id: l.id, name: l.name }))}
            selected={filters.phaseIds}
            onChange={(phaseIds) => setFilters({ ...filters, phaseIds })}
          />
          <button
            type="button"
            className={`btn small secondary ${filters.mine ? 'board-filter-on' : ''}`}
            onClick={() => setFilters({ ...filters, mine: !filters.mine })}
          >
            My projects
          </button>
          <button
            type="button"
            className={`btn small secondary ${filters.showArchived ? 'board-filter-on' : ''}`}
            onClick={() => setFilters({ ...filters, showArchived: !filters.showArchived })}
          >
            Show archived
          </button>
          <span style={{ flex: 1 }} />
          <Popover
            open={columnsMenu}
            onOpenChange={setColumnsMenu}
            trigger={
              <button type="button" className="btn small secondary">
                Columns ▾
              </button>
            }
          >
            <div className="board-menu">
              {table
                .getAllLeafColumns()
                .filter((c) => c.id !== 'name')
                .map((c) => (
                  <label key={c.id} className="board-menu-item">
                    <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                    {String(c.columnDef.header)}
                  </label>
                ))}
              <button
                type="button"
                className="board-menu-item muted"
                onClick={() => {
                  setColumnSizing({});
                  setColumnsMenu(false);
                }}
              >
                Reset column widths
              </button>
            </div>
          </Popover>
        </div>

        <div className="board-scroll">
          <table
            className="board-table"
            style={{ ...columnSizeVars, width: table.getTotalSize() }}
          >
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={header.column.id === 'name' ? 'board-sticky' : ''}
                      style={{ width: `calc(var(--header-${header.id}-size) * 1px)` }}
                    >
                      <button
                        type="button"
                        className="board-th"
                        onClick={header.column.getToggleSortingHandler()}
                        title="Sort"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                      </button>
                      <div
                        className={`board-resizer ${header.column.getIsResizing() ? 'resizing' : ''}`}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        title="Drag to resize · double-click to reset"
                      />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            {isResizing ? (
              <MemoBody table={table} highlightId={highlightId} />
            ) : (
              <BodyInner table={table} highlightId={highlightId} />
            )}
          </table>

          {visible.length === 0 && (
            <p className="muted board-empty">
              {liveCount === 0 ? 'No projects yet — add the first one below.' : 'Nothing matches the filters.'}
            </p>
          )}
        </div>

        <div className="board-add">
          <span className="board-avatar add">+</span>
          <input
            ref={addRef}
            placeholder="+ Add project"
            aria-label="Add project"
            value={addName}
            onChange={(e) => {
              setAddName(e.target.value);
              setDuplicate(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create(false);
              if (e.key === 'Escape') {
                setAddName('');
                setDuplicate(null);
              }
            }}
          />
          {duplicate && (
            <span className="board-dup-warn">
              Already on the board{dupStatus ? ` · ${dupStatus}` : ''}
              {duplicate.coordinator ? ` · ${duplicate.coordinator}` : ''}
              <button type="button" className="btn small secondary" onClick={openDuplicate}>
                Open it
              </button>
              <button type="button" className="btn small primary" onClick={() => create(true)}>
                Add anyway
              </button>
            </span>
          )}
        </div>
      </div>

      {editLabels && (
        <EditLabelsModal
          columnKey={editLabels}
          labels={board.labels}
          projects={board.projects}
          onUpdate={updateLabels}
          onArchive={archiveLabel}
          onClose={() => setEditLabels(null)}
        />
      )}
      {activityFor && (
        <ActivityModal project={activityFor} activity={board.activity} onClose={() => setActivityFor(null)} />
      )}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete permanently?</h3>
            <p>
              <b>{confirmDelete.name}</b> ({initialsOf(confirmDelete.coordinator || '—')}) will be removed for the
              whole team. Archiving is usually enough.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={() => deletePermanently(confirmDelete)}>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
