# Checkpoint — Board Tier 1 + Extra Work roster fix

> 2026-10-08. Built on Aboud's "go" after `_STUDY_board_benchmark.md`.
> **NOT deployed, NOT committed** — Aboud: "dont deploy until we finish everything."

---

## 1. Extra Work roster fix (the Anas bug)

**Symptom:** Anas opened the Extra Work tab and saw nothing.

**Root cause — two bugs stacked, neither was a missing account:**
- Both accounts existed all along (`ayaghmour`, `yalnabelsi`, created by Aboud 2026-10-02).
  The "create Anas + Ya'rob accounts" line in `_PLAN_extra_work.md` / `_CHECKPOINT_extra_work.md`
  was written from the plan and never checked against prod. Both lines are now struck through.
- The real bug: the roster came from `settings.authors`, which is **localStorage-only and never
  synced**. The shipped default is `['Aboud Yousef', 'Omar Rajab', 'Mohammad Refai']` — Anas and
  Ya'rob were absent on their own devices, and October had no entries to surface them either.
- Secondary: the September import left `username: ""` on 26 of 30 entries, so members could not
  delete or correct their own imported rows (`ExtraWorkTab.tsx` ownership check).

**Fix:** new `extraWorkRoster(me, fallback)` in `src/lib/auth.ts` reads the synced users blob,
excludes deleted users, always includes the signed-in user, falls back to the passed roster when
the cache is empty (offline/first run). Wired at `App.tsx` (computed once) → desktop `ExtraWorkTab`
and `MobileApp` → `MobileHours`. `settings.authors` is untouched and still drives Compose.

**Data repair (STAGED, not applied):** `_versions/v10-extrawork-roster/ew-repaired.json`
— 26 entries backfilled, 0 unmatched, live hours unchanged at 143, no field but `username` touched.
Before-snapshot: `extrawork-blob-BEFORE.json`. Apply with
`npx netlify blobs:set sowpost extrawork --input _versions/v10-extrawork-roster/ew-repaired.json`
**on Aboud's word only.**

---

## 2. Board Tier 1 (from `_STUDY_board_benchmark.md`)

New pure-logic module `src/lib/boardViews.ts` (+ 28 tests) holds the rules; `BoardTab` owns state.
`Filters` / `NO_FILTERS` moved out of `BoardTab` so presets are testable.

| # | Shipped-in-code | Notes |
|---|---|---|
| 1 | **Group by** — none / Status / Coordinator / Design-Schedule | Collapsible headers with colour swatch + count; label order for labels, alphabetical for people, "Not set"/"Unassigned" last; sort order preserved inside each group; choice persisted |
| 2 | **Install date column** | **READ-ONLY** mirror of the linked post, posted-beats-draft (same rule as Daily Progress). Sortable/filterable. Red when past |
| 3 | **Aging signal** | Dot + faint row tint. `overdue` (install date passed) beats `stale` (untouched ≥ 14 days). Reads `updatedAt`, no schema change |
| 4 | **Bulk select + bulk edit** | Checkbox column (doubles as the aging marker), select-all with indeterminate state, sticky navy bar, set Status / Coordinator / Design-Schedule, Undo |
| 5 | **View presets** | All active · Mine · Needs scheduling · Needs attention. A preset REPLACES filters, never stacks. `staleOnly` filter added to back "Needs attention" |

**Deliberate decisions**
- **Install date is read-only on purpose.** Writing it back would invert the locked rule "the board
  controls Compose, never the opposite" (Aboud 2026-10-02). No button, no input, in that cell —
  pinned by a test.
- **Drag-to-reorder is disabled while grouped.** Grouping rearranges rows, so a drag would land
  somewhere the user did not point at — same reasoning as a drag clearing a column sort.
- **Bulk edit is ONE `setBoard`, not a loop over `applyPatch`.** A loop would lose every change but
  the last, because `boardRef` only catches up on re-render. Undo restores each row's own previous
  value, not a shared one — verified live with two rows that started on different statuses.
