// Pure board helpers for the bot API (Aboud 2026-11-23, items 15–17).
//
// The merge layer is already duplicated server/client in this repo on purpose
// (boardMerge.ts mirrors src/lib/board.mergeBoard). These helpers follow the
// same pattern: a small, self-contained server copy of the label/section/aging
// rules the API needs, so the function bundle never has to import the whole
// client tree. They operate on the loose blob shapes.

export interface Label {
  id: string;
  columnKey: string;
  name: string;
  sortOrder?: number;
  isDefault?: boolean;
  isDone?: boolean;
  archived?: boolean;
  outOfScope?: boolean;
  review?: boolean;
  predesign?: boolean;
}

export interface Project {
  id: string;
  name: string;
  coordinator?: string;
  reviewer?: string;
  statusId?: string | null;
  phaseId?: string | null;
  preDesignStatusId?: string | null;
  rating?: number | null;
  position?: number;
  sourceUrl?: string;
  requestedBy?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
  archivedAt?: string;
  schemaVersion?: number;
  [k: string]: unknown;
}

export interface Activity {
  id: string;
  projectId: string;
  actor?: string;
  action?: string;
  changes?: Record<string, { old: string; new: string }>;
  batchId?: string;
  source?: string;
  at: string;
}

export type Section = 'active' | 'predesign' | 'review' | 'scope' | 'completed';

const OUT_OF_SCOPE_NAMES = new Set(['hold', 'sonnen', 'enphase']);
const REVIEW_NAMES = new Set(['installation review']);
const PREDESIGN_NAMES = new Set(['pre-design', 'predesign', 'pre design']);

const norm = (s: string) => s.trim().toLowerCase();

export function labelById(labels: Label[], id: string | null | undefined): Label | undefined {
  return id ? labels.find((l) => l.id === id) : undefined;
}

export function labelName(labels: Label[], id: string | null | undefined): string | null {
  return labelById(labels, id)?.name ?? null;
}

/** Resolve a label by NAME within a column (case-insensitive) → id, or null. */
export function resolveLabelName(labels: Label[], columnKey: string, name: string): string | null {
  const want = norm(name);
  const hit = labels.find((l) => l.columnKey === columnKey && !l.archived && norm(l.name) === want);
  return hit?.id ?? null;
}

function isDone(l: Label | undefined): boolean {
  return !!l && l.columnKey === 'status' && !!l.isDone;
}
function isReview(l: Label | undefined): boolean {
  if (!l || l.columnKey !== 'status' || l.isDone) return false;
  if (typeof l.review === 'boolean') return l.review;
  return REVIEW_NAMES.has(norm(l.name));
}
function isPredesign(l: Label | undefined): boolean {
  if (!l || l.columnKey !== 'status' || l.isDone) return false;
  if (typeof l.predesign === 'boolean') return l.predesign;
  return PREDESIGN_NAMES.has(norm(l.name));
}
/** Mirror of board.ts isCancelledLabel — hardened, see isOutOfScope below. */
function isCancelled(l: Label | undefined): boolean {
  return !!l && l.columnKey === 'status' && norm(l.name).startsWith('cancel');
}
function isOutOfScope(l: Label | undefined): boolean {
  if (!l || l.columnKey !== 'status' || l.isDone) return false;
  // Cancelled wins unconditionally, like isDone — see board.ts for why.
  if (isCancelled(l)) return true;
  if (typeof l.outOfScope === 'boolean') return l.outOfScope;
  return OUT_OF_SCOPE_NAMES.has(norm(l.name));
}

/** Mirror of splitSections' precedence: done → review → predesign → scope → active. */
export function sectionOf(labels: Label[], statusId: string | null | undefined): Section {
  const l = labelById(labels, statusId);
  if (isDone(l)) return 'completed';
  if (isReview(l)) return 'review';
  if (isPredesign(l)) return 'predesign';
  if (isOutOfScope(l)) return 'scope';
  return 'active';
}

