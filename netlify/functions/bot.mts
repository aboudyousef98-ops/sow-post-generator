// /api/bot/v1/* — the SOW Bot API (Aboud 2026-11-23, items 15–18).
//
// A BEARER lane, separate from the browser's Origin+path-token guard: a machine
// client has no Origin and no session, so it sends `Authorization: Bearer
// sow_live_…`. The token is resolved to a LIVE identity every request
// (lib/botAuth) — demote or archive the user and the token stops working. Every
// write is attributed server-side to the token's user (updatedBy / activity
// actor), the first attribution in this app a client cannot forge.
//
// All endpoints are thin wrappers over the SAME merge layer the board uses
// (lib/boardMerge) — no storage rewrite. Bulk/write calls return a `batchId`;
// POST /changes/:batchId/revert reverses it, conflict-safe.

import { createHmac } from 'node:crypto';
import { jsonResponse, readJsonBody } from './lib/guard';
import { type BoardBlob, mergeBoard } from './lib/boardMerge';
import { getSowpostStore, getSowpostStoreStrong } from './lib/store';
import { authenticate, parseBearer, type BotIdentity, type TokenRecord } from './lib/botAuth';
import {
  type Activity,
  type Label,
  type Project,
  findSimilar,
  labelName,
  linkFromRecords,
  resolveLabelName,
  reverseFromActivity,
  sectionOf,
  serializeRow,
} from './lib/botBoard';
import { type AhjLike, type RecordLike as MatchRecord, matchReport } from './lib/botMatch';
import type { BotConfig } from './botconfig.mts';

type Store = ReturnType<typeof getSowpostStore>;

const uuid = () => crypto.randomUUID();
const err = (status: number, error: string) => jsonResponse(status, { error });

// ---- board read / write (CAS merge, mirrors board.mts) ----------------------

async function readBoard(store: Store): Promise<BoardBlob> {
  return (
    ((await store.get('board', { type: 'json' })) as BoardBlob | null) ?? {
      projects: [],
      labels: [],
      activity: [],
      updates: [],
    }
  );
}

/** Upsert the given rows into the board. Returns the merged board or null on conflict. */
async function applyToBoard(store: Store, incoming: Partial<BoardBlob>): Promise<BoardBlob | null> {
  const full: BoardBlob = {
    projects: incoming.projects ?? [],
    labels: incoming.labels ?? [],
    activity: incoming.activity ?? [],
    updates: incoming.updates ?? [],
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = (await store.getWithMetadata('board', { type: 'json' })) as
      | { data: BoardBlob | null; etag?: string }
      | null;
    const merged = mergeBoard(existing?.data ?? null, full);
    const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
    const res = await store.setJSON('board', merged, cond);
    if (res.modified || (existing && !existing.etag)) return merged;
  }
  return null;
}

// ---- permissions (member scoping; admins always pass) -----------------------

function canEdit(board: BoardBlob, columnKey: string, username: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const rule = (board.columnPerms as { columnKey: string; editors?: string[]; deletedAt?: string }[] | undefined)?.find(
    (c) => c.columnKey === columnKey && !c.deletedAt,
  );
  if (!rule || !rule.editors || rule.editors.length === 0) return true;
  return rule.editors.includes(username);
}

const FIELD_COLUMN: Record<string, string> = {
  statusId: 'status',
  preDesignStatusId: 'predesignStatus',
  coordinator: 'coordinator',
  rating: 'rating',
};

// ---- outgoing webhook (item 18) ---------------------------------------------

async function fireWebhook(store: Store, event: string, payload: unknown): Promise<void> {
  try {
    const cfg = (await store.get('botconfig', { type: 'json' })) as BotConfig | null;
    if (!cfg || !cfg.enabled || !cfg.webhookUrl || !cfg.events?.includes(event)) return;
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-SOW-Event': event };
    if (cfg.webhookSecret) headers['X-SOW-Signature'] = 'sha256=' + createHmac('sha256', cfg.webhookSecret).update(body).digest('hex');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    await fetch(cfg.webhookUrl, { method: 'POST', headers, body, signal: ctrl.signal }).catch(() => {});
    clearTimeout(timer);
  } catch {
    // Fire-and-forget: a webhook failure must never fail the API call itself.
  }
}

// ---- idempotency (retry-safe writes) ----------------------------------------

