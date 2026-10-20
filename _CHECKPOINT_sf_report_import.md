# CHECKPOINT — Import from Salesforce (report paste → board)

**Date:** 2026-10-19 · **Branch:** `fix/board-save-outage` · **Backup:** `_versions/v18-sf-report-import/`

## What was asked
Paste a whole Salesforce "Scope of Work Assignments" report (Scheduled or
Design), have the system find the project names, add the ones that are missing,
and set Design/Schedule by itself — with Schedule winning when a project is on
both reports. No more copy-pasting project by project.

## Decisions taken with Aboud (brainstormed 2026-10-19)
1. **Preview, then one Import click.** Not a silent auto-add: 61 rows landing on
   a board three people share needs one screen of "here is what will happen".
2. **New rows only for the coordinator.** An existing row's coordinator is never
   overwritten by a paste. The Design report shows `-` for everyone, so those
   rows arrive unassigned.
3. **Near misses are questions, never guesses.** Import is blocked until each is
   answered. Guessing "same" loses a project; guessing "new" is how
   `scripts/dedupe-projects.mjs` came to exist.
4. **"Not on this report" is informational and complete-paste-only.** Never
   offers to archive — a partial paste would propose archiving live work.
5. **Deterministic parser, no AI.** Approach A of three. Same house rule as
   `lib/parser.ts`; fails loudly rather than importing garbage.

## Architecture — four pieces, each tested alone

| File | Role |
|---|---|
| `src/lib/sfReport.ts` | text → `{ kind, rows, totalRecords, complete, unreadable, warnings, error }`. Pure. |
| `src/lib/sfImport.ts` | report + board → `ImportPlan` (`new` / `matched` / `maybe` / `archived`, phase changes, sticky-Schedule, absent). Pure. |
| `src/board/ImportModal.tsx` | the preview screen; collects answers; decides nothing. |
| `src/board/BoardTab.tsx` | `runImport()` — one `setBoard`, one activity entry per row, one Undo. |

