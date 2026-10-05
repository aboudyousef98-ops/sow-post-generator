# Checkpoint — Board: 5-star rating + hold-row drag-to-reorder

**Date:** 2026-10-05 · **Deploy:** `6ac372eebb488a50e72e6030` → https://sow-post-generator.netlify.app
**Backup:** pre-change files in `_versions/v6-rating5-reorder/`

## What was built

1. **Rating 1–3 → 1–5 stars** (Board tab)
   - `src/board/types.ts` — `rating: 1|2|3|4|5|null`
   - `src/board/cells.tsx` — `RatingCell` renders 5 stars; keyboard `1`–`5` sets, `0` clears, clicking the current star clears (unchanged behavior)
   - Rating column default width 120 → 148 so 5 stars fit
   - Existing 1–3 values stay valid — no migration, no server change (board.mts does not validate fields)

2. **Drag-to-reorder rows, monday-style (hold the row itself, no handle)**
   - Press-and-hold anywhere on a row in the main table, move ≥5 px → drag starts; drop line shows the target; release to drop
   - `positionForMove()` in `src/lib/board.ts` — new `position` = midpoint between new neighbours; one row changes, merge-safe via `updatedAt`, so **order is shared with the whole team**
   - A plain click (no movement) still opens cell editors; the click after a drop is swallowed; drags never start from inline inputs
   - Dragging while a column sort is active clears the sort (manual order is what's being edited)
   - Reorders are NOT written to the activity log (`activityForPatch` skips `position`)
   - Completed section is not draggable (keeps "recently finished first")

## Tested

- TDD: all new behavior had failing tests first
- `npm test` — 374/374 pass (6 new/updated: positionForMove ×4, activity-skips-position, 5-star cell, drag reorder, press-without-move-is-a-click)
- `npm run lint`, `tsc --noEmit`, `npm run build`, `check:nosecrets` — all clean
- Post-deploy smoke: root 200, live bundle `index-CdBeY2HH.js` contains the new drag code

## Pending

- Touch-screen dragging untested (desktop/mouse is the team's usage); revisit if anyone boards from a tablet
