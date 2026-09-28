# Checkpoint — Draft safety, bulleted polish, AutoCAD title block

**Date:** 2026-09-28 · **Requested by:** Aboud · **Phase:** 6

Three changes in one pass, all approved in chat before implementation.

---

## 1. Draft safety — two coworkers lost their projects

**Root cause found in the code.** Autosave was gated on the customer name:

```ts
// App.tsx (before)
if (!current.sf.customerName.trim()) return;
```

Anything typed before the customer name existed — notes, address, jurisdiction —
was **never persisted at all**. Aboud did not know how the loss happened, so
every path that could drop work was closed rather than just the likely one.

| Fix | Where |
|---|---|
| Autosave fires on **any** filled field, not just the customer name | `App.tsx`, `lib/record.ts` → `hasContent()` |
| `beforeunload` / `pagehide` / `visibilitychange` flush straight to localStorage | `App.tsx` |
| **New post** force-saves the open record before clearing the form | `App.tsx` → `newPost()` |
| Explicit **💾 Save as Draft** button, bypasses the 500 ms debounce | `OutputColumn.tsx` → `saveDraftNow()` |
| Drafts rows show **Untitled draft** instead of `—` for unnamed drafts | `DraftsTab.tsx` |

**✅ Mark as done on each Drafts row** — freezes `finalText`/`finalHtml` and moves
the record to History without opening it in Compose. `markAsPosted()` was
refactored into `markPostedById(id)`; Compose only resets when the record being
posted is the one open in it. Two-step inline confirm (not `window.confirm`),
disabled while required fields are missing, Undo in the toast.

## 2. AI polish keeps bullet points

Two separate causes — both fixed:

1. The system prompt literally said *"Keep each note as prose sentences (1–4
   sentences). No bullet lists."* → replaced with a **line-preserving, minimal-edit**
   contract: same number of lines, same order, never merged, the engineer's own
   wording kept where it was already correct. `temperature` 0.2 → 0.1,
   `max_tokens` 600 → 900.
2. Even correct output would have been flattened: `template.ts` rendered each
   note as a single inline value. A multi-line note now renders as sub-bullets
   (`◦` in Slack, nested `<ul>` in the rich clipboard); single-line notes stay
   inline exactly as before.

Bullet characters the writer types (`-`, `*`, `•`) are stripped so they are not
rendered twice. A dash or asterisk must be followed by a space, so `-20 ft` and
`*2 AWG` keep their first character.

**Guard:** `bulletCountChange()` compares the bullet count in vs out and Compose
shows *"AI returned 1 bullet instead of 3"* when the model disobeys.

**Model:** stays **`gpt-4o-mini`**. Aboud originally asked for a cheaper model;
`gpt-4.1-nano` was offered and declined once the saving was quantified
(~10¢ per 1,000 polishes) against the risk of more drift from the source text.

## 3. Region line + AutoCAD title block

**Region line changed for every post** (Aboud, this session): the Salesforce
region text with the metro beside it on *every* project, not only unrecognized ones.

| Input | Post prints |
|---|---|
| SF `Houston / Beaumont`, region HOU | `Houston / Beaumont – Near HOU` |
| SF `Corpus Christi`, region OTHER → HOU | `Corpus Christi – Near HOU` |
| Manual entry, no SF paste | `HOU` (no redundant `HOU – Near HOU`) |
| OTHER, metro not resolved yet | `Corpus Christi` |

Note the abbreviation change: `– Near Houston` → `– Near HOU`.

**Title block panel** — collapsed card in Compose under the preview
(`TitleBlockCard.tsx`). Five values matching the pre-printed PROJECT INFORMATION
table: Project Name (customer name), Property Address, Region, AHJ
(jurisdiction), SOW Coordinator (the "Posting as" author). One Copy button per
row (always works) plus **Copy all 5**, which writes a single-column HTML table
and newline text so one paste can fill the column.

**Region in the title block is the SF text ALONE** — no `– Near` suffix, unlike
the post.

---

## Tested

- `npx vitest run` — **130 passed / 130** (baseline before this work: 107).
  - `template.test.ts` 18 → 30: region matrix, sub-bullets in text + HTML,
    stripped bullet chars, polished multi-line, title block mapping + TSV.
  - `tokenGuard.test.ts` 5 → 10: merge, split, preserved, blank lines, empty.
  - `App.integration.test.tsx` 5 → 11: notes saved with no customer name and
    surviving a reload; New post saving inside the debounce window; Save as
    Draft; empty-form refusal; mark-as-done from a row incl. the confirm step
    and cancel.
- `npx tsc --noEmit` clean · `npx eslint src netlify` clean
- `npx vite build` clean · `node scripts/check-no-secrets.mjs` OK

## Not verified by tests — needs a human

1. **The AI prompt itself.** There is no local `OPENAI_API_KEY` (it lives only in
   Netlify), so the new prompt could not be exercised before deploy. Verify on
   the live site: type a 3-line note, Polish, confirm three bullets come back.
2. **The AutoCAD multi-cell paste.** Whether AutoCAD accepts Chrome's HTML-table
   clipboard is untested. The five single Copy buttons are the guaranteed path.

## Backup

Pre-change `src/` and `netlify/` copied to `_versions/v2-phase5/`.
