# Checkpoint — Wire material check (AL vs CU)

> Aboud, 2026-11-11. Branch `feat/wire-material-check` (off `feat/board-automations`).
> **NOT DEPLOYED** — appended to `_CHECKPOINT_pending_package.md` as item 2.

---

## 1. The problem

Solrite rejections:

> "The wires presented on the submitted evidence (Al) do not match the ones
> described on the latest planset submission (Cu). Please update the
> information and submit for revision."

This is a workflow gap, not a bug. The wire material can legitimately change
after the elevation review, and the SOW/BOS team specifies the final material
— but nothing in the handoff ever **said** which material won, so the design
uploaded to Salesforce was never updated and nobody noticed until Solrite did.

## 2. What was built

Three dropdowns at the top of the Compose **Feedback** card, above the Design
Feedback box, and one derived sentence.

| Field | Required? | Purpose |
|---|---|---|
| Service rating | no | 100–400 A, NEC Table 310.12 rows. Names the size in the ask. |
| Design SLD shows | no | What the planset in Salesforce says. |
| BOS / install uses | no | What will actually be installed. |

The verdict strip under them shows one of three states and the **exact
sentence** Design Feedback will carry:

- **unknown** (grey) — "Pick both to state the match in Design Feedback."
- **match** (teal) — "✓ Match — aluminum in both."
- **mismatch** (amber) — "✗ Mismatch — SLD copper, BOS aluminum." + a
  **Copy ask** button that puts just the request on the clipboard.

Generated sentences (`src/lib/wireMaterial.ts`):

> Wire material unchanged — the design SLD and the BOS both specify aluminum
> conductors (4/0 AWG for the 200 A service, NEC Table 310.12).

> Wire material changed after the elevation review — the BOS specifies
> aluminum, the design SLD shows copper. Please update the design SLD to
> 4/0 AWG aluminum for the 200 A service (NEC Table 310.12) and re-upload it
> to Salesforce so the planset matches the BOS.

Both the `(…)` size clause and the "for the 200 A service" clause drop when no
service rating is picked.

## 3. Decisions

| Decision | Why |
|---|---|
| **No `Required` gate** | Aboud 2026-11-11: *"we dont use Required on this website so you only need to show the field and our team will take care of the rest"*. Same conclusion as the battery analysis on 2026-11-03, for the same reason — a gate would flip ~257 open drafts to "not ready". |
| **Derived, not typed into `notes.design`** | It leads the bullet list but is not a `PolishKey`, so `✨ Polish with AI` can never reword the material and it cannot be deleted by accident. Pinned by three tests in `wireMaterial.test.ts`. |
| **Prepended in `effectiveNoteLines`, not `buildLines`** | That one function feeds the Slack post **and** the SF `Design Feedback` field. Changing it there means the post and the SF record can never disagree about the material — which is the exact disagreement Solrite rejects. |
| **Two dropdowns, no "SLD fixed in SF?" flag** | Aboud's call. When the designer fixes the SLD, the coordinator re-picks "Design SLD shows" and the bullet flips back to a match. |
| **`PostRecord.wire`, not inside `InstallNotes`** | It drives Design Feedback, not the Installation Notes bullet. Keeping it out of `InstallNotes` means it can never become a `PolishKey` via that path. |
| **BOS never auto-fills** | A silent default is exactly how the mismatches went unnoticed. "Same as design" makes the no-change case one click instead. |
| **Says nothing while unanswered** | A "pending" line inside a Solrite submission is worse than silence. The gap is shown in the form and the readiness card instead. |

## 4. Two things worth knowing

**The reference graphic has a typo.** The Table 310.12 image circulated to the
team prints `30/` for 225 A copper. The real table reads **3/0 AWG**. The code
uses 3/0; `wireMaterial.test.ts` pins it so nobody "corrects" it back to the
picture.

