// scripts/build-board-import.ts
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// src/lib/board.ts
function cleanName(raw) {
  return raw.trim().replace(/\s+/g, " ");
}
function nameKey(name) {
  return cleanName(name).toLowerCase();
}

// src/lib/nameCase.ts
function titleCaseName(name) {
  return name.replace(/[^\s-]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

// src/lib/sfReport.ts
var DECORATION_RE = /\p{Extended_Pictographic}|\p{Variation_Selector}|\u200D/gu;
var SUFFIXES = {
  ii: "II",
  iii: "III",
  iv: "IV",
  vi: "VI",
  vii: "VII",
  jr: "Jr",
  sr: "Sr"
};
function cleanProjectName(raw) {
  const titled = titleCaseName(cleanName(raw.replace(DECORATION_RE, " ")));
  return titled.split(" ").map((word) => SUFFIXES[word.toLowerCase()] ?? word).join(" ");
}

// scripts/build-board-import.ts
var AUTHOR = "Aboud Yousef";
var STATUS_NEW = "status-new";
var PHASE_DESIGN = "phase-design";
function recaseOnlyIfNeeded(raw, titled) {
  const rawWords = raw.split(/(\s+)/);
  const titledWords = titled.split(/(\s+)/);
  if (rawWords.length !== titledWords.length) return titled;
  return rawWords.map((word, i) => {
    const letters = word.replace(/[^A-Za-z]/g, "");
    if (!letters) return titledWords[i];
    const uninformative = letters === letters.toUpperCase() || letters === letters.toLowerCase();
    return uninformative ? titledWords[i] : word;
  }).join("");
}
var [comparePath, boardPath, outPath] = process.argv.slice(2);
if (!comparePath || !boardPath || !outPath) {
  console.error("usage: node scripts/build-board-import.mjs <compare.json> <board.json> <out.json>");
  process.exit(1);
}
var compare = JSON.parse(readFileSync(comparePath, "utf8"));
var board = JSON.parse(readFileSync(boardPath, "utf8"));
function toIsoDate(raw) {
  const m = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${String(+mm).padStart(2, "0")}-${String(+dd).padStart(2, "0")}`;
}
var liveKeys = new Set(
  board.projects.filter((p) => !p.deletedAt).map((p) => nameKey(p.name))
);
var now = (/* @__PURE__ */ new Date()).toISOString();
var projects = [];
var activity = [];
var collisions = [];
var seen = /* @__PURE__ */ new Set();
var rows = [...compare.missingList].sort(
  (a, b) => String(toIsoDate(a.completed)).localeCompare(String(toIsoDate(b.completed)))
);
rows.forEach((row, i) => {
  const undecorated = cleanProjectName(row.name);
  const name = recaseOnlyIfNeeded(row.name.replace(/[\p{Extended_Pictographic}\p{Variation_Selector}‍]/gu, "").replace(/\s+/g, " ").trim(), undecorated);
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
    coordinator: "",
    statusId: STATUS_NEW,
    phaseId: PHASE_DESIGN,
    designedDate,
    rating: null,
    // Spaced a minute apart so the import has a stable, inspectable order and
    // cannot collide with an existing row's position.
    position: Date.parse(now) + i * 6e4,
    createdAt: now,
    createdBy: AUTHOR,
    updatedAt: now,
    updatedBy: AUTHOR,
    schemaVersion: 1
  });
  activity.push({
    id: randomUUID(),
    projectId: id,
    actor: AUTHOR,
    action: "create",
    at: now
  });
});
var payload = { projects, labels: [], activity, updates: [], automations: [] };
writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
console.log(`input rows      : ${compare.missingList.length}`);
console.log(`projects to add : ${projects.length}`);
console.log(`activity rows   : ${activity.length}`);
console.log(`collisions      : ${collisions.length}`);
for (const c of collisions) console.log(`  SKIPPED (already on board): ${c}`);
console.log("");
for (const p of projects) {
  console.log(`  ${p.designedDate}  ${p.name}`);
}
console.log(`
wrote ${outPath}`);