/** Whole days from an ISO date/timestamp to `nowIso`. Negative = future. */
export function daysSince(iso: string, nowIso: string): number {
  const then = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  const now = Date.parse(nowIso.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  return Math.round((now - then) / 86_400_000);
}

export interface DaysInStatus {
  days: number | null;
  /** 'activity' when read from a logged status change, 'created' on fallback. */
  source: 'activity' | 'created' | null;
}

/** Days the project has sat in its current status — newest logged status change,
 * creation date as the documented fallback (the log is capped at 5,000). */
export function daysInStatus(activity: Activity[], project: Project, nowIso: string): DaysInStatus {
  let at: string | null = null;
  for (const a of activity) {
    if (a.projectId !== project.id) continue;
    if (a.action === 'update' && a.changes && 'statusId' in a.changes && (!at || a.at > at)) at = a.at;
  }
  if (at) return { days: daysSince(at, nowIso), source: 'activity' };
  if (project.createdAt) return { days: daysSince(project.createdAt, nowIso), source: 'created' };
  return { days: null, source: null };
}

// ---- Compose records join (install date + address are NOT on board rows) ----

interface RecordLike {
  projectId?: string | null;
  deletedAt?: string;
  status?: string;
  postedAt?: string;
  updatedAt?: string;
  sf?: { installScheduledDate?: string; siteAddress?: string };
}

export function linkFromRecords(records: RecordLike[], projectId: string): { installDate: string | null; address: string | null } {
  let draft: RecordLike | undefined;
  let posted: RecordLike | undefined;
  for (const r of records) {
    if (r.projectId !== projectId || r.deletedAt) continue;
    if (r.status === 'draft') {
      if (!draft || (r.updatedAt ?? '') > (draft.updatedAt ?? '')) draft = r;
    } else if (!posted || (r.postedAt ?? '') > (posted.postedAt ?? '')) {
      posted = r;
    }
  }
  const installDate = posted?.sf?.installScheduledDate || draft?.sf?.installScheduledDate || null;
  const address = posted?.sf?.siteAddress || draft?.sf?.siteAddress || null;
  return { installDate, address };
}

// ---- row serialization (the shape the bot reads) ----------------------------

export interface BoardRow {
  id: string;
  name: string;
  address: string | null;
  section: Section;
  status: string | null;
  preDesignStatus: string | null;
  stars: number | null;
  coordinator: string;
  installDate: string | null;
  daysInStatus: number | null;
  daysInStatusSource: 'activity' | 'created' | null;
  sourceUrl: string | null;
  requestedBy: string | null;
  lastUpdatedBy: string | null;
  lastUpdatedAt: string | null;
}

export function serializeRow(
  p: Project,
  labels: Label[],
  activity: Activity[],
  link: { installDate: string | null; address: string | null },
  nowIso: string,
): BoardRow {
  const dis = daysInStatus(activity, p, nowIso);
  return {
    id: p.id,
    name: p.name,
    address: link.address,
    section: sectionOf(labels, p.statusId),
    status: labelName(labels, p.statusId),
    preDesignStatus: labelName(labels, p.preDesignStatusId),
    stars: (p.rating as number | null | undefined) ?? null,
    coordinator: p.coordinator ?? '',
    installDate: link.installDate,
    daysInStatus: dis.days,
    daysInStatusSource: dis.source,
    sourceUrl: p.sourceUrl ?? null,
    requestedBy: p.requestedBy ?? null,
    lastUpdatedBy: p.updatedBy ?? null,
    lastUpdatedAt: p.updatedAt ?? null,
  };
}

// ---- fuzzy duplicate (server copy of src/lib/board.nameSimilarity) ----------

function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function nameTokens(s: string): string[] {
  return normalizeName(s).split(' ').filter(Boolean);
}
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function tokenSim(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  return len ? 1 - editDistance(a, b) / len : 1;
}
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let sum = 0;
  for (const t of short) {
    let best = 0;
    for (const u of long) best = Math.max(best, tokenSim(t, u));
    sum += best;
  }
  return sum / short.length;
}

export const DUPLICATE_THRESHOLD = 0.82;

export function findSimilar(projects: Project[], name: string, threshold = DUPLICATE_THRESHOLD) {
  if (!nameTokens(name).length) return [];
  return projects
    .filter((p) => !p.deletedAt && !p.archivedAt)
    .map((p) => ({ id: p.id, name: p.name, score: Number(nameSimilarity(name, p.name).toFixed(3)) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

// ---- revert one logged change (server copy of src/lib/board.reversePatch) ---

const DASH = '—';

function displayOf(project: Project, labels: Label[], key: string): string {
  const v = (project as Record<string, unknown>)[key];
  if (v === null || v === undefined || v === '') return DASH;
  if (key === 'statusId' || key === 'phaseId' || key === 'preDesignStatusId') return labelName(labels, v as string) ?? DASH;
  if (key === 'rating') return `${v} star${v === 1 ? '' : 's'}`;
  return String(v);
}

function resolveOld(key: string, display: string, labels: Label[]): { value: unknown } | undefined {
  if (key === 'statusId' || key === 'phaseId' || key === 'preDesignStatusId') {
    if (display === DASH) return { value: null };
    const col = key === 'statusId' ? 'status' : key === 'phaseId' ? 'phase' : 'predesign';
    const id = resolveLabelName(labels, col, display);
    return id ? { value: id } : undefined;
  }
  if (key === 'rating') {
    if (display === DASH) return { value: null };
    const n = parseInt(display, 10);
    return n >= 1 && n <= 5 ? { value: n } : undefined;
  }
  if (key === 'coordinator' || key === 'reviewer') return { value: display === DASH ? '' : display };
  if (key === 'name' || key === 'requestedBy' || key === 'sourceUrl') return { value: display === DASH ? '' : display };
  if (key === 'designedDate') return { value: display === DASH ? null : display };
  return undefined;
}

export interface Reverse {
  patch: Record<string, unknown>;
  conflicts: string[];
  skipped: string[];
}

/** Build the conflict-safe reverse patch for one logged `update` entry. */
export function reverseFromActivity(entry: Activity, project: Project, labels: Label[]): Reverse {
  const patch: Record<string, unknown> = {};
  const conflicts: string[] = [];
  const skipped: string[] = [];
  if (entry.action !== 'update' || !entry.changes) return { patch, conflicts, skipped };
  for (const [key, { old, new: nw }] of Object.entries(entry.changes)) {
    if (displayOf(project, labels, key) !== nw) {
      conflicts.push(key);
      continue;
    }
    const resolved = resolveOld(key, old, labels);
    if (!resolved) {
      skipped.push(key);
      continue;
    }
    patch[key] = resolved.value;
  }
  return { patch, conflicts, skipped };
}
