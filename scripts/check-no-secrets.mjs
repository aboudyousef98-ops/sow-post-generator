// Acceptance check (spec/09): the built bundle must contain no OpenAI key.
// Scans every file in dist/ for the string `sk-` followed by key-like chars.
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

let bad = 0;
for (const file of walk(dist)) {
  const text = readFileSync(file, 'latin1');
  const m = text.match(/sk-[A-Za-z0-9_-]{8,}/);
  if (m) {
    console.error(`FOUND key-like string in ${file}: ${m[0].slice(0, 12)}…`);
    bad++;
  }
}

if (bad) {
  console.error(`check:nosecrets FAILED (${bad} file(s))`);
  process.exit(1);
}
console.log('check:nosecrets OK — no sk- strings in dist/');
