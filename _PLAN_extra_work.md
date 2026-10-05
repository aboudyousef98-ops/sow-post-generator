# Plan — Extra Work Tracker (replaces `Extra Work Tracker.xlsx`)

> Approved by Aboud 2026-10-06 ("go with A, do the structure").
> UI visual design arrives later from a Claude Design handoff — this build is the
> STRUCTURE: data, sync, logic, exports, and a plain functional UI with stable
> `.ew-*` class names ready to be re-skinned.

## What it replaces
`Extra Work Tracker.xlsx` — one sheet per person (`Date | Day | Day type |
Extra hours | Description of work` + a stats header), a Summary sheet, and a
monthly hand-made report file (`Extra Work Summary - SOW Team - <Mon YYYY>.xlsx`)
sent to the company. The report file is just a month-slice of the tracker with
the same per-person layout (cols A–D width 30, E width 95, dates `yyyy-mm-dd`,
hours `0.0`, name in A1, stats rows 5–6, table header row 7).

## Decisions (Aboud, 2026-10-06)
- Lives as a new **main tab "Extra Work"** in the SOW site (not a separate site).
- **Everyone sees all entries; each person edits/deletes only their own; admin
  edits anyone's.** Client-side enforcement, same trust model as the rest of the app.
- Report export: **both** real `.xlsx` (matching the company file) and **PDF**
  via a print view + browser print-to-PDF.
- Day type is **automatic: Sat+Sun → Weekend, else Weekday** (confirmed twice —
  the TEMPLATE sheet's Fri=Weekend example is wrong), with a per-entry
  **override** (Weekday/Weekend/Holiday) for exceptions.
- Mobile: the entry form is the mobile priority — one column, big targets.

## Noted-not-asked (reasonable defaults, flag if wrong)
- **Holiday hours count in the Weekend column** of stats/summary (the company
  format has only Weekday/Weekend columns; Total = Weekday + Weekend must hold).
- Report sheets ordered **alphabetically by display name**.
- The report `.xlsx` contains **per-person sheets only** (the company file has
  no Summary sheet — matched exactly).
- **No import of the old Excel history** (question asked, unanswered) — site
  starts fresh; an import step can be added later.
- Anas Yaghmour and Yarob Alnabelsi need accounts (Admin → Users) before they
  can log entries. Not seeded in code.

## Data model (`src/extrawork/types.ts`)
```ts
ExtraWorkEntry {
  id: string;                 // uuid
  username: string;           // owner (stable key, matches TeamUser.username)
  person: string;             // display name at entry time (what reports print)
  dateIso: string;            // 'YYYY-MM-DD'
  hours: number;              // > 0, 0.5 steps
  description: string;
  dayTypeOverride: 'weekday' | 'weekend' | 'holiday' | null;  // null = automatic
  createdAt / updatedAt: string;  // ISO timestamps; updatedAt is the merge key
  deletedAt?: string;         // tombstone — deletes must win merges
  schemaVersion: 1;
}
ExtraWorkState { entries: ExtraWorkEntry[] }
```

## Architecture (copies the board/records pattern exactly)
- **Server** `netlify/functions/extrawork.mts`: guard → GET/PUT on
  `getStore('sowpost')` key `'extrawork'`, CAS retry ×5, merge imported from
  `src/lib/extraWork.ts` (the `ahjs.mts` precedent, so the server merge is unit-tested).
- **Route** `netlify.toml`: `/api/:token/extrawork` block above the SPA fallback.
- **Client api** `src/lib/api.ts`: `fetchSharedExtraWork()` / `putSharedExtraWork()`
  (wrapped `{entries}` like records).
- **Cache** `src/lib/storage.ts`: `KEY_EXTRAWORK = 'sowpost.extrawork'`,
  merge-on-write `loadExtraWork()`/`saveExtraWork()`.
- **App wiring** `src/App.tsx`: 4th synced store — state, `storeSync` entry,
  debounced push (1500 ms), mount sync leg, included in the 15 s poll + focus pull.
- **Pure logic** `src/lib/extraWork.ts`: `emptyExtraWork`, `mergeExtraWork`
  (last-write-wins by `updatedAt`, tombstones win), `newEntry`, `patchEntry`,
  `dayTypeFor(dateIso, override)`, `monthKey`, `entriesForMonth`,
  `personStats` (total/weekday/weekend/days logged), `monthSummary`.
- **Reports** `src/lib/extraWorkReport.ts` (pure: rows + stats per person for a
  month) and `src/lib/extraWorkXlsx.ts` (builds the workbook with **exceljs**,
  `import()`-ed on click so the main bundle stays small). PDF = print-only view
  of the same report data + `window.print()`.
- **UI** `src/components/ExtraWorkTab.tsx` (props: `state, setState, me,
  myUsername, isAdmin, toast`): entry form on top (date=today, hours, description,
  collapsed override), month picker, my entries (edit/delete), team entries
  (read-only unless admin), summary table, `Download Excel` + `PDF` buttons.
- **CSS** `src/theme.css`: `/* Extra Work */` block, `.extra-work` wrapper,
  `.ew-*` classes, `@media (max-width: 520px)` form rules, `@media print` block.

## Task list
1. ✅ Spec (this file)
2. ✅ Types + pure lib with tests (TDD)
3. ✅ Report builders with tests (TDD)
4. ✅ Storage keys + server function + netlify.toml + api.ts
5. ✅ ExtraWorkTab component + jsdom test (rebuilt to the design handoff same night)
6. ✅ App.tsx wiring (+ integration test stub), theme.css block
7. ✅ exceljs dependency + xlsx module (readback-tested)
8. ✅ Full gate 417/417 — **deploy still waits for Aboud's word**
9. ✅ `_CHECKPOINT_extra_work.md` (+ `_CHECKPOINT_design_handoff.md` for the
   desktop redesign, Settings v2 and the iPhone shell, incl. mobile Hours)

Post-spec changes (Aboud, same night): whole hours only (no 0.5 steps);
holiday split into its own column on screen (folded into Weekend in the
company .xlsx); delete+Undo instead of row editing; members see only their own
log; overtime pay calculator (salary/30/8 × 1.5, local-only storage).

Backups of modified files → `_versions/v9-extra-work/` (new files need none).
