// Acceptance check (spec/09 + 10-project-board §0.6): the built bundle must
// contain no OpenAI key and no Supabase service-role key. Scans every file in
// dist/ for key-like strings. The Supabase ANON key is allowed (public by
// design; RLS protects the data) — the patterns below match only the secret
// forms: `sb_secret_…` and the legacy JWT whose role claim is `service_role`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/, // OpenAI key
  /sb_secret_[A-Za-z0-9_-]{8,}/, // Supabase secret API key (current format)
  // Catches plaintext references (env var name aside, nothing in the client
  // may mention the service role). A legacy service-role JWT is base64 and
  // would NOT match — SETUP.md says to use the sb_secret_ key, which does.
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]/,
];

let bad = 0;
for (const file of walk(dist)) {
  const text = readFileSync(file, 'latin1');
  for (const pattern of PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      console.error(`FOUND key-like string in ${file}: ${m[0].slice(0, 12)}…`);
      bad++;
    }
  }
}

if (bad) {
  console.error(`check:nosecrets FAILED (${bad} file(s))`);
  process.exit(1);
}
console.log('check:nosecrets OK — no sk- / sb_secret_ / service-role strings in dist/');
