# Checkpoint — Aluminum wiring warning on Compose

> Built 2026-10-20 from Othman's `Aluminum_Wiring_Requirements_by_Jurisdiction.xlsx`
> (Slack file F0CAT93MKQR, identical copy sits in `../` next to this repo).
> Pre-change state backed up to `_versions/v20-aluminum-warning/`.

## What was built

- **Dataset** (`src/lib/aluminumWiringData.ts`, GENERATED — never hand-edit):
  509 Texas jurisdictions × verbatim "Aluminum Requirement" text. Stance mix:
  157 Allowed per NEC · 32 Restricted · 24 Not allowed · 193 Unknown—call city ·
  103 No local code (NEC 2023 + utility rules).
- **Generator** (`scripts/import-aluminum-xlsx.mjs`): when Othman ships a new
  list, run `node scripts/import-aluminum-xlsx.mjs "<xlsx path>"`. Deterministic
  and loud — wrong header, blank cell, or duplicate jurisdiction aborts with
  nothing written. Prefix twins (see below) print a warning, not an abort.
- **Lookup** (`src/lib/aluminumWiring.ts`): `matchAluminum(jurisdiction)`.
  Exact normalized-name match wins; "City/Town/Village of X" is stripped on
  both sides as a fallback, but ONLY when unambiguous — the list really has
  both **City of Lakeside** and **Town of Lakeside** (different jurisdictions),
  so a bare "Lakeside" matches nothing rather than guessing.
- **Compose banner** (`ComposeTab.tsx` + `.alu-banner` in `theme.css`): one
  dense yellow line under Jurisdiction — `⚠ Aluminum wiring — {name}:
  {requirement}` — using the existing `--dyn-warn-bg/-ink/--dyn-yellow` idiom.

## Decisions (Aboud's, 2026-10-20 — do not re-litigate)

- **Shows for EVERY matched jurisdiction**, including "Allowed per NEC"
  (asked; he picked "every matched" over restricted-only).
- **Display-only.** Never appended to the post text, no approval checkbox —
  unlike the AHJ banner. A test pins this.
- **Static dataset, not boards.** 509 read-only rows don't belong in the
  Requirements tab. Salesforce will carry this on the jurisdictions object
  eventually (Othman, Slack); until then the sheet is the truth and a new
  sheet is one regeneration away. Desktop + anywhere ComposeTab renders.

## What was tested

- `src/lib/aluminumWiring.test.ts` (7): case/whitespace-insensitive match,
  prefix stripping both directions, Lakeside ambiguity → null, unknown/empty →
  null, dataset integrity (509 rows, none blank, Pasadena → Restricted).
- `src/components/ComposeTab.aluminum.test.tsx` (2): banner appears with the
  stance for "Addison", clears for an off-list value; stance never leaks into
  the post preview.
- Full gate: **851/851 tests**, `tsc --noEmit` clean, eslint clean,
  `vite build` ok, `check:nosecrets` ok. (One full-suite run straight after a
  cold cache hit the documented parallel-load timeout flake across ~13 files;
  two clean full runs followed. Same pre-existing behavior as
  `_CHECKPOINT_sf_report_import.md` notes.)

## Pending

- **UNCOMMITTED, like the sfWorkbook work** — "don't deploy anything" stands;
  ask before committing, ask again before deploying.
- Not visually checked in a real browser (jsdom only) — worth a 10-second look
  on `netlify dev` before shipping.
- If Salesforce starts exporting the stance per project, the lookup can switch
  source without touching the banner.
