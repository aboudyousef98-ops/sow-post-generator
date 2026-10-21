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
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  activityEntry,
  activityForPatch,
  cleanName,
  findDuplicate,
  isOutOfScopeLabel,
  labelById,
  linkedPosts,
  newProject,
  patchProject,
  positionForMove,
  type LinkedPosts,
  type ProjectPatch,
} from '../lib/board';
import {
  PINNED_COLUMNS,
  UNFILTERABLE_COLUMNS,
  distinctColumnValues,
  hasColumnFilters,
  matchesColumnFilters,
  moveColumn,
  normalizeColumnOrder,
} from '../lib/boardColumns';
import {
  GROUP_OPTIONS,
  NO_FILTERS,
  agingState,
  agingTitle,
  groupProjects,
  installDateOf,
  isPresetActive,
  selectedRows,
  splitSections,
  viewPresets,
  type AgingState,
  type Filters,
  type GroupKey,
} from '../lib/boardViews';
import { relativeTime, isoToUs, todayIso } from '../lib/dates';
import { hasSfNotes, type SfNotes } from '../lib/sfNotes';
import { matchesSearch } from '../lib/boardSearch';
import {
  isPendingInfoLabel,
  needsRatingReason,
  newUpdate,
  putUpdate,
  updateCounts,
} from '../lib/updates';
import type { PostRecord } from '../types';
import type { Toast } from '../components/Toast';
import type {
  BoardActivity,
  BoardLabel,
  BoardProject,
  BoardState,
  LabelColumnKey,
  ProjectUpdate,
} from './types';
import ActivityModal from './ActivityModal';
import UpdatesModal from './UpdatesModal';
import UpdateSearchModal from './UpdateSearchModal';
import RequireNoteModal, { type NoteGate } from './RequireNoteModal';
import EditLabelsModal from './EditLabelsModal';
import ImportModal, { type ImportRequest } from './ImportModal';
import Popover from './Popover';
import { DateCell, LabelCell, NameCell, PersonCell, RatingCell, UpdatedCell, initialsOf } from './cells';

const KEY_WIDTHS = 'sowpost.board.colWidths.v1';
const KEY_VISIBILITY = 'sowpost.board.colVisibility.v2'; // v2: Last update now defaults visible
const KEY_FILTERS = 'sowpost.board.filters.v1';
const KEY_DONE_OPEN = 'sowpost.board.doneOpen.v1';
const KEY_SCOPE_OPEN = 'sowpost.board.scopeOpen.v1';
const KEY_GROUP_BY = 'sowpost.board.groupBy.v1';
const KEY_ORDER = 'sowpost.board.colOrder.v1';

// Filters / NO_FILTERS now live in lib/boardViews so the view presets can be
// unit-tested without a DOM.

/** Which of the board's three sections a status label puts a row in. */
type Section = 'active' | 'scope' | 'done';

const SECTION_TITLE: Record<Section, string> = {
  active: 'the board',
  scope: 'Out of SOW scope',
  done: 'Completed projects',
};

function sectionOf(label: BoardLabel | undefined): Section {
  if (label?.isDone) return 'done';
  if (isOutOfScopeLabel(label)) return 'scope';
  return 'active';
}

/**
 * "…but 3 out-of-scope and 25 completed ones do" — the tail of the empty-table
 * message. Counting the rows that ARE matching, section by section, is what
 * stops an empty table from reading as missing data.
 */
function matchesBelow(scope: number, done: number): string {
  const parts: string[] = [];
  if (scope) parts.push(`${scope} out-of-scope`);
  if (done) parts.push(`${done} completed`);
  const total = scope + done;
  return `${parts.join(' and ')} ${total === 1 ? 'one does' : 'ones do'}`;
}

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
  /** Team records — READ ONLY here, to render the Post column. */
  records: PostRecord[];
  /** Board → Compose: open (or create) this project's post. */
  onOpenCompose: (project: BoardProject) => void;
  /** Row to highlight/scroll to when arriving from a Compose chip. */
  focusId?: string | null;
  onFocusHandled?: () => void;
}

/**
 * Sort affordance on a column header. Columns were always sortable, but the
 * arrow only appeared AFTER you had already clicked — so nobody knew (Aboud
 * 2026-10-17 #1: "these column needs ... a small arrow at the header to sort").
 * A dimmed ↕ sits there permanently and resolves to ↑ / ↓ once sorted.
 */
function SortArrow({ dir }: { dir: false | 'asc' | 'desc' }) {
  return (
    <span className={`board-sort${dir ? ' on' : ''}`} aria-hidden="true">
      {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}
    </span>
  );
}

/**
 * Multi-select checkbox filter in a popover (coordinator / status / phase).
 * `single` turns it into a pick-one-and-close menu, which is what the bulk
 * action bar needs — one tap applies, no "Apply" button to hunt for.
 */
