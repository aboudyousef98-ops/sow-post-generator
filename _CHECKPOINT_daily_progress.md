# Checkpoint — Admin › Daily Progress (2026-10-04, revised 2026-10-06 ×2)

> **Rev 2 (2026-10-06, later) — short dates + manual Updates section. NOT DEPLOYED.**
> After seeing the report in Slack, Aboud asked for a shorter date style and a
> manual "Updates" field:
> - Scheduled rows are now `- Name - Wed 10/07` (`shortDate()`: 3-letter
>   weekday + MM/DD, no year, "Scheduled" word dropped). Heading carries the
>   meaning instead: **"Projects scheduled (installation date):"**.
> - New **Updates** textarea in the tab (one line per update, trimmed, empties
>   dropped via `parseUpdates()`); lines print at the end of the report under
>   `Updates:`; empty → `- None`. Deliberately NOT persisted — daily throwaway.
> - `formatDailyReport()` gained a 5th param `updates: string[]`.
> Backup `_versions/v8-daily-progress-format/`. Gate green: **375/375 tests**,
> tsc, eslint, nosecrets, build. **Aboud said "dont deploy"** mid-task — prod
> still runs Rev 1 (deploy `6ac4130b…`). Deploy + commit both pending his word.

> **Rev 2026-10-06 — "Projects scheduled" now follows the date picker.**
> The 7-day window is gone. Section 2 now lists **Schedule-phase rows whose
> `designedDate` equals the picked date**, each showing its linked install
> date (`- Name - Scheduled Wednesday, 10/07/2026`); rows designed that day
> with no install date are still flagged, never hidden. Heading renamed to
> "Projects scheduled:" in both the UI and the copied report. `scheduledNext7`
> and `addDaysIso` were removed, replaced by `scheduledOn(board, records,
> dateIso)`. Old files backed up to `_versions/v7-daily-progress-filter/`.
> Gate: 372/372 tests, tsc, eslint, nosecrets, build — all green.
> **Deployed to production 2026-10-06** (deploy `6ac4130b…`); live bundle
> verified to contain the new heading and no "next 7 days" string.
> Still uncommitted to git (no commit requested).
> The section below describes the ORIGINAL 2026-10-04 build.

## What was built
A third Admin sub-tab, **Daily Progress** (`Settings | Users | Daily Progress`),
rendering the daily SOW report from the board + linked posts. Admin-only, no
backend changes — all data already reaches the client via the existing sync.

- **Projects from Design** — live board rows with phase `phase-design` and
  `designedDate` equal to the picked date (date picker, defaults to today).
  Matching is by the seeded label *id*, so renaming the label is safe.
- **Projects scheduled for the next 7 days** — live rows with phase
  `phase-schedule`; the install date comes from `linkedPosts()` — the POSTED
  record's `sf.installScheduledDate` wins, falling back to the latest draft.
  Window = today..today+7 inclusive, sorted by date. Rows with no linked
  date are flagged "No installation date yet" (orange), never hidden.
  The date picker drives ONLY the Design section; the 7-day window always
  starts at today (Aboud's decision, 2026-10-04).
- **Copy report** — plain-text version on the clipboard, e.g.
  `- Lavon Grier - Scheduled Wednesday, 10/07/2026`, ready for Slack.
  Empty sections copy as `- None`.

## Files
- `src/lib/dailyProgress.ts` (new) — pure logic: `addDaysIso`, `designedOn`,
  `scheduledNext7`, `formatDailyReport`
- `src/lib/dailyProgress.test.ts` (new) — 10 tests (TDD, watched fail first)
- `src/components/DailyProgressTab.tsx` (new) — the UI
- `src/App.tsx` — `progress` tab key, Admin sub-tab button, render wiring
- `src/theme.css` — `.daily-progress` block

## Tested
- `vitest run` — **343/343 pass** (28 files), including the 10 new tests:
  date filter, 7-day window boundaries (both ends inclusive), posted-beats-draft,
  draft fallback, no-date bucket, phase/archived/deleted exclusion, month/year
  rollover in `addDaysIso`, exact report text with weekday names.
- `tsc --noEmit` clean, `eslint` clean on all touched files, `npm run build` OK.

## Pending
- **NOT deployed** (Aboud: "don't deploy, we have other stuff to do").
  Deploy is the usual deliberate CLI command when ready.
- Changes are uncommitted (no commit requested).
