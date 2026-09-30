# Checkpoint — Phase 8, the Option A redesign

**Date:** 2026-09-30 · **Requested by:** Aboud · **Design:** `uiux-design-handoff/ui-ux-improvement-request/project/SOW Post Generator - Option A (Tabs + Live Preview).dc.html`

All five screens rebuilt against the Claude Design handoff, plus four fixes
Aboud asked for after seeing Compose running locally. Commits `a141ccc`,
`bb55aaa`, `be5e4a4`. Pre-change state archived to `_versions/v4-phase7/`.

The `claude_design` MCP was not connected in this session either. It was not
needed — the handoff zip had already been extracted to `uiux-design-handoff/`,
and per its own README the prototypes were read as source, not rendered.

---

## Decisions taken before building

| Question | Answer |
|---|---|
| Design drops **Save as Draft** for a "saved automatically" line | **Keep both.** The button was added after two projects were lost; the line alone is not the same reassurance. |
| Figtree: CDN, bundled, or skip | **Bundled locally.** No third-party request per page view, no flash of unstyled text. |
| Delivery | **Compose first**, reviewed on localhost, then the other four. |

## Global

- **Figtree, self-hosted.** `theme.css` already declared `--font-sans: 'Figtree'`
  but nothing ever loaded it, so the app had been silently falling back to
  Helvetica since the token was written. Google serves **one variable file per
  subset** covering weights 300–900, so the four weights the design uses need
  two files (30 kB), not the eight the CSS lists (132 kB of duplicates).
  Arabic has no Figtree glyphs and falls back per-glyph, as in the prototype.
- New surface tokens from Option A: `--dyn-bg #f4f6f7`, `--dyn-line #eef1f2`,
  `--dyn-border #e3e8ea`, plus the teal/warning/highlight tints the design uses.

## Header

Tabs moved into the navy bar with a count badge on Drafts; Sync and AI merged
into one pill with a dot each; "Posting as" moved out of the Source card and
into the bar. The bar is sticky, because the tabs now live in it.

## Compose

Two columns. The form's separate cards are flattened into one sectioned card by
a wrapper — the children are still `.card` elements, so no markup had to be
restructured. A sticky aside carries:

- **Readiness card** replacing the red "Required before copying:" line. Same
  source of truth (`missingRequired`), shown as a tick-list so you see what is
  done as well as what is missing, with the action beside each gap.
- **Live Slack preview**, `max-height: calc(100vh - 300px)`.

Secondary actions (Copy plain text, AutoCAD title block) moved into a `···`
menu. The Level `<select>` became four colour-coded cards, dots per the 2026
standard's own grading; still chosen by hand, nothing infers a level.

Below 980px the aside drops under the form and stops sticking, so the
one-page vertical flow comes back on a narrow screen.

## Drafts · History · AHJ · Settings

- **Drafts** — page header with count and `+ New post`, pill filter row, and
  the **Readiness column** in three states (`Ready` / `Missing <field>` /
  `Missing N fields`). Mark as posted is inline and appears only once a draft
  is ready; the Readiness cell explains why when it is not. Duplicate and
  Delete moved into a per-row `···`. "Mark as done" renamed **Mark as posted**,
  matching the design and the Compose button that does the same thing.
- **History** — Customer + "by author" in one cell, Region and Drivers columns,
  Posted as a date, Copy again per row.
- **AHJ** — the dropdown picker became a permanent left pane listing every
  board with its alias line and post count. The board, composer and post
  articles already matched the design.
- **Settings** — three sections in one card, label + description on the left,
  controls on the right.
- **ListControls** restyled as the pill row. All six filters kept; the design
  shows four, but dropping a working filter is not a re-layout. Each label
  moved into its own default option (`All regions`, `Everyone`) so the labels
  could go without the controls becoming a mystery.

---

## Also fixed this phase (Aboud, after seeing Compose)

### Saving — "the guys are losing their data"

Two real holes, both closed, both with tests that failed first:

1. **`saveRecords()` was a whole-key overwrite** of the in-memory array. Any
   writer holding a stale array — a second tab, or this tab just after a
   background sync landed — silently deleted the other one's work, with no
   error. It now merges over what is on disk, newest `updatedAt` per id
   winning: a write can add and update but **never remove**. Deletes still
   work, being tombstones with a newer timestamp.
2. **The 500 ms autosave debounce had no crash protection.** `beforeunload`
   covers closing a tab; it does not fire on a power cut or a forced shutdown.
   A new `sowpost.live` key holds the open record, written **synchronously on
   every change**, restored on load when newer than the saved copy.

Plus a `storage` listener so a second tab refreshes instead of showing a stale
list.

### Three smaller ones

- **Install Scheduled Date** stopped being required in Phase 7, but its label
  still carried a `*` — the only asterisk in the form — so it still read as
  required.
- **Orientation** gains `Interior - Garage`.
- **"Posting as"** could be pushed off the right edge of the header, because
  the tab strip was allowed to grow without limit. Tabs now scroll; the
  right-hand controls never shrink. It also rendered blank when the current
  author had been removed from the roster.

## Tested

- `npx vitest run` — **248 passed / 248**, 19 files (before Phase 8: 237).
  New: 6 in `storage.persist.test.ts` for the merge-on-write and live-draft
  behaviour, 3 in `App.integration.test.tsx` for crash recovery.
- `npx tsc --noEmit` clean · `npx eslint src netlify` clean
- `npx vite build` clean (317.89 kB js / 98.21 kB gzip; CSS 22.65 kB)
- `node scripts/check-no-secrets.mjs` OK

Existing tests were updated only where the UI deliberately changed — tab
labels, the merged status pill (now queried by `title`), the Slack preview
heading, button renames, picking a level by clicking its card, and scoping
alias assertions to the board pane now that aliases appear in two places. No
assertion was weakened to make it pass.

## Not verified by tests — needs a human

1. **How it actually looks.** Every check here is behavioural; none of it
   proves the layout reads well at your screen width. This is the one that
   needs eyes on `localhost:8888`.
2. The four live checks from `_CHECKPOINT_installation_notes.md` are still
   open, and three of them still need a deploy — `netlify dev` does not receive
   `OPENAI_API_KEY`, so the AI buttons are disabled locally.

## Deliberately not done

- **Warning strip "Looks right" / "Dismiss" actions.** The design shows
  dismissible warnings; that is new state on the record, not a re-layout.
- **Per-field highlight in the live preview** (`it.hl` in the prototype)
  showing which bullet just changed — also new logic.
- **"Coordination info from Salesforce ▾" popover** — the data is already on
  screen in the existing card.
- Prod is still Phase 6. Nothing here is deployed.