function FilterSelect({
  label,
  options,
  selected,
  onChange,
  single = false,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
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
        {options.length === 0 && <span className="board-menu-item muted">Nothing to pick</span>}
        {options.map((o) =>
          single ? (
            <button
              key={o.id}
              type="button"
              className="board-menu-item"
              onClick={() => {
                setOpen(false);
                onChange([o.id]);
              }}
            >
              {o.name}
            </button>
          ) : (
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
          ),
        )}
        {!single && selected.length > 0 && (
          <button type="button" className="board-menu-item muted" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
    </Popover>
  );
}

/**
 * Per-column value filter (Aboud 2026-10-18: "can we have a filter for each
 * column? to filter everything by that value?").
 *
 * Lists the values actually present in that column and filters to the ticked
 * ones. Values come from lib/boardColumns, not from the table's accessors —
 * those are sort keys and would show lowercased names and internal label ids.
 */
function ColumnFilter({
  columnId,
  label,
  values,
  selected,
  open,
  onOpenChange,
  onChange,
}: {
  columnId: string;
  label: string;
  values: string[];
  selected: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (values: string[]) => void;
}) {
  const on = selected.length > 0;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <button
          type="button"
          className={`board-col-filter${on ? ' on' : ''}`}
          aria-label={`Filter ${label}`}
          title={on ? `${label}: ${selected.join(', ')}` : `Filter by ${label}`}
        >
          ▼{on ? <span className="board-col-filter-count">{selected.length}</span> : null}
        </button>
      }
    >
      <div className="board-menu board-col-menu">
        {values.length === 0 && <span className="board-menu-item muted">Nothing to filter</span>}
        {values.map((v) => (
          <label key={`${columnId}:${v}`} className="board-menu-item">
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={(e) => onChange(e.target.checked ? [...selected, v] : selected.filter((x) => x !== v))}
            />
            {v}
          </label>
        ))}
        {on && (
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
  onOpenCompose,
  onCopyName,
  onActivity,
  onUpdates,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: BoardProject;
  isAdmin: boolean;
  onOpenCompose: () => void;
  onCopyName: () => void;
  onActivity: () => void;
  onUpdates: () => void;
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
        <button type="button" role="menuitem" className="board-menu-item strong" onClick={act(onOpenCompose)}>
          Open in Compose
        </button>
        <button type="button" role="menuitem" className="board-menu-item" onClick={act(onCopyName)}>
          Copy name
        </button>
        <button type="button" role="menuitem" className="board-menu-item" onClick={act(onUpdates)}>
          Updates
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

/** Row drag in flight: the held project + where the drop line sits. */
interface RowDrag {
  id: string;
  overIndex: number;
}

// Body split out so it can be memoized while a column is being resized —
// the "Performant Column Resizing" pattern: widths move via CSS variables,
// rows do not re-render during the drag.
function BodyInner({
  table,
  highlightId,
  drag,
  onRowPointerDown,
  onRowClickCapture,
  groupBy = 'none',
  labels = [],
  collapsed = {},
  onToggleGroup,
  agingOf,
  selectedIds,
}: {
  table: TanTable<BoardProject>;
  highlightId: string | null;
  /** Reorder props — main table only; the Completed section keeps its order. */
  drag?: RowDrag | null;
  onRowPointerDown?: (e: ReactPointerEvent<HTMLTableSectionElement>) => void;
  onRowClickCapture?: (e: ReactMouseEvent<HTMLTableSectionElement>) => void;
  groupBy?: GroupKey;
  labels?: BoardLabel[];
  collapsed?: Record<string, boolean>;
  onToggleGroup?: (key: string) => void;
  agingOf?: (p: BoardProject) => AgingState;
  selectedIds?: Record<string, boolean>;
}) {
  const rows = table.getRowModel().rows;

  const rowClass = (row: (typeof rows)[number], i: number) =>
    [
      row.original.archivedAt ? 'board-row-archived' : '',
      row.original.id === highlightId ? 'board-row-highlight' : '',
      selectedIds?.[row.original.id] ? 'board-row-selected' : '',
      agingOf ? `board-row-aging-${agingOf(row.original)}` : '',
      drag && drag.id === row.original.id ? 'board-row-dragging' : '',
      drag && drag.overIndex === i ? 'board-drop-before' : '',
      drag && drag.overIndex === rows.length && i === rows.length - 1 ? 'board-drop-after' : '',
    ]
      .filter(Boolean)
      .join(' ');

  const cells = (row: (typeof rows)[number]) =>
    row.getVisibleCells().map((cell) => (
      <td
        key={cell.id}
        className={cell.column.id === 'name' ? 'board-sticky' : ''}
        style={{ width: `calc(var(--col-${cell.column.id}-size) * 1px)` }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </td>
    ));

  if (groupBy === 'none') {
    return (
      <tbody onPointerDown={onRowPointerDown} onClickCapture={onRowClickCapture}>
        {rows.map((row, i) => (
          <tr key={row.id} data-project-id={row.original.id} className={rowClass(row, i)}>
            {cells(row)}
          </tr>
        ))}
      </tbody>
    );
  }

  // Group the rows the table already sorted, so sort order survives grouping.
  const byId = new Map(rows.map((r) => [r.original.id, r]));
  const groups = groupProjects(
    rows.map((r) => r.original),
    groupBy,
    labels,
  );
  const colSpan = table.getVisibleLeafColumns().length;

  return (
    <>
      {groups.map((g) => {
        const shut = Boolean(collapsed[g.key]);
        return (
          <tbody key={g.key} className="board-group" onClickCapture={onRowClickCapture}>
            <tr className="board-group-row">
              <td colSpan={colSpan}>
                <button
                  type="button"
                  className="board-group-head"
                  aria-expanded={!shut}
                  onClick={() => onToggleGroup?.(g.key)}
                >
                  <span className={`board-done-caret ${shut ? '' : 'open'}`}>▸</span>
                  {g.color && <span className="board-group-swatch" style={{ background: g.color }} />}
                  <span className="board-group-title">{g.title}</span>
                  <span className="board-done-count">{g.rows.length}</span>
                </button>
              </td>
            </tr>
            {!shut &&
              g.rows.map((p) => {
                const row = byId.get(p.id);
                if (!row) return null;
                return (
                  <tr key={row.id} data-project-id={p.id} className={rowClass(row, -1)}>
                    {cells(row)}
                  </tr>
                );
              })}
          </tbody>
        );
      })}
    </>
  );
}
/**
 * A collapsible section below the main table — "Completed projects" and
 * "Out of SOW scope". Same columns, same widths, same sorting state as the
 * main table; only the rows differ. Headers here sort but do not resize:
 * resizing lives on the main header alone, so there is one source of width.
 */
function SectionCard({
  variant,
  title,
  emptyText,
  open,
  onToggle,
  table,
  columnSizeVars,
  width,
  highlightId,
  agingOf,
  selectedIds,
}: {
  /** Drives the accent colour only — see `.board-done` / `.board-scope`. */
  variant: 'done' | 'scope';
  title: string;
  emptyText: string;
  open: boolean;
  onToggle: () => void;
  table: TanTable<BoardProject>;
  columnSizeVars: Record<string, number>;
  width: number;
  highlightId: string | null;
  agingOf?: (p: BoardProject) => AgingState;
  selectedIds?: Record<string, boolean>;
}) {
  const rows = table.options.data.length;
  return (
    <div className={`card list-card board-done board-${variant}`}>
      <button type="button" className="board-done-toggle" aria-expanded={open} onClick={onToggle}>
        <span className={`board-done-caret ${open ? 'open' : ''}`}>▸</span>
        {title}
        <span className="board-done-count">{rows}</span>
      </button>
      {open &&
        (rows === 0 ? (
          <p className="muted board-empty">{emptyText}</p>
        ) : (
          <div className="board-scroll">
            <table className="board-table" style={{ ...columnSizeVars, width }}>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className={header.column.id === 'name' ? 'board-sticky' : ''}
                        style={{ width: `calc(var(--header-${header.id}-size) * 1px)` }}
                      >
                        {header.column.id === 'select' ? null : (
                          <button
                            type="button"
                            className="board-th"
                            onClick={header.column.getToggleSortingHandler()}
                            title="Sort"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortArrow dir={header.column.getIsSorted()} />
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <BodyInner table={table} highlightId={highlightId} agingOf={agingOf} selectedIds={selectedIds} />
            </table>
          </div>
        ))}
    </div>
  );
}

const MemoBody = memo(
  BodyInner,
  (prev, next) =>
    prev.table.options.data === next.table.options.data &&
    prev.drag === next.drag &&
    prev.groupBy === next.groupBy &&
    prev.collapsed === next.collapsed &&
    prev.selectedIds === next.selectedIds,
) as typeof BodyInner;

export default function BoardTab({
  board,
  setBoard,
  me,
  isAdmin,
  authors,
  toast,
  records,
  onOpenCompose,
  focusId,
  onFocusHandled,
}: Props) {
  const [filters, setFilters] = useState<Filters>(() => readJson(KEY_FILTERS, NO_FILTERS));
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState(() => readJson<Record<string, number>>(KEY_WIDTHS, {}));
  // "Last update" USED to default to hidden. It is now the way into a row's
  // activity log (Aboud 2026-10-17), so it has to be on — a hidden column
  // would leave the log unreachable. The storage key was bumped to v2 so
  // everyone picks this up once instead of keeping an old `updated: false`.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readJson<VisibilityState>(KEY_VISIBILITY, {}),
  );
  const [editLabels, setEditLabels] = useState<LabelColumnKey | null>(null);
  const [activityFor, setActivityFor] = useState<BoardProject | null>(null);
  const [updatesFor, setUpdatesFor] = useState<BoardProject | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  /** A patch held hostage until the user explains it (#3 rating, #6 pending). */
  const [gate, setGate] = useState<{
    project: BoardProject;
    patch: ProjectPatch;
    gate: NoteGate;
    kind: 'rating' | 'pending-info';
    rating?: 1 | 2 | 3 | 4 | 5;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BoardProject | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [duplicate, setDuplicate] = useState<BoardProject | null>(null);
  const [columnsMenu, setColumnsMenu] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Completed section: out of sight by default, one click away.
  const [doneOpen, setDoneOpen] = useState(() => localStorage.getItem(KEY_DONE_OPEN) === '1');
  // "Out of SOW scope" — same deal, and also collapsed by default: the whole
  // point is that these rows stop crowding the pipeline.
  const [scopeOpen, setScopeOpen] = useState(() => localStorage.getItem(KEY_SCOPE_OPEN) === '1');
  const addRef = useRef<HTMLInputElement>(null);
  // Tier 1: group by, collapsed groups, and bulk selection.
  const [groupBy, setGroupBy] = useState<GroupKey>(
    () => (localStorage.getItem(KEY_GROUP_BY) as GroupKey | null) ?? 'none',
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // Column order is a viewer preference like widths and visibility. Reconciled
  // against the columns that exist now on every load, so a release that adds a
  // column does not hide it from anyone who has already dragged things about.
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(KEY_ORDER);
      return Array.isArray(JSON.parse(raw ?? 'null')) ? (JSON.parse(raw as string) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [dragCol, setDragCol] = useState<string | null>(null);
  // Per-column value filters. Deliberately NOT persisted: a saved filter that
  // silently hides rows across sessions is the same "where did my projects go"
  // trap that cost this board two days. It resets every load, and the header
  // count plus a highlighted funnel say when one is on.
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [filterMenu, setFilterMenu] = useState<string | null>(null);
  // Fixed for the lifetime of the render pass, so every row is aged against
  // the same "today" (and a test can't straddle midnight).
  const today = todayIso();

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
  useEffect(() => {
    localStorage.setItem(KEY_DONE_OPEN, doneOpen ? '1' : '0');
  }, [doneOpen]);
  useEffect(() => {
    localStorage.setItem(KEY_SCOPE_OPEN, scopeOpen ? '1' : '0');
  }, [scopeOpen]);
  useEffect(() => {
    localStorage.setItem(KEY_GROUP_BY, groupBy);
  }, [groupBy]);
  useEffect(() => {
    if (columnOrder.length) localStorage.setItem(KEY_ORDER, JSON.stringify(columnOrder));
  }, [columnOrder]);

  const boardRef = useRef(board);
  boardRef.current = board;

  // Arriving from a Compose chip: reveal the row (even a completed one),
  // highlight it briefly, and scroll it into view.
  useEffect(() => {
    if (!focusId) return;
    const project = boardRef.current.projects.find((p) => p.id === focusId);
    // Reveal whichever collapsed section the row actually sits in — otherwise
    // "open it" scrolls to nothing.
    const label = boardRef.current.labels.find((l) => l.id === project?.statusId);
    if (label?.isDone) setDoneOpen(true);
    else if (isOutOfScopeLabel(label)) setScopeOpen(true);
    setHighlightId(focusId);
    const scroll = setTimeout(() => {
      document.querySelector(`[data-project-id="${focusId}"]`)?.scrollIntoView({ block: 'center' });
    }, 50);
    const clear = setTimeout(() => setHighlightId(null), 2500);
    onFocusHandled?.();
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  /** projectId → its latest draft/posted, recomputed when team records change. */
  const postsByProject = useMemo(() => {
    const map = new Map<string, LinkedPosts>();
    for (const r of records) {
      if (!r.projectId || r.deletedAt) continue;
      if (!map.has(r.projectId)) map.set(r.projectId, linkedPosts(records, r.projectId));
    }
    return map;
  }, [records]);

  /**
   * projectId → install date, mirrored READ-ONLY from the linked post.
   * The board never writes back to Compose (Aboud's locked rule, 2026-10-02).
   */
  const installByProject = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const [id, lp] of postsByProject) map.set(id, installDateOf(lp));
    return map;
  }, [postsByProject]);

  /** projectId → live update count, for the Updates column badge. */
  const updateCountById = useMemo(() => updateCounts(board.updates), [board.updates]);
  // What the per-column filters read a cell as. See lib/boardColumns.
  const columnCtx = useMemo(
    () => ({ labels: board.labels, installByProject, updateCountById }),
    [board.labels, installByProject, updateCountById],
  );

  const agingFor = (p: BoardProject): AgingState =>
    agingState(p, installByProject.get(p.id) ?? null, today);

  // ---- writes ---------------------------------------------------------------

  /** One-field optimistic write + activity entry. Single source of mutation. */
  const applyPatch = (
    project: BoardProject,
    patch: ProjectPatch,
    extraActivity?: BoardActivity,
    /** The explanation a gate collected, written to Updates with the patch. */
    withUpdate?: ProjectUpdate,
    /** A second entry logged alongside the field change (e.g. the gate post). */
    alsoLog?: BoardActivity,
  ) => {
    const cur = boardRef.current;
    const next = patchProject(project, patch, me);
    const entry = extraActivity ?? activityForPatch(project, patch, me, cur.labels);
    const added = [entry, alsoLog].filter((e): e is BoardActivity => Boolean(e));
    setBoard({
      ...cur,
      projects: cur.projects.map((p) => (p.id === project.id ? next : p)),
      activity: added.length ? [...added, ...cur.activity] : cur.activity,
      updates: withUpdate ? putUpdate(cur.updates, withUpdate) : (cur.updates ?? []),
    });
  };

  /**
   * applyPatch, but some edits have to be justified first (#3, #6). Returning
   * early here means the row does NOT change until the note is written —
   * cancelling leaves everything exactly as it was, which is the point.
   */
  const guardedPatch = (project: BoardProject, patch: ProjectPatch) => {
    if ('rating' in patch && needsRatingReason(patch.rating as number | null)) {
      const stars = patch.rating as 1 | 2 | 3 | 4 | 5;
      setGate({
        project,
        patch,
        kind: 'rating',
        rating: stars,
        gate: {
          title: `Why is this ${stars} stars?`,
          prompt: `A ${stars}-star rating needs a reason, so it can be found later. Rating`,
          placeholder: 'e.g. this project has trench and external long run',
          confirmLabel: `Rate ${stars}★ and post`,
        },
      });
      return;
    }

    if ('statusId' in patch) {
      const label = labelById(boardRef.current.labels, (patch.statusId as string) ?? null);
      if (isPendingInfoLabel(label?.name)) {
        setGate({
          project,
          patch,
          kind: 'pending-info',
          gate: {
            title: 'What information is missing?',
            prompt: 'Say what you are waiting for before putting this on hold. Project',
            placeholder: 'e.g. need the signed utility interconnection letter from the customer',
            confirmLabel: 'Set status and post',
          },
        });
        return;
      }
    }

    applyPatch(project, patch);
  };

  /** The gate was answered — write the update and the patch in one go. */
  const resolveGate = (text: string) => {
    if (!gate) return;
    const u = newUpdate(gate.project.id, text, me, gate.kind, gate.rating ? { rating: gate.rating } : {});
    // The field change keeps its own activity entry; this adds the post.
    applyPatch(gate.project, gate.patch, undefined, u, activityEntry(gate.project.id, me, 'update-post'));
    setGate(null);
    toast('Update posted.');
  };

  /**
   * Upsert an update on its own (the Updates thread's own edits), and record
   * it in the activity log — #5, "whatever action we take on a project it must
   * be recorded". The update's TEXT is not copied into the log: it already
   * lives on the thread, and duplicating it would double the store.
   */
  const putUpdateOnBoard = (u: ProjectUpdate) => {
    const cur = boardRef.current;
    const existed = (cur.updates ?? []).some((x) => x.id === u.id);
    const action: BoardActivity['action'] = u.deleted
      ? 'update-delete'
      : existed
        ? 'update-edit'
        : 'update-post';
    setBoard({
      ...cur,
      updates: putUpdate(cur.updates, u),
      activity: [activityEntry(u.projectId, me, action), ...cur.activity],
    });
  };

  /**
   * One patch across many rows in ONE write. Calling applyPatch in a loop would
   * lose every change but the last — boardRef only catches up on re-render.
   * Undo restores each row's own previous value, not a single shared one.
   */
  const bulkApply = (rows: BoardProject[], patch: ProjectPatch, describe: string) => {
    if (rows.length === 0) return;
    const cur = boardRef.current;
    const now = new Date().toISOString();
    const ids = new Set(rows.map((r) => r.id));
    const entries = rows
      .map((r) => activityForPatch(r, patch, me, cur.labels))
      .filter((e): e is BoardActivity => Boolean(e));
    setBoard({
      ...cur,
      projects: cur.projects.map((p) => (ids.has(p.id) ? patchProject(p, patch, me, now) : p)),
      activity: [...entries, ...cur.activity],
    });
    const field = Object.keys(patch)[0] as keyof BoardProject;
    const previous = rows.map((r) => ({ id: r.id, value: r[field] }));
    toast(`${rows.length} project${rows.length === 1 ? '' : 's'} → ${describe}.`, {
      label: 'Undo',
      fn: () => {
        const now2 = new Date().toISOString();
        const back = boardRef.current;
        const byId = new Map(previous.map((x) => [x.id, x.value]));
        setBoard({
          ...back,
          projects: back.projects.map((p) =>
            byId.has(p.id) ? patchProject(p, { [field]: byId.get(p.id) } as ProjectPatch, me, now2) : p,
          ),
        });
      },
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

  /**
   * Apply a whole Salesforce report in ONE write (Aboud, 2026-10-19).
   *
   * One setBoard call matters: it is one localStorage write, one debounced push
   * and one merge on everyone else's copy. Sixty-one separate writes would race
   * the debounce and could lose rows.
   *
   * Undo is captured BEFORE the write and reverses exactly what this import
   * did — nothing else. Created rows are tombstoned rather than dropped from
   * the array, because a bare removal does not propagate: the merge is
   * newer-wins per id, so a row missing on one side simply comes back.
   */
  const runImport = ({ plan, restoreArchived }: ImportRequest) => {
    const cur = boardRef.current;
    const now = new Date().toISOString();
    const projects = [...cur.projects];
    const activity: BoardActivity[] = [];
    const createdIds: string[] = [];
    const phaseBefore: { id: string; phaseId: string | null }[] = [];
    const notesBefore: { id: string; sfNotes?: SfNotes; sfNotesAt?: string }[] = [];
    const restoredIds: string[] = [];
    // Newest-on-top, and in the order the report listed them.
    let position = Date.parse(now) + plan.rows.length;

    for (const row of plan.rows) {
      if (row.match === 'maybe') continue; // unanswered — the button blocks this

      if (row.match === 'new') {
        const created: BoardProject = {
          ...newProject(row.name, me, cur.labels, now),
          // newProject puts the author in `coordinator`; the report decides it
          // here, and '' (the Design report's "-") must stay unassigned.
          coordinator: row.coordinator,
          phaseId: row.phaseChange?.toId ?? null,
          // Only set when Salesforce's own status names a board status (Hold
          // today). Otherwise newProject's default label stands.
          ...(row.statusId ? { statusId: row.statusId } : {}),
          // The export's alerts + AHJ/utility notes, shown on Compose.
          ...(row.notes ? { sfNotes: row.notes, sfNotesAt: now } : {}),
          position: position--,
        };
        projects.push(created);
        createdIds.push(created.id);
        activity.push(
          activityEntry(created.id, me, 'create', { name: { old: '—', new: created.name } }, now),
        );
        continue;
      }

      const index = projects.findIndex((p) => p.id === row.projectId);
      if (index === -1) continue;
      const before = projects[index];
      if (row.match === 'archived' && !restoreArchived) continue;

      const patch: ProjectPatch = {};
      if (row.match === 'archived') patch.archivedAt = undefined;
      if (row.phaseChange) patch.phaseId = row.phaseChange.toId;
      if (row.notes !== undefined) {
        // {} from the plan means Salesforce cleared them — mirror that.
        patch.sfNotes = hasSfNotes(row.notes) ? row.notes : undefined;
        patch.sfNotesAt = now;
      }
      if (Object.keys(patch).length === 0) continue;

      projects[index] = patchProject(before, patch, me, now);
      if (row.match === 'archived') {
        restoredIds.push(before.id);
        activity.push(activityEntry(before.id, me, 'restore', undefined, now));
      }
      if (row.phaseChange) phaseBefore.push({ id: before.id, phaseId: row.phaseChange.fromId });
      if (row.notes !== undefined) {
        notesBefore.push({ id: before.id, sfNotes: before.sfNotes, sfNotesAt: before.sfNotesAt });
      }
      const entry = activityForPatch(before, patch, me, cur.labels, now);
      if (entry) activity.push(entry);
    }

    if (createdIds.length === 0 && phaseBefore.length === 0 && restoredIds.length === 0 && notesBefore.length === 0) {
      setImportOpen(false);
      toast('Nothing to import — the board already matches that report.');
      return;
    }

    setBoard({ ...cur, projects, activity: [...activity, ...cur.activity] });
    setImportOpen(false);

    const parts = [`Imported ${createdIds.length} project${createdIds.length === 1 ? '' : 's'}`];
    if (phaseBefore.length) parts.push(`${phaseBefore.length} moved phase`);
    if (notesBefore.length) parts.push(`${notesBefore.length} notes updated`);
    if (restoredIds.length) parts.push(`${restoredIds.length} restored`);
    toast(`${parts.join(' · ')}.`, {
      label: 'Undo',
      fn: () => {
        const back = boardRef.current;
        const undone = new Date().toISOString();
        const created = new Set(createdIds);
        const restored = new Set(restoredIds);
        const phases = new Map(phaseBefore.map((p) => [p.id, p.phaseId]));
        const notes = new Map(notesBefore.map((p) => [p.id, p]));
        setBoard({
          ...back,
          projects: back.projects.map((p) => {
            if (created.has(p.id)) return patchProject(p, { deletedAt: undone }, me, undone);
            const patch: ProjectPatch = {};
            if (phases.has(p.id)) patch.phaseId = phases.get(p.id) ?? null;
            if (notes.has(p.id)) {
              patch.sfNotes = notes.get(p.id)!.sfNotes;
              patch.sfNotesAt = notes.get(p.id)!.sfNotesAt;
            }
            if (restored.has(p.id)) patch.archivedAt = undone;
            return Object.keys(patch).length ? patchProject(p, patch, me, undone) : p;
          }),
        });
      },
    });
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

  // Rows the standard filters allow, BEFORE the per-column value filters.
  // The value list each header offers is drawn from this, so unticking a value
  // never removes it from its own menu — you can always put it back.
  const valuePool = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return board.projects
      .filter((p) => !p.deletedAt)
      .filter((p) => (filters.showArchived ? true : !p.archivedAt))
      // Matches project name AND coordinator, punctuation-folded, every term
      // required. Before this, searching a person's name found nothing at all
      // (Aboud 2026-10-17 #9) — see src/lib/boardSearch.ts.
      .filter((p) => (needle ? matchesSearch(p, needle) : true))
      .filter((p) => (filters.coordinators.length ? filters.coordinators.includes(p.coordinator) : true))
      .filter((p) => (filters.statusIds.length ? filters.statusIds.includes(p.statusId ?? '') : true))
      .filter((p) => (filters.phaseIds.length ? filters.phaseIds.includes(p.phaseId ?? '') : true))
      .filter((p) => (filters.mine ? p.coordinator === me : true))
      // Designed-date range: ISO strings compare correctly as text. A row
      // with no date is hidden while a range is set — it can't be "inside" it.
      .filter((p) =>
        filters.dateFrom || filters.dateTo
          ? p.designedDate !== null &&
            (!filters.dateFrom || p.designedDate >= filters.dateFrom) &&
            (!filters.dateTo || p.designedDate <= filters.dateTo)
          : true,
      )
      // "Needs attention": install date passed, or untouched for STALE_DAYS.
      .filter((p) => (filters.staleOnly ? agingState(p, installByProject.get(p.id) ?? null, today) !== 'none' : true))
      .sort((a, b) => b.position - a.position);
  }, [board.projects, filters, me, installByProject, today]);

  // Per-column value filters (Aboud 2026-10-18).
  const visible = useMemo(
    () => valuePool.filter((p) => matchesColumnFilters(p, columnFilters, columnCtx)),
    [valuePool, columnFilters, columnCtx],
  );

  // A project whose status label "counts as done" leaves the main board and
  // lands in the Completed projects section below (Aboud, 2026-10-02); one
  // whose status is marked out-of-scope lands in the section between the two
  // (Aboud, 2026-10-19). Both rules live in lib/boardViews.splitSections.
  const { active, outOfScope, completed } = useMemo(
    () => splitSections(visible, board.labels),
    [visible, board.labels],
  );

  // ---- drag-to-reorder (hold a row, move it, drop — spec: monday-style) -----

  const [drag, setDrag] = useState<RowDrag | null>(null);
  const activeRef = useRef<BoardProject[]>([]);
  activeRef.current = active;
  const sortingRef = useRef(sorting);
  sortingRef.current = sorting;
  const suppressClickRef = useRef(false);

  const onRowPointerDown = (e: ReactPointerEvent<HTMLTableSectionElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Typing or selecting text in an inline editor must never start a drag.
    if (target.closest('input, textarea, select')) return;
    const tr = target.closest('tr[data-project-id]');
    if (!tr) return;
    const id = tr.getAttribute('data-project-id')!;
    const startY = e.clientY;
    let started = false;

    // Index the drop line sits at, from the live row rects (header excluded).
    const overIndexAt = (y: number) => {
      const rows = document.querySelectorAll<HTMLElement>('.board-table-main tbody tr[data-project-id]');
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) return i;
      }
      return rows.length;
    };

    const onMove = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientY - startY) < 5) return; // still just a press
        started = true;
        // Manual order is what's being edited — a column sort would lie about
        // where the row lands, so dragging returns the table to manual order.
        if (sortingRef.current.length) setSorting([]);
      }
      ev.preventDefault();
      setDrag({ id, overIndex: overIndexAt(ev.clientY) });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!started) return;
      // Swallow the click that follows the drop so no cell editor opens.
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      setDrag(null);
      const list = activeRef.current;
      const from = list.findIndex((p) => p.id === id);
      if (from === -1) return;
      const position = positionForMove(list, from, overIndexAt(ev.clientY));
      if (position !== null) applyPatch(list[from], { position });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onRowClickCapture = (e: ReactMouseEvent<HTMLTableSectionElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const labelSortValue = (labels: BoardLabel[], id: string | null) => labelById(labels, id)?.sortOrder;

  // ---- bulk selection -------------------------------------------------------
  // Selection spans everything currently shown, Completed rows included, so a
  // bulk change can reopen finished work.
  /**
   * "Visible" has THREE independent hiding mechanisms and a bulk action may
   * only ever touch rows that pass all three:
   *   1. the filters (already applied — `active` / `completed`),
   *   2. a collapsed section — Completed (`doneOpen`) or Out of SOW scope
   *      (`scopeOpen`),
   *   3. a COLLAPSED GROUP when grouping is on.
   * (3) was missed first time round, so select-all could write a teammate's
   * collapsed group (found by review, 2026-10-08).
   */
  /** A search is being typed — see `shown` and the Completed section. */
  const searching = filters.search.trim().length > 0;

  const shown = useMemo(() => {
    // While a search is running, completed and out-of-scope rows are always in
    // play — hiding a match behind a collapsed section is what made #9 look
    // like "nothing appears". The user's own open/shut preferences are not
    // written to.
    const base = [
      ...active,
      ...(scopeOpen || searching ? outOfScope : []),
      ...(doneOpen || searching ? completed : []),
    ];
    if (groupBy === 'none') return base;
    const hidden = new Set<string>();
    for (const g of groupProjects(base, groupBy, board.labels)) {
      if (collapsed[g.key]) for (const p of g.rows) hidden.add(p.id);
    }
    return hidden.size ? base.filter((p) => !hidden.has(p.id)) : base;
  }, [active, outOfScope, completed, scopeOpen, doneOpen, searching, groupBy, collapsed, board.labels]);

  /**
   * Rows a bulk action will touch. Resolved from every LIVE project, not from
   * `shown` (Aboud 2026-10-17 #7: "I select multi project and change the status
   * it does not do the action for all projects").
   *
   * It used to read `shown`, so any row that left the viewport's filter — a
   * status edit moving it to Completed, a group collapsing, a background sync
   * reordering — silently dropped out of the selection, and the bulk action
   * then applied to fewer rows than the user had ticked. Keeping the selection
   * whole and REPORTING what is hidden is honest; shrinking it silently is not.
   */
  const picked = useMemo(
    () => selectedRows(board.projects.filter((p) => !p.deletedAt), selected),
    [board.projects, selected],
  );
  const shownPicked = useMemo(() => selectedRows(shown, selected), [shown, selected]);
  /** Selected, but not currently on screen — surfaced in the bulk bar. */
  const hiddenPicked = picked.length - shownPicked.length;
  const allShownSelected = shown.length > 0 && shownPicked.length === shown.length;
  const someShownSelected = shownPicked.length > 0;

  /**
   * Read through a ref, NOT the closure.
   *
   * This is called from the select-column header, which lives inside the
   * `columns` useMemo — and that memo deliberately omits volatile values. A
   * plain closure over `shown` therefore went stale: after changing a filter,
   * select-all wrote the PREVIOUS row set (rows no longer on screen) and the
   * prune effect below could not undo it (found by review, 2026-10-08).
   */
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const toggleAllShown = (on: boolean) => {
    setSelected(on ? Object.fromEntries(shownRef.current.map((p) => [p.id, true])) : {});
  };
  const clearSelection = () => setSelected({});

  // Drop selections for rows that genuinely no longer exist (deleted, or gone
  // in a sync). Rows merely hidden by a filter STAY selected and are counted
  // in the bulk bar instead — see `picked` above for why.
  useEffect(() => {
    setSelected((s) => {
      const live = new Set(board.projects.filter((p) => !p.deletedAt).map((p) => p.id));
      const next = Object.fromEntries(Object.entries(s).filter(([id, on]) => on && live.has(id)));
      return Object.keys(next).length === Object.keys(s).length ? s : next;
    });
  }, [board.projects]);

  const columns = useMemo<ColumnDef<BoardProject>[]>(
    () => [
      {
        id: 'select',
        // Doubles as the aging marker — the left edge is where the eye lands,
        // and it needs no extra column of its own.
        header: () => (
          <input
            type="checkbox"
            aria-label="Select all shown"
            checked={allShownSelected}
            ref={(el) => {
              if (el) el.indeterminate = someShownSelected && !allShownSelected;
            }}
            onChange={(e) => toggleAllShown(e.target.checked)}
          />
        ),
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) => {
          const state = agingFor(row.original);
          return (
            <span className="board-select-cell">
              <input
                type="checkbox"
                aria-label={`Select ${row.original.name}`}
                checked={Boolean(selected[row.original.id])}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [row.original.id]: e.target.checked }))
                }
              />
              {state !== 'none' && (
                <span
                  className={`board-aging-dot ${state}`}
                  title={agingTitle(state, row.original, installByProject.get(row.original.id) ?? null, today)}
                  aria-label={agingTitle(state, row.original, installByProject.get(row.original.id) ?? null, today)}
                />
              )}
            </span>
          );
        },
      },
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
              onOpenCompose={() => onOpenCompose(row.original)}
              onCopyName={() => {
                navigator.clipboard?.writeText(row.original.name);
                toast('Name copied.');
              }}
              onActivity={() => setActivityFor(row.original)}
              onUpdates={() => setUpdatesFor(row.original)}
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
            onPick={(statusId) => {
              const prev = row.original.statusId;
              // "Pending Additional Information" is intercepted here and does
              // not land until the user says what is missing (#6).
              if (isPendingInfoLabel(labelById(boardRef.current.labels, statusId)?.name)) {
                guardedPatch(row.original, { statusId });
                return;
              }
              applyPatch(row.original, { statusId });
              // Crossing INTO a done or out-of-scope label hides the row from
              // the main board — announce where it went, with a way back.
              const from = sectionOf(labelById(boardRef.current.labels, prev));
              const to = sectionOf(labelById(boardRef.current.labels, statusId));
              if (to !== from && to !== 'active') {
                toast(`${row.original.name} → ${SECTION_TITLE[to]}.`, {
                  label: 'Undo',
                  fn: () => {
                    const cur = boardRef.current.projects.find((p) => p.id === row.original.id);
                    if (cur) applyPatch(cur, { statusId: prev });
                  },
                });
              }
            }}
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
        id: 'installDate',
        header: 'Install date',
        size: 140,
        minSize: 110,
        maxSize: 800,
        accessorFn: (p) => installByProject.get(p.id) ?? undefined, // ISO sorts as text
        sortUndefined: 'last',
        // READ-ONLY on purpose: this value belongs to the linked post. Letting
        // the board write it would invert "the board controls Compose, never
        // the opposite" (Aboud, 2026-10-02).
        cell: ({ row }) => {
          const iso = installByProject.get(row.original.id) ?? null;
          if (!iso) {
            return (
              <span className="board-install-cell empty" title="No install date — comes from the linked post">
                —
              </span>
            );
          }
          const past = iso < today;
          return (
            <span
              className={`board-install-cell ${past ? 'past' : ''}`}
              title={`From the linked post — edit it in Compose${past ? ' · date has passed' : ''}`}
            >
              {isoToUs(iso)}
            </span>
          );
        },
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
        size: 148,
        minSize: 120,
        maxSize: 800,
        accessorFn: (p) => p.rating ?? undefined,
        sortUndefined: 'last',
        cell: ({ row }) => (
          // 4 and 5 stars go through the gate — they must say why (#3).
          <RatingCell value={row.original.rating} onPick={(rating) => guardedPatch(row.original, { rating })} />
        ),
      },
      {
        // The Monday-style thread (#2). Count doubles as the affordance —
        // a row with nothing on it shows a quiet "+", not a zero.
        id: 'updates',
        header: 'Updates',
        size: 110,
        minSize: 80,
        maxSize: 400,
        accessorFn: (p) => updateCountById.get(p.id) ?? 0,
        cell: ({ row }) => {
          const n = updateCountById.get(row.original.id) ?? 0;
          return (
            <button
              type="button"
              className={`board-upd-cell${n ? ' has' : ''}`}
              title={n ? `${n} update${n === 1 ? '' : 's'} — open the thread` : 'Post the first update'}
              onClick={() => setUpdatesFor(row.original)}
            >
              💬 {n || '+'}
            </button>
          );
        },
      },
      {
        id: 'post',
        header: 'Post',
        size: 150,
        minSize: 100,
        maxSize: 800,
        // Sort groups: drafts first, then posted, then empty.
        accessorFn: (p) => {
          const lp = postsByProject.get(p.id);
          return lp?.draft ? 2 : lp?.posted ? 1 : 0;
        },
        cell: ({ row }) => {
          const lp = postsByProject.get(row.original.id);
          let text = '—';
          let title = 'Start a post for this project';
          if (lp?.draft) {
            text = `Draft · ${initialsOf(lp.draft.author)} · ${relativeTime(lp.draft.updatedAt)}`;
            title = 'Open the draft in Compose';
          } else if (lp?.posted?.postedAt) {
            // Local date of the timestamp — a UTC slice could read a day early.
            const d = new Date(lp.posted.postedAt);
            text = `Posted ${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ✓`;
            title = 'Posted — open History';
          }
          return (
            <button
              type="button"
              className={`board-post-cell ${lp?.draft ? 'draft' : lp?.posted ? 'posted' : 'empty'}`}
              title={title}
              onClick={() => onOpenCompose(row.original)}
            >
              {text}
            </button>
          );
        },
      },
      {
        id: 'updated',
        header: 'Last update',
        size: 150,
        minSize: 120,
        maxSize: 800,
        accessorFn: (p) => p.updatedAt,
        cell: ({ row }) => <UpdatedCell project={row.original} onActivity={() => setActivityFor(row.original)} />,
      },
    ],
    // applyPatch/archive/etc. read boardRef, so the defs only need to refresh
    // when the data they RENDER changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.labels, authors, me, isAdmin, postsByProject, installByProject, updateCountById, today, selected, allShownSelected, someShownSelected],
  );

  // Reconciled every render: a saved order from an older release must not hide
  // a column added since, and must not resurrect one that was removed.
  const resolvedOrder = useMemo(
    () => normalizeColumnOrder(columnOrder, columns.map((c) => c.id as string)),
    [columnOrder, columns],
  );

  const table = useReactTable({
    data: active,
    columns,
    state: { sorting, columnSizing, columnVisibility, columnOrder: resolvedOrder },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  // Completed projects — same columns and widths, its own rows. Resizing
  // lives on the main header only; sorting state is shared so both tables
  // always read the same way.
  const doneTable = useReactTable({
    data: completed,
    columns,
    state: { sorting, columnSizing, columnVisibility, columnOrder: resolvedOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: false,
  });

  // Out of SOW scope — identical contract to doneTable: shared columns, shared
  // widths, shared sorting, its own rows.
  const scopeTable = useReactTable({
    data: outOfScope,
    columns,
    state: { sorting, columnSizing, columnVisibility, columnOrder: resolvedOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: false,
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

  const toggleGroup = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // Grouping rearranges the rows, so a manual drag would land somewhere the
  // user did not point at — reordering is only offered in ungrouped order,
  // the same reason a drag clears a column sort.
  const canReorder = groupBy === 'none';
  const mainBodyProps = {
    table,
    highlightId,
    drag,
    onRowPointerDown: canReorder ? onRowPointerDown : undefined,
    onRowClickCapture,
    groupBy,
    labels: board.labels,
    collapsed,
    onToggleGroup: toggleGroup,
    agingOf: agingFor,
    selectedIds: selected,
  };

  const openDuplicate = () => {
    if (!duplicate) return;
    setFilters((f) => ({ ...f, search: '', mine: false }));
    // The twin may live in a collapsed section — reveal it before scrolling.
    const where = sectionOf(labelById(board.labels, duplicate.statusId));
    if (where === 'done') setDoneOpen(true);
    if (where === 'scope') setScopeOpen(true);
    setHighlightId(duplicate.id);
    setDuplicate(null);
    setAddName('');
    setTimeout(() => {
      document.querySelector(`[data-project-id="${duplicate.id}"]`)?.scrollIntoView({ block: 'center' });
    }, 50);
    setTimeout(() => setHighlightId(null), 2500);
  };

  // Header counts speak about ACTIVE work; the completed and out-of-scope
  // sections carry their own counts.
  const activeTotal = useMemo(
    () => splitSections(board.projects.filter((p) => !p.deletedAt && !p.archivedAt), board.labels).active.length,
    [board.projects, board.labels],
  );
  const dupStatus = duplicate ? labelById(board.labels, duplicate.statusId)?.name : '';
  const presets = useMemo(() => viewPresets(board.labels), [board.labels]);

  return (
    <div className="list-page board-page">
      <div className="list-head">
        <h1>Board</h1>
        <span className="muted">
          {activeTotal === 0 && completed.length === 0 && outOfScope.length === 0
            ? 'no projects yet'
            : `${active.length} of ${activeTotal} active project${activeTotal === 1 ? '' : 's'}`}
        </span>
        {/* A column filter hides rows, and a hidden filter reads as missing
            data — which this board has already paid for once. One obvious
            chip, always reachable, that turns every column filter off. */}
        {hasColumnFilters(columnFilters) && (
          <button
            type="button"
            className="btn small board-colfilter-clear"
            onClick={() => setColumnFilters({})}
            title="Remove every per-column filter"
          >
            Column filters on — clear
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={() => addRef.current?.focus()}>
          + New project
        </button>
      </div>

      <div className="card list-card">
        <div className="board-presets">
          {presets.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`btn small secondary ${isPresetActive(filters, v) ? 'board-filter-on' : ''}`}
              title={v.title}
              onClick={() => setFilters({ ...NO_FILTERS, ...v.patch })}
            >
              {v.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <label className="board-groupby">
            Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupKey)} aria-label="Group by">
              {GROUP_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

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
          {/* Natural-language search over every project's Updates (#3). */}
          <button type="button" className="btn small secondary" onClick={() => setAskOpen(true)} title="Search everything the team has posted on every project">
            💬 Ask the updates
          </button>
          <span className={`board-date-range ${filters.dateFrom || filters.dateTo ? 'on' : ''}`}>
            <span className="muted">Designed</span>
            <input
              type="date"
              aria-label="Designed date from"
              title="Designed date — from"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
            <span className="muted">–</span>
            <input
              type="date"
              aria-label="Designed date to"
              title="Designed date — to"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
            {(filters.dateFrom || filters.dateTo) && (
              <button
                type="button"
                className="btn small secondary"
                title="Clear the date range"
                onClick={() => setFilters({ ...filters, dateFrom: '', dateTo: '' })}
              >
                ✕
              </button>
            )}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setImportOpen(true)}
            title="Paste a Scope of Work Assignments report and add whatever is missing"
          >
            Import from Salesforce
          </button>
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
                .filter((c) => c.id !== 'name' && c.id !== 'select')
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
            className={`board-table board-table-main ${drag ? 'board-reordering' : ''}`}
            style={{ ...columnSizeVars, width: table.getTotalSize() }}
          >
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const colId = header.column.id;
                    const movable = !PINNED_COLUMNS.includes(colId);
                    const picked = columnFilters[colId] ?? [];
                    return (
                      <th
                        key={header.id}
                        className={[
                          colId === 'name' ? 'board-sticky' : '',
                          movable ? 'board-th-movable' : '',
                          dragCol && dragCol !== colId && movable ? 'board-th-droppable' : '',
                          dragCol === colId ? 'board-th-dragging' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ width: `calc(var(--header-${header.id}-size) * 1px)` }}
                        // Reorder by dragging the header onto another one
                        // (Aboud 2026-10-18: "we can move the columns between
                        // each other, so we can have one of them closer").
                        // `select` and the sticky `name` never move.
                        draggable={movable}
                        onDragStart={movable ? () => setDragCol(colId) : undefined}
                        onDragEnd={() => setDragCol(null)}
                        onDragOver={movable && dragCol ? (e) => e.preventDefault() : undefined}
                        onDrop={
                          movable && dragCol
                            ? (e) => {
                                e.preventDefault();
                                setColumnOrder(moveColumn(resolvedOrder, dragCol, colId));
                                setDragCol(null);
                              }
                            : undefined
                        }
                      >
                        {/* The select column holds a checkbox — it must not be
                            wrapped in the sort button (invalid, and every click
                            would sort instead of select). */}
                        {colId === 'select' ? (
                          <span className="board-th-plain">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="board-th"
                              onClick={header.column.getToggleSortingHandler()}
                              title={movable ? 'Sort · drag the header to move this column' : 'Sort'}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <SortArrow dir={header.column.getIsSorted()} />
                            </button>
                            {!UNFILTERABLE_COLUMNS.includes(colId) && (
                              <ColumnFilter
                                columnId={colId}
                                label={String(header.column.columnDef.header ?? colId)}
                                values={distinctColumnValues(valuePool, colId, columnCtx)}
                                selected={picked}
                                open={filterMenu === colId}
                                onOpenChange={(v) => setFilterMenu(v ? colId : null)}
                                onChange={(vals) =>
                                  setColumnFilters((f) => ({ ...f, [colId]: vals }))
                                }
                              />
                            )}
                            <div
                              className={`board-resizer ${header.column.getIsResizing() ? 'resizing' : ''}`}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              onDoubleClick={() => header.column.resetSize()}
                              title="Drag to resize · double-click to reset"
                            />
                          </>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            {isResizing ? (
              <MemoBody {...mainBodyProps} />
            ) : (
              <BodyInner {...mainBodyProps} />
            )}
          </table>

          {active.length === 0 && (
            <p className="muted board-empty">
              {activeTotal === 0 && completed.length === 0 && outOfScope.length === 0
                ? 'No projects yet — add the first one below.'
                : activeTotal === 0
                  ? 'Nothing in progress — every project is in a section below.'
                  : completed.length + outOfScope.length > 0
                    ? // The real shape of Aboud's #9: every one of Yarob's
                      // projects is Done, so a search for him emptied this
                      // table while 25 matches sat in a collapsed section
                      // below, reading as "nothing appears". The out-of-scope
                      // section can hide a match exactly the same way.
                      `No active projects match — but ${matchesBelow(outOfScope.length, completed.length)}, shown below.`
                    : 'Nothing matches the filters.'}
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

      {/* Out of SOW scope sits BETWEEN active and Completed on purpose
          (Aboud 2026-10-19): these projects are not in the pipeline, but they
          are not finished either, and they still have to be findable. */}
      <SectionCard
        variant="scope"
        title="Out of SOW scope"
        emptyText="Nothing here — a project lands here when its status is marked “out of scope” in Edit labels (Hold, Sonnen and ENPHASE are, by default)."
        // A search forces both sections open for the duration of the search —
        // `searching` made their rows selectable (below) but left them off
        // screen, which is the same "nothing appears" trap as #9. The stored
        // preference is not written to, so it comes back as it was.
        open={scopeOpen || searching}
        onToggle={() => setScopeOpen((v) => !v)}
        table={scopeTable}
        columnSizeVars={columnSizeVars}
        width={table.getTotalSize()}
        highlightId={highlightId}
        agingOf={agingFor}
        selectedIds={selected}
      />

      <SectionCard
        variant="done"
        title="Completed projects"
        emptyText="Nothing here yet — a project lands here when its status is set to a “done” label."
        open={doneOpen || searching}
        onToggle={() => setDoneOpen((v) => !v)}
        table={doneTable}
        columnSizeVars={columnSizeVars}
        width={table.getTotalSize()}
        highlightId={highlightId}
        agingOf={agingFor}
        selectedIds={selected}
      />

      {picked.length > 0 && (
        <div className="board-bulk-bar" role="region" aria-label="Bulk actions">
          <span className="board-bulk-count">
            {picked.length} selected
            {hiddenPicked > 0 && (
              <span className="board-bulk-hidden" title="Selected rows that the current filters hide. Bulk actions still apply to them.">
                {' '}· {hiddenPicked} hidden
              </span>
            )}
          </span>
          <FilterSelect
            label="Set status"
            single
            options={statusOptions.map((l) => ({ id: l.id, name: l.name }))}
            selected={[]}
            onChange={(ids) => {
              const label = labelById(board.labels, ids[0] ?? null);
              if (!label) return;
              bulkApply(picked, { statusId: label.id }, label.name);
              clearSelection();
            }}
          />
          <FilterSelect
            label="Set coordinator"
            single
            options={authors.map((a) => ({ id: a, name: a }))}
            selected={[]}
            onChange={(ids) => {
              if (!ids[0]) return;
              bulkApply(picked, { coordinator: ids[0] }, ids[0]);
              clearSelection();
            }}
          />
          <FilterSelect
            label="Set Design/Schedule"
            single
            options={phaseOptions.map((l) => ({ id: l.id, name: l.name }))}
            selected={[]}
            onChange={(ids) => {
              const label = labelById(board.labels, ids[0] ?? null);
              if (!label) return;
              bulkApply(picked, { phaseId: label.id }, label.name);
              clearSelection();
            }}
          />
          <span style={{ flex: 1 }} />
          <button type="button" className="btn small secondary" onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      )}

      {importOpen && (
        <ImportModal
          projects={board.projects}
          labels={board.labels}
          roster={authors}
          onImport={runImport}
          onClose={() => setImportOpen(false)}
        />
      )}

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
      {askOpen && (
        <UpdateSearchModal
          projects={board.projects.filter((p) => !p.deletedAt)}
          updates={board.updates ?? []}
          onOpenProject={(p) => {
            setAskOpen(false);
            setUpdatesFor(p);
          }}
          onClose={() => setAskOpen(false)}
        />
      )}

      {updatesFor && (
        <UpdatesModal
          project={updatesFor}
          updates={board.updates ?? []}
          me={me}
          isAdmin={isAdmin}
          onPut={putUpdateOnBoard}
          onClose={() => setUpdatesFor(null)}
        />
      )}

      {gate && (
        <RequireNoteModal
          gate={gate.gate}
          projectName={gate.project.name}
          onConfirm={resolveGate}
          onCancel={() => setGate(null)}
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
