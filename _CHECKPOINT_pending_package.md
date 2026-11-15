# Pending feature package — NOT DEPLOYED

> Aboud 2026-11-06: "dont deploy btw, we will save this, do a package of
> features, then we deploy."

Running list of work that is finished and tested locally but deliberately
**not shipped**. Deploy the whole package at once, following the live-data
backup rule in `CLAUDE.md` §"Deploy rule".

> **2026-11-11: items 1 and 2 SHIPPED** in deploy `6af42a21` ("yalla
> deployyyy") — all 5 stores byte-identical, `main` merged and pushed. They
> stay below as the record of that package. **Item 3 onward is the NEW
> pending package.**

> **2026-11-15: items 3–11 SHIPPED** in deploy `6afa1986` (his "yalla
> deployyyy", 23:45). Backups `_versions/v40-live-backup-2026-11-15-predeploy/`
> and `v41-…-postdeploy/` — **all 5 stores byte-identical**. Verified on prod:
> new client served (mode cards, Active Projects collapse, 💬 chips, Trench
> checkbox, Permissions); `columnPerms` round-tripped through the new server
> PutSchema (set → stored in blob → reverted); seeded Pre-Design labels
> landed and coexist with the team's own manual "Pending Additional
> Information" status label; **AI reminders fired live** (Polish on a
> throwaway draft matched a real SOW Note about exterior conduit — dialog
> rendered, draft deleted after). The package list stays below as the record.

---

## 1. Board width — wide page cap (2026-11-06) ✅ done, tested

**Ask:** "why dont we have this window wide to the red rectangle?"

**Diagnosis.** Two nested caps, and the inner one was the real culprit:

| Element | Cap | Effect |
|---|---|---|
| `main.page` | 1360px | ~640px of empty margin on a 2000px screen |
| `.list-page` (board borrows it) | **1100px** | clipped **528px** of table off the right |

So the table was scrolling three columns (`Post`, `Last update`, part of
`Updates`) out of sight while the page still had 260px of unused room.

**Measured, not guessed:**
- active table natural width = **1628px**
- Installation Review table = **1798px** (carries the extra Reviewer column)
- → **1900px** clears both with room to spare

**Change (3 files, +49/-1):**
- `src/theme.css` — new `.page.page-wide { max-width: 1900px }`
- `src/theme.css` — new `.list-page.board-page { max-width: none }`
- `src/App.tsx:944` — `className={tab === 'board' ? 'page page-wide' : 'page'}`
- `src/App.board.test.tsx` — test: only the Board tab gets `page-wide`

**Deliberately scoped to the Board.** Compose / Requirements / SOW Notes are
forms and prose and keep the 1360px reading width; Drafts and History keep
1100px. Not `max-width: none` — on an ultrawide a 3000px row puts "Project
name" and "Last update" a desk apart and scanning gets worse.

**Verified at 1978px viewport:**

| | before | after |
|---|---|---|
| active table clipped | 528px | **0** (232px spare) |
| review table clipped | ~232px | **0** (62px spare) |
| wasted page margin | 339px | 78px |
| Compose `main.page` | 1360px | **1360px — unchanged** |
| Drafts `.list-page` | 1100px | **1100px — unchanged** |

Full gate green: `vitest run --no-file-parallelism` → **67 files, 1206 tests**.
`tsc --noEmit` clean.

**On a laptop this is inert** — the narrower viewport wins and the table
scrolls exactly as before.

---

## 2. Wire material check — AL vs CU (2026-11-11) ✅ done, tested

**Ask:** Solrite keeps rejecting projects — *"the wires presented on the
submitted evidence (Al) do not match the ones described on the latest planset
submission (Cu)"*. The material legitimately changes after the elevation
review; what was missing is that nothing in the handoff ever **said so**, so
the planset in Salesforce was never updated.

**Change.** Two dropdowns in Compose (what the design SLD shows, what the BOS
will install) produce one **derived** bullet that leads Design Feedback in
both the Slack post and the SF field. A third optional dropdown (service
rating) makes the ask name the conductor size from NEC Table 310.12.

Full detail, including the decisions taken and what was deliberately left out:
`_CHECKPOINT_wire_material_check.md`.

**Files (+6 new, 6 touched):** `src/lib/wireMaterial.ts`,
`src/components/WireCheckRow.tsx`, their tests, plus `src/types.ts`,
`src/lib/template.ts`, `src/components/ComposeTab.tsx`,
`src/components/OutputColumn.tsx`, `src/theme.css`.

**No required gate** — Aboud 2026-11-11: *"we dont use Required on this
website"*. Visibility replaces it: an amber advisory row in the readiness card
that never flips `ready`. Pinned by `OutputColumn.readiness.test.tsx`.

Full gate green: `vitest run --no-file-parallelism` → **69 files, 1250 tests**.
`tsc --noEmit` and `eslint` clean. Driven in the real app on `localhost:8888`.

---

## 3. Trench checkbox — NEC 300.5 depth note (2026-11-12) ✅ done, tested — PENDING

**Ask (Slack #design-sow-team, 2026-11-12):** Jamal — electricians might not
follow the burial code and inspections fail; Omar — "We will start adding
this in our elevations and submission notes going forward". Aboud: a
`[] Trench?` checkbox; ticked → one sentence in the planning stating the
trench depth.

**Change.** `trench?: boolean` on `InstallNotes` (optional — the
panelFacesFront no-migration contract). A "Trench?" checkbox in Compose under
the Conduit raceway subhead. Ticked → the fixed `TRENCH_LINE` sentence
renders LAST under the **Conduit Raceway** bullet, and alone it still makes
the bullet appear. One source (`conduitRunLines`) feeds the Slack post AND
the SF "Installation Window and Planning" blob, so they can never disagree.
Not a PolishKey — the AI can never reword the code reference. No
`missingRequired` gate (standing rule).

**The sentence** (NEC Table 300.5 col 3; 18" is COVER to the TOP of the
conduit — Aboud's thread; 24" under driveways — Abdallah):

> A trench is required for the underground conduit run — minimum 18" of
> cover from finished grade to the top of the conduit per NEC Table 300.5
> (24" under driveways), so the trench depth must be at least 18" plus the
> conduit diameter.

(Revised twice and **APPROVED by Aboud 2026-11-13**: 2026-11-12 "indicate
that we are referring to the depth of the trench" → the word "depth" made
explicit, pinned by a test; 2026-11-13 the `(e.g. a 20" deep trench for a
2" conduit)` example removed — "remove this and save the rest, park it,
i will deploy later".)

**Files (6 touched):** `src/types.ts`, `src/lib/installNotes.ts`,
`src/components/InstallNotesCard.tsx`, `src/lib/record.ts` (hasContent —
trench-only drafts autosave), + pins in `installNotes.test.ts`,
`template.test.ts`, `sfSubmission.test.ts`, `record.test.ts`.

Full gate green: `vitest run --no-file-parallelism` → **69 files, 1258
tests**. `tsc --noEmit` and `eslint --max-warnings 0` clean.

---

## 4. Pre-Design board section + SVT pre-design compose tab (2026-11-15) ✅ done, tested — PENDING

**Ask (Aboud 2026-11-15, after the #sow-svt-collab taskforce kickoff):** SOW
posts a pre-design analysis within hours of the site survey, before design,
so SVT/CLR can make scheduling decisions. Board: a "Pre-Design" group between
the active table and Installation Review, with its own per-project sub-status
(Working on it / Done / Pending Additional Information / Pending Updates).
Compose: a second tab "SVT — Pre-design" (battery-location HO agreement +
alternatives, likely conduit path, upgrades, shared site facts, two-day flag)
producing a formatted SVT post. Research base: `_STUDY_predesign_svt.md`
(Slack reading + 402 records mined for the path vocabulary).

**Board.** 5th section `preDesign` in `splitSections` (flag `predesign?` on
BoardLabel, by-name default `pre-design`/`predesign` — the isReviewLabel
recipe). New label column `columnKey:'predesign'` + `BoardProject.
preDesignStatusId`; the column renders ONLY in the Pre-Design section (the
Reviewer scoping contract). Seeds (NOT system labels, archivable): status
`Pre-Design` (#66CCFF, rank 175 — just before Installation Review) + the 4
sub-status labels, `Working on it` default. The seed-merge machinery delivers
them to the live board on first load after deploy — no migration. Setting a
row's status to Pre-Design auto-seeds the sub-status to Working on it.
EditLabelsModal: a `pre-design` flag on status labels (mutually exclusive
with done/review/out-of-scope) + full label editing for the new column.

**Compose.** Form mode toggle `SVT — Pre-design | SOW — Full scope`
(per-device, `sowpost.composeMode.v1`); both tabs edit the SAME draft, so
shared fields (battery location, walls, stories, services, roof material,
disconnect duration, special cases) are typed once — pre-design work
pre-fills the full SOW compose, no sync layer. New `svt?: SvtNotes` on
PostRecord (no-migration contract): HO-agrees tri-state + location/reason,
2 fixed alternative slots (location+reason each), 5 path ticks
(Back-to-back / Attic run / External run / Trench (underground) / Existing
solar tie-in), path notes, two-day flag. 7 new PolishKeys (`svt.*`) on client
AND server schema (sync test green); ticks and derived sentences are not
polishable. hasContent extended so an svt-only draft autosaves.

**Output.** `src/lib/svtPost.ts` — the SVT post builder. Header
`*Pre-Design Analysis — <name>*` + `kW | jurisdiction | utility`, bullets:
Battery Location (the SAME "Batteries will be installed…" sentence the SF
field prints, then the HO answer, then alternatives) → Most Likely Conduit
Path → Installation Notes (the SOW post's own `installNoteLines`, battery
location and "anything else" omitted) → Scheduling (`TWO_DAY_LINE`, Issam's
CLR GANTT flag). Rendered by the SOW post's own renderers
(`renderItemsText/Html`, extracted from template.ts — formats can never
drift). OutputColumn `mode` prop: SVT mode = readiness card + one
"Copy SVT post" button (dual-format clipboard, same 4 required fields,
Ctrl+Shift+C) + live preview; no SF panel, no note check, no Mark as posted.

**Files:** new `src/lib/svtPost.ts` (+test), `src/components/SvtCard.tsx`,
`src/components/OutputColumn.svt.test.tsx`; touched `src/types.ts`,
`src/lib/{installNotes,record,template,board,boardViews}.ts` (+tests),
`src/board/{types.ts,BoardTab.tsx,EditLabelsModal.tsx}` (+BoardTab test),
`src/components/{ComposeTab,OutputColumn}.tsx`, `src/theme.css`,
`netlify/functions/lib/rewriteSchema.ts`.

Full gate green: `vitest run --no-file-parallelism` → **71 files, 1290
tests** (+32 new). `tsc --noEmit` and `eslint --max-warnings 0` clean.
Driven end-to-end in the real app on `localhost:8888`: status → Pre-Design
section with auto-seeded sub-status, all 4 sub-status picks, SVT tab fill
(HO disagreement, alternative, path ticks, two-day), live preview, copy
toast, SOW tab unchanged with the shared battery location flowing into the
SF field. Demo data left on the LOCAL blobs (Chad Trader in Pre-Design;
Jasmine Fowler draft carries a filled SVT block) for Aboud's own click-through.

**Open (awaiting Aboud):** SVT post wording/section review; whether the
pre-design "Trench (underground)" tick should also pre-tick the SOW trench
box; mobile board shows no Pre-Design section (same as Installation Review).

---

## 5. Compose UX round + include-fix + polish reminders (2026-11-15) ✅ done, tested — PENDING

**Asks (Aboud 2026-11-15, screenshot review of item 4 on localhost):**

1. **Bigger mode buttons.** The SVT/SOW toggle chips became two large mode
   cards at the very top of the Compose page (`.compose-mode-switch` /
   `.mode-card` in theme.css): bold title + subtitle, active card filled
   orange. Moved OUT of the form column to page level.
2. **Aluminum banner removed.** "remove the warning that is popped in yellow,
   it presents in each compose and it is not relatable" — the 2026-10-20
   aluminum-wiring banner fired for every jurisdiction on Othman's 509-row
   list with the same generic sentence. Banner deleted from ComposeTab; the
   list/matcher stay in `lib/aluminumWiring.ts` (own tests untouched);
   `ComposeTab.aluminum.test.tsx` now pins the REMOVAL.
3. **Include checkboxes now reach the SF panel.** They appended requirement
   sections to the Slack post only — `buildSfSubmission` never read them,
   which read as "the checkbox is not working" once SF per-field became the
   submission path. Fix: `buildSfSubmission(record, settings, ahjs?)` appends
   `requirementSections()` (the Slack post's own source) after the clearance
   line of the "Installation Window and Planning" blob, underlined + dashed
   like the other sections; multi-line requirements indent under their dash.
   Readiness card already said "appended" — now the blob agrees.
4. **Polish-time AI reminders.** Clicking Polish now also runs the pre-post
   note check (same `noteCheck` endpoint + `eligibleNotes` +
   `triggerIsGrounded` evidence verification) against the post AS POLISHED —
   the SVT post when the SVT tab is open, the SOW post otherwise — and pops a
   NON-BLOCKING "Reminders — N requirement notes may apply" dialog ("Got it"
   dismisses). No keyword fallback, silent on AI failure: reminders are
   advisory, never an error, and nothing is gated.

**Files:** `src/components/ComposeTab.tsx` (+`ComposeTab.reminders.test.tsx`
new, `ComposeTab.aluminum.test.tsx` rewritten), `src/lib/sfSubmission.ts`
(+test), `src/components/SfSubmissionCard.tsx`,
`src/components/OutputColumn.tsx`, `src/theme.css`.

Full gate green: `vitest run --no-file-parallelism` → **72 files, 1296
tests**. `tsc --noEmit` and `eslint --max-warnings 0` clean. Verified on
`localhost:8888`: mode cards render, banner gone, ticking Include appends
"AHJ Requirements (Harris County)" to the window blob. **The live reminders
dialog could NOT be exercised locally (no OpenAI key in the local env —
Polish is disabled); the mocked component test pins the wiring. Verify the
real AI pass after deploy, same as every AI feature.**

---

## 6. Pre-deploy audit pass (2026-11-15) ✅ done — commit `6bf15a5`

Aboud: "please make full review and audit before we deploy, and make sure
UI/UX is perfect". Two adversarial reviews (correctness/data-safety, UX/a11y)
over the whole `f6fdd95^..HEAD` range + a hands-on browser pass.

**Verdict: NO BLOCKERS.** Confirmed clean (evidence, not hope): the 5 new
seed labels collide with nothing on the live board (checked against the v39
backup by id, name, and sortOrder — 175 lands in the free 170/180 gap) and
can never resurrect an archive or beat a user edit; old clients merge the new
labels/fields untouched and simply show Pre-Design rows in the active table
until they refresh; every new record/board field honors the no-migration
contract; client/server polish keys match in content AND order; Slack text,
Slack HTML, and the SF blob are byte-identical for any record without the new
fields (renderer refactor verified verbatim); an svt-only draft autosaves.

**Fixed from the audit** (all in `6bf15a5`, each pinned by a test where it
can be): the SVT post leaked the "Anything else" box (missing omit check);
sub-status seeding was cell-pick-only → now central `withPredesignDefault()`
(bulk, gate, automations, mobile); reminders could pop for the WRONG record
after a draft switch mid-AI-round-trip → id guards; reminders modal gained
dialog role/autofocus/Escape; mobile board gained the Pre-Design section;
Edit-labels status rows overflowed (6 flags squeezed the rename input to
zero width) → flags on their own line + `.modal.board-labels`; SVT-mode
readiness card now describes the SVT post (3 advisories) instead of
SOW-stage rows with a dead wire advisory; include-requirements checkboxes
say "…in the full SOW post (not this SVT post)" in SVT mode; mode cards
navy-on-orange (5.04:1 AA — white was 2.33:1), aria-pressed group semantics,
focus ring, narrow-width stack, boot-skeleton bones; chips restored on
shared boxes in the SVT tab; copy nits (Pre-Design casing, Homeowner,
"Gantt chart").

**Accepted, not fixed (known + reasoned):** renaming the "Pre-Design" status
label drops the by-name section match unless the `pre-design` flag is ticked
(identical contract to Installation Review); Installation Review rows remain
unlisted on mobile (pre-existing gap, now one section lonelier); users with
a saved column order get the new column appended last until they drag it;
old-build clients show raw `preDesignStatusId` in activity entries during
the rollout window; whole-record merge can drop concurrent svt edits from a
stale client (the store's long-standing semantics, not new).

Final gate: **72 files / 1302 tests green**, `tsc`, `eslint
--max-warnings 0`, `npm run build`, `check:nosecrets` all clean.

---

## 7. Active Projects collapse + Slack requests + crew-days (2026-11-15) ✅ done, tested — PENDING

Three same-day asks after the audit:

**(a) Active Projects.** The main table is titled "Active Projects" with a
count chip and collapses like the sibling sections (`KEY_ACTIVE_OPEN`,
search forces open without writing the preference).

**(b) Paste from Slack — the 2026-11-06 agreed design, now BUILT.** He asked
"i don't see the Paste from Slack anywhere … make sure this function is
working". New `requests?: ProjectRequest[]` on BoardState (merged by
id/updatedAt, tombstoned, on BOTH client `mergeBoard` and server
`boardMerge` — PutSchema extended, the strict-schema lesson). Procedure as
agreed: batch paste → `parseSlackPaste` chunks on blank lines →
`suggestProject` fuzzy name match (all name words, word-boundary; no guess
without a match) → human confirms every match; unmatched park in the inbox
until their row exists (attach/remove there). Amber `● n` chip in the name
cell → viewer modal with Mark resolved. Soft popup at "Working on it"
(by-name, like isReviewLabel); HARD GATE at "Ready to submit"/isDone: each
request confirmed "Resolved — this is done" before the status lands, then
the held change re-dispatches through guardedPatch so needs-a-note gates
still run (putRequests advances boardRef synchronously — without that the
gate re-pops forever). Bulk Set-status filters blocked rows with a naming
toast; mobile refuses the move with a pointer to desktop (no resolve UI
there). Deferred from the original design: the show-requests /
require-requests-resolved ActionKinds in the Automations panel — the gates
are built-in like the rating/note gates instead.

**(c) SVT Scheduling.** `svt.twoDay` (never deployed) replaced by
`crewDays?: 1 | 2` select + polishable `schedulingNotes` box
(`svt.schedulingNotes` on client AND server polish schema). The SVT post's
Scheduling bullet prints ONE_DAY_LINE/TWO_DAY_LINE + the notes.

Gate: **73 files / 1320 tests** green, tsc + eslint + build + nosecrets
clean; all three driven end-to-end on localhost (match screen, inbox park,
chip, gate hold+release, scheduling bullet). Demo data on LOCAL blobs:
Glenda Hodge carries an open wire request; Maria M Acevedo waits in the
inbox.

**Same-day UX round (commit `ac2e147`), his calls:**
- **Updates column RETIRED** — its exact affordance (💬 n / 💬 +, same
  tooltips) moved beside the project name, next to the amber requests chip;
  both chips open the ONE per-project panel.
- **UpdatesModal is now that panel**: the project's Slack requests render
  above the thread (Mark resolved there releases the gate) plus a paste box
  that captures a designer's message for THIS project with no matching step.
  The toolbar "Paste from Slack" stays for batch + the inbox (he chose
  keeping both over a panel-only design).
- **Type-ahead project picker** in the batch modal ("start searching by the
  first letter"): prefix matches first, then contains, Enter picks the top
  hit, clearing the box parks the message in the inbox. Replaced the
  <select> — 400 rows outgrew it.
Gate after the round: **73 files / 1322 tests** green, full gate clean,
driven on localhost.
- **Chips merged into ONE pill** (follow-up same day — "their feature is the
  same"): quiet `💬 +` with nothing, teal `💬 n` with updates, AMBER with
  `● n` (or `💬 n · ● n`) the moment requests are open — the louder state
  wins. 73 files / 1323 tests green. (One `App.integration` flake during the
  gate reproduced identically with the change stashed — pre-existing
  machine-load timing, green on re-run; the vitest-sequential rule stands.)

---

## 8. Monday-style project side panel + threaded replies (2026-11-15) ✅ done, tested — PENDING

**Ask:** "when i click on the update icon i want the updates to open on the
side panel with the name of the posting it with replies under each post for
us to comment on his update, like monday.com". Design approved in chat
(bounded path).

**Panel.** `UpdatesPanel` (replaces `UpdatesModal`, which is deleted along
with `RequestsViewerModal`): a right-side panel (`.upd-panel`, 560px,
slide-in with reduced-motion respect, z-index 40 so gate modals stay above).
NON-MODAL — the board stays live; clicking another row's pill switches the
panel to that project; Escape/✕ closes; switching projects clears any
half-typed draft/reply. Content top-to-bottom: project name → Slack
requests (resolve + direct paste, as before) → composer → thread.

**Replies.** `ProjectUpdate.parentId?` — optional, no migration; a reply IS
an update, so merge, search corpus, "Ask the board", and the pill count all
work untouched. One level deep (Monday's model). `lib/updates`:
`newReply()`, `threadRoots()` (posts newest-first, replies oldest-first; a
deleted post with live replies rides along flagged so the panel renders an
"(update deleted)" stub). Edit/delete rules identical for replies. The
soft popup at "Working on it" now opens this panel instead of its own modal.

**Known gaps:** mobile still renders the flat list (a reply shows as a plain
update there — readable, unthreaded); the panel overlaps the table's right
columns rather than squeezing them (overlay by design).

Gate: **73 files / 1329 tests** green (the recurring `App.integration`
machine-load flake re-verified green in isolation), tsc + eslint + build +
nosecrets clean; driven live (reply posted under Glenda's update, panel
switch, Escape).

---

## 9. SVT Salesforce view + SOW default/left (2026-11-15) ✅ done, tested — PENDING

(1) **SVT output gains "Slack post | Salesforce"** — the same bullets
(`buildSvtLines`, one source) rendered via `buildSvtSfText()` with the SF
plain-text conventions (`underline`/`runLines` now EXPORTED from
sfSubmission.ts so the conventions live once): dashed title underlines,
`- ` lines, nested indents. The main button follows the view — "Copy for
Salesforce" copies plain text only. (2) **SOW is the LEFT and DEFAULT mode
card**; the localStorage persistence was removed so Compose always opens on
SOW. Panel-button polish rode earlier in `item 8` (Add request under its
box, ↩ Reply pill). Gate: **74 files / 1334 tests** green (flake included
this run), full gate clean, verified live.

---

## 10. Users management — email + inline account editing (2026-11-15) ✅ done, tested — PENDING

Commit `d330117`. Admin → Users becomes the account manager Aboud asked for
("manage the users accounts, emails, password"): **Email column** (optional,
contact-info only — never used for login; `TeamUser.email?`, no-migration),
**inline Edit** per row (display name + email; hint that old posts/board rows
keep the previous name), add-form gains "Email (optional)",
`normalizeEmail`/`looksLikeEmail` guards in `src/lib/auth.ts`. Password reset
and role/archive controls already existed and stay. Skeleton column added.
Post-deploy this screen is how the **5-password rotation** chore gets done.

---

## 11. Per-column board permissions (2026-11-15) ✅ done, tested — PENDING

Commit `7e40e93`. The ask: "a dropdown for each column where i can assign
editing permission … refai to edit the stars column but khaled mattar view
only … hide columns from some users."

- **Admin-only "🔒 Permissions"** button on the board toolbar → modal with a
  row per column (name, coordinator, reviewer, status, pre-design status,
  designed date, phase, rating): **Edit** picker (Everyone default / named
  members) + **Hide from** picker (every column except project name).
- Keyed by **username** (renames can't flip access); **admins are never
  restricted** and always see everything; client-side honest-team
  enforcement (accepted threat model).
- Enforced at every write path — desktop applyPatch / applyWithAutomations /
  bulkApply and mobile applyPatch — blocked edits toast "View only" and
  change nothing. Hidden columns vanish from the table **and** the Columns ▾
  menu.
- Storage: `columnPerms` on the board blob — `mergeById` client+server,
  `Stamped` entry in the strict PutSchema (max 200, the `updates`-incident
  lesson applied), tombstone-revive on re-set. Optional field, old blobs and
  old clients untouched, schemaVersion stays 1.
- New: `src/lib/columnPerms.ts` (+tests), `src/board/PermissionsModal.tsx`.
- Gate: **76 files / 1352 tests** all green (no flake this run), tsc, lint,
  build, nosecrets clean. Verified live on localhost: modal, member picker,
  set→label updates→revert persisted; member-side blocking covered by
  component tests (only one real login exists locally).

---

## Blocking the deploy

1. Live-data backup is **mandatory** before and after — pull all Netlify
   Blobs into `_versions/vNN-live-backup-YYYY-MM-DD/` and diff after.
2. Wait for Aboud's deploy trigger ("yalla deploy") — package deploys only.

## Unrelated, still open

- Rebecca Post is live at "New project" with Hamzah's special-order Cu SER
  wire request (Slack, Nov 3) un-actioned.
