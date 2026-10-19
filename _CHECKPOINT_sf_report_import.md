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
