// The ONE Supabase client (10-project-board.md §4, D2). Everything board/auth
// related imports from here — never call createClient() anywhere else.
//
// The env vars are absent until Aboud creates the Supabase project (SETUP.md),
// and the app must keep building and running without them until B1 wires the
// login in. So the client is created lazily and callers can probe
// supabaseConfigured() first instead of crashing at import time.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

/** True once VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set at build time. */
export function supabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/** The shared client. Throws with a setup hint when the env vars are missing. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        'Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see SETUP.md).',
      );
    }
    client = createClient(url, anonKey);
  }
  return client;
}
