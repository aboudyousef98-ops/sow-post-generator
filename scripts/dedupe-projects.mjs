// Tombstone duplicate board rows created during the 2026-10-17 save outage.
//
// While the board took no writes, two people could create the same project
// without ever seeing each other's row. Once everyone synced, those arrived as
// genuine duplicates.
//
// Aboud's rule (2026-10-18): keep the row with the real Compose content behind
// it; drop the empty twin. Ties go to the OLDER row.
//
// Deletes are tombstones (`deletedAt`), never a splice — mergeStamped unions by
// id, so a hard delete would be resurrected by the next client push.
//
// Usage:
//   node scripts/dedupe-projects.mjs            # dry run, prints the plan
//   node scripts/dedupe-projects.mjs --apply    # writes the board blob

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'Aboud Yousef';
const sh = (args, opts = {}) =>
  execFileSync('npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32', ...opts });
const parse = (t) => JSON.parse(t.slice(Math.min(...[t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0))));

const board = parse(sh(['netlify', 'blobs:get', 'sowpost', 'board']));
const records = parse(sh(['netlify', 'blobs:get', 'sowpost', 'records']));

// How much real Compose content stands behind a row.
function weight(projectId) {
  const linked = records.filter((r) => r.projectId === projectId && !r.deletedAt);
  let chars = 0;
  let noteKeys = 0;
  for (const r of linked) {
    for (const v of Object.values(r)) if (typeof v === 'string') chars += v.trim().length;
    const notes = r.notes ?? r.installNotes;
    if (notes && typeof notes === 'object') {
      noteKeys += Object.values(notes).filter((v) => v && String(v).trim()).length;
    }
  }
  return { linked: linked.length, noteKeys, chars };
}

const live = board.projects.filter((p) => !p.deletedAt);
const groups = new Map();
for (const p of live) {
  const k = p.name.trim().toLowerCase();
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(p);
}

const plan = [];
for (const [, rows] of groups) {
  if (rows.length < 2) continue;
  const scored = rows
    .map((p) => ({ p, w: weight(p.id) }))
    .sort(
      (a, b) =>
        b.w.noteKeys - a.w.noteKeys || // real notes win
        b.w.chars - a.w.chars || // then more content
        a.p.createdAt.localeCompare(b.p.createdAt), // then the older row
    );
  plan.push({ keep: scored[0], drop: scored.slice(1) });
}

if (plan.length === 0) {
  console.log('no duplicate live project names — nothing to do');
  process.exit(0);
}

for (const { keep, drop } of plan) {
  console.log(`\n▸ ${keep.p.name}`);
  console.log(`   KEEP  ${keep.p.id.slice(0, 8)}  by ${keep.p.createdBy}  notes=${keep.w.noteKeys} chars=${keep.w.chars}  created ${keep.p.createdAt}`);
  for (const d of drop) {
    console.log(`   DROP  ${d.p.id.slice(0, 8)}  by ${d.p.createdBy}  notes=${d.w.noteKeys} chars=${d.w.chars}  created ${d.p.createdAt}`);
    const orphanUpdates = board.updates?.filter((u) => u.projectId === d.p.id).length ?? 0;
    if (orphanUpdates) console.log(`         ⚠ ${orphanUpdates} update post(s) hang off this row — NOT dropping it`);
  }
}

// Never tombstone a row that carries update posts: that text exists nowhere
// else, and hiding the row hides the thread with it.
const unsafe = plan.flatMap(({ drop }) => drop).filter((d) => (board.updates ?? []).some((u) => u.projectId === d.p.id));
if (unsafe.length) {
  console.error(`\nABORT — ${unsafe.length} row(s) to drop carry update posts. Move them first.`);
  process.exit(1);
}

if (!APPLY) {
  console.log('\ndry run — re-run with --apply to write');
  process.exit(0);
}

const stamp = new Date().toISOString();
const dropIds = new Set(plan.flatMap(({ drop }) => drop.map((d) => d.p.id)));
let n = 0;
for (const p of board.projects) {
  if (!dropIds.has(p.id)) continue;
  p.deletedAt = stamp;
  p.updatedAt = stamp;
  p.updatedBy = ACTOR;
  n++;
}
if (n !== dropIds.size) {
  console.error(`ABORT — expected to tombstone ${dropIds.size}, touched ${n}`);
  process.exit(1);
}

mkdirSync('_versions/_prodcheck', { recursive: true });
const backup = `_versions/_prodcheck/board.before-dedupe.json`;
writeFileSync(backup, JSON.stringify(parse(sh(['netlify', 'blobs:get', 'sowpost', 'board']))));
const out = '_versions/_prodcheck/board.deduped.json';
writeFileSync(out, JSON.stringify(board));
sh(['netlify', 'blobs:set', 'sowpost', 'board', '--input', out]);

const after = parse(sh(['netlify', 'blobs:get', 'sowpost', 'board']));
const stillLive = after.projects.filter((p) => !p.deletedAt && dropIds.has(p.id));
console.log(`\ntombstoned ${n}; backup at ${backup}`);
console.log(stillLive.length === 0 ? '✅ verified: none of the dropped rows are live' : `❌ ${stillLive.length} still live`);
console.log(`projects: ${after.projects.length} total, ${after.projects.filter((p) => !p.deletedAt).length} live`);
