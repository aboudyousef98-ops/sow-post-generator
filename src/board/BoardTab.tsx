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
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  activityEntry,
  activityForPatch,
  autoSortOn,
  cleanName,
  findDuplicate,
  isOutOfScopeLabel,
  isPredesignLabel,
  isReviewLabel,
  labelById,
  linkedPosts,
  newProject,
  nextPrefs,
  patchProject,
  withPredesignDefault,
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
  bandMove,
  groupProjects,
  installDateOf,
  isPresetActive,
  idsBetween,
  selectedRows,
  sortByPreDesignStatus,
  sortByStatus,
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
  labelRequiresNote,
  needsRatingReason,
  newUpdate,
  putUpdate,
  statusGate,
  updateCounts,
} from '../lib/updates';
import type { PostRecord } from '../types';
import type { Toast } from '../components/Toast';
import type {
  AutomationRule,
  BoardActivity,
  BoardLabel,
  BoardProject,
  BoardState,
  LabelColumnKey,
  ProjectRequest,
  ProjectUpdate,
  UpdateKind,
} from './types';
import {
  autoUpdates,
  describeRule,
  followUpPatch,
  gatingRules,
  matchingRules,
} from '../lib/automations';
import ActivityModal from './ActivityModal';
import AutomationsModal from './AutomationsModal';
import UpdatesPanel from './UpdatesPanel';
import UpdateSearchModal from './UpdateSearchModal';
import RequireNoteModal, { type NoteGate } from './RequireNoteModal';
import { PasteFromSlackModal, RequestsGateModal } from './RequestsModal';
import PermissionsModal, { type TeamMember } from './PermissionsModal';
import { canEditColumn, HIDEABLE_COLUMNS, isColumnHidden, MANAGEABLE_COLUMNS, setPerm } from '../lib/columnPerms';
import { isReadyOrDoneLabel, isWorkingLabel, openRequestsFor } from '../lib/requests';
import EditLabelsModal from './EditLabelsModal';
import ImportModal, { type ImportRequest } from './ImportModal';
import Popover from './Popover';
import { DateCell, LabelCell, NameCell, PersonCell, RatingCell, UpdatedCell, initialsOf } from './cells';

const KEY_WIDTHS = 'sowpost.board.colWidths.v1';
const KEY_VISIBILITY = 'sowpost.board.colVisibility.v2'; // v2: Last update now defaults visible
const KEY_FILTERS = 'sowpost.board.filters.v1';
const KEY_DONE_OPEN = 'sowpost.board.doneOpen.v1';
const KEY_SCOPE_OPEN = 'sowpost.board.scopeOpen.v1';
const KEY_REVIEW_OPEN = 'sowpost.board.reviewOpen.v1';
const KEY_PREDESIGN_OPEN = 'sowpost.board.predesignOpen.v1';
const KEY_ACTIVE_OPEN = 'sowpost.board.activeOpen.v1';
const KEY_GROUP_BY = 'sowpost.board.groupBy.v1';
const KEY_ORDER = 'sowpost.board.colOrder.v1';

// Filters / NO_FILTERS now live in lib/boardViews so the view presets can be
// unit-tested without a DOM.

/** Which of the board's five sections a status label puts a row in. */
type Section = 'active' | 'predesign' | 'review' | 'scope' | 'done';

const SECTION_TITLE: Record<Section, string> = {
  active: 'Active Projects',
  predesign: 'Pre-Design',
  review: 'Installation Review',
  scope: 'Out of SOW scope',
  done: 'Completed projects',
};

function sectionOf(label: BoardLabel | undefined): Section {
  // Same precedence as splitSections: done, review, pre-design, out-of-scope.
  if (label?.isDone) return 'done';
  if (isReviewLabel(label)) return 'review';
  if (isPredesignLabel(label)) return 'predesign';
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

/** Patch field → the board column it belongs to, for the permissions guard. */
const PATCH_COLUMN: [string, string][] = [
  ['name', 'name'],
  ['coordinator', 'coordinator'],
  ['reviewer', 'reviewer'],
  ['statusId', 'status'],
  ['phaseId', 'phase'],
  ['preDesignStatusId', 'predesignStatus'],
  ['designedDate', 'designedDate'],
  ['rating', 'rating'],
];

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
  /** Signed-in USERNAME — what column permissions key on (renames can't flip access). */
  meUsername: string;
  isAdmin: boolean;
  authors: string[];
  /** The team roster for the permissions pickers. */
  members: TeamMember[];
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
/**
 * A pointer sensor that ignores a press that started inside a text field.
 *
 * The whole row is the drag handle — Aboud asked to "hold the row", not to
 * aim at a grip — so without this, typing in the inline name editor would
 * begin a drag. Buttons are deliberately NOT excluded: the status chip, the
 * rating and the name are most of the row's surface, and the 8px activation
 * distance below is what separates a click on them from a drag.
 */
class RowPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: e }: { nativeEvent: PointerEvent }) =>
        !(e.target as HTMLElement | null)?.closest?.('input, textarea, select'),
    },
  ];
}

/** One draggable body row. */
function SortableRow({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'row' },
  });
  return (
    <tr
      ref={setNodeRef}
      data-project-id={id}
      className={`${className}${isDragging ? ' board-row-dragging' : ''}`}
      // Transform, not a re-render: the rows below slide out of the way with
      // the GPU rather than React re-ordering 400 rows per frame.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // `listeners` only — NOT dnd-kit's `attributes`. Those put
      // role="button" + tabindex on the <tr>, so every row announced itself
      // as a button whose name is the whole row's text ("button, Martha
      // Thompson Aboud Yousef Working on it 10/16/2026 …"), and broke
      // getByRole queries that look for real buttons inside the row. The row
      // stays a row; the pointer sensor is what starts a drag.
      //
      // The cost is that keyboard dragging is unreachable, same as the
      // hand-rolled version it replaces — reaching it needs a visible grip
      // in the select column, which is a look change to agree first.
      {...listeners}
    >
      {children}
    </tr>
  );
}

