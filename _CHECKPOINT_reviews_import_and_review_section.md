# CHECKPOINT — Scope of Work Reviews import + Installation Review section

> Date: 2026-11-03 | Status: **SHIPPED AND VERIFIED** — deploy
> `6aea09b4e12b3d3d8ddfcb5d`. Two independent features, two commits
> (`1d44e4b`, `82f63a5`).
> A: daily Solrite-only import from the "Scope of Work Reviews" export.
> B: Installation Review board section + Reviewer assignee column.

## A. Reviews report import

### What Aboud asked for
"Can we make the tool also import projects from this board, but we need to
import only solrite projects, dont include cash or any other lender" — and then
the governing constraint: **"i will import this everyday"**.

### The file
`Scope of Work Reviews-2026-11-03-04-02-01.xlsx`, 278 data rows, header on
row 11, grouped by Install Scheduled Date with Subtotal/Count furniture
interleaved. Saved as the test fixture `src/lib/__fixtures__/sf-export-reviews.xlsx`.

Lenders: **242 SOLRITE**, 16 GoodLeap, 12 Cash, 6 LightReach, 1 Sungage,
1 FCC Finance.

The existing importer **rejected it outright** (`kind: unknown`) — `detectKind`
only knew "Scope of Work Assignments – Scheduled/Design". So this is a third
report kind, not a tweak.

Columns it HAS that the parser wanted: `Project Name`,
`Scope Of Work Assignment: Full Name`, and all five alerts/AHJ/utility note
columns, under the exact header names already in `NOTE_COLS`.
Columns it does NOT have: **`Project Status`** (no Cancel/Hold/Scheduled
signal) and `Fulfillment: Current Design: Document Name` (so the name
cross-check is skipped — it was already conditional).

### Built
- `sfReport.ts` — `'review'` added to `SfReportKind`; `SfReport.skipped: string[]`
  added (required, so every construction site states its intent).
- `sfWorkbook.ts` — detects the title; `COL_LENDER` + `SOLRITE_RE = /solrite/i`;
  a blank lender is skipped too ("unknown" must not read as "ours"). No
  `Project Status` column means `status: ''` and `scheduled: true` — '' on
  purpose, so a new row falls to the board's default label rather than one
  invented here. **The lender gate runs BEFORE the de-dup bookkeeping** (see
  the bug below).
- `sfImport.ts` — for `review` kind, phase is set on **NEW rows only**. Daily,
  the existing "a Scheduled report always moves a row to Schedule" rule would
  drag anything a coordinator moved to Design back every night. Also: names in
  `report.skipped` count as seen, so they never appear in "not on this report".
- `ImportModal.tsx` — "Reviews report" in the header, and a new expandable
  preview line: *"N skipped — not a Solrite project"*.

### Two bugs found by measuring instead of assuming

**1. The lender gate ate 6 Solrite projects.** With the gate placed after
`seen.add(key)`, a non-Solrite row claimed the name key and the matching
Solrite row was then dropped as a duplicate. Parser returned 234 instead of
240. Moving the gate above the de-dup fixed it; pinned by a regression test.

**2. Six projects carry TWO lender rows** — one GoodLeap (or FCC Finance) AND
one SOLRITE: Ada Delgadillo, Glenda Hodge, Sylvester Hernandez, Deborah Hueber,
Donna Luce, Sherry Miles. They import on the strength of the Solrite row, so
reporting them as "skipped — not Solrite" would be a lie in the preview.
`skipped` is now filtered to names that genuinely did not make it in: **30**,
not 36.

**This corrects what was told to Aboud earlier**: of the "8 non-Solrite
projects already on your board", 6 are really Solrite projects with a duplicate
row. Only **Ali Dweik 2** and **Briggette Jordan** are purely non-Solrite.

### Measured dry run against the live board (375 live rows, 363 active)
| Outcome | Count |
|---|---|
| Solrite rows in the file | 242 |
| Unique projects parsed | **240** (Anthony Mcdowell + Carlos Flores Sr are each listed under two date groups) |
| Genuinely skipped | **30** |
| Matched existing board rows | 194 |
| Created new | 44 |
| Near-miss "maybe" questions | **2** |
| Matched an archived row | 2 |

**The 2 maybes, which recur EVERY day until fixed at the source** (answers live
in component state and are not remembered between imports):
- `Betty Key` (report) vs `Betty Key.` (board) — trailing period, same project.
  Rename the board row.
- `Evan Frye Fd_40124` (report) vs `Evan Frye FD_40121` (board) — **the numbers
  differ**. Possibly two different projects; a designer should check.

## B. Installation Review section + Reviewer column

### Built
- `board/types.ts` — `BoardLabel.review?: boolean`, `BoardProject.reviewer?: string`.
  Both optional, same no-migration contract as `outOfScope`.
- `lib/board.ts` — `isReviewLabel()` / `reviewStatusIds()`, mirroring
  `isOutOfScopeLabel`. Name default `'installation review'`, so the status
  Aboud had **already created** works with no tick and no migration.
  `reviewer` added to `ProjectPatch` and to `FIELD_LABELS` (activity log).