interface IdemEntry {
  key: string;
  batchId: string;
  at: string;
}
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;

async function idempotentBatch(store: Store, key: string | null): Promise<string | null> {
  if (!key) return null;
  const list = ((await store.get('idempotency', { type: 'json' })) as IdemEntry[] | null) ?? [];
  const hit = list.find((e) => e.key === key);
  return hit?.batchId ?? null;
}

async function recordIdempotency(store: Store, key: string | null, batchId: string, nowMs: number): Promise<void> {
  if (!key) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = (await store.getWithMetadata('idempotency', { type: 'json' })) as
      | { data: IdemEntry[] | null; etag?: string }
      | null;
    const kept = (existing?.data ?? []).filter((e) => nowMs - Date.parse(e.at) < IDEM_TTL_MS && e.key !== key);
    const next = [...kept, { key, batchId, at: new Date(nowMs).toISOString() }];
    const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
    const res = await store.setJSON('idempotency', next, cond);
    if (res.modified || (existing && !existing.etag)) return;
  }
}

// ---- display helpers --------------------------------------------------------

function displayValue(key: string, value: unknown, labels: Label[]): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'statusId' || key === 'phaseId' || key === 'preDesignStatusId') return labelName(labels, value as string) ?? '—';
  if (key === 'rating') return `${value} star${value === 1 ? '' : 's'}`;
  return String(value);
}

function changesFor(before: Project, patch: Record<string, unknown>, labels: Label[]): Record<string, { old: string; new: string }> {
  const changes: Record<string, { old: string; new: string }> = {};
  for (const key of Object.keys(patch)) {
    if (before[key] === patch[key]) continue;
    changes[key] = { old: displayValue(key, before[key], labels), new: displayValue(key, patch[key], labels) };
  }
  return changes;
}

function defaultStatusId(labels: Label[]): string | null {
  const status = labels.filter((l) => l.columnKey === 'status' && !l.archived);
  return (status.find((l) => l.isDefault) ?? status[0])?.id ?? null;
}

function defaultPredesignId(labels: Label[]): string | null {
  const pd = labels.filter((l) => l.columnKey === 'predesign' && !l.archived);
  return (pd.find((l) => l.isDefault) ?? pd[0])?.id ?? null;
}

// ---- the handler ------------------------------------------------------------

export default async (req: Request): Promise<Response> => {
  const store = getSowpostStoreStrong();

  // Authenticate against the LIVE users + tokens blobs.
  const [tokens, users] = await Promise.all([
    store.get('tokens', { type: 'json' }) as Promise<TokenRecord[] | null>,
    store.get('users', { type: 'json' }) as Promise<{ username: string; displayName?: string; role?: string; deletedAt?: string }[] | null>,
  ]);
  const who = authenticate(parseBearer(req.headers.get('authorization')), tokens ?? [], users ?? []);
  if (!who) return err(401, 'invalid or revoked token');

  // Best-effort lastUsedAt touch — never blocks or fails the request.
  void touchLastUsed(store, who.token).catch(() => {});

  const url = new URL(req.url);
  const rest = url.pathname.replace(/^\/api\/bot\/v1\/?/, '').replace(/\/$/, '');
  const seg = rest ? rest.split('/') : [];
  const method = req.method;

  try {
    // GET /board
    if ((seg.length === 0 || (seg.length === 1 && seg[0] === 'board')) && method === 'GET') {
      return await getBoard(store, url);
    }
    // GET /requirements
    if (seg.length === 1 && seg[0] === 'requirements' && method === 'GET') {
      const ahjs = (await store.get('ahjs', { type: 'json' })) ?? [];
      return jsonResponse(200, { requirements: ahjs }, undefined);
    }
    // GET /match-report
    if (seg.length === 1 && seg[0] === 'match-report' && method === 'GET') {
      return await getMatchReport(store);
    }
    // GET /changes
    if (seg.length === 1 && seg[0] === 'changes' && method === 'GET') {
      return await getChanges(store, url);
    }
    // POST /changes/:batchId/revert
    if (seg.length === 3 && seg[0] === 'changes' && seg[2] === 'revert' && method === 'POST') {
      return await revertBatch(store, seg[1], who);
    }
    // POST /projects
    if (seg.length === 1 && seg[0] === 'projects' && method === 'POST') {
      return await createProject(store, req, who);
    }
    // PATCH /projects/:id
    if (seg.length === 2 && seg[0] === 'projects' && method === 'PATCH') {
      return await patchProject(store, req, seg[1], who);
    }
    // GET /projects/:id
    if (seg.length === 2 && seg[0] === 'projects' && method === 'GET') {
      return await getProject(store, seg[1]);
    }
    // POST /projects/:id/updates
    if (seg.length === 3 && seg[0] === 'projects' && seg[2] === 'updates' && method === 'POST') {
      return await addUpdate(store, req, seg[1], who);
    }
    // PATCH /projects/:id/updates/:updateId
    if (seg.length === 4 && seg[0] === 'projects' && seg[2] === 'updates' && method === 'PATCH') {
      return await editUpdate(store, req, seg[1], seg[3], who);
    }
  } catch (e) {
    console.log(JSON.stringify({ at: new Date().toISOString(), endpoint: 'bot', error: String(e) }));
    return err(500, 'internal error');
  }

  return err(404, 'no such endpoint');
};

