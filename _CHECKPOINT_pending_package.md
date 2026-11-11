# Pending feature package — NOT DEPLOYED

> Aboud 2026-11-06: "dont deploy btw, we will save this, do a package of
> features, then we deploy."

Running list of work that is finished and tested locally but deliberately
**not shipped**. Deploy the whole package at once, following the live-data
backup rule in `CLAUDE.md` §"Deploy rule".

Branch: `feat/board-automations` (still unmerged to `main` — see below).

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

Full gate green: `vitest run --no-file-parallelism` → **69 files, 1248 tests**.
`tsc --noEmit` and `eslint` clean. Driven in the real app on `localhost:8888`.

---

## Blocking the deploy

1. **`feat/board-automations` is not merged to `main`.** `main` does NOT
   reflect production; the 2026-11-05 deploy (`6aeca8d9`) shipped from this
   branch. Merge before the package goes out.
2. Live-data backup is **mandatory** before and after — pull all Netlify
   Blobs into `_versions/vNN-live-backup-YYYY-MM-DD/` and diff after.

## Designed but not built

- **Slack material-requests capture** — brainstormed 2026-11-05/06, design
  agreed (batch "Paste from Slack" inbox + soft popup at "Working on it" +
  hard gate at Ready to submit / Done). Spec not yet written.

## Unrelated, still open

- Rebecca Post is live at "New project" with Hamzah's special-order Cu SER
  wire request (Slack, Nov 3) un-actioned.
