// Per-user sync check for the 2026-10-17 board save outage.
//
// Reads the LIVE board blob and reports, for each of the five people, whether
// their browser has pushed since the fix went out. Read-only — it never
// writes to the store.
//
// The decisive signal is the `updates` key. The board blob has never had one:
// the old `.strict()` schema rejected every payload that carried it. The key
// can only appear once a PUT is accepted by the fixed schema.
//
// Usage:
//   node scripts/check-sync.mjs                 # one snapshot
//   node scripts/check-sync.mjs --watch         # re-check every 30s
//   node scripts/check-sync.mjs --baseline <f>  # compare to a backup board.json

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROSTER = ['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai', 'Yarob Alnabelsi', 'Anas Yaghmour'];

// Rows seen on Anas's screen on 2026-10-18 that the server did not have.
const STRANDED_ON_ANAS_SCREEN = [
  'Okernithia Shepherd', 'Rita Joyce', 'Eric Webber', 'Sylvester Hernandez',
  'Ernesto Orozco', 'Keely Jones', 'Nikki Calton', 'Daniel Bowen',
  'Karan Staggers', 'Sony Joseph', 'Susan Stone',
];

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const baselineIdx = args.indexOf('--baseline');
const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : null;

// The last write the server accepted before the outage.
const OUTAGE_START = '2026-10-16T19:32:52.756Z';

function liveBoard() {
  const raw = execFileSync('npx', ['netlify', 'blobs:get', 'sowpost', 'board'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  return JSON.parse(raw.slice(raw.indexOf('{')));
}

function report(b, baseline) {
  const stamp = new Date().toISOString();
  const done = new Set((b.labels ?? []).filter((l) => l.isDone).map((l) => l.id));
  const active = b.projects.filter((p) => !p.deletedAt && !p.archivedAt);

  console.log(`\n================ ${stamp} ================`);
  console.log(`updates key present : ${'updates' in b ? `YES (${b.updates.length} posts)` : 'NO — no client has pushed yet'}`);
  console.log(`projects            : ${b.projects.length}${baseline ? `  (was ${baseline.projects.length}, ${b.projects.length - baseline.projects.length >= 0 ? '+' : ''}${b.projects.length - baseline.projects.length})` : ''}`);
  console.log(`activity rows       : ${b.activity.length}`);

  // Who has written since the outage began?
  console.log('\n--- per-person: has their browser pushed since the outage? ---');
  const rows = [];
  for (const person of ROSTER) {
    const theirs = b.projects.filter((p) => p.updatedBy === person || p.createdBy === person);
    const newest = theirs.map((p) => p.updatedAt).sort().pop() ?? '—';
    const sinceFix = theirs.filter((p) => p.updatedAt > OUTAGE_START).length;
    const acts = (b.activity ?? []).filter((a) => a.actor === person && a.at > OUTAGE_START).length;
    rows.push({ person, rows: theirs.length, newest, newSinceOutage: sinceFix, activity: acts });
  }
  const w = Math.max(...ROSTER.map((p) => p.length));
  for (const r of rows) {
    const ok = r.newSinceOutage > 0 || r.activity > 0;
    console.log(
      `  ${ok ? '✅' : '⬜'} ${r.person.padEnd(w)}  rows=${String(r.rows).padStart(3)}  ` +
        `new-since-outage=${String(r.newSinceOutage).padStart(3)}  last-write=${r.newest}`,
    );
  }
  const synced = rows.filter((r) => r.newSinceOutage > 0 || r.activity > 0).length;
  console.log(`\n  ${synced} of ${ROSTER.length} have pushed since the outage started.`);

  // The known-stranded rows from Anas's screen.
  const names = new Set(b.projects.map((p) => p.name.trim().toLowerCase()));
  const arrived = STRANDED_ON_ANAS_SCREEN.filter((n) => names.has(n.toLowerCase()));
  console.log(`\n--- Anas's 11 stranded rows: ${arrived.length}/11 have arrived ---`);
  for (const n of STRANDED_ON_ANAS_SCREEN) {
    console.log(`  ${names.has(n.toLowerCase()) ? '✅' : '⬜'} ${n}`);
  }

  console.log('\n--- active (not done) by coordinator ---');
  const tally = {};
  for (const p of active.filter((p) => !done.has(p.statusId))) {
    tally[p.coordinator || '(unassigned)'] = (tally[p.coordinator || '(unassigned)'] || 0) + 1;
  }
  console.log(' ', JSON.stringify(tally));

  return { synced, arrived: arrived.length };
}

const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;

if (!watch) {
  report(liveBoard(), baseline);
} else {
  console.log('watching every 30s — Ctrl-C to stop');
  const tick = () => {
    try {
      const { synced, arrived } = report(liveBoard(), baseline);
      if (synced === ROSTER.length && arrived === STRANDED_ON_ANAS_SCREEN.length) {
        console.log('\n🎉 all five have pushed and every known stranded row is on the server.');
        process.exit(0);
      }
    } catch (e) {
      console.error('check failed:', e.message);
    }
  };
  tick();
  setInterval(tick, 30000);
}
