# Checkpoint — five board features (2026-11-05)

Branch: `feat/board-automations` (6 commits, **not merged, not deployed**)
Baseline: `main` @ `1f496ca`

Aboud asked for five things. Research reframed two of them before any code was
written — the plan is at `C:\Users\Admin\.claude\plans\i-want-to-build-fluffy-hopper.md`.

---

## What was built

| # | Ask | Commit |
|---|---|---|
| 0 | *(blocker)* 19 dead test files | `9cb96b5` |
| 1 | Force an update on "Pending Update" | `d955cda` |
| 2 | Reviewer column only on Installation Review | `0d3b1be` |
| 3 | Always-ordered board, shared | `7e20973` |
| 4 | Write your own automations | `576bdf1` |
| 5 | "Ask the updates" should read the activity log | `a4a8d05` |
| — | Two bugs only running the app could show | `98ec18e` |

### 0 — The blocker, found first
`npx vitest run` on `main` failed **19 files / 184 tests**, including
`BoardTab.test.tsx` — the exact file features 1–3 needed.

Not jsdom. **Node 26** defines `localStorage`/`sessionStorage` on `globalThis`
as getters returning `undefined` without `--localstorage-file`, and vitest's
`getWindowKeys` skips any key already on the Node global unless it is in
vitest's hardcoded `KEYS` list — which omits `localStorage`. jsdom's working
Storage was dropped on the floor. `src/test-setup.ts` borrows a real Storage
off a throwaway JSDOM (inside a test, `window`, `document.defaultView` and
`globalThis` are all the same object, so there is nothing else to copy from,
and jsdom's `Storage` is an illegal constructor).

### 1 — Any status can require a note
`BoardLabel.requiresNote`, same optional contract as `outOfScope`/`review`: an
explicit tick wins, a by-name default covers "Pending Additional Information"
and "Pending Update" so the live board needs **no migration and no re-tick**.
Gate copy now comes from `lib/updates.statusGate`, so one gate serves every
status. Mobile reads the same helper.

**Hole closed:** the bulk bar's "Set status" called `bulkApply` directly, so
moving 20 rows to a gated status posted *nothing*. One explanation now covers
the batch, in the same single write.

### 2 — Reviewer column scoped
Forced on for the review table, forced off for the other three, and removed
from the "Columns ▾" menu. That made the four tables stop sharing a header set,
so each sizes itself (`sizeVarsFor`) — otherwise the extra column hangs off the
end of its own section. **First test coverage for the Reviewer column at all**;
it shipped 2026-11-03 while the test file was dead.

### 3 — Always-ordered board (shared)
Aboud: *"yess auto-sort, but when it is on it is on for everybodyy not only the
user using it."* So it is `BoardState.prefs`, in the blob, admin-only to flip,
**absent means ON**. Rank is the team's own label `sortOrder`; `position`
descending is the tie-break inside a band. Drag is inert while on, extending
the precedent grouping already set.

**Two things this had to get right or it would have broken production:**
- `boardMerge.PutSchema` is `.strict()` and `putSharedBoard` sends the *whole*
  board — an undeclared `prefs` key would have 400'd **every board save**, the
  exact 37-hour outage recorded at `boardMerge.ts:28`.
- The seed ranks *are* the live ranks. "New project" and "Working on it" still
  carry `SEED_STAMP` (checked against the 2026-11-03 backup), so a re-seed
  reaches them. Without reordering the seed, auto-sort would have sorted **New
  project first** — the opposite of the ask. They now bracket the team's 30–180
  labels at **5** and **999**.

### 4 — Automations
*Built in*: the seven existing behaviours, **described** from the live labels
(not reimplemented), each pointing at the control that tunes it.
*Yours*: `WHEN` status-to / rating-at-least / project-created, optional `IF`
coordinator or phase, `THEN` require-note / set-status / set-phase /
set-coordinator / set-reviewer / post-update. The builder shows the sentence
the rule will read as, live.

**Change triggers only.** No server can run a job here, so a time-based trigger
could only fire when somebody has the board open, and three browsers would each
fire it — needing a dedup table. Change triggers run on the client that made
the change and fire exactly once with no bookkeeping.
**Single pass, no cascade** — the loop guard, and it is tested as one.

### 5 — "Ask the board"
Two lanes in parallel, failing independently. Updates unchanged (a question
about *meaning*). Activity is **query extraction, not retrieval**: the model
turns the English into `{actors, from, to, actions, fields}` and the client
applies it locally and exactly. **Nothing from the 2,589-entry log is
uploaded.** Dates are LOCAL days (`dates.localDateOf`) — activity is stamped in
UTC, so an evening edit in the Americas would otherwise file under tomorrow.
Hallucinated actors/fields are dropped on both sides: a filter narrowed by an
invented name answers *"you did nothing yesterday"*, which someone would believe.

---

## Verified

`67/67 files, 1156/1156 tests` · `tsc --noEmit` clean · `eslint` clean ·
`npm run build` clean.

**Driven live on `netlify dev`** against the local 161-project store:
- A rule saved through the strict PutSchema into the blob and round-tripped.
- Firing it set Design/Schedule *alongside* the status in **one** activity
  entry: `statusId: New project→Ready to submit, phaseId: Design→Schedule`.
- Auto-sort re-ranked the row on the spot; `prefs` stayed absent (= on).
- Status picker lists **Working on it first, New project last**.
- No Reviewer column outside Installation Review.
- "Ask the board" answered *"what were the projects I interacted with today?"*
  with the right row — from the **local parser**, since the AI lane 502'd.

## NOT verified — do these before trusting them

1. **The AI lane.** `activityquery` returns 502 `OPENAI_API_KEY not set` on
   localhost — and so does the pre-existing `updatesearch`, so it is
   environmental, not this code. **Needs a draft deploy** (memory:
   `testing-ai-and-mobile`). Ask it *"what did I interact with yesterday?"* and
   *"which projects have trenching?"* and confirm each answers from the right
   source.
2. **Mobile.** The gate change is covered by a unit test, but the 390px
   same-origin iframe run was not done.
3. **Production deploy.** CLAUDE.md's data-backup rule applies: pull all five
   blobs into `_versions/v34-live-backup-YYYY-MM-DD/`, deploy, pull again, diff.

## Decisions Aboud should confirm

- **Drag is disabled while auto-sort is on.** He never picked between the three
  drag options; this is the smallest honest behaviour and matches grouping.
- **Seed reorder changes the live board's label order** on next sync — which
  also reorders the status picker and Group-by-Status. Intended, and one ↑/↓ in
  Edit labels overrides it forever.

## Local-only side effect

`node scripts/reset-local-password.mjs aboudyousef "local-only-2026"` was run to
sign in to `netlify dev`. It touches only the **gitignored** local blob store,
leaves `updatedAt` alone so it can never win a merge against production, and
wrote a backup beside it. Delete `scripts/reset-local-password.mjs` when done
with it, as its own header says.

---

# DEPLOYED — 2026-11-05

**Live:** `6aeca8d9c77a5315fe1000f7` (replaced `6aea09b4` of 2026-11-03).
Deployed with `netlify deploy --build --prod` — sow is NOT git-connected
(re-verified via getSite: `repo_url` is null), so the CLI is the only path,
and `--build` is what injects the real `VITE_API_PATH_TOKEN` instead of
baking `changeme`.

**First attempt failed** on `getaddrinfo ENOTFOUND api.netlify.com` — a
transient DNS drop, which also stopped the CLI cancelling its own deploy.
Confirmed production was untouched (still `6aea09b4`, state `ready`) before
retrying. Second attempt clean: 18 assets, 12 functions.

## Data backup + diff (CLAUDE.md rule)

- Pre:  `_versions/v35-live-backup-2026-11-05-predeploy/`  — 409 projects, 2847 activity
- Post: `_versions/v36-live-backup-2026-11-05-postdeploy/` — 409 projects, 2848 activity

| Store | Result |
|---|---|
| ahjs, extrawork, users | **byte-identical** |
| board | +1 activity: Anas Yaghmour moved "George Tenberge" Working on it → Done, 16:00:24 |
| records | 3 drafts edited — Omar Rajab 15:41, Anas Yaghmour 15:58, Mohammad Refai 16:05. Count unchanged (371), none added or removed |

**Every difference named and attributable to a teammate working during the
deploy window. No deploy damage.** `labels` byte-identical, confirming the
seed re-rank only lands when a client running the new code syncs.

## Verified live, on production

- New build serving: Auto-sort pill, ⚡ Automations, 💬 Ask the board,
  Installation Review section, rows ranked Working-on-it first.
- **`POST /api/<token>/activityquery` → 200.** Both lanes fired in parallel
  (`updatesearch` 200 + `activityquery` 200), as designed.
- "what did I interact with yesterday?" → **"24 projects you touched on
  2026-11-04. 6 more from updates."** The model resolved "yesterday" to the
  date and "I" to the signed-in user; the client applied the filter exactly.
  Per-project summaries correct, including "changed SOW coordinator, created
  it, deleted it".
- Redesigned Ask panel: padded, sized to content, empty state with both
  lanes labelled, focus lands in the input.

## Still open

1. **The team's board will re-rank on their next load** — the seed re-rank
   puts "Working on it" first and "New project" last, and auto-sort is ON by
   default. Expected and approved, but it is a visible change they have not
   been told about.
2. **Drag is band-constrained** — a row only reorders within its own status
   while auto-sort is on. Confirm that reads right to the team.
3. **Keyboard dragging is unreachable** (dnd-kit `attributes` withheld to
   stop every row announcing as a button). Needs a visible grip to fix.
4. Branch `feat/board-automations` is what shipped — **main does not reflect
   production**. Merge it.
5. Settings still device-local (the sixth-blob job), and
   `_PLAN_supabase_migration.md` Phase 1 (ETag) is the real credit fix.