async function touchLastUsed(store: Store, token: TokenRecord): Promise<void> {
  const now = new Date().toISOString();
  const existing = (await store.getWithMetadata('tokens', { type: 'json' })) as { data: TokenRecord[] | null; etag?: string } | null;
  const list = existing?.data ?? [];
  const next = list.map((t) => (t.id === token.id ? { ...t, lastUsedAt: now, updatedAt: now } : t));
  const cond = existing?.etag ? { onlyIfMatch: existing.etag } : {};
  await store.setJSON('tokens', next, cond);
}

// ---- GET /board -------------------------------------------------------------

async function getBoard(store: Store, url: URL): Promise<Response> {
  const board = await readBoard(store);
  const records = ((await store.get('records', { type: 'json' })) as Parameters<typeof linkFromRecords>[0] | null) ?? [];
  const labels = board.labels as unknown as Label[];
  const activity = board.activity as unknown as Activity[];
  const now = new Date().toISOString();

  const section = url.searchParams.get('section');
  const status = url.searchParams.get('status');
  const coordinator = url.searchParams.get('coordinator');

  const rows = (board.projects as unknown as Project[])
    .filter((p) => !p.deletedAt && !p.archivedAt)
    .map((p) => serializeRow(p, labels, activity, linkFromRecords(records, p.id), now))
    .filter((r) => (section ? r.section === section : true))
    .filter((r) => (status ? (r.status ?? '').toLowerCase() === status.toLowerCase() : true))
    .filter((r) => (coordinator ? r.coordinator.toLowerCase() === coordinator.toLowerCase() : true));

  return jsonResponse(200, { projects: rows }, undefined);
}

// ---- GET /projects/:id ------------------------------------------------------

async function getProject(store: Store, id: string): Promise<Response> {
  const board = await readBoard(store);
  const p = (board.projects as unknown as Project[]).find((x) => x.id === id);
  if (!p) return err(404, 'no such project');
  const records = ((await store.get('records', { type: 'json' })) as Parameters<typeof linkFromRecords>[0] | null) ?? [];
  const labels = board.labels as unknown as Label[];
  const activity = board.activity as unknown as Activity[];
  const now = new Date().toISOString();
  const updates = (board.updates ?? []).filter((u) => (u as { projectId?: string }).projectId === id);
  const acts = activity.filter((a) => a.projectId === id);
  return jsonResponse(
    200,
    { project: serializeRow(p, labels, activity, linkFromRecords(records, id), now), updates, activity: acts },
    undefined,
  );
}

// ---- GET /match-report ------------------------------------------------------

async function getMatchReport(store: Store): Promise<Response> {
  // Full scoring (Aboud 2026-11-23): which jurisdictions/utilities in the
  // Compose drafts match NO requirements board — the gaps where a job gets no
  // requirements at all. Server port of src/lib/requirementsExport.matchReport.
  const ahjs = ((await store.get('ahjs', { type: 'json' })) as AhjLike[] | null) ?? [];
  const records = ((await store.get('records', { type: 'json' })) as MatchRecord[] | null) ?? [];
  return jsonResponse(200, { report: matchReport(records, ahjs) }, undefined);
}

// ---- GET /changes -----------------------------------------------------------

