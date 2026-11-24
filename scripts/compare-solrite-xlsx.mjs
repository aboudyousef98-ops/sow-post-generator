// Read-only: compare the Solrite Design Submission Metrics export against the
// LIVE board, and report which exported project names are not on the board.
//
// Name matching is deliberately layered, because the two systems type names
// differently ("Steven R TAYLOR" on the board vs "Steven Taylor" in the export):
//   1. exact, after case/punctuation/whitespace normalisation
//   2. first+last only, dropping middle names and initials
//   3. same token multiset (handles "Last, First" and reordered names)
//   4. fuzzy, first+last, >= 0.88 similarity (catches typos) -- reported as
//      a NEAR match for a human to confirm, never silently treated as present
//
// Usage: node scripts/compare-solrite-xlsx.mjs <board.json> <xl-projects.json>

import { readFileSync, writeFileSync } from 'node:fs';

const [boardPath, xlPath] = process.argv.slice(2);
if (!boardPath || !xlPath) {
  console.error('usage: node scripts/compare-solrite-xlsx.mjs <board.json> <xl-projects.json>');
  process.exit(1);
}

const board = JSON.parse(readFileSync(boardPath, 'utf8'));
const xl = JSON.parse(readFileSync(xlPath, 'utf8'));

const STOP = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'mr', 'mrs', 'ms', 'dr']);

// The Salesforce export decorates some names with a trailing label emoji
// ("Donald Kennedy 🏷️"), and both systems punctuate inconsistently. Drop emoji
// and punctuation, but KEEP digits: one customer can have several projects that
// differ only by street number ("... 14209 Haymeadow" vs "... 14207 Haymeadow").
function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A name carrying a street address identifies one SITE, not one person, so the
// first+last and token-set shortcuts must not be applied to it -- they would
// collapse five distinct Devlieger sites onto whichever one the board has.
function hasAddress(s) {
  return /\d/.test(String(s)) || / - /.test(String(s));
}

function tokens(s) {
  return norm(s).split(' ').filter((t) => t && !STOP.has(t));
}

// First + last, with middle names and single-letter initials dropped.
function firstLast(s) {
  const t = tokens(s).filter((x) => x.length > 1);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  return `${t[0]} ${t[t.length - 1]}`;
}

function tokenKey(s) {
  return tokens(s).filter((x) => x.length > 1).sort().join(' ');
}

// Dice coefficient on character bigrams.
function similarity(a, b) {
  if (a === b) return 1;
  const grams = (s) => {
    const g = [];
    for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.length || !B.length) return 0;
  const pool = [...B];
  let hits = 0;
  for (const g of A) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      hits++;
      pool.splice(i, 1);
    }
  }
  return (2 * hits) / (A.length + B.length);
}

// --- index the board ----------------------------------------------------
const byExact = new Map();
const byFirstLast = new Map();
const byTokens = new Map();

const push = (map, key, row) => {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
};

for (const p of board.projects) {
  push(byExact, norm(p.name), p);
  push(byFirstLast, firstLast(p.name), p);
  push(byTokens, tokenKey(p.name), p);
}

const boardFirstLast = [...byFirstLast.keys()].filter(Boolean);

// --- compare ------------------------------------------------------------
const matched = [];
const near = [];
const missing = [];

for (const row of xl) {
  const name = row.name;
  let hit = byExact.get(norm(name));
  let how = 'exact';
  if (!hit && !hasAddress(name)) {
    hit = byFirstLast.get(firstLast(name));
    how = 'first+last';
  }
  if (!hit && !hasAddress(name)) {
    hit = byTokens.get(tokenKey(name));
    how = 'reordered';
  }
  if (hit) {
    matched.push({ ...row, how, board: hit.map((h) => h.name) });
    continue;
  }

  // Site-specific rows get no fuzzy pass either: a 0.9-similar address is a
  // DIFFERENT house, which is exactly the case we must not wave through.
  if (hasAddress(name)) {
    missing.push({ ...row, closest: null, note: 'site-specific (address) row' });
    continue;
  }

  const fl = firstLast(name);
  let best = null;
  for (const cand of boardFirstLast) {
    const s = similarity(fl, cand);
    if (!best || s > best.score) best = { score: s, cand };
  }
  if (best && best.score >= 0.88) {
    near.push({ ...row, score: +best.score.toFixed(3), board: byFirstLast.get(best.cand).map((h) => h.name) });
  } else {
    missing.push({ ...row, closest: best ? `${byFirstLast.get(best.cand)[0].name} (${best.score.toFixed(2)})` : null });
  }
}

const out = {
  boardProjects: board.projects.length,
  exportRows: xl.length,
  exportUnique: new Set(xl.map((r) => norm(r.name))).size,
  matched: matched.length,
  near: near.length,
  missing: missing.length,
  nearList: near,
  missingList: missing,
};

writeFileSync('_solrite_compare.json', JSON.stringify(out, null, 2), 'utf8');

console.log(`board projects   : ${out.boardProjects}`);
console.log(`export rows      : ${out.exportRows} (${out.exportUnique} unique names)`);
console.log(`matched on board : ${out.matched}`);
console.log(`near matches     : ${out.near}`);
console.log(`NOT on board     : ${out.missing}`);
console.log('');
if (near.length) {
  console.log('--- NEAR MATCHES (confirm by hand) ---');
  for (const n of near) console.log(`  ${n.name}  ~  ${n.board.join(' / ')}  [${n.score}]  designer=${n.designer} completed=${n.completed}`);
  console.log('');
}
console.log('--- NOT ON THE BOARD ---');
for (const m of missing) {
  console.log(`  ${m.name}  | designer=${m.designer} | completed=${m.completed} | kW=${m.kw} | closest=${m.closest ?? '-'}`);
}
