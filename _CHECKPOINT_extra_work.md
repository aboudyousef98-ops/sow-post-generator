# Checkpoint — Extra Work tracker (2026-10-06/07, overnight build)

> **Morning session 2026-10-07 (Aboud testing live on localhost):**
> - **September history IMPORTED** from the company summary file via
>   `scripts/import-extrawork.mjs` (30 entries, deterministic ids
>   `sep26-<person>-<date>-<n>`, totals verified: 37/40/20/6/40 h) — into BOTH
>   the local dev store and the **production** blob (`netlify blobs:set`), so
>   the data is live the moment he deploys. Two Aug-9 rows keep their sheet's
>   Weekday type as overrides. Usernames blank except Aboud (accounts pending).
> - **Calculator for ALL employees** (not just own log): salary remembered per
>   person, still device-local only. Desktop + mobile.
> - **Per-member .xlsx export** — "Download .xlsx" on every person log
>   (desktop) + "Export .xlsx" on mobile My-hours; file
>   `Extra Work - <Person> - <Mon YYYY>.xlsx` via personReport/personFileName.
> - **PDF print fixed** — was a blank page (display:none on ancestors killed
>   the nested print block); now the visibility technique + collapsed #root.
> - **Excel "nice format"** — navy header band, colored day-type cells
>   (app label colors), borders, bold hours, frozen header rows.
> - **Daily Progress**: live "How it reads in Slack" preview panel
>   (dp-preview), report bullets now `•` not `-`, empty Updates section is
>   omitted entirely. Salary placeholder removed from the calculator.
> - Gate after all of it: **422/422 tests (34 files)**, tsc, lint, build clean.
> - Still NOT deployed / NOT committed — his word.

Replaces `Extra Work Tracker.xlsx`. Built in one overnight run on Aboud's
"finish everything without approval"; **NOT deployed, NOT committed** — both
wait for his word. Spec: `_PLAN_extra_work.md`. Design mocks:
`../design-handoff/` (Extra Work - Desktop.dc.html + SOW Tool - iPhone.dc.html).

## What was built

### Data + sync (the structure)
- `src/extrawork/types.ts` — `ExtraWorkEntry { id, username, person, dateIso,
  hours, description, dayTypeOverride, deletedAt?, createdAt, updatedAt,
  schemaVersion }`; day name/type always COMPUTED (Sat+Sun → weekend, override
  stored only when it differs).
- `src/lib/extraWork.ts` — pure logic: dayTypeFor, isValidHours (**whole hours
  1–24**, design decision), newEntry/patchEntry (tombstone deletes),
  mergeExtraWork (LWW by updatedAt), month helpers, personStats
  (total/weekday/weekend/**holiday**/days — distinct dates), overtimePay.
- `netlify/functions/extrawork.mts` — store `sowpost` key `extrawork`, CAS ×5,
  merge imported from the client lib (ahjs.mts precedent). Route added in
  `netlify.toml`. Client: `fetchSharedExtraWork`/`putSharedExtraWork` (api.ts),
  `sowpost.extrawork` cache (storage.ts, merge-on-write), 4th synced store in
  App.tsx (mount sync + 15 s poll + 1.5 s debounced push + sync pill).

### Desktop tab (per the design handoff)
`src/components/ExtraWorkTab.tsx`: sidebar (Team summary Σ + per-person rows
with weekday/weekend/holiday stacked bars + legend), 4 stat tiles, payroll
summary table (Employee/Total/Weekday/Weekend/**Holiday**/Days + TOTAL) on
Team summary, person log with inline add row (date, auto day-type select with
"(overridden)" note, whole-hours input, description, quick-fill chips from the
person's own recent descriptions), instant delete + Undo toast (tombstone ↔
revive). Month ‹ › switcher; Copy summary (clipboard text block).
**Members open only their own log; admins open anyone's** (sidebar + summary
stay visible to all). Admin logging for someone else resolves the username
from the cached roster.

### Overtime pay calculator (Aboud, mid-build request)
On your OWN log only: enter monthly salary → daily = /30, hourly = /8,
pay = 1.5 × month's extra hours × hourly, shown instantly ("1550 → 6.46 JOD/h").
Salary is stored **locally only** (`sowpost.ewSalary.<username>`), never synced.

### Reports (both, per Aboud's original ask)
- **Excel** `src/lib/extraWorkXlsx.ts` + exceljs (lazy `import()` — not in the
  main bundle): one sheet per person, exact company layout (name A1, stats
  rows 5–6, header row 7, cols A–D 30 / E 95, dates yyyy-mm-dd, hours 0.0).
  File name `Extra Work Summary - SOW Team - <Mon YYYY>.xlsx`.
  **Company file keeps only Weekday/Weekend stats — holiday hours fold into
  Weekend there** (the Day type cell still prints Holiday).
- **PDF**: print-only view + browser print-to-PDF (body.ew-printing CSS).

## Tested
- 417/417 tests, 33 files. New: extraWork (16), extraWorkReport (3),
  extraWorkXlsx readback (1, 60 s cold-start timeout), ExtraWorkTab (10),
  mobile shell (6). tsc + eslint + build + nosecrets clean.
- Build warns about the exceljs chunk size — expected, it loads on demand.

## Pending / owed
- **Deploy + git commit — Aboud's word only.**
- ~~Anas Yaghmour + Ya'rob Alnabelsi accounts (Admin → Users) before they can log.~~
  **Not needed — both accounts already existed** (`ayaghmour`, `yalnabelsi`,
  created 2026-10-02); verified against the live `sowpost/users` blob 2026-10-08.
- Old Excel history NOT imported (question was never answered) — October starts
  fresh; an import can be added later.
- Visual pass on the real phone + Claude Design re-skin feedback loop.

Backups: `_versions/v9-extra-work/` (pre-change App/api/storage/theme/toml/pkg).
Mobile Hours flow is in `_CHECKPOINT_design_handoff.md`.
