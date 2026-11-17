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

## 12. Pre-Design is a full table, like Active Projects (2026-11-17) ✅ done, tested — PENDING

**Ask (Aboud 2026-11-17):** "Pre-Design is becoming a really important board
for us to work on … it would be like another type of active projects … the
active projects board has features that other boards dont have … sync the
setting make sure they work together. **i need to move columns**." Clarified
in chat: parity between the Active and Pre-Design tables ("same same"), ONE
column layout editable from either section, per-device as today.

**What it is.** The Active table's JSX became a `FullTable` component and the
Pre-Design section now renders it instead of the stripped `SectionCard`. So
Pre-Design gained: headers that drag to move, resize grips, per-column filter
funnels, the select-all checkbox, draggable rows, grouping. Installation
Review / Out of SOW scope / Completed deliberately keep the light table —
they are looked things up in, not worked in. Say the word if you want them too.

**Why the column move needed this.** `Pre-Design status` is hidden in the
active table and off the Columns ▾ menu (each section-scoped column is), so
until now there was no header ANYWHERE that could start a drag on it. Its own
table can. Verified: it moved to second position and stayed there after reload.

**One layout, two tables.** Column order, widths and visibility were already
one shared state — what was missing was being able to *start* a move or a
resize from the Pre-Design header. Now either header does, and the change
lands in both. Each table owns its own `DndContext`: a row drag only means
something inside one section (status is what moves a row between sections),
while a column drag writes the one shared order.

**⚠ The one thing the team will notice.** Pre-Design rows no longer sort
most-recently-touched first. They rank by **sub-status** — the team's own
Edit-labels order, Working on it → Done → Pending… — with the manual drag
order as the tie-break, exactly like the active table. Rows that reshuffle on
every edit cannot be dragged into an order that means anything (Aboud picked
this over keeping newest-first). **The Pre-Design list reorders once, on
everyone's first load after deploy.** The three archive sections are
unchanged and still sort newest-first (pinned by a test).

A drag across sub-statuses is refused with "A row can only be reordered
within its own Pre-Design status while auto-sort is on" — the band rule the
active table already had, told to band by the column that orders this one.

**Decision changed mid-build:** group-collapse state is NOT namespaced per
section, as first sketched. One `collapsed` map is what `shown` and the
select-all safety rule ("never write a teammate's collapsed group") already
assume; splitting it would have put that invariant at risk for a cosmetic
gain. Collapsing a group collapses it in both tables.

**Deliberately NOT built:** "group by Pre-Design status" as a menu option —
the Group by menu is shared with the active table, where that column does not
exist. Easy to add if wanted.

**Files:** `src/board/BoardTab.tsx` (FullTable extracted + Pre-Design wired),
`src/lib/boardViews.ts` (`sortByPreDesignStatus`, `bandMove` takes a `bandOf`,
`splitSections` stops sorting preDesign), `+ both test files`.

Gate: **76 files / 1365 tests** (+13), `tsc --noEmit` and
`eslint --max-warnings 0` clean. The refactor landed as its own commit
(`28ab5c7`) with the Active table provably unchanged before anything was
added; the feature is `43ab22c`.

Driven end-to-end on `localhost:8888` with REAL PointerEvents (dnd-kit
ignores synthetic drags): column move from the Pre-Design header → moved in
both tables; `Pre-Design status` moved for the first time; resize 148→228px
in both; row drag inside a band; cross-band drag refused with the toast;
sub-status ranking (a row marked Done sank below the Working-on-it row);
select-all ticks/unticks and both headers stay in sync; order + widths
survive a reload; no console errors. Demo rows put back to Working on it.

**Left on the LOCAL dev box only** (localhost preferences, not production):
Rating is moved before Designed date and widened to 228px, and Pre-Design
status sits second. "Reset column widths" is in the Columns ▾ menu.

---

## Item 13 — SVT pre-design fields, mined from #sow-svt-collab (2026-11-17)

Read the channel the taskforce actually works in and diffed the three real
pre-design notes (all Omar Rajab, 13–17 Nov) against the built SVT form. The
team had already converged on a seven-beat template unprompted; the form
captured beats 1 and 3 and none of 2, 4, 5, 6, 7. Aboud's call: **additive
only** — the four battery boxes and their tests stay exactly as they were.

Added to `SvtNotes` (all optional, `schemaVersion` stays 1, no migration):

| Block | Fields | Pinned to |
|---|---|---|
| HO agreement | `hoAgrees` widened `boolean` → `boolean \| 'unknown'` | William Giles — "no stated preference" was the headline, and a blank could not say it |
| Clearance | `clearEquipment`, `clearAvailable`, `clearDepth`, `clearRequired`, `clearanceAllMet` | Louis Fritz / Garage — 40" − 11.9" = 28" vs 36" |
| Site conditions | `atticAccessible`, `detachedStructure`, `hoa`, `batteryStacks` | the conditions each note cites to justify a route |
| Cost impact | `costDirection`, `costDrivers[]`, `costNotes` | all three notes name a direction and a driver |
| Homeowner actions | `hoActions[]`, `hoActionsOther` | "clear the garage", "remove or relocate the plants" |
| The ask | `ask`, `blockedOn` | all three notes close with one of four asks |