async function getChanges(store: Store, url: URL): Promise<Response> {
  const board = await readBoard(store);
  const projectId = url.searchParams.get('projectId');
  const batchId = url.searchParams.get('batchId');
  const since = url.searchParams.get('since');
  const changes = (board.activity as unknown as Activity[])
    .filter((a) => (projectId ? a.projectId === projectId : true))
    .filter((a) => (batchId ? a.batchId === batchId : true))
    .filter((a) => (since ? a.at >= since : true));
  return jsonResponse(200, { changes }, undefined);
}

// ---- POST /projects ---------------------------------------------------------

async function createProject(store: Store, req: Request, who: BotIdentity): Promise<Response> {
  const body = (await readJsonBody(req)) as Record<string, unknown> | null | 'too-large';
  if (body === 'too-large') return err(413, 'payload too large');
  if (!body || typeof body.name !== 'string' || !body.name.trim()) return err(400, 'name required');
  const idemKey = req.headers.get('idempotency-key');
  const prior = await idempotentBatch(store, idemKey);
  if (prior) return jsonResponse(200, { idempotent: true, batchId: prior }, undefined);

  const board = await readBoard(store);
  const labels = board.labels as unknown as Label[];
  const projects = board.projects as unknown as Project[];
  const name = body.name.trim().replace(/\s+/g, ' ');

  if (body.force !== true) {
    const dups = findSimilar(projects, name);
    if (dups.length) return jsonResponse(409, { error: 'possible duplicate', duplicates: dups }, undefined);
  }

  // coordinator: null means "skip auto-assign" (unassigned); a string sets it;
  // absent also means unassigned (the API never guesses, unlike the browser).
  const coordinator = typeof body.coordinator === 'string' ? body.coordinator : '';
  let statusId = defaultStatusId(labels);
  if (typeof body.status === 'string' && body.status.trim()) {
    const resolved = resolveLabelName(labels, 'status', body.status);
    if (!resolved) return err(400, `unknown status "${body.status}"`);
    statusId = resolved;
  }
  let preDesignStatusId: string | null = null;
  if (typeof body.preDesignStatus === 'string' && body.preDesignStatus.trim()) {
    const resolved = resolveLabelName(labels, 'predesign', body.preDesignStatus);
    if (!resolved) return err(400, `unknown pre-design status "${body.preDesignStatus}"`);
    preDesignStatusId = resolved;
  } else if (sectionOf(labels, statusId) === 'predesign') {
    preDesignStatusId = defaultPredesignId(labels); // mirror withPredesignDefault
  }

  const now = new Date().toISOString();
  const batchId = uuid();
  const project: Project = {
    id: uuid(),
    name,
    coordinator,
    statusId,
    phaseId: null,
    preDesignStatusId,
    designedDate: null,
    rating: null,
    position: Date.parse(now),
    ...(typeof body.sourceUrl === 'string' ? { sourceUrl: body.sourceUrl } : {}),
    ...(typeof body.requestedBy === 'string' ? { requestedBy: body.requestedBy } : {}),
    createdAt: now,
    createdBy: who.displayName,
    updatedAt: now,
    updatedBy: who.displayName,
    schemaVersion: 1,
  };
  const activity: Activity = {
    id: uuid(),
    projectId: project.id,
    actor: who.displayName,
    action: 'create',
    changes: { name: { old: '—', new: name } },
    batchId,
    source: 'api',
    at: now,
  };

  const merged = await applyToBoard(store, { projects: [project as never], activity: [activity as never] });
  if (!merged) return err(503, 'conflict, retry');
  await recordIdempotency(store, idemKey, batchId, Date.parse(now));
  const row = serializeRow(project, labels, [activity], { installDate: null, address: null }, now);
  await fireWebhook(store, 'project.created', row);
  console.log(JSON.stringify({ at: now, endpoint: 'bot', op: 'create', by: who.username, batchId: batchId.slice(0, 8) }));
  return jsonResponse(201, { project: row, batchId }, undefined);
}

// ---- PATCH /projects/:id ----------------------------------------------------

