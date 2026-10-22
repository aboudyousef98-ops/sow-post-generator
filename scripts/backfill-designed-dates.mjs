// One-time data fix, 2026-10-22 (Aboud's overnight delegation). Two jobs:
//
// 1. BACKFILL Designed dates: live projects that have a linked Compose record
//    but no designedDate are invisible to Daily Progress. Fill each from its
//    EARLIEST linked record's creation day — the 2026-10-22 activity study
//    showed draft day == design day within one day in 89% of cases. Each fill
//    is logged as a normal activity entry.
//
// 2. RESTORE truncated activity: the server merge capped activity at 1000
//    until today's deploy (client went to 5000 on 2026-10-21), so every merge
//    evicted the oldest entries. Union the live activity with the
//    v22-live-backup copy so everything either side still has survives.
//
// RUN ORDER: back up all stores first, deploy the raised server cap, THEN run
// this — otherwise the next client push re-truncates what this restores.
//
// Usage:
//   node scripts/backfill-designed-dates.mjs            # dry run, prints the plan
//   node scripts/backfill-designed-dates.mjs --apply    # writes the board blob

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'Aboud Yousef';
const CAP = 5000; // must match ACTIVITY_CAP (src/lib/board.ts + boardMerge.ts)
const sh = (args, opts = {}) =>
  execFileSync('npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32', ...opts });
const parse = (t) => JSON.parse(t.slice(Math.min(...[t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0))));

// The team's local day (UTC+3, Palestine) — the board's date convention.
const localDay = (iso) => new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 10);

const board = parse(sh(['netlify', 'blobs:get', 'sowpost', 'board']));
const records = parse(sh(['netlify', 'blobs:get', 'sowpost', 'records']));
const v22 = JSON.parse(readFileSync('_versions/v22-live-backup-2026-10-21/board.json', 'utf8'));

// ---- job 1: designedDate backfill -------------------------------------------
const live = board.projects.filter((p) => !p.deletedAt && !p.archivedAt);
const plan = [];
for (const p of live) {
  if (p.designedDate) continue;
  const first = records
    .filter((r) => r.projectId === p.id && !r.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!first) continue;
  plan.push({ p, date: localDay(first.createdAt) });
}

console.log(`designedDate backfill: ${plan.length} project(s)`);
for (const { p, date } of plan) console.log(`  ${p.name.padEnd(30)} → ${date}`);

// ---- job 2: activity restore -------------------------------------------------
const liveIds = new Set(board.activity.map((a) => a.id));
const restored = (v22.activity ?? []).filter((a) => a?.id && !liveIds.has(a.id));
console.log(`\nactivity restore: live has ${board.activity.length}, v22 adds ${restored.length} evicted entr(ies)`);

if (!APPLY) {
  console.log('\ndry run — re-run with --apply to write');
  process.exit(0);
}

const stamp = new Date().toISOString();
for (const { p, date } of plan) {
  p.designedDate = date;
  p.updatedAt = stamp;
  p.updatedBy = ACTOR;
  board.activity.push({
    id: randomUUID(),
    projectId: p.id,
    actor: ACTOR,
    action: 'update',
    changes: { designedDate: { old: '—', new: date } },
    at: stamp,
  });
}
board.activity = [...board.activity, ...restored].sort((a, b) => b.at.localeCompare(a.at)).slice(0, CAP);

mkdirSync('_versions/_prodcheck', { recursive: true });
const backup = '_versions/_prodcheck/board.before-backfill.json';
writeFileSync(backup, JSON.stringify(parse(sh(['netlify', 'blobs:get', 'sowpost', 'board']))));
const out = '_versions/_prodcheck/board.backfilled.json';
writeFileSync(out, JSON.stringify(board));
sh(['netlify', 'blobs:set', 'sowpost', 'board', '--input', out]);

const after = parse(sh(['netlify', 'blobs:get', 'sowpost', 'board']));
const missing = plan.filter(({ p }) => !after.projects.find((x) => x.id === p.id)?.designedDate);
console.log(`\nwrote ${plan.length} date(s) + ${restored.length} restored activity entr(ies); backup at ${backup}`);
console.log(missing.length === 0 ? '✅ verified: every backfilled project has its date' : `❌ ${missing.length} missing`);
console.log(`activity now: ${after.activity.length} entries`);
