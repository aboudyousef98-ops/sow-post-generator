// Data migration for 2026-10-17. Reads the backup snapshot, writes a repaired
// copy beside it. Pure file-in/file-out — it never touches a store itself, so
// you can diff the result before anything is published.
//
// Two changes, both from Aboud's 2026-10-17 list:
//
//   1. Extra Work usernames. 26 September rows carry `username: ""`, so the
//      people who own them cannot delete their own imported rows. Backfilled
//      by matching `person` against the roster's displayName.
//
//   2. Ya'rob -> Yarob. "you can change yarob's name to Yarob on everything on
//      the platform to avoid confusion". The apostrophe is a display-name-only
//      problem; the LOGIN USERNAME `yalnabelsi` is a different field and is
//      deliberately left alone — changing it would break his sign-in and
//      orphan the extra-work rows repaired in (1).
//
// Usage: node scripts/migrate-2026-10-17.mjs <backupDir>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/migrate-2026-10-17.mjs <backupDir>');
  process.exit(1);
}

const KEYS = ['ahjs', 'board', 'extrawork', 'records', 'users'];
const OLD_NAME = "Ya'rob Alnabelsi";
const NEW_NAME = 'Yarob Alnabelsi';

const read = (k) => readFileSync(join(dir, `${k}.json`), 'utf8');
const load = (k) => JSON.parse(read(k));

// ---- 1. roster -------------------------------------------------------------
const users = load('users');
const roster = Array.isArray(users) ? users : users.users;
const byDisplay = new Map(roster.map((u) => [u.displayName, u.username]));

// ---- 2. extra work: backfill usernames ------------------------------------
const ew = load('extrawork');
let filled = 0;
const unmatched = new Set();
for (const e of ew.entries) {
  if (e.username) continue;
  const u = byDisplay.get(e.person);
  if (u) {
    e.username = u;
    filled++;
  } else unmatched.add(e.person);
}
if (unmatched.size) {
  console.error('ABORT — no roster match for:', [...unmatched]);
  process.exit(1);
}

const hours = (d) => d.entries.reduce((n, e) => n + (Number(e.hours) || 0), 0);
const beforeHours = hours(load('extrawork'));
if (hours(ew) !== beforeHours) {
  console.error('ABORT — hours changed', beforeHours, '->', hours(ew));
  process.exit(1);
}
writeFileSync(join(dir, 'extrawork.out.json'), JSON.stringify(ew));

// ---- 3. rename across every key -------------------------------------------
// A whole-document string replace is the correct tool here: the old name only
// ever appears as a display-name VALUE (verified: coordinator, actor,
// updatedBy, person, author, by, displayName), never as a key or an id.
const renamed = {};
for (const k of KEYS) {
  const src = k === 'extrawork' ? JSON.stringify(ew) : read(k);
  const out = src.split(OLD_NAME).join(NEW_NAME);
  renamed[k] = out;
  const n = (src.length - out.length) / (OLD_NAME.length - NEW_NAME.length);
  // Every output must still be valid JSON with the same shape.
  const a = JSON.parse(src);
  const b = JSON.parse(out);
  const shape = (v) => (Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? Object.keys(v).sort().join(',') : typeof v);
  if (shape(a) !== shape(b)) {
    console.error(`ABORT — ${k} shape changed`);
    process.exit(1);
  }
  writeFileSync(join(dir, `${k}.out.json`), out);
  console.log(`${k.padEnd(10)} renamed ${n}`);
}

console.log(`\nextrawork usernames backfilled: ${filled}`);
console.log(`hours unchanged at: ${beforeHours}`);
console.log(`wrote *.out.json in ${dir}`);
