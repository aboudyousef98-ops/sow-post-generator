// Client wrappers for the Netlify Functions — spec/07-netlify-functions.md.
// Paths are tokenized: /api/<VITE_API_PATH_TOKEN>/<endpoint>. The token is a
// build-time constant (not a secret — just a non-guessable path segment).

import type { Notes } from '../types';

const TOKEN = import.meta.env.VITE_API_PATH_TOKEN ?? 'changeme';

function apiPath(endpoint: 'health' | 'rewrite' | 'extract'): string {
  return `/api/${TOKEN}/${endpoint}`;
}

export interface ApiError {
  status: number;
  message: string;
}

async function post<T>(endpoint: 'rewrite' | 'extract', body: unknown): Promise<T> {
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

export interface RewriteResponse {
  polished: Notes;
  model: string;
  ms: number;
}

export function rewrite(notes: Notes): Promise<RewriteResponse> {
  return post<RewriteResponse>('rewrite', notes);
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

export interface HealthResponse {
  ok: boolean;
  hasKey: boolean;
}

export async function health(): Promise<HealthResponse> {
  const res = await fetch(apiPath('health'));
  if (!res.ok) throw { status: res.status, message: `HTTP ${res.status}` } satisfies ApiError;
  return (await res.json()) as HealthResponse;
}