Post grows from 4 bullets to 9: Battery Location → Conduit Path → **Site
Conditions** → **Clearance** → Installation Notes → **Cost Impact** →
Scheduling → **Homeowner Actions** → **The Ask**. Empty bullets still drop, so
a thin note stays short. `buildSvtLines` remains the one source feeding Slack,
SF and the rich clipboard.

**Battery stacks → kWh.** Ya'rob asked on 2026-11-16 how to verify 2 vs 3
stacks; Daniel Beier answered the same night — read it off the scope, 20 kWh =
1 stack, 40 = 2, 60 = 3. So `batteryStacks` is `1 | 2 | 3`, `STACK_KWH` holds
the mapping, and one pick writes both numbers: "Sold with 3 battery stacks
(60 kWh)." The dropdown shows the kWh so the pick is unambiguous.

Deliberate calls:
- **Zero new polish keys** — every new text input is a short noun phrase, so
  `rewriteSchema.ts` (closed enum, client *and* server) is untouched.
- **"they/them"** for the homeowner in generated sentences — the form cannot
  know a customer's pronouns and this text is pasted into Salesforce.
- **36" is an input with a default, never a hardcoded constant** — the figure
  is equipment- and AHJ-specific and was cited for an inverter, not a battery.
- **No board automation** (Aboud): the ask writes its sentence only; the
  Pre-Design sub-status stays hand-set. Compose never writes to the Board.
- `CLEARANCE_LINE` is now exported from `sfSubmission.ts` and reused, so the
  pre-design note and the SOW handoff cannot word the same claim two ways.
- Two new advisory rows (never gates): "Battery stacks recorded", and a
  contradiction row when a short measurement sits next to a ticked
  "all clearances met". Both print; the row only makes the conflict visible.
- `missingRequired()` still has its 4 entries — no required fields.

Files: `types.ts`, `lib/svtPost.ts`, `lib/sfSubmission.ts` (export only),
`lib/record.ts` (`hasContent`), `components/SvtCard.tsx`,
`components/OutputColumn.tsx`, `theme.css`, new
`lib/svtPost.predesign.test.ts`.

Gate: **77 files / 1414 tests** (+49), `tsc --noEmit` and `eslint` clean.
Two tests (`App.integration`, `BoardTab`) time out under
`--no-file-parallelism` on this laptop and pass isolated in 8s / 18s — load,
not regressions.

Driven on `localhost:8888` against a **blank New Post** (never a real draft —
Compose autosaves), reproducing the Louis Fritz / Garage note: the preview
printed the clearance arithmetic, "Sold with 3 battery stacks (60 kWh)",
"Saves cost — external conduit length", the nested homeowner actions and the
closing ask. Live verdict chip read "✗ Leaves about 28" — short of 36" by
about 8"". **Left behind: one "Untitled draft" (Nov 17, 7:37 PM) in Drafts**
— delete it before the deploy.

Backup of the pre-change files: `_versions/v42-pre-svt-fields-2026-11-17/`.

**Not reviewed yet: whether the Compose skeleton enumerates card blocks**
(CLAUDE.md requires the skeleton to ship with the screen). Check before deploy.

### Item 13b — tick-chip redesign + UI audit (2026-11-17)

Aboud flagged the cost-driver row: eight chips on a row that could not wrap,
so every two-word label broke in half — "long SER / run", "concrete / pad".
Audited with the `ui-ux-pro-max` skill rather than eyeballed.

Findings applied, each tied to a rule the skill returned:

| Rule | Severity | Fix |
|---|---|---|
| Compact Label Overflow | High | `flex-wrap: wrap` on the ROW, `white-space: nowrap` on the CHIP — the row wraps between chips, a label never breaks |
| Target Size (WCAG 2.2 AA, 24×24 CSS px) | High | whole pill is the hit area: `min-height: 30px` + padding, not the ~13px native box |
| Touch Spacing (≥8px) | Medium | `gap: 8px` both axes (was 14px one axis, no row-gap because nothing wrapped) |

Also fixed, from reading the card rather than from the skill: the chips and a
free-text input shared one `.install-row`, so an eight-chip group was squeezed
by whatever sat beside it. New `.tick-field` (`flex: 1 1 100%`) gives a tick
group the whole row; "Another driver" and "Something else" moved to their own
rows and gained a hint saying they join the list above.

Checked state is an **`on` class set by React, not `:has(input:checked)`** —
`:has()` appears nowhere else in `theme.css` (verified: 0 occurrences), and a
class is assertable. New `ChipTicks.test.tsx` guards it, since a group that
forgets the class just looks permanently unchecked and nothing else would
catch that. Applied to `InstallNotesCard` too, so both Compose cards match.