- Selection spans Completed rows too (when that section is open), and a row filtered off screen is
  dropped from the selection automatically.
- No new dependency. Grouping and selection are hand-rolled over the TanStack table already
  installed; `getGroupedRowModel` was not used because the custom drag + two-table layout make its
  row model a worse fit than grouping the already-sorted rows.

---

## 2b. هري ابو روي returning one paragraph instead of bullets

**Symptom (Aboud, 2026-10-08):** the rewrite button merged the bullets into a single paragraph.

**Root cause:** the guarantee lived only in the prompt. Both prompts said "NEVER merge two lines",
but the model received one multi-line string per note and flattened it anyway — and the rewrite
prompt was the weaker of the two:
- it had **no multi-line worked example at all** (polish had one);
- it still carried polish's contradictory `Fix only: spelling, grammar…` line directly under
  "Your job is a FULL REWRITE";
- it ran at temperature 0.3 against polish's 0.1.

**Fix — moved the guarantee out of the prompt and into code.** New `netlify/functions/lib/rewriteLines.ts`:
each bullet is sent to the model as its **own item** (ids `"0"`, `"1"`, …), so the model never sees a
multi-line string it could flatten; the lines are stitched back by index afterwards. Also:
- a newline the model still slips into a single bullet is folded to a space, so one bullet can
  never become two;
- blank lines are never sent (nothing to edit) and are restored verbatim;
- a missing bullet in the response → 502, so the UI keeps the engineer's raw drafts (spec/07);
- both prompts reframed around "EACH ITEM IS EXACTLY ONE BULLET", the contradictory `Fix only`
  line removed from rewrite mode, and a multi-item worked example added to both;
- `maxTokens` 900 → 1600 (one JSON item per bullet is chattier).

The public request/response contract (`POLISH_KEYS` ids) is **unchanged** — the client was not
touched. New internal `LineResponse` schema covers the model's per-line shape.

Applied to **both** modes on purpose: same bug class, one code path, and it enforces exactly what
polish's line rules already demanded.

**Not yet verified against the live model** — there is no local `OPENAI_API_KEY`, so this can only
be exercised on the deployed site. 14 unit tests cover the split/stitch logic.

## 2c. Daily Progress "Updates" lost on every tab switch

**Symptom (Aboud, 2026-10-08):** text typed into Admin › Daily Progress › Updates disappeared
whenever he changed tabs.

**Cause:** `useState('')` with the comment "Daily throwaway note — deliberately not persisted
anywhere". That was a real decision from the 2026-10-06 session, but `DailyProgressTab` unmounts on
every tab switch, so the note was not throwaway-per-day, it was throwaway-per-click.

**Fix:** new `src/lib/dailyUpdates.ts` — per-date, device-local, never synced (it is one admin's
scratch pad). Written **synchronously on every keystroke, deliberately NOT debounced**: the tab can
unmount at any moment and a pending timer would take the last characters with it. Moving the date
picker swaps in that day's own notes; clearing the box deletes the entry rather than storing `""`;
the store is pruned to the 30 most recent days. 9 unit tests.

## 2d. Mobile: every card clipped on the phone

**Symptom (Aboud, 2026-10-08, Safari/iPhone, 3 screenshots):** on Drafts, Extra Work and Admin,
card content was sliced — names cut through the middle of the letters, L1/L2/L3 pills cut in half,
subtitles missing.

**Cause — one CSS bug, four screens.** `.m-list-scroll` is `display: flex; flex-direction: column`
with `overflow: auto`. Its children inherit `flex-shrink: 1`, so as soon as the content is taller
than the screen the browser **squashes every child**, and `.m-card { overflow: hidden }` clips the
squashed content. A short list never overflows, so it looked perfect in review — his Drafts tab has
**83 entries**.

**Fix:** `.m-list-scroll > * { flex-shrink: 0 }`.