### How the parser finds rows without knowing the columns
The two reports have different columns, so nothing is counted positionally.
Two structural invariants, verified against both real pastes:
- `feature not included` appears once per row (the broken "Scope of Work
  Complete" column). Line before = SOW coordinator, line after = project name.
- the row ends with a document name containing `| FF |`, which **repeats the
  project name** — so every row is cross-checked against itself. A row that
  disagrees, or has no document name at all, is reported and never imported.
- the report's own `Total Records` gives a third count → partial-paste warning.

### Two things the real data corrected mid-build
- **A truncated trailing row must not kill the paste.** The design said "counts
  disagree → refuse everything"; Aboud's own paste ends mid-notes. Now it is
  per-row: that one row is listed as unreadable, the other four import.
- **The roster spells him `Yarob`, Salesforce writes `Ya'rob`.** Exact roster
  matching would have silently unassigned 2 of 5 rows. Coordinator lookup now
  ignores punctuation and case.
- **Salesforce's per-row `Project Status` is a better phase signal than the
  report it came from.** "Okernithia Shepherd" sits on the *Design* report with
  status `Install Scheduled`. So: row says Install Scheduled → Schedule;
  otherwise the report's own kind. Schedule still wins everywhere.

## Verification
- **809 tests pass, 0 fail** (54 files) · `tsc --noEmit` clean · `eslint` clean ·
  `check:nosecrets` clean.
- 58 new tests: 18 `sfReport`, 23 `sfImport` (incl. 2 end-to-end through the
  real pastes), 12 `ImportModal`, 5 in `BoardTab` (write + Undo + re-import).
- Both real pastes are committed as fixtures
  (`src/lib/__fixtures__/sf-report-{scheduled,design}-partial.txt`), covering the
  `-` placeholder, the `✨` emoji, the `Nº` character, blank lines inside the
  notes column, and the truncated final row.
- **Dry-run against the live 157-row board:** the 11 pasted projects are all
  genuinely new (none are on the board). A synthetic report built from *real*
  live names then confirmed matching end to end:
  `Cynthia Paquette` → matched · `KARMEN GOMEZ` → matched · `Moises Negrette`
  → question vs `Moises Negrete` · `Taylor Steven R` → question vs
  `Steven R TAYLOR` · new name → created.

## Deliberately not built
- No new board columns for kW, street address, CLR agent, designer or lender —
  the board has nowhere to put them. Install date stays read-only from the
  linked post ("the board controls Compose, never the opposite", 2026-10-02).
- SF `Project Status` never touches the board's **Status** column — that column
  is the team's own workflow (Hold, Sonnen, Ready to submit, OVERTIME).
- No archiving of rows missing from a report.

## Pending
- Not committed, not pushed, not deployed. Review on `http://localhost:53561`.
- Activity is capped at 1000 entries and the log is already near it — a 61-row
  import spends 61. Worth raising the cap before the first full import.
- Everything open in `_CHECKPOINT_board_save_outage.md` is untouched.

---

## Follow-up, same day — Salesforce Project Status (Aboud testing, 2026-10-19)

Live testing with a real Ctrl+A paste surfaced statuses the first two fixtures
never contained. Of 9 rows pasted: `Install Scheduled` 2, `AHJ` 2,
**`Cancel` 4**, **`Hold` 1**.

The importer read Project Status *only* to detect "Install Scheduled", so all
nine would have been added as live Design projects — four of them cancelled.
On a 61-row import that is a couple of dozen dead projects dropped into the
pipeline the Out-of-SOW-scope section had just been built to clear.

**Decisions (Aboud):**
- **Cancelled rows are still imported** — his call over my recommendation to
  skip them — but the count is never buried, and any row *already on the board*
  that Salesforce now shows as `Cancel` is listed so he can archive it himself.
  The import still never archives or edits anything.
- **A NEW row carries a Salesforce status that names a board status.** Today
  that is `Hold`, so those rows land straight in Out of SOW scope instead of
  the pipeline. Existing rows are untouched, as before.
- A cancelled row can never count as `scheduled`, so it cannot drag anything
  onto Schedule.

New fixture `sf-report-design-cancel-hold.txt` — his actual Ctrl+A paste,
9 of 61 rows, carrying `Cancel`, `Hold`, a hyphenated shouted name
(`JOHANN LAWRENCE-BRIAN DSOUZA`) and the trailing `Loading...`.

Also fixed: the fixture helper in `sfReport.test.ts` now normalises CRLF. Git
checked the fixtures out with CRLF on this laptop, which silently broke a test
that edits the text with `\n` patterns — it passed by accident before.

824 tests pass (was 809).

### Still open
- **Ctrl+A cannot get all 61 rows.** Salesforce only renders what you scroll
  past, so each copy yields a different ~9-row window (10/18–10/19 the first
  time, 9/27–9/28 the second, ending in `Loading...`). The CSV-export route is
  designed but NOT built — see the options put to Aboud 2026-10-19.

---

## Second follow-up, 2026-10-19 evening — reading the exported .xlsx

**UNCOMMITTED.** Finished and green, but left in the working tree: Aboud said
"dont deploy anything" and ended the session. Ask before committing.

Ctrl+A was proven unusable. Salesforce Lightning only keeps rendered rows in
the DOM, so two copies of the same 61-record report produced two different
~9-row windows (10/18–10/19, then 9/27–9/28, the second ending in `Loading...`).
Scrolling swaps the window rather than accumulating it.

So: **`Export → Details Only (.xlsx)`**, read directly in the browser.

| File | Role |
|---|---|
| `src/lib/sfWorkbook.ts` | `sheetToGrid()` (exceljs sheet → string grid) + `parseSfGrid()` → the same `SfReport` the paste parser returns. Pure. |
| `src/board/ImportModal.tsx` | file picker above the paste box; the file wins when set; `exceljs` is `import()`-ed so it stays out of the main bundle |
| `src/lib/__fixtures__/sf-export-design.xlsx` | Aboud's real export, 21 KB |

The export is the *better* input: a real header row means columns are matched
**by name**, so the `feature not included` anchor is not needed and moving or
adding a Salesforce column cannot break it.

### What the real file changed
- **62 rows, not the 61 the browser header claimed** — the two captures were
  minutes apart. The file is authoritative, so `complete` is always true and
  the "expand the date groups" warning never fires for an export.
- **A 🏷️ emoji on two project names** (`MEWELDE J Moore 🏷️`) that its own
  design document omits. Those two silently failed the cross-check — 60 of 62.
  Now stripped by `cleanProjectName()` in `sfReport.ts`, shared by both
  parsers; left in, it would also have poisoned board name-matching forever.
  The same helper stops `Ira Matthews III` becoming `Ira Matthews Iii`.
- **A status neither sample had: `Install Initiated`** (2 rows). Treated as
  scheduled — the install has started, so it is not design work. Stated to
  Aboud; **not explicitly confirmed**. `SCHEDULED_STATUS_RE` and
  `CANCELLED_STATUS_RE` now live in `sfReport.ts` and are shared, so the paste
  and the export can never disagree about what a status means.
- Statuses in the file: AHJ 40 · Cancel 8 · Hold 8 · Install Scheduled 4 ·
  Install Initiated 2.

### Verification
- **842 tests, 841 pass.** The one failure is **pre-existing and unrelated**:
  `App.integration` → *Compose acceptance flow → paste → classify → preview →
  persist → post*. Confirmed by stashing all of this work and running the full
  suite twice on clean `HEAD`, where it also failed. It passes in isolation and
  times out under parallel load. Worth fixing separately.
- tsc, eslint, `check:nosecrets` and `npm run build` all clean.
- Verified the fixture does **not** reach the bundle — no customer name from it
  appears anywhere in `dist/`.
- One flaky test of my own was found and fixed before it could settle in: the
  file-reading test waited on a fixed 400 ms timer and failed under suite load.
  It now waits on the rendered result (`findByText`).

### Still open
- `Install Initiated` → Schedule is unconfirmed.
- The importer is **desktop only**; mobile has the sections but no button.
- `ACTIVITY_CAP = 1000` and prod is already at 1000 — a 62-row import spends 62
  entries. Raise it before the first full import.