async function patchProject(store: Store, req: Request, id: string, who: BotIdentity): Promise<Response> {
  const body = (await readJsonBody(req)) as Record<string, unknown> | null | 'too-large';
  if (body === 'too-large') return err(413, 'payload too large');
  if (!body) return err(400, 'bad payload');
  const idemKey = req.headers.get('idempotency-key');
  const prior = await idempotentBatch(store, idemKey);
  if (prior) return jsonResponse(200, { idempotent: true, batchId: prior }, undefined);

  const board = await readBoard(store);
  const labels = board.labels as unknown as Label[];
  const before = (board.projects as unknown as Project[]).find((p) => p.id === id);
  if (!before) return err(404, 'no such project');

  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string') {
    const r = resolveLabelName(labels, 'status', body.status);
    if (!r) return err(400, `unknown status "${body.status}"`);
    patch.statusId = r;
  }
  if (typeof body.preDesignStatus === 'string') {
    const r = resolveLabelName(labels, 'predesign', body.preDesignStatus);
    if (!r) return err(400, `unknown pre-design status "${body.preDesignStatus}"`);
    patch.preDesignStatusId = r;
  }
  if (typeof body.coordinator === 'string') patch.coordinator = body.coordinator;
  if (body.coordinator === null) patch.coordinator = '';
  if (typeof body.stars === 'number') {
    if (body.stars < 1 || body.stars > 5) return err(400, 'stars must be 1–5');
    patch.rating = body.stars;
  }
  if (body.stars === null) patch.rating = null;
  if (Object.keys(patch).length === 0) return err(400, 'nothing to change');

  // Permission check — members are scoped by columnPerms, admins pass.
  for (const field of Object.keys(patch)) {
    const col = FIELD_COLUMN[field];
    if (col && !canEdit(board, col, who.username, who.role === 'admin')) {
      return err(403, `the ${col} column is restricted`);
    }
  }

  // Entering Pre-Design seeds the sub-status default (mirror withPredesignDefault).
  if ('statusId' in patch && sectionOf(labels, patch.statusId as string) === 'predesign' && !before.preDesignStatusId) {
    patch.preDesignStatusId = defaultPredesignId(labels);
  }

  const now = new Date().toISOString();
  const batchId = uuid();
  const changes = changesFor(before, patch, labels);
  if (Object.keys(changes).length === 0) return jsonResponse(200, { project: serializeRow(before, labels, board.activity as unknown as Activity[], { installDate: null, address: null }, now), batchId, noop: true }, undefined);

  const after: Project = { ...before, ...patch, updatedAt: now, updatedBy: who.displayName };
  const activity: Activity = { id: uuid(), projectId: id, actor: who.displayName, action: 'update', changes, batchId, source: 'api', at: now };

  const merged = await applyToBoard(store, { projects: [after as never], activity: [activity as never] });
  if (!merged) return err(503, 'conflict, retry');
  await recordIdempotency(store, idemKey, batchId, Date.parse(now));
  const records = ((await store.get('records', { type: 'json' })) as Parameters<typeof linkFromRecords>[0] | null) ?? [];
  const row = serializeRow(after, labels, merged.activity as unknown as Activity[], linkFromRecords(records, id), now);
  if ('statusId' in patch) await fireWebhook(store, 'project.status_changed', { project: row, from: labelName(labels, before.statusId), to: row.status });
  console.log(JSON.stringify({ at: now, endpoint: 'bot', op: 'patch', id: id.slice(0, 8), by: who.username, batchId: batchId.slice(0, 8) }));
  return jsonResponse(200, { project: row, batchId }, undefined);
}

// ---- POST /projects/:id/updates ---------------------------------------------

async function addUpdate(store: Store, req: Request, id: string, who: BotIdentity): Promise<Response> {
  const body = (await readJsonBody(req)) as Record<string, unknown> | null | 'too-large';
  if (body === 'too-large') return err(413, 'payload too large');
  if (!body || typeof body.text !== 'string' || !body.text.trim()) return err(400, 'text required');
  const board = await readBoard(store);
  if (!(board.projects as unknown as Project[]).some((p) => p.id === id)) return err(404, 'no such project');
  const now = new Date().toISOString();
  const update = { id: uuid(), projectId: id, text: body.text.trim(), by: who.displayName, at: now, kind: 'note', updatedAt: now };
  const activity: Activity = { id: uuid(), projectId: id, actor: who.displayName, action: 'update-post', batchId: uuid(), source: 'api', at: now };
  const merged = await applyToBoard(store, { updates: [update as never], activity: [activity as never] });
  if (!merged) return err(503, 'conflict, retry');
  console.log(JSON.stringify({ at: now, endpoint: 'bot', op: 'update', id: id.slice(0, 8), by: who.username }));
  return jsonResponse(201, { update }, undefined);
}

