// Client wrappers for the Netlify Functions — spec/07-netlify-functions.md.
// Paths are tokenized: /api/<VITE_API_PATH_TOKEN>/<endpoint>. The token is a
// build-time constant (not a secret — just a non-guessable path segment).

import type { PolishKey, RewriteMode } from '../types';

const TOKEN = import.meta.env.VITE_API_PATH_TOKEN ?? 'changeme';

function apiPath(endpoint: 'health' | 'rewrite' | 'extract' | 'region'): string {
  return `/api/${TOKEN}/${endpoint}`;
}

export interface ApiError {
  status: number;
  message: string;
}

async function post<T>(endpoint: 'rewrite' | 'extract' | 'region', body: unknown): Promise<T> {
  const res = await fetch(apiPath(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    const j = json as { error?: string; openai?: string } | null;
    const message = j?.openai || j?.error || text || `HTTP ${res.status}`;
    throw { status: res.status, message } satisfies ApiError;
  }
  return json as T;
}

export interface PolishItem {
  id: PolishKey;
  text: string;
}

export interface RewriteResponse {
  items: PolishItem[];
  model: string;
  ms: number;
}

/**
 * Per-box character ceiling the server enforces — `RequestItem` in
 * `netlify/functions/lib/rewriteSchema.ts`. Kept here so the UI can refuse an
 * over-long note in words instead of surfacing a bare "bad payload"; a test in
 * `rewriteSchema.test.ts` fails if the two numbers drift apart.
 */
export const MAX_NOTE_CHARS = 3000;

/**
 * Polish (or rewrite) every non-empty free-text box in one call
 * (spec/10 §5, §11). `mode` defaults to 'polish' — the light copy-edit;
 * 'rewrite' is the full rewrite for rough/mixed-language notes.
 */
export function rewrite(items: PolishItem[], mode: RewriteMode = 'polish'): Promise<RewriteResponse> {
  return post<RewriteResponse>('rewrite', { items, mode });
}

export interface ExtractedFields {
  recordTitle: string | null;
  customerName: string | null;
  systemSizeKw: number | null;
  projectStatus: string | null;
  installScheduledDate: string | null;
  latestScheduledVisit: string | null;
  siteAddress: string | null;
  jurisdiction: string | null;
  utility: string | null;
  lender: string | null;
  fundingStage: string | null;
  installRegionRaw: string | null;
  scheduledWorkItems: string | null;
  unscheduledWorkItems: string | null;
  coordinatorNotes: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractResponse {
  fields: ExtractedFields;
  model: string;
  ms: number;
}

export function extract(imageDataUrl: string): Promise<ExtractResponse> {
  return post<ExtractResponse>('extract', { imageDataUrl });
}

export interface RegionResponse {
  metro: 'HOU' | 'DFW';
  model: string;
  ms: number;
}

/** AI fallback for locations the offline Texas-city table doesn't know. */
export function regionLookup(location: string): Promise<RegionResponse> {
  return post<RegionResponse>('region', { location });
}

// ---- Phase 4: shared team history (Netlify Blobs behind /api/records) -----

import type { PostRecord } from '../types';

function recordsPath(): string {
  return `/api/${TOKEN}/records`;
}

export async function fetchSharedRecords(): Promise<PostRecord[]> {
  const res = await fetch(recordsPath());
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { records?: PostRecord[] };
  if (!Array.isArray(json.records)) throw { status: 502, message: 'Bad records response' } satisfies ApiError;
  return json.records;
}

/** Push local records; the server merges by id/updatedAt and returns the merged set. */
export async function putSharedRecords(records: PostRecord[]): Promise<PostRecord[]> {
  const res = await fetch(recordsPath(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { records?: PostRecord[] };
  return Array.isArray(json.records) ? json.records : records;
}

// ---- Phase 5: shared AHJ requirements (Netlify Blobs behind /api/ahjs) ----

import type { Ahj } from '../types';

function ahjsPath(): string {
  return `/api/${TOKEN}/ahjs`;
}

export async function fetchSharedAhjs(): Promise<Ahj[]> {
  const res = await fetch(ahjsPath());
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { ahjs?: Ahj[] };
  if (!Array.isArray(json.ahjs)) throw { status: 502, message: 'Bad ahjs response' } satisfies ApiError;
  return json.ahjs;
}

/** Push local AHJs; the server deep-merges (meta by updatedAt, posts by id) and returns the merged set. */
export async function putSharedAhjs(ahjs: Ahj[]): Promise<Ahj[]> {
  const res = await fetch(ahjsPath(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ahjs }),
  });
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { ahjs?: Ahj[] };
  return Array.isArray(json.ahjs) ? json.ahjs : ahjs;
}

// ---- Phase 9: shared team login roster (Netlify Blobs behind /api/users) ---

import type { TeamUser } from '../types';

function usersPath(): string {
  return `/api/${TOKEN}/users`;
}

export async function fetchSharedUsers(): Promise<TeamUser[]> {
  const res = await fetch(usersPath());
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { users?: TeamUser[] };
  if (!Array.isArray(json.users)) throw { status: 502, message: 'Bad users response' } satisfies ApiError;
  return json.users;
}

/** Push local users; the server merges by username/updatedAt and returns the merged roster. */
export async function putSharedUsers(users: TeamUser[]): Promise<TeamUser[]> {
  const res = await fetch(usersPath(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users }),
  });
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { users?: TeamUser[] };
  return Array.isArray(json.users) ? json.users : users;
}

// ---- Project Board (Netlify Blobs behind /api/board) -----------------------

import type { BoardState } from '../board/types';

function boardPath(): string {
  return `/api/${TOKEN}/board`;
}

export async function fetchSharedBoard(): Promise<BoardState> {
  const res = await fetch(boardPath());
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { board?: BoardState };
  if (!json.board || !Array.isArray(json.board.projects)) {
    throw { status: 502, message: 'Bad board response' } satisfies ApiError;
  }
  return json.board;
}

/** Push the local board; the server merges by id/updatedAt and returns the merged state. */
export async function putSharedBoard(board: BoardState): Promise<BoardState> {
  const res = await fetch(boardPath(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(board),
  });
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  const json = (await res.json()) as { board?: BoardState };
  return json.board && Array.isArray(json.board.projects) ? json.board : board;
}

export interface HealthResponse {
  ok: boolean;
  hasKey: boolean;
}

export async function health(): Promise<HealthResponse> {
  const res = await fetch(apiPath('health'));
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  return (await res.json()) as HealthResponse;
}
