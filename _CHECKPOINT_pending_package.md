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

## Blocking the deploy

1. Live-data backup is **mandatory** before and after — pull all Netlify
   Blobs into `_versions/vNN-live-backup-YYYY-MM-DD/` and diff after.
2. Wait for Aboud's deploy trigger ("yalla deploy") — package deploys only.

## Designed but not built

- **Slack material-requests capture** — brainstormed 2026-11-05/06, design
  agreed (batch "Paste from Slack" inbox + soft popup at "Working on it" +
  hard gate at Ready to submit / Done). Spec not yet written.

## Unrelated, still open

- Rebecca Post is live at "New project" with Hamzah's special-order Cu SER
  wire request (Slack, Nov 3) un-actioned.