// ---- PATCH /projects/:id/updates/:updateId -----------------------------------

interface ApiUpdate {
  id: string;
  projectId: string;
  text: string;
  by: string;
  at: string;
  kind: string;
  updatedAt: string;
  editedAt?: string;
  editedBy?: string;
  deleted?: { at: string; by: string };
}

async function editUpdate(store: Store, req: Request, projectId: string, updateId: string, who: BotIdentity): Promise<Response> {
  const body = (await readJsonBody(req)) as Record<string, unknown> | null | 'too-large';
  if (body === 'too-large') return err(413, 'payload too large');
  if (!body || typeof body.text !== 'string' || !body.text.trim()) return err(400, 'text required');

  const board = await readBoard(store);
  const updates = (board.updates ?? []) as unknown as ApiUpdate[];
  // A deleted update reads as gone, same as GET /projects/:id already treats
  // deleted/archived projects — there is nothing left here to edit.
  const before = updates.find((u) => u.id === updateId && u.projectId === projectId && !u.deleted);
  if (!before) return err(404, 'no such update');

  // The token's own user, and only that user — never an admin override. A
  // bot token has no "act as anyone" mode; it is one fixed identity.
  if (before.by !== who.displayName) return err(403, 'can only edit your own updates');

  const text = body.text.trim();
  const now = new Date().toISOString();
  if (text === before.text) {
    return jsonResponse(200, { update: before, noop: true }, undefined);
  }

  const after: ApiUpdate = { ...before, text, editedAt: now, editedBy: who.displayName, updatedAt: now };
  const activity: Activity = {
    id: uuid(),
    projectId,
    actor: who.displayName,
    action: 'update-edit',
    batchId: uuid(),
    source: 'api',
    at: now,
  };

  const merged = await applyToBoard(store, { updates: [after as never], activity: [activity as never] });
  if (!merged) return err(503, 'conflict, retry');
  console.log(JSON.stringify({ at: now, endpoint: 'bot', op: 'update-edit', id: updateId.slice(0, 8), by: who.username }));
  return jsonResponse(200, { update: after }, undefined);
}

// ---- POST /changes/:batchId/revert ------------------------------------------

async function revertBatch(store: Store, batchId: string, who: BotIdentity): Promise<Response> {
  const board = await readBoard(store);
  const labels = board.labels as unknown as Label[];
  const projects = board.projects as unknown as Project[];
  const entries = (board.activity as unknown as Activity[]).filter((a) => a.batchId === batchId && a.action === 'update');
  if (entries.length === 0) return err(404, 'no reversible changes for that batch');

  const now = new Date().toISOString();
  const newBatch = uuid();
  const changedProjects: Project[] = [];
  const newActivity: Activity[] = [];
  const reverted: string[] = [];
  const conflicts: { projectId: string; fields: string[] }[] = [];

  for (const entry of entries) {
    const p = projects.find((x) => x.id === entry.projectId);
    if (!p) continue;
    const { patch, conflicts: c } = reverseFromActivity(entry, p, labels);
    if (c.length) conflicts.push({ projectId: p.id, fields: c });
    if (Object.keys(patch).length === 0) continue;
    const after: Project = { ...p, ...patch, updatedAt: now, updatedBy: who.displayName };
    const changes = changesFor(p, patch, labels);
    changedProjects.push(after);
    newActivity.push({ id: uuid(), projectId: p.id, actor: who.displayName, action: 'update', changes, batchId: newBatch, source: 'api', at: now });
    reverted.push(p.id);
  }

  if (changedProjects.length === 0) {
    return jsonResponse(200, { batchId: newBatch, reverted: [], conflicts, note: 'nothing reverted — every field changed since' }, undefined);
  }
  const merged = await applyToBoard(store, { projects: changedProjects as never[], activity: newActivity as never[] });
  if (!merged) return err(503, 'conflict, retry');
  console.log(JSON.stringify({ at: now, endpoint: 'bot', op: 'revert', of: batchId.slice(0, 8), into: newBatch.slice(0, 8), by: who.username }));
  return jsonResponse(200, { batchId: newBatch, reverted, conflicts }, undefined);
}
