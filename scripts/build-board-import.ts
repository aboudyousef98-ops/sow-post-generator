// Build the board PUT payload for projects found on a Salesforce export but
// missing from the board. Writes the payload to disk; it does NOT send it.
//
// Field choices follow the 2026-10-29 import precedent
// (_versions/v31-board-import-backup-2026-10-29/_CHECKPOINT_solrite-board-import.md):
//   status      = New project (the board's own default label)
//   phase       = Design  ("under Design status", Aboud 2026-11-08)
//   designedDate= the export's Design Completion Date
//   coordinator = '' (unassigned) -- the export's "Designer assigned" is the
//                 DESIGN team, not the SOW roster, so it must not be written here
//   createdBy/updatedBy = the importing user
//   one `create` activity row each
//
// Names go through the app's own cleanProjectName, so the 🏷️ tag emoji
// Salesforce attaches and the ALL-CAPS rows are normalised exactly the way a
// UI import would have normalised them.
//
// Usage:
//   node scripts/build-board-import.mjs <compare.json> <board.json> <out.json>

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cleanProjectName } from '../src/lib/sfReport';
import { nameKey } from '../src/lib/board';

const AUTHOR = 'Aboud Yousef';
const STATUS_NEW = 'status-new';
const PHASE_DESIGN = 'phase-design';

/**
 * cleanProjectName title-cases EVERY word, which is right for the ALL-CAPS
 * pastes it was written for but turns an already-correct "Chad McCartney" into
 * "Chad Mccartney". So re-case only the words that carry no case information
 * of their own -- all-caps or all-lowercase -- and leave a word the export
 * already mixed-cased alone.
 */
function recaseOnlyIfNeeded(raw: string, titled: string): string {
  const rawWords = raw.split(/(\s+)/);
  const titledWords = titled.split(/(\s+)/);
  if (rawWords.length !== titledWords.length) return titled;
  return rawWords
    .map((word, i) => {
      const letters = word.replace(/[^A-Za-z]/g, '');
      if (!letters) return titledWords[i];
      const uninformative = letters === letters.toUpperCase() || letters === letters.toLowerCase();
      return uninformative ? titledWords[i] : word;
    })
    .join('');
}

const [comparePath, boardPath, outPath] = process.argv.slice(2);
if (!comparePath || !boardPath || !outPath) {
  console.error('usage: node scripts/build-board-import.mjs <compare.json> <board.json> <out.json>');
  process.exit(1);
}

const compare = JSON.parse(readFileSync(comparePath, 'utf8'));
const board = JSON.parse(readFileSync(boardPath, 'utf8'));

// "10/25/2026, 5:25 AM" -> "2026-10-25". Local calendar date as Salesforce
// printed it; no timezone maths, because a date-only field has no instant.
function toIsoDate(raw: string): string | null {
  const m = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${String(+mm).padStart(2, '0')}-${String(+dd).padStart(2, '0')}`;
}

// Re-assert the duplicate guard against the board we are about to write to.
// The comparison ran earlier; a row added in between must not be doubled.
const liveKeys = new Set(
  board.projects
    .filter((p: { deletedAt?: string }) => !p.deletedAt)
    .map((p: { name: string }) => nameKey(p.name)),
);

const now = new Date().toISOString();
const projects: unknown[] = [];
const activity: unknown[] = [];
const collisions: string[] = [];
const seen = new Set<string>();

// Oldest first, so the newest design keeps the highest `position` (newest on top).
const rows = [...compare.missingList].sort((a: { completed: string }, b: { completed: string }) =>
  String(toIsoDate(a.completed)).localeCompare(String(toIsoDate(b.completed))),
);

rows.forEach((row: { name: string; completed: string; designer: string; kw: string }, i: number) => {
  // Strip the 🏷️ emoji and collapse whitespace the app's way, then keep the
  // export's own casing wherever it actually had some.
  const undecorated = cleanProjectName(row.name);
  const name = recaseOnlyIfNeeded(row.name.replace(/[\p{Extended_Pictographic}\p{Variation_Selector}‍]/gu, '').replace(/\s+/g, ' ').trim(), undecorated);
  const key = nameKey(name);
  if (liveKeys.has(key) || seen.has(key)) {
    collisions.push(`${row.name} -> ${name}`);
    return;
  }
  seen.add(key);

  const id = randomUUID();
  const designedDate = toIsoDate(row.completed);
  projects.push({
    id,
    name,
    coordinator: '',
    statusId: STATUS_NEW,
    phaseId: PHASE_DESIGN,
    designedDate,
    rating: null,
    // Spaced a minute apart so the import has a stable, inspectable order and
    // cannot collide with an existing row's position.
    position: Date.parse(now) + i * 60_000,
    createdAt: now,
    createdBy: AUTHOR,
    updatedAt: now,
    updatedBy: AUTHOR,
    schemaVersion: 1,
  });
  activity.push({
    id: randomUUID(),
    projectId: id,
    actor: AUTHOR,
    action: 'create',
    at: now,
  });
});

// Only the new rows. The server merges by id, so an empty labels/updates list
// leaves those collections untouched, and omitting `prefs` entirely preserves
// the team's shared auto-sort setting (mergePrefs keeps the side that has it).
const payload = { projects, labels: [], activity, updates: [], automations: [] };

writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

console.log(`input rows      : ${compare.missingList.length}`);
console.log(`projects to add : ${projects.length}`);
console.log(`activity rows   : ${activity.length}`);
console.log(`collisions      : ${collisions.length}`);
for (const c of collisions) console.log(`  SKIPPED (already on board): ${c}`);
console.log('');
for (const p of projects as { name: string; designedDate: string }[]) {
  console.log(`  ${p.designedDate}  ${p.name}`);
}
console.log(`\nwrote ${outPath}`);
