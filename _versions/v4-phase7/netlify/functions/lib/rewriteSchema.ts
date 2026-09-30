// Request/response schemas for /api/<token>/rewrite — spec/10 §5.
// Kept out of rewrite.mts so they can be unit-tested without a Netlify
// runtime, the same way guard.ts is.

import { z } from 'zod';

/**
 * MUST stay in sync with `POLISH_KEYS` in `src/lib/installNotes.ts` — the
 * "key list stays in sync with the client" test in rewriteSchema.test.ts
 * fails loudly if the two ever drift apart.
 */
export const POLISH_KEYS = [
  'install.batteryLocation',
  'install.mainDisconnectLocation',
  'install.loadRun',
  'install.serviceRun',
  'install.solarRun',
  'install.batteryRun',
  'install.specialCases',
  'install.other',
  'siteSurvey',
  'design',
  'homeowner',
] as const;

const RequestItem = z.object({ id: z.enum(POLISH_KEYS), text: z.string().max(3000) }).strict();

export const RewriteRequest = z
  .object({
    items: z.array(RequestItem).min(1).max(POLISH_KEYS.length),
    // Optional and defaulted so a stale client that omits it keeps the old
    // behaviour instead of failing (spec/10 §11.2).
    mode: z.enum(['polish', 'rewrite']).optional().default('polish'),
  })
  .strict()
  .refine((v) => new Set(v.items.map((i) => i.id)).size === v.items.length, {
    message: 'duplicate id',
  });

export const RewriteResponse = z
  .object({ items: z.array(z.object({ id: z.enum(POLISH_KEYS), text: z.string() }).strict()) })
  .strict();

/** OpenAI structured-output schema. `strict: true` requires named properties. */
export const REWRITE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
      },
    },
  },
  required: ['items'],
};
