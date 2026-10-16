# Checkpoint — Formatting toolbar (2026-10-17)

Closes owed item #1 from the 2026-10-08 session.

## What was built

A light formatting toolbar on the notes and requirements composers. Bold, italic,
strikethrough, bulleted list, numbered list, checkbox.

**Storage format is Slack's own wire format** — `*bold*`, `_italic_`, `~strike~`,
and `• ` / `1. ` / `☐ ` line leaders. Nothing new is stored; the text in Blobs is
exactly what you see in the textarea. Aboud's requirement, verbatim: *"when i do
copy paste to slack to have the format as it is on our website."*

That works because the website now draws notes as **real `<ul>` / `<ol>` /
`<strong>` / `<em>` / `<s>` nodes** instead of a `pre-wrap` block of text. A
browser selection-copy off the page therefore carries the structure into Slack,
and `renderMarksHtml()` produces the identical HTML for the clipboard path.

### Files

| File | Role |
|---|---|
| `src/lib/richText.ts` | Parser + `renderMarksHtml()` for the clipboard |
| `src/lib/richText.test.ts` | 28 tests |
| `src/components/RichText.tsx` | React renderer, mirrors the HTML exactly |
| `src/components/FormatToolbar.tsx` | Toolbar, `continueList()`, `formatHotkey()` |
| `src/components/FormatToolbar.test.tsx` | 17 tests |
| `src/components/SowNotesTab.tsx` | Wired: composer, edit box, display, print |
| `src/components/AhjTab.tsx` | Wired: composer, edit box, display, print, history |
| `src/theme.css` | `.fmt-bar`, `.fmt-btn`, `.rich` |

`AhjTab` is one generic component for all three requirement kinds, so a single
composer + edit box covers AHJ, Utility and Funding.

## Deliberately NOT a markdown library

Engineers type `#`, `>` and `_` inside part numbers and conduit callouts. A real
markdown parser would eat `PV_MOD_01` and `2*3`. Every rule is boundary-guarded:
a mark only opens after a non-word character, only closes before one, must have
content, and must have a matching close on the same line — otherwise the
delimiter stays literal. There is a test case per literal that must survive.

## Extras beyond the agreed scope

- **Enter continues a list** (and an empty item ends it). A list toolbar feels
  broken without it. Shift+Enter is unaffected.
- **Ctrl+B / Ctrl+I** on all four composers.
- **Version history preview** also renders formatted, so a restore shows the
  real thing.

## Out of scope (unchanged, per 2026-10-08)

The Compose feedback boxes. They go through the AI polish path where marks
collide with the bullet-count guard.

## Verification

- `npx vitest run` → **625 passed / 41 files** (was 608 / 40 — +17, zero regressions)
- `npx tsc --noEmit` → clean
- `npx eslint src netlify` → clean
- `npm run build` → succeeds

## Pending

- **Not deployed.** Needs `npx netlify deploy --build --prod`. No AI code paths
  were touched, so this is testable on localhost — unlike the note check.
- Aboud to eyeball the toolbar styling on a real board.