**Free jurisdiction cross-check.** Othman's 509-jurisdiction aluminum list was
already in the tool (`src/lib/aluminumWiring.ts`, added 2026-10-20). When the
BOS picks aluminum **and** the jurisdiction's stance starts with `Not allowed`
or `Restricted`, the strip echoes that requirement. Display-only, never posted
— same contract as the existing Jurisdiction `.alu-banner`. This catches a
second class of rejection before it happens. It stays silent on a copper BOS,
because copper in a copper-only city is exactly right.

**Table 310.12 scope**, repeated as a hint under the rating: dwelling
*service/feeder* conductors, where no adjustment or correction factors apply.
It is guidance for the wording — the coordinator still picks the material.

## 5. Readiness card

A new `Check.tone = 'advisory'`: an amber `!` ring that is **not** a gap.

| State | Row |
|---|---|
| match | ✓ `Wire material matches — aluminum` |
| mismatch | ! `Wire material mismatch — SLD copper, BOS aluminum` · `In Design Feedback` |
| unknown | ! `Wire material not confirmed` · `Pick` |

`ready` stays driven by `missingRequired()` alone. A mismatch is **not** an
error — it is a legitimate change the Design Feedback is now asking for.

## 6. Files

**New:** `src/lib/wireMaterial.ts`, `src/lib/wireMaterial.test.ts`,
`src/components/WireCheckRow.tsx`, `src/components/WireCheckRow.test.tsx`.

**Touched:** `src/types.ts` (`WireMaterial`, `ServiceAmps`, `WireCheck`,
`PostRecord.wire?` — all optional, `schemaVersion` stays 1, no migration),
`src/lib/template.ts` (`effectiveNoteLines`), `src/components/ComposeTab.tsx`
(renders the row), `src/components/OutputColumn.tsx` (`tone`, one row),
`src/theme.css` (`.wire-strip` family + `li.advisory`),
`src/lib/template.test.ts`, `src/lib/sfSubmission.test.ts`,
`src/components/OutputColumn.readiness.test.tsx`.

**Untouched on purpose:** `sfSubmission.ts` (inherits the line via
`effectiveNoteLines`), `installNotes.ts`, `missingRequired()`, the board,
mobile (Compose is desktop-only), `Skeleton.tsx` (no new screen).

## 7. Tested

Full gate: `npx vitest run --no-file-parallelism` → **69 files, 1248 tests, all
green**. `npm run typecheck` and `npm run lint` clean.

New coverage (32 tests): all 11 table rows incl. the 3/0 pin · `wireStatus`
tri-state · all four sentence shapes · the AI-reach guards · Design Feedback
ordering and the suppressed "All good." default · the SF field · no leak into
any other SF field or into Site Survey / Homeowner · all three strip states ·
"Same as design" · no BOS auto-fill · the jurisdiction flag on and off ·
readiness never flipping `ready`.

Driven in the real app on `localhost:8888` (signed in, live data, **read-only
— nothing saved**):

1. Unanswered → grey strip, amber `Wire material not confirmed · Pick`,
   **Ready to post still green**. ✅
2. 200 A → `200 A · Table 310.12 → Copper 2/0 AWG · Aluminum 4/0 AWG`. ✅
3. SLD Copper + BOS Aluminum → amber strip with the full ask; the SF
   **Design Feedback** field read back byte-identical to the strip. ✅
4. **Same as design** → teal strip, bullet flipped to "unchanged", readiness
   row went green. ✅
5. Dropdowns reset to blank; the open draft left exactly as found.

## 8. Not done / open

- **Not deployed.** Package rule — ships with the rest, backup-first.
- `feat/board-automations` still unmerged to `main`; `main` does not reflect
  production. Merge before the package goes out.
- The Design Feedback chips already include *"We suggest using Cu instead of
  AL for this run…"* — worth reviewing once the team uses the dropdowns, since
  the derived bullet may make some of those chips redundant.
- No board column for the wire material. Deliberately out of scope.