/** One draggable column header. */
function SortableHeader({
  id,
  className,
  style,
  children,
}: {
  id: string;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'column' },
  });
  return (
    <th
      ref={setNodeRef}
      className={`${className}${isDragging ? ' board-th-dragging' : ''}`}
      style={{ ...style, transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {children}
    </th>
  );
}

// Body split out so it can be memoized while a column is being resized —
// the "Performant Column Resizing" pattern: widths move via CSS variables,
// rows do not re-render during the drag.
function BodyInner({
  table,
  highlightId,
  sortableRows,
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
  /** Main table only — the three sections below keep their own order. */
  sortableRows?: boolean;
  onRowClickCapture?: (e: ReactMouseEvent<HTMLTableSectionElement>) => void;
  groupBy?: GroupKey;
  labels?: BoardLabel[];
  collapsed?: Record<string, boolean>;
  onToggleGroup?: (key: string) => void;
  agingOf?: (p: BoardProject) => AgingState;
  selectedIds?: Record<string, boolean>;
}) {
  const rows = table.getRowModel().rows;

  const rowClass = (row: (typeof rows)[number]) =>
    [
      row.original.archivedAt ? 'board-row-archived' : '',
      row.original.id === highlightId ? 'board-row-highlight' : '',
      selectedIds?.[row.original.id] ? 'board-row-selected' : '',
      agingOf ? `board-row-aging-${agingOf(row.original)}` : '',
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
      <tbody onClickCapture={onRowClickCapture}>
        {rows.map((row) =>
          sortableRows ? (
            <SortableRow key={row.id} id={row.original.id} className={rowClass(row)}>
              {cells(row)}
            </SortableRow>
          ) : (
            <tr key={row.id} data-project-id={row.original.id} className={rowClass(row)}>
              {cells(row)}
            </tr>
          ),
        )}
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
                // Grouped rows are never sortable: grouping rearranges them,
                // so a drop would land somewhere the user did not point at.
                return (
                  <tr key={row.id} data-project-id={p.id} className={rowClass(row)}>
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
 * Column widths as CSS variables for one table — cells read them with
 * `calc(var(--col-x-size) * 1px)` so a resize drag never re-renders the rows.
 *
 * Per TABLE, not shared: the Installation Review section shows the Reviewer
 * column and the other three do not, so they no longer have the same set of
 * headers or the same total width. The widths themselves still agree, because
 * every table reads the one `columnSizing` state.
 */
function sizeVarsFor(table: TanTable<BoardProject>): Record<string, number> {
  const vars: Record<string, number> = {};
  for (const header of table.getFlatHeaders()) {
    vars[`--header-${header.id}-size`] = header.getSize();
    vars[`--col-${header.column.id}-size`] = header.column.getSize();
  }
  return vars;
}

/**
 * A collapsible section below the main table — "Installation Review",
 * "Out of SOW scope" and "Completed projects". Same columns and sorting state
 * as the main table; the rows differ, and Installation Review also carries the
 * Reviewer column. Headers here sort but do not resize: resizing lives on the
 * main header alone, so there is one source of width.
 */
function SectionCard({
  variant,
  title,
  emptyText,
  open,
  onToggle,
  table,
  highlightId,
  agingOf,
  selectedIds,
  full,
}: {
  /** Drives the accent colour only — see `.board-done` / `.board-scope`. */
  variant: 'done' | 'scope' | 'review' | 'predesign';
  title: string;
  emptyText: string;
  open: boolean;
  onToggle: () => void;
  table: TanTable<BoardProject>;
  highlightId: string | null;
  agingOf?: (p: BoardProject) => AgingState;
  selectedIds?: Record<string, boolean>;
  /**
   * Present = this section renders the FULL table (drag, resize, filter,
   * group) instead of the light read-mostly one. Pre-Design passes it; the
   * three archive sections below do not — see FullTable's own comment.
   */
  full?: Omit<Parameters<typeof FullTable>[0], 'table' | 'rows' | 'empty'>;
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
        ) : full ? (
          <FullTable {...full} table={table} rows={table.options.data} />
        ) : (
          <div className="board-scroll">
            <table className="board-table" style={{ ...sizeVarsFor(table), width: table.getTotalSize() }}>
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
    prev.sortableRows === next.sortableRows &&
    prev.groupBy === next.groupBy &&
    prev.collapsed === next.collapsed &&
    prev.selectedIds === next.selectedIds,
) as typeof BodyInner;

/**
 * The full-fat board table: headers that sort, filter, resize and drag to
 * reorder; rows that drag to reorder; grouping; and the drag overlay that
 * makes a held row feel held.
 *
 * Extracted from the Active Projects table on 2026-11-17 so the Pre-Design
 * section can be the SAME thing rather than a stripped copy (Aboud: "the
 * active project group of tasks to have the same features as the pre-design
 * same same"). `SectionCard` is still the light table, used by the three
 * read-mostly sections below.
 *
 * Each instance owns its OWN DndContext, deliberately:
 * - a ROW drag only ever means something inside one section — what moves a row
 *   between sections is its status, never a pointer — so two contexts also
 *   make a cross-section row drag impossible rather than ambiguous;
 * - a COLUMN drag writes the ONE shared column order, so dragging a header in
 *   either table moves that column in both (Aboud 2026-11-17: one layout,
 *   editable from any section).
 */
function FullTable({
  table,
  rows,
  tableClassName = '',
  onRowMove,
  onColumnMove,
  columnFilters,
  onColumnFilterChange,
  filterMenu,
  onFilterMenuChange,
  valuePool,
  columnCtx,
  body,
  empty,
}: {
  table: TanTable<BoardProject>;
  /** This table's rows, in displayed order — the row sortable's item list. */
  rows: BoardProject[];
  tableClassName?: string;
  onRowMove: (activeId: string, overId: string) => void;
  onColumnMove: (activeId: string, overId: string) => void;
  columnFilters: Record<string, string[]>;
  onColumnFilterChange: (columnId: string, values: string[]) => void;
  filterMenu: string | null;
  onFilterMenuChange: (columnId: string | null) => void;
  valuePool: BoardProject[];
  columnCtx: Parameters<typeof distinctColumnValues>[2];
  /** Everything BodyInner needs except the table, which is this one. */
  body: Omit<Parameters<typeof BodyInner>[0], 'table'>;
  /** Shown under the headers when there are no rows (the Active table's own
   * "where did my projects go" message). */
  empty?: ReactNode;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<'row' | 'column' | null>(null);

  const sensors = useSensors(
    // 8px, so a click on a status chip stays a click.
    useSensor(RowPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const order = table.getState().columnOrder;
  const sizingState = table.getState().columnSizing;
  const visibilityState = table.getState().columnVisibility;
  const columnSizeVars = useMemo(
    () => sizeVarsFor(table),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sizingState, visibilityState, table.options.columns],
  );
  const isResizing = Boolean(table.getState().columnSizingInfo.isResizingColumn);
  /** The row the overlay renders, found once rather than per cell. */
  const overlayRow =
    dragType === 'row' && dragId ? table.getRowModel().rows.find((r) => r.original.id === dragId) : undefined;

  const bodyProps = { table, ...body };

  const onDragStart = (e: DragStartEvent) => {
    setDragId(String(e.active.id));
    setDragType((e.active.data.current?.type as 'row' | 'column') ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const type = e.active.data.current?.type;
    setDragId(null);
    setDragType(null);
    if (!e.over || e.active.id === e.over.id) return;
    if (type === 'column') onColumnMove(String(e.active.id), String(e.over.id));
    else onRowMove(String(e.active.id), String(e.over.id));
  };

  return (
    /* ONE context for rows and columns; each sortable says which it is.
       The axis modifier is picked from what is actually moving, so a row
       cannot drift sideways and a header cannot drift down. */
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[dragType === 'column' ? restrictToHorizontalAxis : restrictToVerticalAxis]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragId(null);
        setDragType(null);
      }}
    >
      <div className="board-scroll">
        <table
          className={`board-table ${tableClassName} ${dragId ? 'board-reordering' : ''}`}
          style={{ ...columnSizeVars, width: table.getTotalSize() }}
        >
          <SortableContext
            items={order.filter((c) => !PINNED_COLUMNS.includes(c))}
            strategy={horizontalListSortingStrategy}
          >
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const colId = header.column.id;
                    const movable = !PINNED_COLUMNS.includes(colId);
                    const picked = columnFilters[colId] ?? [];
                    const thClass = [
                      colId === 'name' ? 'board-sticky' : '',
                      movable ? 'board-th-movable' : '',
                      dragType === 'column' && dragId !== colId && movable ? 'board-th-droppable' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const thStyle = { width: `calc(var(--header-${header.id}-size) * 1px)` };
                    // Reorder by dragging the header onto another one (Aboud
                    // 2026-10-18). `select` and the sticky `name` never move,
                    // so they stay plain <th> and are not sortable items.
                    const Cell = movable ? SortableHeader : 'th';
                    return (
                      <Cell key={header.id} id={colId} className={thClass} style={thStyle}>
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
                                onOpenChange={(v) => onFilterMenuChange(v ? colId : null)}
                                onChange={(vals) => onColumnFilterChange(colId, vals)}
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
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </thead>
          </SortableContext>
          <SortableContext items={rows.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {isResizing ? <MemoBody {...bodyProps} /> : <BodyInner {...bodyProps} />}
          </SortableContext>
        </table>

        {rows.length === 0 && empty}
      </div>

      {/* The thing that makes a row feel held: a real copy of it, lifted off
          the page and following the cursor, rather than the original turning
          a different colour in place. Wrapped in its own <table> so the
          width variables and the cell layout still apply. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {dragId && dragType === 'row' && overlayRow ? (
          <table className="board-table board-drag-ghost" style={{ ...columnSizeVars, width: table.getTotalSize() }}>
            <tbody>
              <tr>
                {overlayRow.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ width: `calc(var(--col-${cell.column.id}-size) * 1px)` }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        ) : dragId && dragType === 'column' ? (
          <div className="board-drag-ghost board-col-ghost">
            {String(table.getColumn(dragId)?.columnDef.header ?? dragId)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default function BoardTab({
  board,
  setBoard,
  me,
  meUsername,
  isAdmin,
  authors,
  members,
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
  // Slack-captured requests (Aboud 2026-11-06 design, built 2026-11-15).
  const [slackOpen, setSlackOpen] = useState(false);
  // Column permissions (Aboud 2026-11-15).
  const [permsOpen, setPermsOpen] = useState(false);
  const [reqGate, setReqGate] = useState<{
    project: BoardProject;
    patch: ProjectPatch;
    open: ProjectRequest[];
    targetName: string;
  } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  /**
   * A patch held hostage until the user explains it (#3 rating, #6 pending,
   * and since 2026-11-05 any status label flagged "needs a note").
   *
   * `projects` is a LIST because the bulk action bar needs the same gate: one
   * explanation, posted to every row it moves. One row is just the list of
   * one, so there is a single resolve path rather than two that can drift.
   */
  const [gate, setGate] = useState<{
    projects: BoardProject[];
    patch: ProjectPatch;
    gate: NoteGate;
    kind: UpdateKind;
    rating?: 1 | 2 | 3 | 4 | 5;
    /** Bulk only — the toast description passed through to bulkApply. */
    describe?: string;
    /**
     * Automations this change matched, captured when the gate opened so the
     * follow-ups land WITH the held patch — re-matching on confirm could give
     * a different answer if a teammate edited a rule in between.
     */
    rules?: AutomationRule[];
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BoardProject | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [duplicate, setDuplicate] = useState<BoardProject | null>(null);
  const [columnsMenu, setColumnsMenu] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  // Completed section: out of sight by default, one click away.
  const [doneOpen, setDoneOpen] = useState(() => localStorage.getItem(KEY_DONE_OPEN) === '1');
  // "Out of SOW scope" — same deal, and also collapsed by default: the whole
  // point is that these rows stop crowding the pipeline.
  const [scopeOpen, setScopeOpen] = useState(() => localStorage.getItem(KEY_SCOPE_OPEN) === '1');
  // Installation Review: unlike the other two this one is OPEN by default — it
  // is live work waiting on someone, not a parking space (Aboud 2026-11-03).
  const [reviewOpen, setReviewOpen] = useState(() => localStorage.getItem(KEY_REVIEW_OPEN) !== '0');
  const [predesignOpen, setPredesignOpen] = useState(() => localStorage.getItem(KEY_PREDESIGN_OPEN) !== '0');
  // The main table collapses like its sibling sections (Aboud 2026-11-15).
  const [activeOpen, setActiveOpen] = useState(() => localStorage.getItem(KEY_ACTIVE_OPEN) !== '0');
  const addRef = useRef<HTMLInputElement>(null);
  // Tier 1: group by, collapsed groups, and bulk selection.
  const [groupBy, setGroupBy] = useState<GroupKey>(
    () => (localStorage.getItem(KEY_GROUP_BY) as GroupKey | null) ?? 'none',
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  /** Where a Shift-click range starts — the last row Ctrl-clicked or ticked. */
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
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
    localStorage.setItem(KEY_REVIEW_OPEN, reviewOpen ? '1' : '0');
  }, [reviewOpen]);
  useEffect(() => {
    localStorage.setItem(KEY_PREDESIGN_OPEN, predesignOpen ? '1' : '0');
  }, [predesignOpen]);
  useEffect(() => {
    localStorage.setItem(KEY_ACTIVE_OPEN, activeOpen ? '1' : '0');
  }, [activeOpen]);
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
    else if (isReviewLabel(label)) setReviewOpen(true);
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

  /** Open Slack requests per row — what the amber chip shows and the gates
   * block on (2026-11-15). */
  const openReqCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of board.requests ?? []) {
      if (r.deleted || r.resolvedAt || !r.projectId) continue;
      map.set(r.projectId, (map.get(r.projectId) ?? 0) + 1);
    }
    return map;
  }, [board.requests]);

  /** Upsert requests in ONE board write (paste batch, resolve, attach).
   * boardRef is advanced SYNCHRONOUSLY: the gate's confirm writes the
   * resolutions and then immediately re-dispatches the held status change,
   * and that second write must see them or the gate re-pops forever. */
  const putRequests = (items: ProjectRequest[]) => {
    if (!items.length) return;
    const cur = boardRef.current;
    const byId = new Map((cur.requests ?? []).map((r) => [r.id, r]));
    for (const r of items) byId.set(r.id, r);
    const next = { ...cur, requests: [...byId.values()] };
    boardRef.current = next;
    setBoard(next);
  };
  // What the per-column filters read a cell as. See lib/boardColumns.
  const columnCtx = useMemo(
    () => ({ labels: board.labels, installByProject, updateCountById }),
    [board.labels, installByProject, updateCountById],
  );

  const agingFor = (p: BoardProject): AgingState =>
    agingState(p, installByProject.get(p.id) ?? null, today);

  // ---- column permissions (Aboud 2026-11-15) --------------------------------

  /** The column a blocked patch field belongs to, or null when all allowed.
   * Checked on the RAW patch, so the auto-seeded Pre-Design sub-status never
   * false-blocks a permitted status change. */
  const blockedColumn = (patch: ProjectPatch): string | null => {
    for (const [field, col] of PATCH_COLUMN) {
      if (field in patch && !canEditColumn(boardRef.current.columnPerms, col, meUsername, isAdmin)) {
        return MANAGEABLE_COLUMNS.find((c) => c.key === col)?.label ?? col;
      }
    }
    return null;
  };

  const refuseIfBlocked = (patch: ProjectPatch): boolean => {
    const blocked = blockedColumn(patch);
    if (!blocked) return false;
    toast(`View only — the ${blocked} column is restricted to specific editors. Ask an admin.`);
    return true;
  };

  /** Write one column's permission rule — admin-only UI reaches this. */
  const setColumnPerm = (columnKey: string, patch: Parameters<typeof setPerm>[2]) => {
    const cur = boardRef.current;
    setBoard({ ...cur, columnPerms: setPerm(cur.columnPerms, columnKey, patch, meUsername || me) });
  };

  // ---- writes ---------------------------------------------------------------

  /** One-field optimistic write + activity entry. Single source of mutation. */
  const applyPatch = (
    project: BoardProject,
    rawPatch: ProjectPatch,
    extraActivity?: BoardActivity,
    /** The explanation a gate collected, written to Updates with the patch. */
    withUpdate?: ProjectUpdate,
    /** A second entry logged alongside the field change (e.g. the gate post). */
    alsoLog?: BoardActivity,
  ) => {
    if (refuseIfBlocked(rawPatch)) return;
    const cur = boardRef.current;
    // Entering Pre-Design seeds the sub-status default — here, at the single
    // source of mutation, so every entry route gets it (audit 2026-11-15).
    const patch = withPredesignDefault(project, rawPatch, cur.labels);
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
  /**
   * applyPatch plus whatever the team's automations want done alongside —
   * the merged field changes in the SAME write, and any "post an update"
   * action on the same thread (lib/automations).
   *
   * Single pass: the follow-up is never fed back through matchingRules. See
   * followUpPatch for why that is the loop guard rather than a limitation.
   */
  const applyWithAutomations = (project: BoardProject, patch: ProjectPatch) => {
    if (refuseIfBlocked(patch)) return;
    const matched = matchingRules(boardRef.current.automations, project, patch, me);
    if (matched.length === 0) {
      applyPatch(project, patch);
      return;
    }
    const merged = withPredesignDefault(
      project,
      { ...patch, ...followUpPatch(matched, me) },
      boardRef.current.labels,
    );
    const posts = autoUpdates(matched, project.id, me);
    // applyPatch takes ONE update; more than one is rare enough that writing
    // them straight is clearer than widening its signature.
    const cur = boardRef.current;
    const next = patchProject(project, merged, me);
    const entry = activityForPatch(project, merged, me, cur.labels);
    let updates = cur.updates ?? [];
    for (const u of posts) updates = putUpdate(updates, u);
    setBoard({
      ...cur,
      projects: cur.projects.map((p) => (p.id === project.id ? next : p)),
      activity: [
        ...(entry ? [entry] : []),
        ...posts.map((u) => activityEntry(u.projectId, me, 'update-post')),
        ...cur.activity,
      ],
      updates,
    });
  };

  /**
   * Returns true when the change LANDED, false when a gate is now holding it.
   * Callers that follow up with a toast need to know which happened.
   */
  const guardedPatch = (project: BoardProject, patch: ProjectPatch): boolean => {
    // A team-written "require an update first" rule gates exactly like the
    // built-in ones, so all three are collected before anything is written.
    const matched = matchingRules(boardRef.current.automations, project, patch, me);
    const customGates = gatingRules(matched);

    if ('rating' in patch && needsRatingReason(patch.rating as number | null)) {
      const stars = patch.rating as 1 | 2 | 3 | 4 | 5;
      setGate({
        projects: [project],
        patch,
        kind: 'rating',
        rating: stars,
        rules: matched,
        gate: {
          title: `Why is this ${stars} stars?`,
          prompt: `A ${stars}-star rating needs a reason, so it can be found later. Rating`,
          placeholder: 'e.g. this project has trench and external long run',
          confirmLabel: `Rate ${stars}★ and post`,
        },
      });
      return false;
    }

    if ('statusId' in patch) {
      // Hard gate FIRST (Aboud 2026-11-06, built 2026-11-15): open Slack
      // requests must be resolved before "Ready to submit"/"Done" — the
      // friction belongs at the moment the BOS is finished. Resolving in the
      // modal re-dispatches this guard, so a needs-a-note gate still runs
      // after it.
      const target = labelById(boardRef.current.labels, (patch.statusId as string) ?? null);
      if (isReadyOrDoneLabel(target)) {
        const open = openRequestsFor(boardRef.current.requests, project.id);
        if (open.length) {
          setReqGate({ project, patch, open, targetName: target!.name });
          return false;
        }
      }
      // Which statuses gate is DATA now, not a name in this file: any status
      // ticked "needs a note" in Edit labels lands here, which is how
      // "Pending Update" joined "Pending Additional Information" without a
      // second branch (Aboud 2026-11-05).
      const label = labelById(boardRef.current.labels, (patch.statusId as string) ?? null);
      if (label && labelRequiresNote(label)) {
        setGate({
          projects: [project],
          patch,
          kind: isPendingInfoLabel(label.name) ? 'pending-info' : 'status',
          rules: matched,
          gate: statusGate(label),
        });
        return false;
      }
    }

    if (customGates.length) {
      setGate({
        projects: [project],
        patch,
        kind: 'status',
        rules: matched,
        gate: {
          title: 'This change needs an update',
          prompt: `${describeRule(customGates[0], boardRef.current.labels)} Project`,
          placeholder: 'e.g. engineering sent the revised set, waiting on the AHJ',
          confirmLabel: 'Save and post',
        },
      });
      return false;
    }

    applyWithAutomations(project, patch);
    return true;
  };

  /**
   * The gate was answered — write the update(s) and the patch in one go.
   * One row takes the single-write path; a bulk gate posts the same
   * explanation to every row it moves, in bulkApply's single write.
   */
  const resolveGate = (text: string) => {
    if (!gate) return;
    const extra = gate.rating ? { rating: gate.rating } : {};
    // Automation field changes land with the held patch, in one write.
    const patch = { ...gate.patch, ...followUpPatch(gate.rules ?? [], me) };
    if (gate.projects.length === 1) {
      const only = gate.projects[0];
      const u = newUpdate(only.id, text, me, gate.kind, extra);
      // The field change keeps its own activity entry; this adds the post.
      applyPatch(only, patch, undefined, u, activityEntry(only.id, me, 'update-post'));
      setGate(null);
      toast('Update posted.');
      return;
    }
    const updates = gate.projects.map((p) => newUpdate(p.id, text, me, gate.kind, extra));
    bulkApply(gate.projects, patch, gate.describe ?? 'updated', updates);
    setGate(null);
    clearSelection();
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
  const bulkApply = (
    rows: BoardProject[],
    patch: ProjectPatch,
    describe: string,
    /**
     * Explanations a gate collected for this bulk change — one per row, same
     * text. They ride in the SAME write as the patch, so 20 rows cost one
     * push instead of 21.
     */
    withUpdates?: ProjectUpdate[],
  ) => {
    if (rows.length === 0) return;
    if (refuseIfBlocked(patch)) return;
    const cur = boardRef.current;
    const now = new Date().toISOString();
    const ids = new Set(rows.map((r) => r.id));
    // Per ROW, not once for the batch: a row that already carries a Pre-Design
    // sub-status must keep it while its neighbours get the default.
    const patchFor = (p: BoardProject) => withPredesignDefault(p, patch, cur.labels);
    const entries = rows
      .map((r) => activityForPatch(r, patchFor(r), me, cur.labels))
      .filter((e): e is BoardActivity => Boolean(e));
    const posts = (withUpdates ?? []).map((u) => activityEntry(u.projectId, me, 'update-post', undefined, now));
    let updates = cur.updates ?? [];
    for (const u of withUpdates ?? []) updates = putUpdate(updates, u);
    setBoard({
      ...cur,
      projects: cur.projects.map((p) => (ids.has(p.id) ? patchProject(p, patchFor(p), me, now) : p)),
      activity: [...entries, ...posts, ...cur.activity],
      updates,
    });
    const field = Object.keys(patch)[0] as keyof BoardProject;
    const previous = rows.map((r) => ({ id: r.id, value: r[field] }));
    toast(`${rows.length} project${rows.length === 1 ? '' : 's'} → ${describe}.`, {
      label: 'Undo',
      // Undo puts the FIELD back and leaves any gate explanation posted. That
      // is deliberate: the note is a record of what someone knew at the time,
      // and the Updates thread is append-only everywhere else too.
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

  /**
   * Archive or permanently delete many rows in ONE write.
   *
   * Not bulkApply: that builds its entries with activityForPatch, which
   * deliberately SKIPS archivedAt and deletedAt because they are "logged as
   * their own actions". A bulk archive routed through it would move the rows
   * and record nothing.
   */
  const bulkLifecycle = (rows: BoardProject[], action: 'archive' | 'delete') => {
    if (rows.length === 0) return;
    const cur = boardRef.current;
    const now = new Date().toISOString();
    const ids = new Set(rows.map((r) => r.id));
    const patch: ProjectPatch = action === 'archive' ? { archivedAt: now } : { deletedAt: now };
    setBoard({
      ...cur,
      projects: cur.projects.map((p) => (ids.has(p.id) ? patchProject(p, patch, me, now) : p)),
      activity: [...rows.map((r) => activityEntry(r.id, me, action, undefined, now)), ...cur.activity],
    });
    clearSelection();
    const n = rows.length;
    const noun = `${n} project${n === 1 ? '' : 's'}`;
    if (action === 'delete') {
      // No Undo, matching the single-row delete: the confirm modal IS the
      // safety, and offering an undo would undersell how final this reads.
      toast(`Deleted permanently — ${noun}.`);
      return;
    }
    toast(`Archived — ${noun}.`, {
      label: 'Undo',
      fn: () => {
        const back = boardRef.current;
        const now2 = new Date().toISOString();
        setBoard({
          ...back,
          projects: back.projects.map((p) =>
            ids.has(p.id) ? patchProject(p, { archivedAt: undefined }, me, now2) : p,
          ),
          activity: [...rows.map((r) => activityEntry(r.id, me, 'restore', undefined, now2)), ...back.activity],
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

  /**
   * Upsert one automation. Stamped here, not in the modal, so the modal never
   * has to know about the merge contract — same split as updateLabels.
   */
  const putRule = (rule: AutomationRule) => {
    const cur = boardRef.current;
    const next = { ...rule, updatedAt: new Date().toISOString(), updatedBy: me };
    const list = cur.automations ?? [];
    setBoard({
      ...cur,
      automations: list.some((r) => r.id === next.id)
        ? list.map((r) => (r.id === next.id ? next : r))
        : [...list, next],
    });
  };

  /** Tombstone, never a splice — a hard delete would come back on the next sync. */
  const deleteRule = (rule: AutomationRule) => {
    putRule({ ...rule, deletedAt: new Date().toISOString() });
    toast('Automation deleted for the team.');
  };

  const archiveLabel = (labelId: string, moveToId: string | null) => {
    const cur = boardRef.current;
    const label = cur.labels.find((l) => l.id === labelId);
    if (!label || label.isSystem) return;
    const now = new Date().toISOString();
    const field: 'statusId' | 'phaseId' | 'preDesignStatusId' =
      label.columnKey === 'status' ? 'statusId' : label.columnKey === 'phase' ? 'phaseId' : 'preDesignStatusId';
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
    const base = newProject(name, me, cur.labels);
    // "When a project is added to the board → …" rules fire here. `null` for
    // `before` is what marks this as a creation rather than an edit, and the
    // follow-ups are folded into the row before it is ever written, so a new
    // project is born already correct instead of flickering.
    const matched = matchingRules(cur.automations, null, base, me);
    const project = { ...base, ...followUpPatch(matched, me) };
    const posts = autoUpdates(matched, project.id, me);
    let updates = cur.updates ?? [];
    for (const u of posts) updates = putUpdate(updates, u);
    setBoard({
      ...cur,
      projects: [...cur.projects, project],
      activity: [
        activityEntry(project.id, me, 'create', { name: { old: '—', new: project.name } }),
        ...posts.map((u) => activityEntry(u.projectId, me, 'update-post')),
        ...cur.activity,
      ],
      updates,
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
  const {
    active: activeUnsorted,
    installReview,
    preDesign: preDesignUnsorted,
    outOfScope,
    completed,
  } = useMemo(() => splitSections(visible, board.labels), [visible, board.labels]);

  /**
   * Always-ordered board (Aboud 2026-11-05) — shared, so it is read off the
   * board rather than localStorage: "when it is on it is on for everybody".
   */
  const autoSort = autoSortOn(board);

  /**
   * The active table, pre-ordered by status when auto-sort is on.
   *
   * Only when the user has NO column sort of their own: clicking a header must
   * still win, and TanStack leaves data order alone while `sorting` is empty.
   * So this orders the data instead of writing to `sorting`, which keeps the
   * two mechanisms from fighting over the same state.
   */
  const active = useMemo(
    () => (autoSort && sorting.length === 0 ? sortByStatus(activeUnsorted, board.labels) : activeUnsorted),
    [autoSort, sorting.length, activeUnsorted, board.labels],
  );

  /**
   * The Pre-Design table, ordered the same way for the same reason — by its
   * OWN column, the sub-status (Aboud 2026-11-17). Auto-sort governs both
   * tables: it is one team-wide switch about how the board reads, so having
   * it rank one table and not the other would be the surprise.
   */
  const preDesign = useMemo(
    () => (autoSort && sorting.length === 0 ? sortByPreDesignStatus(preDesignUnsorted, board.labels) : preDesignUnsorted),
    [autoSort, sorting.length, preDesignUnsorted, board.labels],
  );

  const setAutoSort = (on: boolean) => {
    const cur = boardRef.current;
    setBoard({ ...cur, prefs: nextPrefs(on, me) });
    toast(
      on
        ? 'Auto-sort on — the board is ordered by status for everyone.'
        : 'Auto-sort off for everyone — rows can be dragged again.',
    );
  };

  // ---- drag-to-reorder (hold a row, move it, drop — spec: monday-style) -----

  /**
   * Rows and columns both drag through dnd-kit, told apart by the `type` each
   * sortable carries. Replaced ~55 lines of hand-rolled pointer tracking plus
   * the HTML5 column drag (Aboud 2026-11-05, who wanted the row to feel
   * genuinely held): dnd-kit gives a DragOverlay that follows the cursor,
   * neighbours that slide out of the way, and keyboard dragging — which the
   * hand-rolled version never had.
   *
   * The context itself now lives inside FullTable, one per full table, so the
   * Active and Pre-Design tables each drag their own rows. What stays here is
   * what a drop MEANS, because only the board can write a patch.
   */
  const activeRef = useRef<BoardProject[]>([]);
  activeRef.current = active;
  const preDesignRef = useRef<BoardProject[]>([]);
  preDesignRef.current = preDesign;

  /** One shared column order, moved from either table's header. */
  const moveColumnTo = (dragged: string, onto: string) =>
    setColumnOrder(moveColumn(resolvedOrder, dragged, onto));

  /**
   * A row dropped onto another, within ONE section's rows.
   *
   * `bandOf` is what the section ranks by — status in the Active table, the
   * Pre-Design sub-status in that section (Aboud 2026-11-17: the two tables
   * behave the same, each banding by the column that orders it). A row may
   * only be reordered inside its own band; bandMove returns null for a
   * cross-band drop and dnd-kit springs the row back, so say why or it reads
   * as the drag having failed.
   */
  const rowMover =
    (rowsRef: { current: BoardProject[] }, bandOf: (p: BoardProject) => string | null, bandName: string) =>
    (draggedId: string, ontoId: string) => {
      const rows = rowsRef.current;
      const moved = rows.find((p) => p.id === draggedId);
      const onto = rows.find((p) => p.id === ontoId);
      if (moved && onto && bandOf(moved) !== bandOf(onto)) {
        toast(`A row can only be reordered within its own ${bandName} while auto-sort is on.`);
        return;
      }
      const position = bandMove(rows, draggedId, ontoId, bandOf);
      if (position !== null && moved) applyPatch(moved, { position });
    };

  const moveActiveRow = rowMover(activeRef, (p) => p.statusId, 'status');
  const movePreDesignRow = rowMover(preDesignRef, (p) => p.preDesignStatusId ?? null, 'Pre-Design status');

  /**
   * Ctrl/Cmd-click toggles a row into the selection; Shift-click takes
   * everything from the last-clicked row to this one (Aboud 2026-11-05).
   *
   * CAPTURE phase on purpose: the cells below are buttons — a status chip, a
   * name editor, a rating — and without intercepting first, Ctrl-clicking a
   * status cell would open its picker instead of selecting the row.
   */
  const onRowClickCapture = (e: ReactMouseEvent<HTMLTableSectionElement>) => {
    // No click-suppression needed any more: dnd-kit swallows the click that
    // follows a drop itself, which is what suppressClickRef used to do.
    const multi = e.ctrlKey || e.metaKey;
    if (!multi && !e.shiftKey) return;
    const tr = (e.target as HTMLElement).closest('tr[data-project-id]');
    const id = tr?.getAttribute('data-project-id');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    // Shift-click otherwise drags a text selection across the rows it just
    // highlighted, which looks like a bug.
    window.getSelection?.()?.removeAllRanges();

    if (e.shiftKey) {
      const span = idsBetween(shownRef.current, anchorRef.current, id);
      setSelected((s) => ({ ...s, ...Object.fromEntries(span.map((x) => [x, true])) }));
      // The anchor deliberately STAYS put: shift-clicking again extends from
      // the same origin rather than walking the anchor down the list.
      return;
    }
    setSelected((s) => ({ ...s, [id]: !s[id] }));
    setAnchorId(id);
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
      ...(activeOpen || searching ? active : []),
      ...(predesignOpen || searching ? preDesign : []),
      ...(reviewOpen || searching ? installReview : []),
      ...(scopeOpen || searching ? outOfScope : []),
      ...(doneOpen || searching ? completed : []),
    ];
    if (groupBy === 'none') return base;
    const hidden = new Set<string>();
    for (const g of groupProjects(base, groupBy, board.labels)) {
      if (collapsed[g.key]) for (const p of g.rows) hidden.add(p.id);
    }
    return hidden.size ? base.filter((p) => !hidden.has(p.id)) : base;
  }, [active, installReview, preDesign, outOfScope, completed, activeOpen, predesignOpen, reviewOpen, scopeOpen, doneOpen, searching, groupBy, collapsed, board.labels]);

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
  // Read through a ref for the same reason as `shown` above: the click-capture
  // handler is created once per render but reads state at event time.
  const anchorRef = useRef(anchorId);
  anchorRef.current = anchorId;
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
            {/* ONE chip beside the name for the whole project panel (Aboud
                2026-11-15: the Updates column moved here, then the separate
                requests chip merged in — "their feature is the same"). Quiet
                💬 + with nothing, teal 💬 n with updates, AMBER with ● n the
                moment designers' requests are open: the louder state wins
                the pill. Titles keep the column's old wording so the
                affordance reads the same. */}
            {(() => {
              const u = updateCountById.get(row.original.id) ?? 0;
              const r = openReqCountById.get(row.original.id) ?? 0;
              const title = r
                ? `${r} open Slack request${r === 1 ? '' : 's'} from the designers${
                    u ? ` · ${u} update${u === 1 ? '' : 's'}` : ''
                  } — resolve before Done`
                : u
                  ? `${u} update${u === 1 ? '' : 's'} — open the thread`
                  : 'Post the first update';
              return (
                <button
                  type="button"
                  className={`board-upd-chip${r ? ' req' : u ? ' has' : ''}`}
                  title={title}
                  onClick={() => setUpdatesFor(row.original)}
                >
                  {r ? (u ? `💬 ${u} · ● ${r}` : `● ${r}`) : `💬 ${u || '+'}`}
                </button>
              );
            })()}
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
        // Who is reviewing the installation (Aboud 2026-11-03). Same picker as
        // the coordinator; Salesforce has no reviewer column, so this is only
        // ever set by hand and no import ever touches it.
        id: 'reviewer',
        header: 'Reviewer',
        size: 170,
        minSize: 110,
        maxSize: 800,
        accessorFn: (p) => p.reviewer || undefined,
        sortUndefined: 'last',
        cell: ({ row }) => (
          <PersonCell
            value={row.original.reviewer ?? ''}
            authors={authors}
            me={me}
            label="Reviewer"
            onPick={(reviewer) => applyPatch(row.original, { reviewer })}
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
              // Entering Pre-Design seeds the sub-status default centrally —
              // withPredesignDefault runs inside applyPatch/bulkApply, so this
              // path and every other one behave the same (audit 2026-11-15).
              // Everything goes through the guard: it is what applies the
              // "needs a note" gate (#6, and Pending Update since 2026-11-05)
              // AND the team's own automations. It returns false when a gate
              // is holding the change, in which case there is nothing to
              // announce yet — the modal is the announcement.
              if (!guardedPatch(row.original, { statusId })) return;
              // Work starts → the project panel opens itself with the
              // designers' open requests on top (soft, Aboud 2026-11-06;
              // nothing blocked — consolidated into the side panel 2026-11-15).
              const landed = labelById(boardRef.current.labels, statusId);
              if (isWorkingLabel(landed) && (openReqCountById.get(row.original.id) ?? 0) > 0) {
                setUpdatesFor(row.original);
              }
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
        // Pre-Design sub-status (Aboud 2026-11-15) — the SVT collab
        // taskforce's own state per project. Shown ONLY in the Pre-Design
        // section, the same scoping contract as `reviewer`.
        id: 'predesignStatus',
        header: 'Pre-Design status',
        size: 200,
        minSize: 120,
        maxSize: 800,
        accessorFn: (p) => labelSortValue(board.labels, p.preDesignStatusId ?? null),
        sortUndefined: 'last',
        cell: ({ row }) => (
          <LabelCell
            labels={board.labels}
            columnKey="predesign"
            valueId={row.original.preDesignStatusId ?? null}
            onPick={(preDesignStatusId) => applyPatch(row.original, { preDesignStatusId })}
            onEditLabels={() => setEditLabels('predesign')}
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
      // The Updates COLUMN was retired 2026-11-15 (Aboud: "move it from
      // column to be like the one indicated with the arrow") — the thread now
      // opens from the 💬 chip beside the project name.
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
    [board.labels, authors, me, isAdmin, postsByProject, installByProject, updateCountById, openReqCountById, today, selected, allShownSelected, someShownSelected],
  );

  // Reconciled every render: a saved order from an older release must not hide
  // a column added since, and must not resurrect one that was removed.
  const resolvedOrder = useMemo(
    () => normalizeColumnOrder(columnOrder, columns.map((c) => c.id as string)),
    [columnOrder, columns],
  );

  /**
   * Reviewer belongs to the Installation Review section and nowhere else
   * (Aboud 2026-11-05: "I wanted that column to only be in the Installation
   * review board"). It is the ONE column whose visibility is not the viewer's
   * choice, so it is forced per table rather than stored — and it is kept out
   * of the "Columns ▾" menu below, so it cannot be switched on in the wrong
   * place. Every other column still follows `columnVisibility`.
   */
  /** Columns hidden FROM THIS USER by the permissions rules (2026-11-15).
   * Spread LAST so it wins even over the sections' forced columns. */
  const hiddenCols = useMemo(
    () =>
      new Set(
        HIDEABLE_COLUMNS.filter((c) => isColumnHidden(board.columnPerms, c.key, meUsername, isAdmin)).map(
          (c) => c.key,
        ),
      ),
    [board.columnPerms, meUsername, isAdmin],
  );
  const hiddenOverride = useMemo(
    () => Object.fromEntries([...hiddenCols].map((k) => [k, false])),
    [hiddenCols],
  );
  const visibilityNoReviewer = useMemo(
    () => ({ ...columnVisibility, reviewer: false, predesignStatus: false, ...hiddenOverride }),
    [columnVisibility, hiddenOverride],
  );
  const visibilityWithReviewer = useMemo(
    () => ({ ...columnVisibility, reviewer: true, predesignStatus: false, ...hiddenOverride }),
    [columnVisibility, hiddenOverride],
  );
  // Pre-Design sub-status belongs to its section alone, same contract as the
  // Reviewer column above (Aboud 2026-11-15).
  const visibilityPredesign = useMemo(
    () => ({ ...columnVisibility, reviewer: false, predesignStatus: true, ...hiddenOverride }),
    [columnVisibility, hiddenOverride],
  );

  const table = useReactTable({
    data: active,
    columns,
    state: { sorting, columnSizing, columnVisibility: visibilityNoReviewer, columnOrder: resolvedOrder },
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
    state: { sorting, columnSizing, columnVisibility: visibilityNoReviewer, columnOrder: resolvedOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: false,
  });

  // Installation Review — identical contract to doneTable, except this is the
  // one table that carries the Reviewer column. It is therefore one column
  // WIDER than the others, which is why each table sizes itself (sizeVarsFor)
  // instead of all four reading the main table's widths.
  const reviewTable = useReactTable({
    data: installReview,
    columns,
    state: { sorting, columnSizing, columnVisibility: visibilityWithReviewer, columnOrder: resolvedOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: false,
  });

  // Pre-Design — the one OTHER full table (Aboud 2026-11-17: "the active
  // project group of tasks to have the same features as the pre-design same
  // same"). Same options as `table` above, including resizing, and the same
  // shared sizing/order/visibility state — so a column moved or resized here
  // is moved or resized in the active table too. It is also the one table that
  // carries the Pre-Design sub-status column.
  const predesignTable = useReactTable({
    data: preDesign,
    columns,
    state: { sorting, columnSizing, columnVisibility: visibilityPredesign, columnOrder: resolvedOrder },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  // Out of SOW scope — identical contract to doneTable: shared columns, shared
  // widths, shared sorting, its own rows.
  const scopeTable = useReactTable({
    data: outOfScope,
    columns,
    state: { sorting, columnSizing, columnVisibility: visibilityNoReviewer, columnOrder: resolvedOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: false,
  });

  // The main table's own width variables. The three sections compute theirs in
  // SectionCard (sizeVarsFor) — they no longer share a header set.
  const toggleGroup = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // Grouping rearranges the rows, so a manual drag would land somewhere the
  // user did not point at — reordering is only offered in ungrouped order,
  // the same reason a drag clears a column sort.
  //
  // Auto-sort is the same problem with a different cause: the status rank
  // decides where a row sits, so a drop across a band boundary would spring
  // back and read as a bug. Turning auto-sort off hands dragging back.
  // Auto-sort no longer blocks dragging (Aboud 2026-11-05 chose to keep both):
  // the status rank still decides the bands, and a drag reorders within one.
  // Grouping still does, because it rearranges the rows underneath the drop.
  const canReorder = groupBy === 'none';
  /** What BodyInner needs, minus the table — each FullTable adds its own, so
   * the Active and Pre-Design bodies cannot drift apart. */
  const bodyProps = {
    highlightId,
    sortableRows: canReorder,
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
              onClick={() => {
                setFilters({ ...NO_FILTERS, ...v.patch });
                // Only presets that carry a sort touch it — the rest leave
                // whatever column sort the user set alone.
                if (v.sort) setSorting(v.sort);
              }}
            >
              {v.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {/* Shared, not per-browser (Aboud 2026-11-05). Admin-only to change,
              because flipping it changes the board for the whole team — but
              everyone sees the state and who set it, so an ordered board is
              never a mystery. */}
          <button
            type="button"
            className={`btn small secondary ${autoSort ? 'board-filter-on' : ''}`}
            disabled={!isAdmin}
            aria-pressed={autoSort}
            title={
              isAdmin
                ? autoSort
                  ? 'On for the whole team — the board is ordered by status, newest first inside each one. Drag-to-reorder is off while this is on; the order itself is the ↑/↓ in Edit labels.'
                  : 'Off for the whole team — rows keep the manual drag order.'
                : `Set by ${board.prefs?.updatedBy ?? 'the team'} — ask an admin to change it.`
            }
            onClick={() => setAutoSort(!autoSort)}
          >
            {/* A ✕ for "off" read as a remove-this affordance. The on state is
                already carried by the pill colour and aria-pressed; off needs
                no glyph at all. */}
            Auto-sort by status {autoSort ? '✓' : ''}
          </button>
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
          {/* The TOOLS group: things that open something, as opposed to the
              filters on the row above. "Ask the board" sat among the filter
              toggles, where it read as one more thing that narrows the table. */}
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setAskOpen(true)}
            title="Search everything the team has posted — and everything they have done"
          >
            💬 Ask the board
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setAutoOpen(true)}
            title="Everything the board does on its own — and write your own rules"
          >
            ⚡ Automations
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn small secondary"
              onClick={() => setPermsOpen(true)}
              title="Who may edit each column, and who it is hidden from"
            >
              🔒 Permissions
            </button>
          )}
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setSlackOpen(true)}
            title="Paste the designers' Slack requests — matched to their projects, shown when work starts, required resolved before Done"
          >
            📥 Paste from Slack
          </button>
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
                // `name` and `select` are pinned; `reviewer` and
                // `predesignStatus` are off the menu because each belongs to
                // its own section alone (Aboud 2026-11-05 / 2026-11-15) —
                // offering a toggle that the section overrides either way
                // would just be a lying checkbox.
                .filter(
                  (c) =>
                    c.id !== 'name' &&
                    c.id !== 'select' &&
                    c.id !== 'reviewer' &&
                    c.id !== 'predesignStatus' &&
                    // A permissions-hidden column must not be re-enableable.
                    !hiddenCols.has(c.id),
                )
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

        {/* The main table collapses like its sibling sections (Aboud
            2026-11-15: "make it collapse like other groups"). A search forces
            it open without writing the preference — the same contract the
            other sections follow. */}
        <button
          type="button"
          className="board-done-toggle board-active-toggle"
          aria-expanded={activeOpen || searching}
          onClick={() => setActiveOpen((v) => !v)}
        >
          <span className={`board-done-caret ${activeOpen || searching ? 'open' : ''}`}>▸</span>
          Active Projects
          <span className="board-done-count">{active.length}</span>
        </button>

        {(activeOpen || searching) && (
        <>
        <FullTable
          table={table}
          rows={active}
          tableClassName="board-table-main"
          onRowMove={moveActiveRow}
          onColumnMove={moveColumnTo}
          columnFilters={columnFilters}
          onColumnFilterChange={(colId, vals) => setColumnFilters((f) => ({ ...f, [colId]: vals }))}
          filterMenu={filterMenu}
          onFilterMenuChange={setFilterMenu}
          valuePool={valuePool}
          columnCtx={columnCtx}
          body={bodyProps}
          empty={
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
          }
        />

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
        </>
        )}
      </div>

      {/* Out of SOW scope sits BETWEEN active and Completed on purpose
          (Aboud 2026-10-19): these projects are not in the pipeline, but they
          are not finished either, and they still have to be findable. */}
      {/* Pre-Design sits directly under the active table (Aboud 2026-11-15):
          the SVT collab taskforce's survey-stage analyses, with their own
          sub-status column, ahead of the Installation Review section. */}
      {/* The one section that is a full table, not a read-mostly list: the
          SVT taskforce works in it all day (Aboud 2026-11-17, "it would be
          like another type of active projects"). Same body props, same shared
          column layout, its own rows and its own sub-status banding. */}
      <SectionCard
        variant="predesign"
        title="Pre-Design"
        emptyText="Nothing here — a project lands here when its status is set to “Pre-Design” (or any status marked “pre-design” in Edit labels)."
        open={predesignOpen || searching}
        onToggle={() => setPredesignOpen((v) => !v)}
        table={predesignTable}
        highlightId={highlightId}
        agingOf={agingFor}
        selectedIds={selected}
        full={{
          onRowMove: movePreDesignRow,
          onColumnMove: moveColumnTo,
          columnFilters,
          onColumnFilterChange: (colId, vals) => setColumnFilters((f) => ({ ...f, [colId]: vals })),
          filterMenu,
          onFilterMenuChange: setFilterMenu,
          valuePool,
          columnCtx,
          body: bodyProps,
        }}
      />

      <SectionCard
        variant="review"
        title="Installation Review"
        emptyText="Nothing here — a project lands here when its status is marked “installation review” in Edit labels (the “Installation Review” status is, by default)."
        open={reviewOpen || searching}
        onToggle={() => setReviewOpen((v) => !v)}
        table={reviewTable}
        highlightId={highlightId}
        agingOf={agingFor}
        selectedIds={selected}
      />

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
              // The Slack-requests hard gate holds here too (2026-11-15):
              // rows still owing a request stay put and are named; the rest
              // of the batch proceeds. One modal cannot collect resolutions
              // for many rows honestly, so blocked rows are resolved from
              // their own amber chips first.
              let rows = picked;
              if (isReadyOrDoneLabel(label)) {
                const blocked = rows.filter((p) => (openReqCountById.get(p.id) ?? 0) > 0);
                if (blocked.length) {
                  rows = rows.filter((p) => !(openReqCountById.get(p.id) ?? 0));
                  toast(
                    `${blocked.length} selected project${blocked.length === 1 ? ' still owes' : 's still owe'} open Slack requests (amber chip) — resolve those first.`,
                  );
                  if (!rows.length) return;
                }
              }
              // This used to call bulkApply directly, so moving 20 rows to
              // "Pending Additional Information" slipped the gate entirely and
              // posted nothing. One explanation now covers the whole batch.
              if (labelRequiresNote(label)) {
                const g = statusGate(label);
                setGate({
                  projects: rows,
                  patch: { statusId: label.id },
                  kind: isPendingInfoLabel(label.name) ? 'pending-info' : 'status',
                  describe: label.name,
                  gate: {
                    ...g,
                    prompt: `${rows.length} project${rows.length === 1 ? '' : 's'} moving to “${label.name}”. The same update is posted to every one of them.`,
                    confirmLabel: `Set ${rows.length} and post`,
                  },
                });
                return;
              }
              bulkApply(rows, { statusId: label.id }, label.name);
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
          {/* The bulk bar could change three fields but remove nothing, so
              clearing finished work meant deleting it one row at a time
              (Aboud 2026-11-05). Archive is reversible and open to everyone;
              permanent delete is admin-only behind a confirm. */}
          <button
            type="button"
            className="btn small secondary"
            onClick={() => bulkLifecycle(picked, 'archive')}
            title="Hide these from the board — reversible, and Show archived brings them back"
          >
            Archive
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn small danger"
              onClick={() => setConfirmBulkDelete(true)}
              title="Remove these for the whole team — cannot be undone"
            >
              Delete permanently
            </button>
          )}
          <button type="button" className="btn small secondary" onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      )}

      {confirmBulkDelete && (
        <div className="modal-overlay" onClick={() => setConfirmBulkDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {picked.length} project{picked.length === 1 ? '' : 's'} permanently?</h3>
            <p>
              Removed for the whole team, and this cannot be undone. Archiving is usually enough.
            </p>
            {/* Name them. A bare count is not enough to check against what you
                meant to select, and this is the most destructive action here. */}
            <ul className="board-bulk-names">
              {picked.slice(0, 12).map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
              {picked.length > 12 && <li className="muted">…and {picked.length - 12} more</li>}
            </ul>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setConfirmBulkDelete(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  bulkLifecycle(picked, 'delete');
                  setConfirmBulkDelete(false);
                }}
              >
                Delete {picked.length} permanently
              </button>
            </div>
          </div>
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

      {autoOpen && (
        <AutomationsModal
          labels={board.labels}
          automations={board.automations}
          roster={authors}
          isAdmin={isAdmin}
          me={me}
          onSave={putRule}
          onDelete={deleteRule}
          onEditLabels={(columnKey) => {
            setAutoOpen(false);
            setEditLabels(columnKey);
          }}
          onClose={() => setAutoOpen(false)}
        />
      )}

      {permsOpen && (
        <PermissionsModal
          perms={board.columnPerms ?? []}
          members={members}
          onSet={setColumnPerm}
          onClose={() => setPermsOpen(false)}
        />
      )}
      {slackOpen && (
        <PasteFromSlackModal
          projects={board.projects}
          requests={board.requests ?? []}
          me={me}
          onPut={putRequests}
          toast={toast}
          onClose={() => setSlackOpen(false)}
        />
      )}
      {reqGate && (
        <RequestsGateModal
          project={reqGate.project}
          open={reqGate.open}
          me={me}
          targetName={reqGate.targetName}
          onCancel={() => setReqGate(null)}
          onConfirm={(resolved) => {
            // Write the resolutions, then re-dispatch the held change through
            // the guard so a needs-a-note gate still gets its say.
            putRequests(resolved);
            const held = reqGate;
            setReqGate(null);
            const cur = boardRef.current.projects.find((p) => p.id === held.project.id);
            if (cur) {
              if (guardedPatch(cur, held.patch)) {
                toast(`${held.project.name} → ${held.targetName}.`);
              }
            }
          }}
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
          activity={board.activity}
          me={me}
          roster={authors}
          onOpenProject={(p) => {
            setAskOpen(false);
            setUpdatesFor(p);
          }}
          onOpenActivity={(p) => {
            setAskOpen(false);
            setActivityFor(p);
          }}
          onClose={() => setAskOpen(false)}
        />
      )}

      {/* The project panel — a side panel, not a modal (Aboud 2026-11-15,
          "like monday.com"): the board stays live behind it, and clicking
          another row's chip just switches the panel to that project. */}
      {updatesFor && (
        <UpdatesPanel
          project={updatesFor}
          updates={board.updates ?? []}
          requests={board.requests ?? []}
          me={me}
          isAdmin={isAdmin}
          onPut={putUpdateOnBoard}
          onPutRequests={putRequests}
          onClose={() => setUpdatesFor(null)}
        />
      )}

      {gate && (
        <RequireNoteModal
          gate={gate.gate}
          // Bulk gates name the batch in their own prompt, so there is no one
          // project to bold — the modal renders an empty strong and reads fine.
          projectName={gate.projects.length === 1 ? gate.projects[0].name : ''}
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