- `lib/boardViews.ts` — `splitSections` returns a fourth bucket, ordered
  Active → **Installation Review** → Out of SOW scope → Completed.
  Precedence: Done > Review > out-of-scope, documented.
  `GroupKey` gains `'reviewer'`; `groupProjects` treats coordinator and
  reviewer identically (by display name, Unassigned last).
- `lib/boardColumns.ts` — `reviewer` display value, so the per-column filter
  offers real names instead of an internal id.
- `board/BoardTab.tsx` — the section (own `useReactTable`, own open/closed
  preference at `sowpost.board.reviewOpen.v1`, **open by default** because it
  is live work, not a parking space), plus the Reviewer column with the same
  `PersonCell` picker, sorting, filtering, reordering and show/hide.
  `sectionOf` and the focus auto-open handle the new section too.
- `board/cells.tsx` — `PersonCell` gains an optional `label`, so two person
  columns do not both announce themselves as "SOW coordinator".
- `board/EditLabelsModal.tsx` — "installation review" toggle beside
  "out of scope". All three section flags are now mutually exclusive: ticking
  one clears the other two.
- `theme.css` — the section gets the status label's crimson rather than the
  parked amber, so it does not read as "out of the way".

Salesforce has **no reviewer column**, so Reviewer is assigned by hand; no
import path writes it. Pinned by the type comment.

## Tested

TDD throughout — every behaviour had a failing test first, each failure
confirmed to be "feature missing" rather than a typo.

- `sfWorkbook.test.ts` — 12 new: kind detection, lender keep/skip, case
  insensitivity, blank lender, no-status handling, notes still mirrored, the
  other two kinds unaffected, and four against the real 2026-11-03 export
  (240/30, no subtotal furniture, dual-lender regression, honest skip list).
- `sfImport.test.ts` — 7 new: Schedule on new rows only, existing Design and
  existing no-phase left alone, skipped names not reported missing, a genuine
  miss still reported, notes still mirrored, and the Scheduled report's
  force-Schedule behaviour explicitly unchanged.
- `boardViews.test.ts` — 7 new: the section, the name default, explicit
  `review:false`, any label name once ticked, Done > Review > out-of-scope,
  empty when no review label, and `reviewer` offered in Group by.

`tsc --noEmit` clean. `eslint src netlify` clean.

| | Tests | Files |
|---|---|---|
| before this work | 184 failed, 801 passed (985) | 19 failed, 44 passed |
| after | 184 failed, **827 passed** (1011) | 19 failed, 44 passed |

**+26 passing, zero new failures, identical failing-file set.**

### No component tests for the board UI, on purpose
`src/board/*.test.tsx` cannot run on this machine — all 184 pre-existing
failures are the jsdom `localStorage` breakage (jsdom 30.1.1 under vitest
3.2.4 exposes `window`/`document` but not `localStorage`). Adding board
component tests would add red that says nothing about this change, so the
behaviour is covered by pure tests in `lib/` instead. **The jsdom fix is still
owed as its own change** — see `_CHECKPOINT_battery_installation_analysis.md`.

### No skeleton change needed
The 2026-11-01 rule covers adding or redesigning a *screen*. This adds a column
and a section to an existing screen, and the board has no skeleton today (only
`UsersTab` uses `Skeleton.tsx`).

## Pending

- Fix `Betty Key.` on the board and check the two Evan Frye numbers, or those
  two questions greet every morning's import.
- Decide whether `Ali Dweik 2` and `Briggette Jordan` (genuinely non-Solrite,
  already on the board) should be archived by hand.
- The first import is the big one: 44 new rows. After that it should be nearly
  silent.

## Deploy record — 2026-11-03

- Pre-deploy backup `_versions/v33-live-backup-2026-11-03/`, all five stores
  pulled and JSON-validated (board 387 projects, records 341, users 5).
- `npx netlify deploy --build --prod` ran **in-session** — the Bash permission
  rule Aboud added at `Project submission notes/.claude/settings.local.json`
  works. Deploy `6aea09b4e12b3d3d8ddfcb5d`, build 27s.
- **Post-deploy diff: all five stores BYTE-IDENTICAL.** Nothing was touched.
- Live bundle `/assets/index-B6QFJBdJ.js` (688,552 B) carries
  `Installation Review`, `Reviewer`, `installation review`, `"Reviews"`,
  `"review"`, `not a Solrite project`, `Lender`, the `scope of work reviews`
  detector and the `solrite` filter. (`Reviews report` does not grep as one
  string — the minifier splits it into `"Reviews"` and `" report"`.)
- `changeme`: 0. Strict `sk-[A-Za-z0-9_-]{20,}` key pattern: 0. Site 200.

### First run will be the big one
44 new rows, 2 maybe-questions. Fix `Betty Key.` and check the Evan Frye
numbers first, or those two questions recur every morning.
