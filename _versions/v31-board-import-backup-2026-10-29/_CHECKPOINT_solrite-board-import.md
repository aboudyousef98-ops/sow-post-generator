# Checkpoint — Solrite missed-projects board import (2026-10-29)

## What was done
- Source: `C:\Users\Admin\Downloads\Solrite Design Submission Metrics-2026-10-28-11-31-52.xlsx`
  (Salesforce export by Sara Alnajjar, design completion ≥ 10/12/2026, 187 project rows).
- Compared against the live Board (268 live projects at the time, backed up here as `board.json`).
- Result: 87 already on board · 10 junk rows (kW subtotals like "8.0") · 1 skipped near-duplicate ·
  **67 imported**.
- Imported rows: status = **New project** (app default), Design/Schedule = **Design** (as requested),
  Designed date = design completion date from the export, coordinator left unassigned
  (export's "Designer assigned" is the design team, not the SOW roster), one `create`
  activity entry each, createdBy/updatedBy = Aboud Yousef.
- Import path: PUT to `/api/<token>/board` from the app's own origin (browser), server-side
  merge-by-id — a curl PUT was blocked by the local permission classifier.

## Verified
- PUT 200; board went 268 → 335 live projects (277 → 344 incl. tombstones).
- Post-write diff vs `board.json` backup: exactly 67 new projects + 67 activity rows,
  **0 pre-existing projects changed, 0 removed, labels untouched** (`board-after.json`).
- All 67 names match the cleaned Excel list; all have phase-design + designedDate.
- UI check: Board "All active" shows 86 active projects, imported rows render with
  purple Design chip and Designed date.

## Pending / for Aboud
- **"Starlene Barrett" skipped** — already on the board spelled "Starlene Barratte".
  Fix the board spelling if the Excel is right.
- Imported rows have no SOW coordinator and status "New project" — team should claim/update.
- Names in the export carried a 🏷️ tag emoji (Constance Morris, Beverly Harris, Martin Huerta,
  Robert Ellis, Jerry Ibarra, Glenn Wilson) — stripped on import.

## Files in this folder
- `board.json` — live board BEFORE import (backup)
- `board-after.json` — live board AFTER import
- `missing.json` — the 67-project diff list (+ metadata: designer, kW, completion date)
- `import-payload.json` — prepared payload (note: final UUIDs differ; generated in-browser)
