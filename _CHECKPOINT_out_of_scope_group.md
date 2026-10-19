# CHECKPOINT — "Out of SOW scope" board section

**Date:** 2026-10-19 · **Branch:** `fix/board-save-outage` · **Backup:** `_versions/v17-out-of-scope-group/`

## What was asked
Hold / Sonnen / ENPHASE projects are not in the SOW pipeline but still have to
live on the board. Give them their own group **between** the active table and
Completed projects, so they stop crowding the pipeline.

## What was built

| File | Change |
|---|---|
| `src/board/types.ts` | `BoardLabel.outOfScope?: boolean` — optional, so no migration is needed |
| `src/lib/board.ts` | `isOutOfScopeLabel()` + `outOfScopeStatusIds()`; default-by-name list `hold / sonnen / enphase` |
| `src/lib/boardViews.ts` | `splitSections()` — one pure function returns `{ active, outOfScope, completed }` |
| `src/board/BoardTab.tsx` | new `SectionCard` component (Completed + Out-of-scope now share one implementation); `scopeOpen` state persisted to `sowpost.board.scopeOpen.v1`; section rendered between the two existing cards |
| `src/board/EditLabelsModal.tsx` | "out of scope" checkbox per status label, mutually exclusive with "done" |
| `src/mobile/MobileBoard.tsx` | same three sections, same order |
| `src/theme.css` | `.board-scope` / `.m-scope` — amber accent so it never reads as "done" |

### Decisions
- **No data migration.** `outOfScope` is optional; `undefined` falls back to a
  case-insensitive name match on `hold` / `sonnen` / `enphase`. The three labels
  on the live board already carry those names, so the section fills itself the
  moment the build ships. Ticking the box in Edit labels stores an explicit
  boolean (bumping `updatedAt`), which beats the name default forever — the same
  contract a rename has against a re-seed.
- **`isDone` wins** if a label somehow claims both. Kept mutually exclusive in
  the UI; the precedence only matters for data from an older client.
- **Collapsed by default** — the whole point is to get these rows out of the way.
- **Fixed a latent gap while here:** `searching` put completed rows "in play"
  for bulk actions but never rendered the section, so a search could still match
  a row that stayed invisible — the exact shape of #9. Both sections now force
  open while a search is running, without writing the stored preference.

## Verification
- `npx vitest run` → **751 passed, 0 failed** (51 files). 11 new assertions:
  7 in `src/lib/boardViews.test.ts` (`splitSections`), 4 DOM tests in
  `src/board/BoardTab.test.tsx` (row leaves the active table, section order,
  search reveal, choice survives a remount).
- `npx tsc --noEmit` clean · `npx eslint src netlify` clean.
- Two pre-existing tests updated, both deliberate: the empty-table copy changed
  ("every project is in a section below"), and the Edit-labels row now has two
  checkboxes so the test targets `done` by label.
- `BoardTab.columns.test.tsx` fixture pinned `outOfScope: false` on its
  arbitrarily-named "Hold" label — those tests are about column filters and need
  all three rows in the main table.
- **Against the real board** (157 live rows in `.netlify/blobs-serve`):
  active **26 → 11**, out-of-scope **15** (Hold 8, Sonnen 6, ENPHASE 1),
  completed 131.

## Pending
- Not committed, not pushed, not deployed — review it on `http://localhost:53561` first.
- Everything still open from `_CHECKPOINT_board_save_outage.md` (Yarob's unsynced
  two days, unpushed branch, password rotation) is untouched by this change.
