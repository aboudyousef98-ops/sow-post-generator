# CHECKPOINT — Roof material field + SF field-placement audit tool
> Date: 2026-10-27 | Status: built + tested locally, NOT deployed (waiting for Aboud's field audit)

## What was built

### 1. Roof material field (Aboud 2026-10-27)
- `types.ts` — `RoofMaterial` ('shingle' | 'metal' | 'clay-tile' | 'tile' | 'other');
  `InstallNotes.roofMaterial?` + `roofMaterialOther?` (optional, same no-migration
  contract as `concretePad`).
- `installNotes.ts` — `ROOF_MATERIALS` picklist, `roofMaterialLabel()`,
  `needsRoofConduitRework()` (metal / clay tile), `ROOF_CONDUIT_REWORK` text.
  `installNoteLines()` prints `Roof material: X.` right after the roof-rating
  line → flows into the Slack post AND the SF "Installation Window and
  Planning" blob automatically.
- `InstallNotesCard.tsx` — dropdown in the roof-rating row; "Others…" reveals a
  describe box (text preserved when toggled away, mirrors storiesOther);
  Metal / Clay tile show a yellow `.roof-warning` box:
  "⚠ Metal roof: Remove Solar junction box, and add LB condulet to go over the
  roof, add extra 3/4\" conduits with fitting, hangers, compressions to this job."
  **Display-only** — like the aluminum-wiring banner, never posted. (Fixed the
  "juntion" typo from the request.)
- `record.ts` — `hasContent()` counts roofMaterial/roofMaterialOther so a draft
  holding only that choice still autosaves.

### 2. Audit tool — `../sow-field-audit.html` (standalone, outside the repo)
One row per generated text piece, grouped under the exact SF field it lands in
(SF page order, mirrors `sfSubmission.ts`). Mark OK / Wrong (+ where it should
go + note), marks persist in localStorage, "Export report" produces a paste-
back text report. Open by double-clicking the file; on file:// the clipboard
API is blocked, so the report appears pre-selected in a textarea — Ctrl+C.

## Tested
- 2 new unit suites in `installNotes.test.ts` (sentence per material, Others
  blank drops line, order after roof rating, flag = metal/clay-tile only).
- 2 new component tests in `InstallNotesCard.test.tsx` (flag show/hide, Others
  box text preserved). All pass; `tsc --noEmit` and eslint clean.
- Audit HTML exercised in Chrome via localhost: mark → fix controls → export →
  localStorage round-trip all verified, test marks cleared afterwards.
- Full suite: 931 tests; the only failures (3) are PRE-EXISTING test
  interference — same failures reproduce on a clean stash of main when
  `App.integration.test.tsx` + `board/BoardTab.test.tsx` run together; each
  passes alone. Not caused by this change.

## Audit fixes (Aboud's export, 2026-10-27 evening) — APPLIED same day
1. Battery and Equipment Location: "Equipment will be installed on two walls
   (…)" + "Batteries will be installed …" (new `leadSentence()` helper; a box
   already starting with "Batter…" is not double-prefixed).
2. Walls sentence REMOVED from the SF window blob (new `'walls'` omit) — the
   Slack post keeps it.
3. "days not weeks" — NO code change: the app already prints crew-days
   ("1.5 to 2 crew-days"); the audit HTML's example was wrong and is fixed.
4. Window blob install-notes order now: services, roof rating, roof material,
   concrete pad, anything-else, SPECIAL CASES LAST. Order changed globally in
   `installNoteLines` → the Slack post gets the same order (golden test
   unaffected; posts are legacy anyway).
5. Concrete pad moved INTO the window blob as "Concrete pads will be installed
   …" (before anything-else). It now also prints in the Slack post.
6. SF "Site Modification Notes" field REMOVED from the panel (nothing
   generated; filled by hand like Wiring Route).
All verified: 748 lib+component tests pass, tsc + eslint clean. Audit HTML
updated to the new mapping. Formatted example shown to Aboud for approval.

## Pending
- Aboud's approval of the formatted example → then deploy (with the mandatory
  live-blobs backup + diff, CLAUDE.md deploy rule).
- Decide: should the Metal/Clay-tile rework text ALSO be written into an SF
  field (e.g. the window blob), or stay display-only? Currently display-only.
- Commit: changes are uncommitted on `main`.
