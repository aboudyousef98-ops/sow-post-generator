// GET/PUT /api/<token>/botconfig — outgoing-webhook settings (Aboud 2026-11-23,
// item 18). Browser-facing (Origin + path-token guard), edited from Admin →
// Settings. ONE object, merged by updatedAt like board prefs.
//
// The webhook SECRET is write-only over the wire: GET reports `hasSecret` but
// never the value (it signs outgoing calls — a real secret, unlike the path
// token). A PUT that omits `webhookSecret` keeps the stored one; `''` clears it.

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { getSowpostStoreStrong } from './lib/store';

export interface BotConfig {
  enabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  /** Which events fire: 'project.created', 'project.status_changed'. */
  events: string[];
  updatedAt: string;
  updatedBy: string;
}

const EVENTS = ['project.created', 'project.status_changed'] as const;

const PutSchema = z
  .object({
    enabled: z.boolean().optional(),
    webhookUrl: z.string().max(2000).optional(),
    webhookSecret: z.string().max(400).optional(),
    events: z.array(z.enum(EVENTS)).optional(),
    updatedBy: z.string().max(80).optional(),
  })
  .strict();

const EMPTY: BotConfig = { enabled: false, webhookUrl: '', webhookSecret: '', events: [...EVENTS], updatedAt: '', updatedBy: '' };

function publicView(c: BotConfig) {
  return { enabled: c.enabled, webhookUrl: c.webhookUrl, events: c.events, hasSecret: !!c.webhookSecret, updatedAt: c.updatedAt, updatedBy: c.updatedBy };
}

export default async (req: Request): Promise<Response> => {
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  const store = getSowpostStoreStrong();

  if (req.method === 'GET') {
    const c = ((await store.get('botconfig', { type: 'json' })) as BotConfig | null) ?? EMPTY;
    return jsonResponse(200, { config: publicView(c) }, cors);
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = (await store.getWithMetadata('botconfig', { type: 'json' })) as
        | { data: BotConfig | null; etag?: string }
        | null;
      const cur = existing?.data ?? EMPTY;
      const now = new Date().toISOString();
      const next: BotConfig = {
        enabled: parsed.data.enabled ?? cur.enabled,
        webhookUrl: parsed.data.webhookUrl ?? cur.webhookUrl,
        // Omitted secret keeps the stored one; '' clears it (write-only).
        webhookSecret: parsed.data.webhookSecret === undefined ? cur.webhookSecret : parsed.data.webhookSecret,
        events: parsed.data.events ?? cur.events,
        updatedAt: now,
        updatedBy: parsed.data.updatedBy ?? cur.updatedBy,
      };
      const cond = existing ? (existing.etag ? { onlyIfMatch: existing.etag } : {}) : { onlyIfNew: true };
      const res = await store.setJSON('botconfig', next, cond);
      if (res.modified || (existing && !existing.etag)) {
        console.log(JSON.stringify({ at: now, endpoint: 'botconfig', enabled: next.enabled, hasUrl: !!next.webhookUrl }));
        return jsonResponse(200, { config: publicView(next) }, cors);
      }
    }
    return jsonResponse(503, { error: 'conflict, retry' }, cors);
  }

  return jsonResponse(405, { error: 'method not allowed' }, cors);
};
