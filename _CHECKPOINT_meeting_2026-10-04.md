# Checkpoint — Meeting batch 2026-10-04 (Installation Notes + post changes)

## What was built
1. **Service equipment → multi-tick.** `services?: ServiceWork[]` replaces the
   single `service` pick (old field kept deprecated; `servicesOf()` falls back
   to it so pre-change drafts render and show their tick). UI is three
   checkboxes; post renders one sentence in fixed MPU/FSU/FTP order:
   "This project requires an MPU and an FSU." Unticking everything also clears
   the legacy field.
2. **Walls up to 5** ("four walls"/"five walls"), **stories up to 3**
   ("3-story house.").
3. **Main disconnect location removed** from the form and the post. The field
   stays in the type (deprecated) so stored drafts parse; old content simply
   no longer renders.
4. **Power disconnect duration — automatic with manual override** (revised
   twice 2026-10-05). Dropdown defaults to "Automatic — <derived value>":
   `disconnectDurationFor(notes, sf.utility)` gives 4–6 hours when MPU or FSU
   is ticked or the utility matches TNMP / Texas-New Mexico, else 1–2 hours,
   and the option label live-updates with the ticks. Picking 1–2 or 4–6 pins
   it (`disconnectDuration` override field; undefined = automatic). The line
   renders on EVERY post ("Expected power disconnect duration: …").
5. **Roof rating 1–10** (revised 2026-10-05) — replaces the condition dropdown
   with Mohammed Azizi's Roof Rating System (design-sow-team, 2026-09-24):
   9–10 Prime / 7–8 Good / 5–6 Conditional / 3–4 Poor / 1–2 Unviable.
   Post line: "Roof rating: 8/10 (Good) — workable with small adjustments."
   Banners in the card: rating ≤2 → "do not install" always; 3–4 + install
   date set → "alert the team".
6. **CLR Agent + Project Manager tags** — same contract as designerTag:
   `clrAgentTag`/`pmTag` on the record, two Compose dropdowns, appended to the
   tag line (fixed → lead → designer → CLR → PM → extras), rosters editable in
   Admin → Settings. Seeded: CLR = Adam Hallett, Blake Armstrong, Alexandria
   Mullen, Tre Goodloe, Austen Hallett; PM = Mirna Jamalieh, Joud Samardali,
   Ghawi Mahmoud, Yasmeen Momani, Mua'ath Ali. Existing stored settings gain
   the lists automatically via `loadSettings()` default-merge.

## Files
- `src/types.ts`, `src/lib/installNotes.ts`, `src/lib/record.ts`,
  `src/lib/template.ts`, `src/lib/storage.ts`
- `src/components/InstallNotesCard.tsx`, `ComposeTab.tsx`, `SettingsTab.tsx`
- `src/theme.css` (.service-ticks, .field-hint, .roof-warning)
- Tests: installNotes/record/storage/template .test.ts,
  InstallNotesCard.test.tsx, App.integration.test.tsx

## Tested
TDD throughout (every change watched fail first). Full suite
**367/367 pass** (28 files); `tsc --noEmit`, `eslint src netlify`, and
`npm run build` all clean. Golden full-post test carries the automatic
4–6-hour line for the MPU fixture; the always-on duration line is asserted
across the installNotes/template suites.

## Pending
- NOT deployed; changes uncommitted (same as the Daily Progress batch).
- Dev server running locally — hot reload shows everything at localhost:8888.
