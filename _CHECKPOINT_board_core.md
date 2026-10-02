# Checkpoint — Project Board core (monday-style CRM, no Supabase)

Date: 2026-10-02 · Plan: `_PLAN_board.md` · Spec: `../10-project-board.md`
(as amended by Aboud: existing login + existing Blobs sync, no Supabase/Google)

## Added same day (commit d3cd3de, Aboud's requests)

- **Completed projects section**: any project whose status label has the
  "done" flag disappears from the main board and lands in a collapsible
  section below it (count badge, same columns and widths, rows stay fully
  editable — changing the status back returns the row to the main board).
  The move shows a toast with Undo. Main header counts speak about active
  projects only. Custom labels marked "done" in Edit labels behave the same.
- **Designed-date range filter** in the toolbar (From – To, native date
  inputs, ✕ to clear). Rows with no Designed date hide while a range is set.
- Both verified by tests (326 total green) and live in Chrome.

## Built

- **Unwound Supabase** (B0's plumbing): dependency, `supabase/` SQL, client,
  SETUP.md and env vars all removed. TanStack Table + floating-ui + the date
  helpers stayed.
- **Data**: `src/board/types.ts` (BoardProject/BoardLabel/BoardActivity/
  BoardState) · `src/lib/board.ts` (seeded labels with fixed ids, merge rules,
  duplicate guard, patch + activity builders, 16-swatch palette, luminance
  text color) · `storage.ts` gained `loadBoard`/`saveBoard` (merge-on-write).
- **Server**: `netlify/functions/board.mts` — GET/PUT `/api/<token>/board`,
  Blobs key `board`, merge by id/updatedAt, etag CAS, activity capped at
  1000. Redirect added to `netlify.toml`. Same guard as every function.
- **Sync** (App.tsx): board joins the records/ahjs pattern — localStorage
  cache, initial pull-merge-push, debounced 1 s push on edit, **polling every
  15 s + on window focus** (the "realtime"). Sync pill now = records + ahjs +
  board.
- **UI**: `src/board/BoardTab.tsx` + `cells.tsx` + `Popover.tsx` +
  `EditLabelsModal.tsx` + `ActivityModal.tsx`, styled in `theme.css` with the
  existing tokens. Board is the first main tab and the landing tab when
  signed in (tests land on Compose as before).
  - Columns: Name (sticky, inline rename, ⋯ menu) · SOW coordinator (person
    popover, Assign to me, Unassigned) · Status + Design/Schedule (full-color
    label cells, label grid, Edit labels: rename/recolor/reorder/default/
    done-flag/archive with reassignment; system labels can't be archived) ·
    Designed date (native date input, Today/Clear) · Rating (1–3 stars, click
    to set/clear, keys 1/2/3/0) · Last update (hidden by default).
  - Toolbar: search · Coordinator/Status/Design-Schedule multi-filters ·
    My projects · Show archived · Columns menu (show/hide, reset widths).
  - Resizing: drag handles, double-click reset, min/max widths, widths +
    visibility + filters persisted per browser; body memoized during drag
    (CSS-variable widths — TanStack's performant pattern).
  - Quick add at the bottom (Enter adds, stays focused); duplicate guard
    "Already on the board · <status> · <coordinator> [Open it] [Add anyway]".
  - Row menu: Copy name · View activity (field-level history) · Archive with
    5-s Undo toast · Delete permanently (admin only, confirm modal).

## Tested

- `npm test`: **323/323 pass** (26 files) — includes 14 board-logic tests
  (merge/tombstones/seeds/dup-guard/activity) and 7 BoardTab UI tests
  (add, duplicate guard T6, status pick, rating T5, archive/undo, custom
  label T4, search + My projects).
- tsc + eslint + vite build + check:nosecrets clean.
- **Visual smoke in Chrome** (vite dev, seeded session): board renders on
  brand, added rows, duplicate warning fired, status → Working on it (orange),
  Designed date → Today → 10/02/2026, rating ★★. Test data cleared after.
- Pre-existing tests updated for the new landing tab: 2 Phase-9 tests click
  Compose first; the history-sync integration test's fetch stub now answers
  `/board`.

## Pending / notes for Aboud

- **Not pushed, not deployed** (same standing instruction as Phase 9).
  Deploying this phase = `npx netlify deploy --build --prod` when you say so.
- Two-browser sync (T1/T2-style) not yet exercised live — needs the deployed
  site or `netlify dev`; polling is 15 s, so expect ≤15 s, not 2 s.
- Next phase when you want it: **Compose ↔ Board linking** (Post column,
  Project field in Compose, posted ⇒ Done automation).
- SPEC-GAP: coordinators are stored as display names (like post authors);
  renaming a user in Admin → Users does not retag their old rows.
