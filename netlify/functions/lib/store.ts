// Shared Blobs store accessor — keeps deploy previews/branch deploys/local
// dev off production data. BLOBS_STORE_NAME is a Netlify env var scoped per
// deploy context in the dashboard (Site settings -> Environment variables):
// "sowpost" for Production, "sowpost-test" for Deploy previews/Branch
// deploys/Local development. Deliberately NOT derived from
// process.env.CONTEXT — that did not reliably read "production" inside the
// standard Functions runtime during the 2026-11-17 incident (see
// _CHECKPOINT_cors_test_store.md). Falls back to "sowpost" (today's
// behavior) if the var is ever unset, so a misconfiguration degrades to
// "shared store", never to "silently empty".

import { getStore } from '@netlify/blobs';

/**
 * The store this deploy will read and write. Exported separately from
 * getSowpostStore so /health can REPORT it without opening a connection —
 * "which board am I actually talking to" has to be answerable from outside,
 * or a draft deploy silently editing production is undetectable until
 * somebody notices the damage (Aboud, 2026-11-17).
 */
export function sowpostStoreName(env: Record<string, string | undefined> = process.env): string {
  return env.BLOBS_STORE_NAME || 'sowpost';
}

export function getSowpostStore(env: Record<string, string | undefined> = process.env) {
  return getStore(sowpostStoreName(env));
}
