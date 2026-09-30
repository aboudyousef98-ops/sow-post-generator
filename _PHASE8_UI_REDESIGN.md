# Phase 8 — UI redesign from the Claude Design handoff (queued)

> **Done, 2026-09-30.** Built across commits `a141ccc`, `bb55aaa`, `be5e4a4`.
> What shipped, what was decided and what was deliberately left out is in
> `_CHECKPOINT_phase8_ui.md` — read that, this file is the brief it was built
> from. The open questions below were answered before building; the answers
> are recorded in the checkpoint.

## Source

Handoff bundle: `Project submission notes/UIUX improvement request-handoff.zip`,
extracted to `Project submission notes/uiux-design-handoff/`.

Primary design — the file Aboud had open when he exported:
`uiux-design-handoff/ui-ux-improvement-request/project/SOW Post Generator - Option A (Tabs + Live Preview).dc.html`

Also in the bundle:
- `SOW Post Generator - Current.dc.html` — a mockup of today's app, for diffing (773 changed lines against Option A).
- `OptionB.dc.html` — **byte-identical to Option A.** Flagged to Aboud; if he meant to export a genuinely different Option B, it did not make it into the bundle.
- `sow-data.js` — sample data (`window.SOW_DATA`: levels, houPosts, install, runs, feedback, tags, drafts, history). Mock content only; it mirrors the real model, it is not a schema.
- `support.js` — the Claude Design runtime (`dc-runtime`, generated). **Not to be ported.** It only exists to make `sc-if` / `sc-for` / `{{ }}` bindings run in the prototype.
- `dyn-logo.png` — already in the repo at `public/dyn-logo.png`.

The `claude_design` MCP was **not available** in the session (no server, no `/design-login`); the zip contained every file, so it was used directly. Per the bundle's own README, the prototypes were read as source rather than rendered.

## Decisions taken

- **Sequencing: Phase 7 finishes first.** Option A already assumes Phase 7's feature set exists — Installation notes with the Walls/Wall 1/Wall 2/Stories/Service dropdowns, the Conduit raceway block, the planning-window line, the AHJ banner with its append checkbox, the draft/polished toggle. Building the redesign on a finished base avoids doing that work twice, and avoids two agents editing `ComposeTab.tsx` at once.
- **Scope: all five screens** — Compose, Drafts, History, AHJ Requirements, Settings. A half-restyled app reads as broken.
- **Not a rebrand.** The design's palette is exactly the tokens already in `src/theme.css`: `#043d4f` navy, `#05bec0` teal, `#f98f30` orange, `#fcdf5e` yellow, `#1a1a1a` ink, `#3b3b3b` text, `#767676` muted. This is a re-layout.
- **The design predates the second AI button.** Its Feedback header carries a single `Polish all with AI`. Phase 7 ships two buttons (`✨ Polish with AI` and `هري ابو روي`). Controller decision, stated to Aboud and not objected to: **keep both**, fitted into the design's Feedback header. The design does not override a feature he asked for afterwards.

## What actually changes (Option A vs today)

| Area | Today | Option A |
|---|---|---|
| Compose layout | 8 stacked cards, one vertical column | Two columns: form left (`flex:1 1 520px`), sticky `aside` right (`flex:0 1 400px`, `top:72px`) |
| Right panel | — | Readiness card (checklist + Copy for Slack / Mark as posted / `···`) above a **live Slack preview** that updates as you type, `max-height:calc(100vh - 300px)` |
| Level choice | `<select>` | Four colour-coded cards in a 4-up grid, dot colours matching the 2026 standard's own grading (green/amber/orange/red), with Scope + Planning window beneath |
| Required fields | red "Required before copying:" line | tick-list in the readiness card, each row done/missing with an action hint |
| Posting as | a field in the Source card | a pill `<select>` in the header |
| Sync + AI pills | two separate pills | one combined pill, dot per service |
| Secondary actions | all buttons visible | `···` menu (Copy plain text, AutoCAD title block) |
| Drafts | plain table | rounded search + filter pills, **Readiness column**, inline Mark as posted, `···` per row |
| Cards | `.card` | `border-radius:12px; box-shadow:0 2px 12px rgba(4,61,79,0.08)`, sections divided by `1px solid #eef1f2` |
| Font | system stack | Figtree (Google Fonts, weights 400/500/600/700) |

## Open questions for the Phase 8 brainstorm

1. **Figtree is a webfont from Google Fonts.** The app currently ships no external font. Loading one adds a third-party request on every page view and a flash of unstyled text. Ask whether to bundle it locally, use it from the CDN, or keep the system stack.
2. **The readiness checklist replaces `missingRequired()`'s error line.** The underlying function already returns the right list; this is presentation. Confirm no new required field is implied.
3. **The live preview is already computed** — `buildPostHtml()` drives today's preview pane. Moving it into a sticky aside is layout, not logic. The per-field highlight (`it.hl`, `hl.customer`) showing which bullet just changed **is** new logic.
4. **The design shows no "Save as Draft" button**, replacing it with a `Draft · saved automatically · {{ savedAgo }}` line. Phase 6 added that button deliberately after two designers lost work. Confirm before removing it.
5. `Drafts` gains a **Readiness column** — needs a derived value per record; `missingRequired()` gives it, but the three-state wording (ready / nearly / missing N) needs defining.
