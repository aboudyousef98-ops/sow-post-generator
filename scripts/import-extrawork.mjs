// One-off import: "Extra Work Summary - SOW Team - Sep 2026.xlsx" → the
// Extra Work store shape ({ entries: ExtraWorkEntry[] }).
//
//   node scripts/import-extrawork.mjs "<path to .xlsx>" <out.json>
//
// - One sheet per person; table header on row 7, data from row 8.
// - The DATE cell is the truth. The sheet's "Day type" is kept as
//   dayTypeOverride ONLY where it disagrees with the auto rule
//   (Sat+Sun → weekend) — that reproduces the sheets exactly.
// - Ids and timestamps are DETERMINISTIC so re-running the import can never
//   duplicate entries (the server merges by id).
// - username is only known for Aboud; others stay '' (admin-editable) until
//   their accounts exist — ownership of history is an admin job anyway.

import ExcelJS from 'exceljs';
import { writeFileSync } from 'fs';

const [, , xlsxPath, outPath] = process.argv;
if (!xlsxPath || !outPath) {
  console.error('usage: node scripts/import-extrawork.mjs <tracker.xlsx> <out.json>');
  process.exit(1);
}

const USERNAMES = { 'Aboud Yousef': 'aboudyousef' };
const STAMP = '2026-10-07T00:00:00.000Z'; // fixed → stable merges, edits win later

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Cell → 'YYYY-MM-DD'. exceljs gives UTC Dates for date cells; serials appear as numbers. */
function cellDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000); // Excel serial → unix epoch days
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

function autoType(iso) {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);

const entries = [];
for (const ws of wb.worksheets) {
  const person = String(ws.getCell('A1').value ?? '').trim();
  if (!person || /template/i.test(person) || /summary|lists/i.test(ws.name)) continue;
  const perDate = {};
  for (let r = 8; r <= ws.rowCount; r++) {
    const dateIso = cellDate(ws.getCell(r, 1).value);
    const hours = Number(ws.getCell(r, 4).value);
    const description = String(ws.getCell(r, 5).value ?? '').trim();
    if (!dateIso || !Number.isFinite(hours) || hours <= 0) continue;
    const sheetType = String(ws.getCell(r, 3).value ?? '').trim().toLowerCase();
    const auto = autoType(dateIso);
    const override = ['weekday', 'weekend', 'holiday'].includes(sheetType) && sheetType !== auto ? sheetType : null;
    perDate[dateIso] = (perDate[dateIso] ?? 0) + 1;
    entries.push({
      id: `sep26-${slug(person)}-${dateIso}-${perDate[dateIso]}`,
      username: USERNAMES[person] ?? '',
      person,
      dateIso,
      hours,
      description,
      dayTypeOverride: override,
      createdAt: STAMP,
      updatedAt: STAMP,
      schemaVersion: 1,
    });
  }
}

// Sanity report: per-person totals the way the sheets state them.
const byPerson = {};
for (const e of entries) {
  byPerson[e.person] ??= { rows: 0, hours: 0, overrides: 0 };
  byPerson[e.person].rows++;
  byPerson[e.person].hours += e.hours;
  if (e.dayTypeOverride) byPerson[e.person].overrides++;
}
console.log(JSON.stringify(byPerson, null, 1));
console.log(`total entries: ${entries.length}`);

writeFileSync(outPath, JSON.stringify({ entries }, null, 1));
console.log(`wrote ${outPath}`);
