# Checkpoint — Installation Notes, planning window, second AI mode

**Date:** 2026-09-30 · **Requested by:** Aboud · **Phase:** 7

Plan executed: `_PLAN_phase7_installation_notes.md` (Tasks 1–14).
Branch: `phase7-installation-notes`, 21 commits on top of Phase 6 (`3621f0b`).

---

## 1. The install date is optional

A project with no scheduled install date is a normal case, not an error. The
date left the required-field list and both parser warnings about it were
deleted. With no date the `Installation Date & Day` bullet simply does not
render; Copy for Slack, Mark as posted and Mark as done all work without it.

## 2. "Installation Layout" is replaced by a guided Installation Notes section

The single free-text box became structured input (`lib/installNotes.ts`,
`components/InstallNotesCard.tsx`, `components/NoteBox.tsx`):

| Field | Control |
|---|---|
| Walls (1 / 2) + orientation per wall | dropdowns |
| Stories | dropdown (+ free text for "other") |
| Service equipment (MPU / FSU / FTP / none) | dropdown |
| Battery location, main disconnect location | text boxes |
| Load / grid-service / solar / battery runs | text boxes |
| Special cases, Anything else | text boxes |

**Why dropdowns:** these five values are the ones that must never drift. Because
they are not free text they are never sent to the model, so no AI pass can
change a wall count, an orientation or an MPU.

The post now carries **two** bullets where it carried one — `Installation Notes`
and `Conduit Raceway` — each rendered as sub-bullets, each vanishing entirely
when empty.

**Migration:** `migrateRecord()` moves any existing `notes.layout` text into
`installNotes.other` ("Anything else") on load, from both entry points
(localStorage and team sync). Nothing a designer wrote is lost.

**Also fixed here:** `loadSettings()` did `{ ...defaults, ...stored }`, so a
stored `chips` object replaced the defaults wholesale — no new chip would ever
have reached a browser that had saved settings once. `chips` is now always taken
from `defaultSettings()` (correct while no chip editor exists); `defaults` merges
per key so an edited phrase still wins.

## 3. `/api/rewrite` takes a keyed payload

The endpoint took four fixed note fields. It now takes
`{ items: [{ id, text }], mode }` — one entry per non-empty free-text box, with
`id` from a shared 11-key enum. `rewriteSchema.ts` is unit-tested without a
Netlify runtime, and a test fails loudly if its key list drifts from
`POLISH_KEYS` in the client.

The drop/drift guards now run **per box**: a missing number or a changed bullet
count is reported under the specific field that suffered it, not once for the
whole form.

## 4. Second AI mode — `هري ابو روي`

Polish is deliberately constrained never to drift from the engineer's wording,
which makes it the wrong tool for a rough or mixed-language note. A second
button sends `mode: 'rewrite'`, which selects a different system prompt
(temperature 0.3 vs 0.1): a full rewrite that may change every word of a line
but still may not change what the line says, merge lines, split lines or drop a
number. Both guards stay on for both modes.

`polishMode` records which button produced each box, so a reopened draft shows
🔄 instead of ✨ on text the machine reworded. `mode` is optional and defaulted
server-side, so a browser running the old bundle keeps working.

## 5. Planning window in the post

The window was only ever on screen, under the level select — the crew reading
the Slack post could not see how many crew-days to reserve. `Project
Classification` is now a two-value bullet:

```
• *Project Classification:*
    ◦ Level 3 – Service Equipment Modification.
    ◦ Planning window: 1.5 to 2 crew-days.
```

`LEVEL_INFO` windows were corrected to the 2026 standard's own wording
(`SOW Complexity Classification.pdf` p.2): `1 to 1.5 crew-days`, not
`1–1.5 crew-days`. The Level 4 clause *"field verification before scheduling &
material release"* moved out of the window and onto the end of its scope — the
PDF lists it (p.6) under **Pre-construction control**, and it is not a duration.

## 6. Chip defaults

`install.other` inherits the old layout chips minus the three the dropdowns now
cover (1-story, 2-story, two walls). `install.specialCases` is new. The combined
"measurements and wide-angle photos" chip is split in two, since they are
separate asks of the surveyor. Two SLD chips added to `design`.

---

## Tested

- `npx vitest run` — **219 passed / 219**, 18 files (baseline at Phase 6: 130).

  | File | Tests |
  |---|---|
  | `src/lib/template.test.ts` | 43 |
  | `src/lib/installNotes.test.ts` | 22 (new) |
  | `src/lib/ahj.test.ts` | 17 |
  | `src/App.integration.test.tsx` | 16 |
  | `src/lib/parser.test.ts` | 15 |
  | `src/lib/classify.test.ts` | 14 |
  | `src/lib/tokenGuard.test.ts` | 12 |
  | `netlify/functions/lib/rewriteSchema.test.ts` | 11 (new) |
  | `src/lib/storage.test.ts` | 11 |
  | `netlify/functions/lib/guard.test.ts` | 9 |
  | `src/components/AhjTab.test.tsx` | 9 |
  | `src/lib/noteText.test.ts` | 9 (new) |
  | `src/components/InstallNotesCard.test.tsx` | 6 (new) |
  | `src/lib/listQuery.test.ts` | 6 |
  | `src/lib/geo.test.ts` | 6 |
  | `src/lib/record.test.ts` | 5 |
  | `src/lib/storage.settings.test.ts` | 5 |
  | `src/components/SettingsTab.test.tsx` | 3 |

- `npx tsc --noEmit` clean · `npx eslint src netlify` clean
- `npx vite build` clean (310.12 kB js / 96.12 kB gzip)
- `node scripts/check-no-secrets.mjs` OK

**Mutation-checked:** the "each button sends its own mode" test was written after
its implementation, so it was verified by breaking the code — hardcoding
`mode: 'polish'` in `api.ts` fails the rewrite assertion.

## Not verified by tests — needs a human

1. **The revised AI prompt has never run.** There is no local `OPENAI_API_KEY`
   (it lives only in Netlify). On the live site: fill three conduit runs and a
   3-line Design Feedback, press **Polish**, and confirm each box comes back
   separately with its bullet count intact. If the model merges them, the red
   "AI returned N bullets instead of M" hint fires under the specific box.
2. **The rewrite prompt has never run either.** Same check with **هري ابو روي**,
   plus one deliberately rough or Arabic line — confirm it comes back as English
   with the same number of lines and every number intact.
3. **A real pre-Phase-7 draft.** Open a draft created before this deploy and
   confirm its old Installation Layout text is sitting in **Anything else**, and
   that the post reads the same as it did.
4. **Still open from Phase 6:** whether AutoCAD accepts the "Copy all 5"
   multi-cell paste. The five single Copy buttons are the guaranteed fallback.

## Not done here

- **Deploy.** Netlify has no git integration; nothing ships until
  `npx netlify deploy --build --prod` is run from the repo root.
- **Merge to `main`.** The work is on `phase7-installation-notes`; `main` is
  still Phase 6.
- **Phase 8 UI redesign** — queued, with its open questions, in
  `_PHASE8_UI_REDESIGN.md`.

## Backup

Pre-change `src/` and `netlify/` copied to `_versions/v3-phase6/`.
