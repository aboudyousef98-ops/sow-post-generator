# Checkpoint — full review of phases 1–7, and the fixes

**Date:** 2026-09-30 · **Requested by:** Aboud · **After:** Phase 7 merge to `main`

A review pass read every phase and then drove the app with real and hostile
input in throwaway jsdom tests. Ten findings; **seven were real and are fixed**,
one was wrong, two were left alone deliberately. Commit `53e0de6`.

---

## Fixed

| # | Severity | What was wrong |
|---|---|---|
| 1 | data loss | An empty string back from the model silently erased a note |
| 2 | wrong output | Editing a box mid-polish published the text you had deleted |
| 3 | data loss | Opening a draft discarded the last 500 ms of typing |
| 4 | crash | Three malformed record shapes white-screened the app, permanently |
| 5 | confusing UI | AI guard hints followed you onto the next project |
| 6 | confusing UI | An over-long note failed with a bare `bad payload` |
| 7 | regression | Installation Notes text was not searchable in Drafts/History |

### 1. An empty AI reply erased the note (the worst one)

`effectiveText` treats `''` as a valid polished value, so an empty answer made
the box contribute nothing. Both guards are explicitly disabled for that case —
`droppedTokens` and `bulletCountChange` each bail on `!polished.trim()` — so
**nothing warned**. The textarea still showed the engineer's note while the
Slack post carried `Design Feedback: All good.`; for an install box the whole
`Conduit Raceway` bullet vanished.

Reachable because the server prompt itself says *"If a note is empty or only
whitespace, return an empty string for it"* — a model misapplying that to a
short note reproduces it. A blank reply is now treated as "the model skipped
this box", which keeps the raw draft.

### 2. A polish landing on text you had already replaced

`setNote` clears the stale `polished[key]`, but the in-flight reply re-added it
afterwards, keyed by id and never checked against the text that was sent. Typing
`ORIGINAL LINE` → Polish → changing it to `COMPLETELY DIFFERENT LINE` mid-flight
left the textarea showing the new line and the post carrying the polished old
one, with no hint. Results are now dropped when the box no longer holds the text
that was sent; untouched boxes in the same request still apply.

### 3. Opening a draft discarded unsaved keystrokes

`newPost` force-saves `currentRef.current` before clearing — `openDraft` did not,
and replacing `current` cancels the pending 500 ms autosave. Type, click a Drafts
row within half a second, and the typing was gone. Re-opening the draft *already*
in Compose was worse: it reloaded the stale stored copy, so the text vanished
from the screen too and looked like the app had reverted you. `duplicateDraft`
now copies what is on screen rather than the last autosaved version.

### 4. Malformed records bricked the app

`records.mts` validates only `id` + `updatedAt`, and import validates only that
`records` is an array. A record missing `notes`, missing `sf.customerName`, or
with a `level` outside 1..4 threw in `template.ts` / `ComposeTab.tsx`. The
reachable path: such a record arrives from the shared team store and is written
to localStorage **before** the crash, so every reload crashed too and the only
way out was clearing site data by hand.

Now normalized in `migrateRecord()` — the one place every record passes through,
from localStorage, team sync and import alike. `ErrorBoundary.tsx` is the second
line of defence: it shows the error with **Reload**, **Download backup** and
**Clear local data and restart** instead of a blank page.

### 5. Guard hints leaked across projects

`dropped`, `bulletDrift`, `rawPairs`, `manualFields` and `extractState` are
component state and were never reset when the record changed. A brand-new post
could show `AI output dropped: 2", PVC` under an empty box. All per-project
scratch state now clears on `record.id`.

### 6. Over-long notes

The server caps a box at 3000 characters; the client sent 3500 anyway and
surfaced the raw `bad payload`. The UI now refuses it up front and says which
number it is over by. `MAX_NOTE_CHARS` lives in `api.ts`, and a test in
`rewriteSchema.test.ts` fails if it ever drifts from the schema.

### 7. Installation Notes were unsearchable

`listQuery` searched `Object.values(r.notes)` only. That text used to live in
`notes.layout` and *was* searchable before Phase 7 moved it.

**Also:** a line that is only punctuation (`-`, `*`, `...`) no longer reaches
Slack as a bullet reading `-.`. The labelled install boxes already dropped these
via `clause()`; the two paths now agree.

## Reported but NOT changed

- **Walls with an unset orientation.** Reported as "prints a half-truth":
  `walls: 2`, only Wall 1 set → `Installation on two walls (North).` This is
  **specified behaviour** — `spec/10 §3.1` lists exactly this case as "blanks
  skipped", and a test already encodes it. Left as is. Say the word if you want
  it to read `Installation on two walls.` until both are chosen.
- **Chip `{placeholders}` reach the post verbatim.** `spec/06` lists the chips
  with the braces, so this reads as a deliberate fill-in-the-blank. Worth a
  decision later: substitute `{jurisdiction}` automatically, or warn on copy.
- Two tabs of the app in one browser can clobber each other's localStorage on
  the unload flush. Self-heals through the team store; not chased.
- With the Authors roster emptied in Settings, "Posting as" renders blank while
  the record still holds the old name. Cosmetic.

## Tested

- `npx vitest run` — **237 passed / 237**, 18 files (before this pass: 219).
  18 new regression tests: 6 in `App.integration.test.tsx` for the AI paths,
  2 for the draft race, 5 in `storage.test.ts` for malformed records, 2 in
  `listQuery.test.ts`, 2 in `noteText.test.ts`, 1 limit-sync test in
  `rewriteSchema.test.ts`.
- Every fix was written test-first: each new test was seen to fail against the
  old code before the fix went in.
- `npx tsc --noEmit` clean · `npx eslint src netlify` clean
- `npx vite build` clean (312.86 kB / 97.06 kB gzip)
- `node scripts/check-no-secrets.mjs` OK

The review's throwaway probes lived in `src/__review__/` and were deleted once
the scenarios worth keeping had been ported into the permanent suite.

## Confirmed clean by the review

Full paste → edit → level → all 13 Installation Notes controls → 3 feedback
boxes → preview → Copy for Slack (rich + plain); HTML escaping of `<script>`
and `<img onerror>`; CRLF, blank lines, emoji, RTL Arabic, quotes, `&`, 5000
characters; `-20 ft`, `2" PVC`, `#3 AWG Cu THWN`, `1-1/4"`, `200A`, `1.5 ft` all
survive verbatim; the pre-Phase-7 migration including idempotency and not
resurrecting cleared text; save/reopen of every install field; mark-as-posted +
Undo; frozen `finalText` in History; export → re-import with no duplicates;
AHJ add / alias-dedupe / post / approve / reopen / rename; and the guarantee
that dropdown values are never sent to the model.

## Still not done

- **Deploy.** Prod is still Phase 6.
- The four live checks in `_CHECKPOINT_installation_notes.md` — three of them
  need the deploy, because `netlify dev` does not receive `OPENAI_API_KEY`
  locally (health reports `hasKey: false`, so the AI buttons are disabled).
