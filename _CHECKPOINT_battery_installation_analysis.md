# CHECKPOINT — Battery Installation Analysis

> Date: 2026-11-03 | Status: **READY TO DEPLOY — deploy command blocked by the
> Claude Code permission classifier; Aboud must run it.** Code is merged to
> `main` (`67e507d`), v32 live backup taken and validated.
>
> **The required-fields part was DROPPED before deploy.** Aboud: "just skip the
> require thing and yallaaaa go deploy". Built required first; requiring it
> would have flipped ~255 open drafts to "not ready to post" on the spot, so
> the gate came out and only the fields shipped. That removed the entire
> team-wide risk this checkpoint originally warned about.

## What Aboud asked for (2026-11-03)

A new **Battery installation analysis** group (originally **required** — gate
dropped before deploy, see above):

1. **Battery base** — concrete pad / wall mount / on existing ground
   - concrete pad → does the base need extra work? → if yes, describe it
     (suggestions: cutting the ground to fit the pad / clean the ground / level the ground)
   - wall mount → what is the elevation of the batteries?
   - on existing ground → describe (suggestions: inside the garage on concrete ground / concrete ground)
2. **Wall support**
   - is the supporting wall even (flat)? yes → "wall supported normally"; no → "use unistruts with spring nuts"
   - do you need to push the batteries out from the wall? yes → "use unistruts to push the batteries further"; no → nothing

His decisions on the proposal:
- **Retire the old "Concrete pad installation" box entirely**, replace it with this group,
  and add an "Anything else" box at the end of the group.
- **The WHOLE analysis goes under Installation Notes** — not split across two SF fields.
- **Mind the formatting** — SF has no internal formatting.
- **Every SOW has batteries**, so no "N/A" escape hatch.
- **Extra work = No must print an explicit sentence**, not stay silent.

## What was built

### Data model — `src/types.ts`
- `BatteryBase` = `'concrete-pad' | 'wall-mount' | 'existing-ground'` (no "none" — always batteries).
- `InstallNotes` gains, all OPTIONAL (same no-migration contract as `roofMaterial`):
  `batteryBase?`, `batteryBaseNeedsWork?`, `batteryBaseWork?`, `batteryElevation?`,
  `batteryGround?`, `wallEven?`, `batteryPushFromWall?`, `batteryOther?`.
- `InstallTextField` gains `batteryBaseWork | batteryElevation | batteryGround | batteryOther`
  (so they get chips, AI polish, autosave detection and `rawTextFor` for free).
- `concretePad` marked **`@deprecated`** and kept so stored drafts still parse — the
  same treatment `mainDisconnectLocation` got. It is no longer rendered anywhere.
- The three yes/no answers are **tri-state booleans**, not checkboxes.
  `undefined` = "not answered" prints nothing; `false` = "No" prints a real
  sentence for two of them. A checkbox cannot tell those apart.

### Sentences — `src/lib/installNotes.ts`
- `BATTERY_BASES` picklist; new `batteryAnalysisLines(n, p)` builder.
- Order inside the block: base → ground work → wall support → anything else.
- Every branch degrades gracefully with its follow-up box still empty
  (`The batteries will be wall-mounted.` rather than a dangling sentence).
- `clauses()` extracted as the shared "box → joined clauses" primitive behind
  `labelled`, `leadSentence` and the new base branches.
- `installNoteLines()` no longer emits the concrete-pad line.
- Uneven wall + pushed out is **ONE merged sentence** — as two lines it says
  "unistruts" twice in consecutive bullets and reads like a duplication bug.

### Salesforce — `src/lib/sfSubmission.ts`
- New **`Battery Installation Analysis`** underlined section inside
  **Installation Window and Planning**, between Installation Notes and Conduit Raceway.
- Chose a sibling section over an indented sub-list under Installation Notes:
  SF strips formatting, these sentences are long enough to soft-wrap, and a
  wrapped indented line collapses back into the list above it — losing exactly
  the grouping Aboud asked for. Dashed underline + `- ` bullets is the
  convention already used twice in this same field.
- `Battery and Equipment Location` is untouched: still just equipment walls +
  battery location. Pinned by a test that the analysis does NOT leak into it.

### Slack post — `src/lib/template.ts`
- New top-level `Battery Installation Analysis` bullet, structurally identical
  to `Conduit Raceway`.
- `missingRequired()` is **unchanged** — the battery questions do not gate
  anything. `missingBatteryAnalysis()` existed briefly and was removed with the
  gate. `OutputColumn.readiness.test.tsx` now pins the opposite behaviour: an
  untouched battery block must never block Copy for Slack or Mark as posted,
  and must never appear in the readiness tick-list.