Also added: `accent-color`, hover, `:focus-within` ring, and a
`prefers-reduced-motion` guard on the transition (the file already uses
reduced-motion in 4 places — consistent, not new).

Contrast checked by hand, not assumed: `--dyn-warn-ink` #8a6d00 on
`--dyn-warn-bg` #fff8dc = **4.62:1**, over the 4.5:1 floor.

**Flaky-test note, carried forward:** `App.integration.test.tsx` passes
isolated (31/31, ~12s) but times out under full-suite load on this laptop.
`ChipTicks.test.tsx` was written with 4 `<App />` mounts and tipped it over;
trimmed to 2 and the full suite went green again. Gate now:
**78 files / 1416 tests, 0 failures**, `tsc` and `eslint` clean. Keep new
App-mounting tests lean or this resurfaces.

---

## Items 14–17 — Requirements bulk import + wall fit (2026-11-17)

Aboud's spec: ~265 collected rules against a board that could only add one at
a time. Three findings reshaped it before any code:

- **Aliases were already built.** `Ahj.aliases` exists and `matchAhj` already
  checks them (`lib/ahj.ts:59`). Only the match report was new.
- **The General board already exists and is deliberately NEVER posted** —
  `requirementSections` loops `['ahj','utility','funding']` only. Item 2 is a
  decision to reverse, not a feature to add. **Still unanswered** — see below.
- **Per-rule fields were the real dependency.** Items 1, 3, 5 and 6 all read
  or write them, so they landed first.

| # | Commit | What |
|---|---|---|
| 14 | `f42bdfa` | Per-rule fields, category grouping, superseded hiding |
| 15 | `d89b8e2` | Bulk import: CSV/XLSX/paste, preview, dedupe, batch undo |
| 16 | `05ef66e` | Export (CSV/XLSX) + match report |
| 17 | `5f02b08` | Battery wall-fit from the elevation template |

**No server change was needed for any of it** — `PostSchema`/`AhjSchema` in
`ahjs.mts` are already `.loose()`, so the new post fields pass through the PUT
untouched. That is the 37-hour `.strict()` lesson paying off.

**The contract held throughout is about absence.** A post written before these
fields has no category and no status and must reach Compose exactly as it
always did: `status` absent means `current`; a board with no categories yields
one unlabelled group; all three renderers print that case byte-identically.
The existing wording-pinned tests in `template.test.ts` and
`sfSubmission.test.ts` prove it — untouched, still passing.

**Two bugs the real-.xlsx test caught that hand-built grids could not:**
1. Aliases were collected *inside* the status gate, so an alias on an entry's
   first row vanished whenever that row was "To confirm" — i.e. **"CNP"
   quietly stops matching CenterPoint**. Aliases describe the board, not the
   rule; now gathered from every valid row before any status filtering.
2. A Current row whose twin was held back by status must still import. Status
   filters *before* dedupe, so a skipped row never consumes its twin's slot —
   same ordering, same reason, as the lender gate in `sfWorkbook`.

**Wall fit is deliberately conservative.** Body 23.57" is exact; the gap is
rounded up from the drawn 3.76"/3.97" to a flat 4", so `wallNeeded()` returns
51.14"/78.71" against the template's 50.90"/78.44". A test pins that it is
always *above* the drawn run and within 0.33" — erring toward "needs more
wall" is the safe direction for a fit check.

Gate: **82 files / 1514 tests**, 0 failures, `tsc` clean, `eslint` clean
across `src`.

### Not built, and why

- **Phase 4** (`POST /api/requirements/import`, per-user API tokens) — would
  collide with Aboud's in-flight `guard.ts` work. Also a NEW auth mechanism:
  the app authenticates with one shared `API_PATH_TOKEN` today.
- **ETag / 304 conditional GET** (~240 GB/month) — same collision; it touches
  the exact GET handlers being edited.
- **General board → all jobs** — needs Aboud's decision. The board holds 4
  posts; post 3 ("make sure the designers point out…") is written to the SOW
  engineer, not an installer. Recommendation: **new board, leave General
  alone**. ~40 lines would otherwise reach every Slack post and SF handoff.
- **Compose skeleton** — Compose has never had one and only `UsersTab` uses
  `Skeleton.tsx`. Judgment call: the house rule targets screens that wait on
  the network, and Compose hydrates synchronously from localStorage, so there
  is no flash to cover. Logged rather than built.
- **Full equipment-row wall fit** — needs the inverter / 125A load-centre /
  200A meter / AC-disconnect widths, plus questions 5–8 in
  `_STUDY_equipment_widths_dxf.md`.

---

## Blocking the deploy

1. Live-data backup is **mandatory** before and after — pull all Netlify
   Blobs into `_versions/vNN-live-backup-YYYY-MM-DD/` and diff after.
2. Wait for Aboud's deploy trigger ("yalla deploy") — package deploys only.

## Unrelated, still open

- Rebecca Post is live at "New project" with Hamzah's special-order Cu SER
  wire request (Slack, Nov 3) un-actioned.