**How it was verified — reusable technique.** Chrome ignores `resize` on a maximized window, so the
≤480 px shell could not be reached that way. Instead: mount a **390×844 same-origin iframe** of the
app inside the page. An iframe gets its own viewport, so `matchMedia('(max-width: 480px)')` matches
for real and the genuine mobile shell renders (confirmed `innerWidth: 390`, shell mounted). Same
origin ⇒ same localStorage, so it can be seeded.

Seeded **84 drafts** to match his phone, then measured at a true phone viewport:

| | Card height |
|---|---|
| Natural (unconstrained) | 103.3 px |
| **With the fix** | **103.3 px** |
| Rule forced back to `flex-shrink: 1` | **28 px** |

At 28 px the screen reproduced his screenshot exactly — names sliced through the letters, L1/L2/L3
pills cut in half, meta lines gone. All three screens he reported were then confirmed fixed:
Drafts (full names + pills + meta), Admin (all 5 roster rows and both region leads render, where he
saw one row and an empty card), Extra Work (full salary hint instead of a cut line).

All four mobile screens (Drafts, Hours, Admin, AHJ) render inside `.m-list-scroll`, so the single
rule covers them.

Test data cleaned up afterwards; **production verified untouched** — 106 real records, 0 synthetic
ids (`netlify dev` uses a local sandbox blob store, not prod).

## 2e. Bug hunt (14 agents: 6 reviewers → adversarial verification)

23 raw findings → 22 deduped → 8 verified adversarially → **4 confirmed, 4 refuted**. The refuters
killed half the claims, which is the point of the pass.

**Confirmed and fixed:**
1. **Select-all used a stale row set** (`BoardTab.tsx`). The header checkbox lives inside the
   `columns` useMemo and closed over an old `shown`: filter to 1 row → select-all ("1 selected") →
   clear the filter → **"4 selected"**, and a bulk edit wrote 3 projects never selected. Fixed with
   a ref. The existing test harness passed `authors` as a fresh array each render, invalidating the
   memo and **accidentally hiding this**; added `StableHarness` matching what App.tsx really does.
2. **Collapsed groups were still selectable.** `shown` honoured `doneOpen` but ignored collapsed
   GROUPS, so select-all + Set status silently moved teammates' invisible rows. `shown` now honours
   all three hiding mechanisms (filters, Completed collapsed, group collapsed).
3. **Daily Updates prune discarded the note being typed** when editing a date older than the 30
   stored days. The edited day now always survives the prune.
4. **Users cache froze at last login** — sessions never expire, so a member's roster could be weeks
   stale. Now refetched on mount and on window focus, with a `usersStamp` so the memo recomputes.

**Refuted:** bulkApply reviving archived rows · aging flagging Done projects forever · maxTokens too
small · one missing bullet discarding the whole rewrite.

**Accepted as intended by Aboud:** everyone can export everyone's hours.

## 2f. Mobile: admin logged a teammate's hours onto their own log

`MobileHours.submit()` hardcoded `{ username: myUsername, person: me }`, ignoring the selected
person — so an admin who drilled into a teammate's log and tapped "+ Log hours" had the entry
recorded against **themselves**. Desktop already did this correctly
(`isAdmin ? (sel ?? me) : me`); mobile now matches, and the 14-day "already logged" dots and reuse
chips follow the target person too. Regression test confirmed failing before the fix.

## 2g. Internal notes (approved 2026-10-08)

`PostRecord.internalNotes?: string` — team-visible via the normal record sync, **never in the post
and never sent to the AI**. Both guarantees are pinned by tests: post text byte-identical with and
without notes (including the `manualText` path), and `internalNotes` is not a `PolishKey`, so no AI
path can reach it. UI: last card in Compose, "Only your team sees this — never posted to Slack."

## 2h. Requirements split + SOW General Notes

Design and rationale: **`_PLAN_requirements_split.md`**. Built as designed:

- `RequirementKind = 'ahj' | 'utility' | 'funding' | 'general'` on the existing `Ahj` entity.
  **Blob key stays `ahjs`, `mergeAhjs` untouched** — no new sync path, and every existing board
  works with `kind` simply absent (`kindOf()` defaults to `'ahj'`). Verified live: a board with no
  `kind` lands in the AHJ tab.
- Matching per kind: AHJ→`sf.jurisdiction`, Utility→`sf.utility`, Funding→global, General→never.
- `utilityApprovedId` / `fundingApprovedId` alongside the untouched `ahjApprovedId`, same
  self-un-approving contract.
- Post prints up to three sections in order AHJ → Utility → Funding. **An AHJ-only post is
  byte-identical to before the split** (pinned by a test).
- UI: `AHJ Requirements` → **`Requirements`** with sub-tabs AHJ / Utility / Solrite-Funding, plus a
  new **`SOW Notes`** main tab. The three requirement kinds share one component parameterised by
  kind (heading, item noun, plural, subtitle), fed a per-kind slice with a `replaceKind` setter.
- **SOW Notes is ONE panel, not a set of boards** (Aboud, after first seeing it): its own
  `SowNotesTab` — composer + note list (edit / pin / delete-with-undo) + Export PDF, no sidebar, no
  board names or aliases. It still rides the `Ahj` entity (`kind: general`, fixed id
  `sow-general-notes`) so it needs no new store or sync. The fixed id means two people writing the
  first note at once converge on one board; if several general boards ever exist, the first live
  one wins and the rest lie dormant rather than erroring.
- **Clobbering risk verified live**: posting on the Utility tab left the AHJ, Funding and General
  boards intact, and the legacy un-kinded board kept its absent kind.
- Mobile's AHJ tab narrowed to AHJ-kind boards only.

## 2i. Export PDF on every requirements board

"Export PDF" prints the selected board — heading, aliases, requirement count, export date, and each
live requirement with its author/date (deleted ones omitted). Reuses the Extra Work print technique
(`visibility` toggling, NOT `display:none` on ancestors — that blanked a report once on 2026-10-07)
and adds `break-inside: avoid` so a requirement never splits across pages.

The print block is mounted **only while printing**, via `flushSync`. Leaving it in the DOM would
duplicate every requirement for screen readers — and it broke four existing tests, which is how it
was caught.

## 3. Tested

- **523/523 tests, 37 files** (was 430/34). New this session: `boardViews` 28, `BoardTab — Tier 1` 14,
  `extraWorkRoster` 7, mobile regressions 2, `rewriteLines` 14, `dailyUpdates` 11,
  requirement kinds 6, requirement sections 8, internalNotes 3, utilities roster 3, Export PDF 4.
- tsc + eslint + vite build + check-no-secrets all clean. exceljs chunk-size warning is expected.
- Both new regression tests were confirmed to FAIL against the old code before the fix.
- **Visually verified in Chrome at 1500px** on seeded data: presets row, group-by select, grouped
  headers with counts, aging dots, read-only install dates, bulk bar, live bulk apply + Undo.
  No console errors. One CSS bug found and fixed that way — `.board-install-cell` had
  `margin-top:16px` copied from the name cell and sat a line lower than Designed date; it now
  mirrors `.board-date` exactly.

Backups: `_versions/v10-extrawork-roster/` (roster fix), `_versions/v11-board-tier1/` (board),
`_versions/v12-rewrite-bullets/` (rewrite fn + schema).

---

## 4. Owed / open

- **Deploy + git commit — Aboud's word only.** Working tree is dirty with both changes.
- **Apply the staged Extra Work data repair to the prod blob** — his word only.
- The board is now 9 columns and scrolls horizontally sooner at 1500px (Rating/Post clip).
  Hiding a column via `Columns ▾` is the escape hatch; worth his opinion.
- Tier 2 (not started, pick at most one): per-row Updates thread · calendar/month view ·
  dashboard tiles · Kanban-by-status.
- Still owed from before: real-phone smoke test, AI-prompt feedback, the four live AI checks,
  the AutoCAD "Copy all 5" paste question.