### Form — `src/components/InstallNotesCard.tsx`
- `Battery installation analysis` sub-head grouped under the Battery location
  box, above Conduit raceway.
- Branch controls reveal/hide; hidden text is preserved, not wiped.
- Field hints spell out the consequence ("No → 'No additional ground work is
  required…'", "No prints nothing").
- The "Concrete pad installation" box is gone.

### Readiness — `src/components/OutputColumn.tsx`
- The battery questions are deliberately ABSENT from the tick-list: they are
  not required, so they must not read as a gap.
- Kept one cleanup from the required version: the `checks.splice(3, …)`
  Region-text hack is now a plain conditional spread.

### Elsewhere
- `src/lib/record.ts` — `hasContent()` counts the new answers. The tri-states are
  listed explicitly because `false` is a real answer; a truthiness check would
  read "No" as unanswered and silently drop the draft.
- `src/lib/storage.ts` — default chips. **Lowercase fragments on purpose**: these
  boxes are joined INTO a sentence, so a capitalised chip would read mid-sentence.
- `netlify/functions/lib/rewriteSchema.ts` — the server-side POLISH_KEYS list,
  which its own sync test caught immediately. Working as designed.
- `src/lib/__fixtures__/makeRecord.ts` — new `answeredInstallNotes()` fixture for
  tests that want the battery block to actually render. `makeRecord()`
  deliberately does NOT use it, so post-shape goldens stay minimal.

## Tested

Strict TDD throughout: every behaviour had a failing test first, and each
failure was confirmed to be "feature missing" rather than a typo.

- `installNotes.test.ts` — 3 new suites, 20 tests: all 4 base outcomes, all 4
  wall-support outcomes, graceful-empty branches, order, polish, a pre-2026-11-03
  record, and the retired pad line.
- `template.test.ts` — the 10 required-logic tests were deleted with the gate;
  the 4 pre-existing `missingRequired` tests are back to their original form.
- `sfSubmission.test.ts` — 7 new tests: placement between the right sections,
  underline length, every line a plain `- ` bullet, no leak into Battery and
  Equipment Location, section absent when unanswered, clearance still last.
- `OutputColumn.readiness.test.tsx` — NEW file, 5 tests pinning that the battery
  analysis never gates posting (and that the Salesforce fields still do).
- `InstallNotesCard.test.tsx` — 9 new tests on the conditional reveals.
- `record.test.ts` — 5 new autosave tests.

**`tsc --noEmit` clean. `eslint src netlify` clean.**

### Full-suite numbers (verified by stashing to clean `main` and back)

| | Tests | Files |
|---|---|---|
| clean `main` | 184 failed, 754 passed (938) | 19 failed, 43 passed |
| shipped | 184 failed, **799 passed** (983) | 19 failed, 44 passed |

**+45 passing tests, zero new failures, identical failing-file set.**
(It was +56 while the gate existed; dropping it removed 11 of those tests.)

### ⚠ Separate pre-existing problem found (NOT caused by this change)

All **184** of those failures have **one** root cause: `localStorage` is
`undefined` under the jsdom test environment, so every test that touches it dies
on `.clear()` / `.setItem()`. Probed directly: the jsdom env exposes `window` and
`document` but not `localStorage`; adding an explicit `url` does not help.
jsdom is `^30.1.1` (30.1.1 installed) on vitest 3.2.4.

This silently disables 19 test files, including **all** the App integration
tests. The 2026-10-27 checkpoint recorded only 3 failures, so this is drift
since then. **Consequence: I can prove this change adds no new failures, but I
cannot claim the App-level integration tests pass — they do not run at all on
this machine.** Suggested fix, as its own change: pin jsdom to the v26 line, or
add a setup file that provides `localStorage`. Not bundled here on purpose.

## Live-data finding — this change fixes a real bug now in Salesforce

Checked `_versions/v30-live-backup-2026-10-27/records.json` (277 records, 270
live, 255 open drafts). **12 open drafts have text in the retired pad box**, and
the old logic was blindly prefixing it. What those drafts were actually sending
to Salesforce:

| Typed in the box | What the tool printed |
|---|---|
| `No concrete pad needed , we will do wall mount` | `Concrete pads will be installed no concrete pad needed , we will do wall mount.` |
| `battries will be mounted` | `Concrete pads will be installed battries will be mounted.` |
| `Batteries will be installed in the garage so no need for concrete pad` | `Concrete pads will be installed batteries will be installed in the garage so no need for concrete pad.` |

So the box was asserting pads on projects that explicitly have none. The new
dropdown makes that impossible. The content of those 12 drafts also *validates*
the design — people were already using the free box to answer exactly the three
questions Aboud specified.

### The 12 drafts and their suggested new answers

Their `concretePad` text stays stored but **stops printing**, so each needs its
answers re-entered. Nothing blocks them in the meantime — the questions are not
required — so these 12 will simply have no battery section until someone fills
it in. Suggested mapping — **the two ambiguous ones need a designer**:

| Customer | Suggested base | Follow-up |
|---|---|---|
| Christine Burton | Wall mount | elevation needed |
| Curvis Davis Jr | Wall mount | elevation needed |
| Wanda Flowers | Concrete pad | extra work = Yes → level the ground (soil) |
| Shahnaz Parveen Baig | Concrete pad | extra work = Yes → level the ground (soil) |
| David Dawson | Concrete pad | extra work = Yes → clean the ground |
| Dilshad Nathani | On existing ground | inside the garage |
| Michael Palmer | On existing ground | inside the garage |
| Mewelde J Moore | On existing ground | inside the garage, on the floor |
| Patrick Davis | On existing ground | inside the garage, direct on the ground |
| Mohammad Arslan Raza | On existing ground | directly on the garage ground |
| **Steven Clifton** | **ambiguous** | says pads AND wall-mounting equipment in the BOM — ask the designer |
| **Brenda Thompson** | **ambiguous** | no pad, but bricks to be removed on the south wall — wall mount or existing ground? ask |

## Docs updated

- `../sow-sf-format-example.txt` — rewritten, and **generated BY the code** this
  time (a throwaway render script, since deleted) rather than hand-written, so
  it matches the clipboard byte for byte. Includes all 4 scenarios + the rules.
- `../sow-field-audit.html` — 4 new rows marked NEW under Installation Window
  and Planning, the pad row removed, header and the top note rewritten.
- `spec/` needed no change — those docs predate these fields.

## Deploy record — 2026-11-03

**Done:**
- Pre-deploy backup `_versions/v32-live-backup-2026-11-03/` — all five stores
  pulled and each confirmed to parse as JSON (ahjs 2,699 B · board 838,006 B ·
  extrawork 18,214 B · records 830,347 B · users 1,392 B).
- Site checked: `disabled: false`, not git-connected, published deploy was
  `6ae0daf4` (2026-10-27).
- Merged to `main`: `67e507d`.

**Blocked:** `npx netlify deploy --build --prod` was denied by the Claude Code
permission classifier. Aboud needs to run it himself.

**Still to do after it runs:**
1. Re-pull all five stores and diff against `v32-live-backup-2026-11-03/`.
   Expect identical, or only changes someone made during the window.
2. Confirm the live bundle carries the new strings (`Battery Installation
   Analysis`) and no `changeme` token.

### ⚠ The fresh pre-deploy grep changed the numbers

The week-old v30 backup showed 12 drafts with retired pad text. The FRESH v32
pull shows **41** (of 307 open drafts) — the team used that box heavily in the
last week. This is exactly why the rule says to re-grep fresh.

What they were typing, classified: 11 say explicitly that NO pad is needed,
3 say a pad IS going in, and 27 are notes like `on soil ground`,
`Batteries are floor mounted & wall supported. Concrete Pads are needed.`,
`on floor under the batteries and the batteries will be also wall supported`.

Two conclusions:
- **The design is confirmed.** The team was already cramming the battery base
  AND the wall-support answers into that one free box, in prose. The new
  structured questions are what they were reaching for.
- **The old logic was shipping nonsense to Salesforce** for a good share of
  them, e.g. `Concrete pads will be installed no concrete pad needed , we will
  do wall mount.` and `Concrete pads will be installed soil ground.`
  Retiring it fixes those 41 as much as it changes them.

**Mitigation added before deploy (commit `67e507d`):** the retired text is
displayed **read-only** under the battery group with "Retired field — no longer
posted", so none of the 41 drafts loses it invisibly. Whoever opens the draft
can transfer it into the new questions. Nothing writes to it.

## Pending / open questions for Aboud

- Confirm my read of "I like scenario 2 way more" — I took it as *keep all the
  battery facts grouped in one place* rather than split across two SF fields,
  which is what the next instruction asked for too. If he meant something else
  about scenario 2's formatting, the section shape is a one-line change.
- **The 12 drafts** whose retired pad text no longer prints (list above); two
  of them (Steven Clifton, Brenda Thompson) are ambiguous and need a designer.
- Whether the AI should be allowed to polish `batteryElevation` at all — it
  currently can, like `loadRun`, and it holds a measurement. The dropped-token
  and drift guards still apply, and polish is opt-in per box.
- Should the battery questions become required LATER, once the backlog of open
  drafts has been worked through? The gate is ~10 lines to re-add.
- Unrelated, now blocking real verification: the jsdom `localStorage` breakage.
