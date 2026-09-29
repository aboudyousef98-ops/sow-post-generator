# Phase 7 — Installation Notes & Optional Install Date: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the install date optional, and replace the free-text `Installation Layout` note with guided Installation Notes + Conduit Raceway sections driven by dropdowns and labelled boxes.

**Architecture:** Two new pure modules (`lib/noteText.ts` for shared text helpers, `lib/installNotes.ts` for the sentence builders) feed `lib/template.ts`, which grows one bullet into two. The record gains an optional `installNotes` object; `polished`/`usePolished` are re-keyed from the four-value `NoteKey` to an eleven-value `PolishKey`. `/api/rewrite` moves from a fixed four-field payload to a keyed `items` list so only non-empty free text is sent. A `storage.migrateRecord()` pass moves pre-Phase-7 `notes.layout` text into `installNotes.other` on load.

**Tech Stack:** React 19 + Vite 6 + TypeScript, Vitest (node env by default; `// @vitest-environment jsdom` docblock per file for DOM tests), Netlify Functions (`.mts`, zod), Netlify Blobs.

**Spec:** `../spec/10-installation-notes.md` — read it alongside this plan. Supporting context: `../spec/06-output-template.md`, `_CHECKPOINT_drafts_bullets_titleblock.md`.

## Global Constraints

- **Repo root for every path in this plan:** `Project submission notes/sow-post-generator/`. The `spec/` folder is its sibling, outside git.
- **Never `git init` above the repo root** (CLAUDE.md §0). `Cowork Database/` holds real secrets.
- **No credentials in code.** `OPENAI_API_KEY` is server-side only; the client only ever sees `VITE_API_PATH_TOKEN`.
- **Model stays `gpt-4o-mini`** (`OPENAI_MODEL_TEXT` default). Decided 2026-09-28; do not change it, do not change `temperature: 0.1` or `max_tokens: 900`.
- **`schemaVersion` stays `1`.** Every model change in this plan is additive.
- **Level names are verbatim** from `LEVEL_NAMES` — never reworded.
- **Post wording is verbatim** from spec/10 §3.1 and §4. `Installation on two walls (North, West).`, `1-story house.`, `2-story house.`, `This project requires an MPU.`, `Battery location:`, `Main disconnect location:`, `Special cases:`, `Load run:`, `Grid/service run:`, `Solar run:`, `Battery run:`.
- **Gate before every commit:** `npx vitest run` green, `npx tsc --noEmit` clean, `npx eslint src netlify` clean. Before the final commit also `npx vite build` and `node scripts/check-no-secrets.mjs`.
- **Commit message footer** on every commit:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Do not deploy.** `npx netlify deploy --build --prod` is a separate, explicit step Aboud runs after the plan completes. Netlify has no git integration; pushing deploys nothing.
- **Out of scope — do not touch** (spec/10 §10): the L1–L4 select and `LEVEL_INFO`; a chip editor in Settings; the now-dead driver machinery in `classify.ts` (`DRIVERS`, `suggestLevel`, `suggestDriversFromText`, `layoutSeed`, `Descriptors`) — it is unused by the UI but stays where it is; the AHJ tab; shared sync; the AutoCAD title block.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/noteText.ts` | **new** — shared text helpers: `punctuate`, `stripBullet`, `noteLines`, `effectiveText`, `PolishState` | 3 |
| `src/lib/installNotes.ts` | **new** — `InstallNotes` constants, `emptyInstallNotes()`, `installNoteLines()`, `conduitRunLines()`, `rawTextFor()`, `POLISH_KEYS` | 4 |
| `src/lib/__fixtures__/makeRecord.ts` | **new** — one `PostRecord` factory shared by four test files | 2 |
| `src/components/NoteBox.tsx` | **new** — labelled textarea + chips + polished preview + guards + revert | 7 |
| `src/components/InstallNotesCard.tsx` | **new** — the dropdowns + conduit boxes | 8 |
| `netlify/functions/lib/rewriteSchema.ts` | **new** — zod schemas, testable without a Netlify runtime | 9 |
| `src/types.ts` | `InstallNotes`, `Orientation`, `ServiceWork`, `PolishKey`; re-keyed `polished`/`usePolished` | 2 |
| `src/lib/parser.ts` | drop two `No install date found.` warnings | 1 |
| `src/lib/template.ts` | drop `Install date` from required; two new bullets; import helpers | 1, 5 |
| `src/lib/record.ts` | `blankRecord()` seeds `installNotes` | 2 |
| `src/lib/storage.ts` | `migrateRecord()`, `loadSettings()` merge fix, chip defaults | 6, 11 |
| `src/components/ComposeTab.tsx` | render the two cards, re-keyed polish | 8, 10 |
| `src/lib/api.ts` | keyed `rewrite()` | 10 |
| `netlify/functions/rewrite.mts` | keyed contract + prompt header | 9 |
| `src/theme.css` | one new rule block for the dropdown rows | 8 |

---

## Task 1: Install date becomes optional

**Files:**
- Modify: `src/lib/parser.ts:173`, `src/lib/parser.ts:228`
- Modify: `src/lib/template.ts:97-105` (`missingRequired`)
- Test: `src/lib/parser.test.ts`, `src/lib/template.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `missingRequired(record)` no longer returns `'Install date'`. Order of the remaining entries is unchanged: `Customer name`, `Region text`, `Jurisdiction`, `Site address`.

- [ ] **Step 1: Archive the Phase 6 state before touching anything**

CLAUDE.md §6.5 requires a versioned copy before modifying delivered work. `_versions/` is tracked in git (`_versions/v1-phase1/`, `_versions/v2-phase5/` already are).

```bash
cd "Project submission notes/sow-post-generator"
mkdir -p _versions/v3-phase6
cp -r src netlify _versions/v3-phase6/
git add _versions/v3-phase6
git commit -m "$(cat <<'EOF'
chore: archive Phase 6 src/ + netlify/ before Phase 7

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/parser.test.ts`:

```ts
describe('install date is optional (spec/10 §1)', () => {
  it('does not warn when the Salesforce paste has no install date', () => {
    const res = parseSfText('Jane Doe | FF | Project\nJurisdiction\nPasadena', '2026-09-30');
    expect(res.warnings).not.toContain('No install date found.');
    expect(res.fields.installScheduledDate).toBeUndefined();
  });

  it('still warns when a date is present but in the past', () => {
    const res = parseSfText('Install Scheduled Date\n09/01/2026', '2026-09-30');
    expect(res.warnings.some((w) => w.includes('is in the past'))).toBe(true);
  });

  it('still warns when the date text cannot be read', () => {
    const res = parseSfText('Install Scheduled Date\nnot a date', '2026-09-30');
    expect(res.warnings.some((w) => w.startsWith('Could not read Install Scheduled Date'))).toBe(true);
  });

  it('extractedToFields does not warn about a missing date either', () => {
    const res = extractedToFields({ customerName: 'Jane Doe', confidence: 'high' }, '2026-09-30');
    expect(res.warnings).not.toContain('No install date found.');
  });
});
```

Make sure `extractedToFields` is in the import list at the top of the file.

Add to `src/lib/template.test.ts`:

```ts
describe('missingRequired (spec/10 §1)', () => {
  it('does not require an install date', () => {
    const r = norcaRecord({ sf: { ...norcaRecord().sf, installScheduledDate: '' } });
    expect(missingRequired(r)).toEqual([]);
  });

  it('still requires customer, jurisdiction and address', () => {
    const r = norcaRecord({
      sf: { ...norcaRecord().sf, customerName: '', jurisdiction: '', siteAddress: '' },
    });
    expect(missingRequired(r)).toEqual(['Customer name', 'Jurisdiction', 'Site address']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/parser.test.ts src/lib/template.test.ts`
Expected: FAIL — the new cases assert the warning is absent and `missingRequired` returns `[]`, but both still produce the install-date entries.

- [ ] **Step 4: Delete the two parser warnings**

In `src/lib/parser.ts`, inside `parseSfText()`, delete this line:

```ts
  if (!fields.installScheduledDate) warnings.push('No install date found.');
```

Inside `extractedToFields()`, delete the identical line. Leave the past-date check, the `Latest Scheduled Visit` mismatch check, the `Could not read Install Scheduled Date` push and `Customer name missing.` exactly as they are.

- [ ] **Step 5: Drop the date from the required list**

In `src/lib/template.ts`, `missingRequired()` — delete this line:

```ts
  if (!record.sf.installScheduledDate) missing.push('Install date');
```

Update the JSDoc above it to read:

```ts
/**
 * Required fields (Aboud, 2026-09-26; install date dropped 2026-09-30 per
 * spec/10 §1 — projects are now designed before a date is scheduled). The copy
 * buttons and "Mark as posted" stay disabled until these are filled. Notes are
 * NOT required — empty note bullets are simply dropped from the post.
 */
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS. Existing tests that asserted `'No install date found.'` was **present** will now fail — delete those assertions (search `No install date found` across `src/`). Do not delete the surrounding test if it asserts anything else.

- [ ] **Step 7: Run the full gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src netlify
git add src/lib/parser.ts src/lib/template.ts src/lib/parser.test.ts src/lib/template.test.ts
git commit -m "$(cat <<'EOF'
feat: install date is optional — no warning, not a required field

Projects are now designed before a date is scheduled (Aboud, 2026-09-30).
Copy/Mark as posted no longer gate on it; the date bullet already drops from
the post when empty. Past-date and visit-mismatch warnings are unchanged.

Spec: spec/10-installation-notes.md §1

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Types + shared record factory

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/record.ts`
- Create: `src/lib/__fixtures__/makeRecord.ts`
- Test: `src/lib/template.test.ts`, `src/lib/storage.test.ts`, `src/lib/listQuery.test.ts`, `src/App.integration.test.tsx` (switch to the factory)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Orientation`, `ServiceWork`, `InstallNotes`, `PolishKey` exported from `src/types.ts`.
  - `PostRecord.installNotes?: InstallNotes`.
  - `PostRecord.polished?: Partial<Record<PolishKey, string>>`.
  - `PostRecord.usePolished: Partial<Record<PolishKey, boolean>>` — **absent means ON**. Every consumer must test `usePolished[key] !== false`, never `usePolished[key]`.
  - `makeRecord(overrides?: Partial<PostRecord>): PostRecord` from `src/lib/__fixtures__/makeRecord.ts`.

- [ ] **Step 1: Add the new types**

In `src/types.ts`, after the `Descriptors` interface, add:

```ts
// ---- Installation Notes (Phase 7) ----------------------------------------
// spec/10-installation-notes.md §2. Replaces the free-text `Installation
// Layout` note with guided fields. Additive — schemaVersion stays 1.

export type Orientation =
  | 'North'
  | 'North-East'
  | 'East'
  | 'South-East'
  | 'South'
  | 'South-West'
  | 'West'
  | 'North-West';

export type ServiceWork = 'MPU' | 'FSU' | 'FTP';

/** The free-text boxes inside InstallNotes, i.e. the ones the AI may polish. */
export type InstallTextField =
  | 'batteryLocation'
  | 'mainDisconnectLocation'
  | 'loadRun'
  | 'serviceRun'
  | 'solarRun'
  | 'batteryRun'
  | 'specialCases'
  | 'other';

export interface InstallNotes {
  walls?: 1 | 2 | 3;
  /** One entry per wall; index i is wall i. '' = not chosen yet. */
  orientations: (Orientation | '')[];
  stories?: 1 | 2 | 'other';
  /** Free text, rendered only when `stories === 'other'`. */
  storiesOther: string;
  service?: ServiceWork;
  batteryLocation: string;
  mainDisconnectLocation: string;
  // Conduit raceway
  loadRun: string;
  serviceRun: string; // "grid/service run"
  solarRun: string;
  batteryRun: string;
  specialCases: string;
  /** "Anything else" — free-form, rendered with no label. */
  other: string;
}

/**
 * Every free-text box the AI may polish. Dropdown-derived values (walls,
 * orientation, stories, service) are deliberately NOT here — they can never be
 * altered by the model.
 */
export type PolishKey =
  | `install.${InstallTextField}`
  | 'siteSurvey'
  | 'design'
  | 'homeowner';
```

- [ ] **Step 2: Re-key `PostRecord`**

In `src/types.ts`, inside `PostRecord`, replace the `polished` and `usePolished` lines and add `installNotes`:

```ts
  /** Guided Installation Notes (Phase 7). Absent on pre-Phase-7 records until `migrateRecord()` seeds it. */
  installNotes?: InstallNotes;
  /** AI results per box; an absent key means "not polished". */
  polished?: Partial<Record<PolishKey, string>>;
  /**
   * Per-box "use the polished version?" flags. An ABSENT key means ON — only an
   * explicit `false` (the user clicked "Revert to my draft") turns it off.
   * Always test `usePolished[key] !== false`.
   */
  usePolished: Partial<Record<PolishKey, boolean>>;
```

On the `Settings` interface, widen `chips` now — `InstallNotesCard` (Task 8)
indexes it with `install.*` keys and will not compile against the old
`Record<NoteKey, string[]>`. The chip **values** land later, in Task 11:

```ts
  chips: Partial<Record<PolishKey, string[]>>;
```

On the `Notes` interface, mark the dead field:

```ts
export interface Notes {
  /** @deprecated Phase 7 — migrated into `installNotes.other`. Kept so pre-Phase-7 JSON still parses. */
  layout: string;
  siteSurvey: string;
  design: string;
  homeowner: string;
}
```

- [ ] **Step 3: Run typecheck to see the blast radius**

Run: `npx tsc --noEmit`
Expected: FAIL. Errors in `record.ts`, `template.ts`, `ComposeTab.tsx` and the four test files that build `usePolished: { layout: true, … }`. That list is the work for this task and Task 5.

- [ ] **Step 4: Seed `installNotes` in `blankRecord()`**

In `src/lib/record.ts`, add the import and the two changed fields:

```ts
import { emptyInstallNotes } from './installNotes';
```

`emptyInstallNotes` does not exist yet — Task 4 creates it. Create the minimal version now so this task compiles, in a new file `src/lib/installNotes.ts`:

```ts
import type { InstallNotes } from '../types';

/** A fully-blank Installation Notes block — every box empty, no dropdown chosen. */
export function emptyInstallNotes(): InstallNotes {
  return {
    orientations: [],
    storiesOther: '',
    batteryLocation: '',
    mainDisconnectLocation: '',
    loadRun: '',
    serviceRun: '',
    solarRun: '',
    batteryRun: '',
    specialCases: '',
    other: '',
  };
}
```

Then in `blankRecord()`:

```ts
    notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
    installNotes: emptyInstallNotes(),
    usePolished: {},
```

`usePolished: {}` is correct — absent means ON.

- [ ] **Step 5: Create the shared test factory**

Create `src/lib/__fixtures__/makeRecord.ts`:

```ts
// One PostRecord factory for every test file. Before Phase 7 each test file
// hand-rolled its own literal, so a model change broke four files at once.

import type { PostRecord } from '../../types';
import { emptyInstallNotes } from '../installNotes';

export function makeRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: 'test-id',
    status: 'draft',
    author: 'Aboud Yousef',
    sf: {
      customerName: 'Norca Garcia',
      installScheduledDate: '2026-10-01',
      region: 'HOU',
      jurisdiction: 'Pasadena',
      siteAddress: '1317 Skylark Rd, Pasadena, TX 77502',
      source: 'text',
    },
    drivers: [],
    suggestedLevel: 1,
    level: 1,
    notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
    installNotes: emptyInstallNotes(),
    usePolished: {},
    tags: ['Tarek Abu Hseini', 'Mohammed Azizi', 'Diego Banegas'],
    warnings: [],
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}
```

- [ ] **Step 6: Point the four test files at the factory**

In `src/lib/template.test.ts`, replace the local `norcaRecord()` body with a delegation so the rest of the file needs no edits:

```ts
import { makeRecord } from './__fixtures__/makeRecord';

function norcaRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return makeRecord(overrides);
}
```

In `src/lib/storage.test.ts` replace the local `rec()` helper:

```ts
import { makeRecord } from './__fixtures__/makeRecord';

function rec(id: string, updatedAt: string, customer: string): PostRecord {
  return makeRecord({
    id,
    status: 'posted',
    updatedAt,
    sf: { customerName: customer, installScheduledDate: '2026-10-01', region: 'HOU', source: 'text' },
    tags: [],
  });
}
```

In `src/lib/listQuery.test.ts` and `src/App.integration.test.tsx`, replace each `usePolished: { layout: true, siteSurvey: true, design: true, homeowner: true }` literal with `usePolished: {}` and add `installNotes: emptyInstallNotes(),` beside `notes:`. Import `emptyInstallNotes` from `./installNotes` / `./lib/installNotes` as the path requires.

- [ ] **Step 7: Run typecheck and tests**

Run: `npx tsc --noEmit`
Expected: the only remaining errors are in `src/lib/template.ts` and `src/components/ComposeTab.tsx`, which Tasks 5 and 8 fix. Do not patch them here beyond what is needed to compile — if `tsc` must be clean to commit, stop and complete Task 3 through Task 5 before committing this task.

Run: `npx vitest run src/lib/storage.test.ts src/lib/listQuery.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit (combined with Tasks 3–5 if tsc is not yet clean)**

```bash
git add src/types.ts src/lib/record.ts src/lib/installNotes.ts src/lib/__fixtures__/makeRecord.ts src/lib/*.test.ts src/App.integration.test.tsx
git commit -m "$(cat <<'EOF'
feat(types): InstallNotes + PolishKey; shared makeRecord test factory

polished/usePolished re-keyed from the 4-value NoteKey to the 11-value
PolishKey. usePolished is now Partial — an absent key means ON, only an
explicit false is a revert.

Spec: spec/10-installation-notes.md §2

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract shared text helpers into `lib/noteText.ts`

**Files:**
- Create: `src/lib/noteText.ts`
- Modify: `src/lib/template.ts` (delete the local `punctuate`/`noteLines`, import instead)
- Test: `src/lib/noteText.test.ts`

**Interfaces:**
- Consumes: `PolishKey` from Task 2.
- Produces:
  - `punctuate(s: string): string`
  - `stripBullet(line: string): string`
  - `noteLines(text: string): string[]`
  - `interface PolishState { polished?: Partial<Record<PolishKey, string>>; usePolished: Partial<Record<PolishKey, boolean>> }`
  - `effectiveText(raw: string, key: PolishKey, p: PolishState): string`

`PostRecord` structurally satisfies `PolishState`, so callers pass the record directly.

- [ ] **Step 1: Write the failing test**

Create `src/lib/noteText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { effectiveText, noteLines, punctuate, stripBullet } from './noteText';

describe('punctuate', () => {
  it('adds a period only when one is missing', () => {
    expect(punctuate('All good')).toBe('All good.');
    expect(punctuate('All good.')).toBe('All good.');
    expect(punctuate('Really?')).toBe('Really?');
    expect(punctuate('   ')).toBe('');
  });
});

describe('stripBullet', () => {
  it('strips bullet glyphs and dash/asterisk followed by a space', () => {
    expect(stripBullet('• first')).toBe('first');
    expect(stripBullet('  - second')).toBe('second');
    expect(stripBullet('* third')).toBe('third');
  });

  it('keeps a dash or asterisk that is part of the value', () => {
    expect(stripBullet('-20 ft drop')).toBe('-20 ft drop');
    expect(stripBullet('*2 AWG')).toBe('*2 AWG');
  });
});

describe('noteLines', () => {
  it('one source line becomes one punctuated bullet, blanks dropped', () => {
    expect(noteLines('tag wrong on PV-2\n\n- missing expansion unit')).toEqual([
      'tag wrong on PV-2.',
      'missing expansion unit.',
    ]);
  });

  it('empty text yields no bullets', () => {
    expect(noteLines('   \n  ')).toEqual([]);
  });
});

describe('effectiveText', () => {
  const raw = 'my draft';
  it('uses the polished text when present and not reverted', () => {
    expect(effectiveText(raw, 'design', { polished: { design: 'Polished.' }, usePolished: {} })).toBe('Polished.');
  });

  it('an absent usePolished key means ON', () => {
    expect(effectiveText(raw, 'design', { polished: { design: 'Polished.' }, usePolished: {} })).toBe('Polished.');
  });

  it('an explicit false reverts to the raw draft', () => {
    expect(
      effectiveText(raw, 'design', { polished: { design: 'Polished.' }, usePolished: { design: false } }),
    ).toBe('my draft');
  });

  it('falls back to raw when nothing was polished', () => {
    expect(effectiveText(raw, 'design', { usePolished: {} })).toBe('my draft');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/noteText.test.ts`
Expected: FAIL — `Cannot find module './noteText'`.

- [ ] **Step 3: Create the module**

Create `src/lib/noteText.ts`:

```ts
// Shared text helpers for the post's note bullets. Extracted from template.ts
// in Phase 7 so installNotes.ts can use the same rules without a circular
// import (template.ts -> installNotes.ts -> noteText.ts).

import type { PolishKey } from '../types';

/** Ensure terminal punctuation (spec/06 §1 rendering rules). */
export function punctuate(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Remove a bullet character the writer typed, so it isn't rendered twice.
 * True bullet glyphs may sit tight against the word; a dash or asterisk must be
 * followed by a space, so "-20 ft" and "*2 AWG" keep their first character.
 */
export function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[•◦·]\s*|[-*–—]\s+)/, '').trim();
}

/**
 * Split a note into bullet lines — the team writes these as bullet points, one
 * per line (Aboud, 2026-09-28). One source line = one bullet, same order.
 */
export function noteLines(text: string): string[] {
  return text.split('\n').map(stripBullet).filter(Boolean).map(punctuate);
}

/** The `polished` + `usePolished` pair. `PostRecord` satisfies this structurally. */
export interface PolishState {
  polished?: Partial<Record<PolishKey, string>>;
  usePolished: Partial<Record<PolishKey, boolean>>;
}

/**
 * The text a box actually contributes to the post: the polished version when
 * one exists and the user has not reverted it, else the raw draft.
 * An ABSENT `usePolished` key means ON — only an explicit `false` reverts.
 */
export function effectiveText(raw: string, key: PolishKey, p: PolishState): string {
  const polished = p.polished?.[key];
  return polished !== undefined && p.usePolished[key] !== false ? polished : raw;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/noteText.test.ts`
Expected: PASS, 10 assertions.

- [ ] **Step 5: Delete the duplicates from `template.ts`**

In `src/lib/template.ts`, delete the local `punctuate()` and `noteLines()` function bodies and add to the imports:

```ts
import { effectiveText, noteLines, punctuate } from './noteText';
```

`template.ts` still compiles with errors from Task 2 — that is expected until Task 5.

- [ ] **Step 6: Commit**

```bash
npx vitest run src/lib/noteText.test.ts
git add src/lib/noteText.ts src/lib/noteText.test.ts src/lib/template.ts
git commit -m "$(cat <<'EOF'
refactor: extract punctuate/noteLines/effectiveText into lib/noteText.ts

Shared by template.ts and the new installNotes.ts without a circular import.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `lib/installNotes.ts` — the sentence builders

**Files:**
- Modify: `src/lib/installNotes.ts` (created minimally in Task 2)
- Test: `src/lib/installNotes.test.ts`

**Interfaces:**
- Consumes: `PolishState`, `effectiveText`, `noteLines`, `punctuate`, `stripBullet` from Task 3; `InstallNotes`, `Orientation`, `ServiceWork`, `PolishKey`, `InstallTextField` from Task 2.
- Produces:
  - `ORIENTATIONS: Orientation[]` — the 8 compass points, in UI order.
  - `SERVICE_WORK: ServiceWork[]` — `['MPU', 'FSU', 'FTP']`.
  - `INSTALL_TEXT_FIELDS: { key: PolishKey; field: InstallTextField; label: string }[]`
  - `POLISH_KEYS: PolishKey[]` — all 11, install fields first.
  - `emptyInstallNotes(): InstallNotes`
  - `rawTextFor(r: PostRecord, key: PolishKey): string`
  - `installNoteLines(n: InstallNotes | undefined, p: PolishState): string[]`
  - `conduitRunLines(n: InstallNotes | undefined, p: PolishState): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/installNotes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { InstallNotes } from '../types';
import { conduitRunLines, emptyInstallNotes, installNoteLines, rawTextFor } from './installNotes';
import { makeRecord } from './__fixtures__/makeRecord';

const n = (over: Partial<InstallNotes> = {}): InstallNotes => ({ ...emptyInstallNotes(), ...over });
const off = { usePolished: {} };

describe('installNoteLines — walls (spec/10 §3.1)', () => {
  it('one wall with an orientation', () => {
    expect(installNoteLines(n({ walls: 1, orientations: ['North'] }), off)).toEqual([
      'Installation on one wall (North).',
    ]);
  });

  it('two walls list both orientations in order', () => {
    expect(installNoteLines(n({ walls: 2, orientations: ['North', 'West'] }), off)).toEqual([
      'Installation on two walls (North, West).',
    ]);
  });

  it('three walls with one orientation still unset skip the blank', () => {
    expect(installNoteLines(n({ walls: 3, orientations: ['North', '', 'West'] }), off)).toEqual([
      'Installation on three walls (North, West).',
    ]);
  });

  it('no orientation chosen omits the parentheses', () => {
    expect(installNoteLines(n({ walls: 2, orientations: ['', ''] }), off)).toEqual([
      'Installation on two walls.',
    ]);
  });

  it('orientations beyond the wall count are ignored', () => {
    expect(installNoteLines(n({ walls: 1, orientations: ['North', 'West'] }), off)).toEqual([
      'Installation on one wall (North).',
    ]);
  });

  it('no wall count means no wall line', () => {
    expect(installNoteLines(n({ orientations: ['North'] }), off)).toEqual([]);
  });
});

describe('installNoteLines — stories and service', () => {
  it('renders 1 and 2 stories verbatim', () => {
    expect(installNoteLines(n({ stories: 1 }), off)).toEqual(['1-story house.']);
    expect(installNoteLines(n({ stories: 2 }), off)).toEqual(['2-story house.']);
  });

  it('other uses the free text, punctuated', () => {
    expect(installNoteLines(n({ stories: 'other', storiesOther: 'Split level, garage below' }), off)).toEqual([
      'Split level, garage below.',
    ]);
  });

  it('other with no text drops the line', () => {
    expect(installNoteLines(n({ stories: 'other', storiesOther: '  ' }), off)).toEqual([]);
  });

  it('each service value gets the standard sentence', () => {
    expect(installNoteLines(n({ service: 'MPU' }), off)).toEqual(['This project requires an MPU.']);
    expect(installNoteLines(n({ service: 'FSU' }), off)).toEqual(['This project requires an FSU.']);
    expect(installNoteLines(n({ service: 'FTP' }), off)).toEqual(['This project requires an FTP.']);
  });
});

describe('installNoteLines — labelled free text', () => {
  it('joins multiple lines with "; " under one label and strips typed bullets', () => {
    expect(
      installNoteLines(n({ specialCases: 'window to be closed off.\n- small boxes relocated' }), off),
    ).toEqual(['Special cases: window to be closed off; small boxes relocated.']);
  });

  it('keeps battery and disconnect locations in spec order', () => {
    expect(
      installNoteLines(n({ batteryLocation: 'garage', mainDisconnectLocation: 'south wall' }), off),
    ).toEqual(['Battery location: garage.', 'Main disconnect location: south wall.']);
  });

  it('renders "Anything else" as unlabelled bullets, one per line', () => {
    expect(installNoteLines(n({ other: 'Attic run\nBack-to-back' }), off)).toEqual([
      'Attic run.',
      'Back-to-back.',
    ]);
  });

  it('emits the dropdown lines before the free-text lines', () => {
    const lines = installNoteLines(
      n({ walls: 1, orientations: ['North'], stories: 1, service: 'MPU', other: 'Attic run' }),
      off,
    );
    expect(lines).toEqual([
      'Installation on one wall (North).',
      '1-story house.',
      'This project requires an MPU.',
      'Attic run.',
    ]);
  });

  it('an all-empty block produces nothing', () => {
    expect(installNoteLines(n(), off)).toEqual([]);
    expect(installNoteLines(undefined, off)).toEqual([]);
  });
});

describe('installNoteLines — polish selection', () => {
  const notes = n({ specialCases: 'window closed' });

  it('uses the polished text by default', () => {
    expect(
      installNoteLines(notes, { polished: { 'install.specialCases': 'Window to be closed off' }, usePolished: {} }),
    ).toEqual(['Special cases: Window to be closed off.']);
  });

  it('an explicit false reverts to the raw draft', () => {
    expect(
      installNoteLines(notes, {
        polished: { 'install.specialCases': 'Window to be closed off' },
        usePolished: { 'install.specialCases': false },
      }),
    ).toEqual(['Special cases: window closed.']);
  });
});

describe('conduitRunLines (spec/10 §3.2)', () => {
  it('labels the four runs in order', () => {
    expect(
      conduitRunLines(
        n({ loadRun: '18 ft through the attic', serviceRun: '2" PVC, 12 ft', solarRun: 'east wall', batteryRun: '6 ft' }),
        off,
      ),
    ).toEqual([
      'Load run: 18 ft through the attic.',
      'Grid/service run: 2" PVC, 12 ft.',
      'Solar run: east wall.',
      'Battery run: 6 ft.',
    ]);
  });

  it('drops the empty runs and yields nothing when all four are empty', () => {
    expect(conduitRunLines(n({ solarRun: 'east wall' }), off)).toEqual(['Solar run: east wall.']);
    expect(conduitRunLines(n(), off)).toEqual([]);
  });
});

describe('rawTextFor', () => {
  it('reads feedback notes and install boxes through one key space', () => {
    const r = makeRecord({
      notes: { layout: '', siteSurvey: 'survey text', design: '', homeowner: '' },
      installNotes: n({ loadRun: '18 ft' }),
    });
    expect(rawTextFor(r, 'siteSurvey')).toBe('survey text');
    expect(rawTextFor(r, 'install.loadRun')).toBe('18 ft');
    expect(rawTextFor(r, 'install.solarRun')).toBe('');
  });

  it('returns empty string when the record has no installNotes yet', () => {
    expect(rawTextFor(makeRecord({ installNotes: undefined }), 'install.loadRun')).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/installNotes.test.ts`
Expected: FAIL — `installNoteLines` / `conduitRunLines` / `rawTextFor` are not exported.

- [ ] **Step 3: Write the implementation**

Replace the whole of `src/lib/installNotes.ts` with:

```ts
// Guided Installation Notes — spec/10-installation-notes.md §3.
//
// Pure: dropdown choices + labelled free-text boxes -> post sub-bullets. The
// sentence wording mirrors `classify.ts` layoutSeed() so the post keeps one
// voice. Dropdown-derived sentences are never sent to the AI, so a wall count
// or an MPU can never be altered by the model.

import type {
  InstallNotes,
  InstallTextField,
  Orientation,
  PolishKey,
  PostRecord,
  ServiceWork,
} from '../types';
import { effectiveText, noteLines, punctuate, stripBullet, type PolishState } from './noteText';

// Re-exported so callers of installNoteLines/conduitRunLines get the type from
// the same module as the functions (spec/10 §3 documents it here).
export type { PolishState };

export const ORIENTATIONS: Orientation[] = [
  'North',
  'North-East',
  'East',
  'South-East',
  'South',
  'South-West',
  'West',
  'North-West',
];

export const SERVICE_WORK: ServiceWork[] = ['MPU', 'FSU', 'FTP'];

const WALL_WORD: Record<1 | 2 | 3, string> = {
  1: 'one wall',
  2: 'two walls',
  3: 'three walls',
};

/** Every free-text box inside InstallNotes, with its polish key and post label. */
export const INSTALL_TEXT_FIELDS: { key: PolishKey; field: InstallTextField; label: string }[] = [
  { key: 'install.batteryLocation', field: 'batteryLocation', label: 'Battery location' },
  { key: 'install.mainDisconnectLocation', field: 'mainDisconnectLocation', label: 'Main disconnect location' },
  { key: 'install.loadRun', field: 'loadRun', label: 'Load run' },
  { key: 'install.serviceRun', field: 'serviceRun', label: 'Grid/service run' },
  { key: 'install.solarRun', field: 'solarRun', label: 'Solar run' },
  { key: 'install.batteryRun', field: 'batteryRun', label: 'Battery run' },
  { key: 'install.specialCases', field: 'specialCases', label: 'Special cases' },
  { key: 'install.other', field: 'other', label: 'Anything else' },
];

/** All 11 polishable boxes. Order is the request order sent to /api/rewrite. */
export const POLISH_KEYS: PolishKey[] = [
  ...INSTALL_TEXT_FIELDS.map((f) => f.key),
  'siteSurvey',
  'design',
  'homeowner',
];

/** A fully-blank Installation Notes block — every box empty, no dropdown chosen. */
export function emptyInstallNotes(): InstallNotes {
  return {
    orientations: [],
    storiesOther: '',
    batteryLocation: '',
    mainDisconnectLocation: '',
    loadRun: '',
    serviceRun: '',
    solarRun: '',
    batteryRun: '',
    specialCases: '',
    other: '',
  };
}

/** The raw (un-polished) text behind any polish key, from either half of the record. */
export function rawTextFor(r: PostRecord, key: PolishKey): string {
  if (key === 'siteSurvey' || key === 'design' || key === 'homeowner') return r.notes[key];
  const f = INSTALL_TEXT_FIELDS.find((x) => x.key === key);
  return f && r.installNotes ? r.installNotes[f.field] : '';
}

/** Drop terminal punctuation so joined clauses read as one sentence. */
function clause(s: string): string {
  return s.replace(/[.;,]+$/, '').trim();
}

/**
 * A labelled free-text field: every non-empty line becomes a clause, the
 * clauses are joined with "; " under one label, and the result gets a period.
 * Empty -> no line at all.
 */
function labelled(label: string, raw: string, key: PolishKey, p: PolishState): string[] {
  const parts = effectiveText(raw, key, p).split('\n').map(stripBullet).map(clause).filter(Boolean);
  return parts.length ? [`${label}: ${parts.join('; ')}.`] : [];
}

const field = (f: InstallTextField) => INSTALL_TEXT_FIELDS.find((x) => x.field === f)!;

/** The `Installation Notes` bullet's sub-bullets, in the order spec/10 §3.1 fixes. */
export function installNoteLines(n: InstallNotes | undefined, p: PolishState): string[] {
  if (!n) return [];
  const lines: string[] = [];

  // 1. Dropdown-derived sentences.
  if (n.walls) {
    const or = n.orientations.slice(0, n.walls).filter(Boolean);
    lines.push(`Installation on ${WALL_WORD[n.walls]}${or.length ? ` (${or.join(', ')})` : ''}.`);
  }
  if (n.stories === 1) lines.push('1-story house.');
  else if (n.stories === 2) lines.push('2-story house.');
  else if (n.stories === 'other' && n.storiesOther.trim()) lines.push(punctuate(n.storiesOther));
  if (n.service) lines.push(`This project requires an ${n.service}.`);

  // 2. Labelled free text.
  for (const f of ['batteryLocation', 'mainDisconnectLocation', 'specialCases'] as InstallTextField[]) {
    const def = field(f);
    lines.push(...labelled(def.label, n[f], def.key, p));
  }

  // 3. "Anything else" — unlabelled, one bullet per line, exactly as the old
  //    free-text Installation Layout note rendered. Keeps the migration invisible.
  lines.push(...noteLines(effectiveText(n.other, 'install.other', p)));

  return lines;
}

/** The `Conduit Raceway` bullet's sub-bullets. All four empty -> bullet dropped. */
export function conduitRunLines(n: InstallNotes | undefined, p: PolishState): string[] {
  if (!n) return [];
  const runs: InstallTextField[] = ['loadRun', 'serviceRun', 'solarRun', 'batteryRun'];
  return runs.flatMap((f) => {
    const def = field(f);
    return labelled(def.label, n[f], def.key, p);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/installNotes.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
npx vitest run src/lib/installNotes.test.ts src/lib/noteText.test.ts
git add src/lib/installNotes.ts src/lib/installNotes.test.ts
git commit -m "$(cat <<'EOF'
feat: installNotes.ts — dropdowns + labelled boxes to post sub-bullets

Spec: spec/10-installation-notes.md §3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `template.ts` — Installation Notes + Conduit Raceway bullets

**Files:**
- Modify: `src/lib/template.ts:34-44` (`effectiveNoteLines`), `src/lib/template.ts:132-156` (`buildLines`)
- Test: `src/lib/template.test.ts`

**Interfaces:**
- Consumes: `installNoteLines`, `conduitRunLines` from Task 4; `effectiveText`, `noteLines`, `punctuate` from Task 3.
- Produces: `effectiveNoteLines(record, key: 'siteSurvey' | 'design' | 'homeowner', settings)` — narrowed from `NoteKey`. `buildPostText` / `buildPostHtml` signatures are unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/template.test.ts`:

```ts
import { emptyInstallNotes } from './installNotes';

describe('Installation Notes + Conduit Raceway bullets (spec/10 §4)', () => {
  const withNotes = (over = {}) =>
    norcaRecord({ installNotes: { ...emptyInstallNotes(), ...over } });

  it('a single value renders inline', () => {
    const text = buildPostText(withNotes({ stories: 1 }), defaultSettings());
    expect(text).toContain('• *Installation Notes:* 1-story house.');
  });

  it('several values render as sub-bullets', () => {
    const text = buildPostText(
      withNotes({ walls: 2, orientations: ['North', 'West'], stories: 1, service: 'MPU' }),
      defaultSettings(),
    );
    expect(text).toContain('• *Installation Notes:*\n    ◦ Installation on two walls (North, West).');
    expect(text).toContain('    ◦ 1-story house.');
    expect(text).toContain('    ◦ This project requires an MPU.');
  });

  it('Conduit Raceway is its own bullet, after Installation Notes', () => {
    const text = buildPostText(
      withNotes({ stories: 1, loadRun: '18 ft through the attic', solarRun: '1-1/4" PVC' }),
      defaultSettings(),
    );
    expect(text.indexOf('*Installation Notes:*')).toBeLessThan(text.indexOf('*Conduit Raceway:*'));
    expect(text.indexOf('*Conduit Raceway:*')).toBeLessThan(text.indexOf('*Clearance:*'));
    expect(text).toContain('◦ Load run: 18 ft through the attic.');
    expect(text).toContain('◦ Solar run: 1-1/4" PVC.');
  });

  it('both bullets disappear when nothing is filled in', () => {
    const text = buildPostText(withNotes(), defaultSettings());
    expect(text).not.toContain('Installation Notes');
    expect(text).not.toContain('Conduit Raceway');
    expect(text).not.toContain('Installation Layout');
  });

  it('Conduit Raceway alone disappears when only Installation Notes is filled', () => {
    const text = buildPostText(withNotes({ stories: 2 }), defaultSettings());
    expect(text).toContain('*Installation Notes:*');
    expect(text).not.toContain('Conduit Raceway');
  });

  it('the HTML version mirrors the text version and escapes values', () => {
    const html = buildPostHtml(withNotes({ stories: 1, solarRun: '1-1/4" PVC <east>' }), defaultSettings());
    expect(html).toContain('<li><strong>Installation Notes:</strong> 1-story house.</li>');
    expect(html).toContain('<li><strong>Conduit Raceway:</strong> Solar run: 1-1/4&quot; PVC &lt;east&gt;.</li>');
  });

  it('a post with no install date omits the date bullet entirely', () => {
    const r = norcaRecord({ sf: { ...norcaRecord().sf, installScheduledDate: '' } });
    const text = buildPostText(r, defaultSettings());
    expect(text).not.toContain('Installation Date & Day');
    expect(text).toContain('• *Region:* HOU.');
  });
});
```

`esc()` in `template.ts` escapes `&`, `<` and `>` and **not** `"` — that is deliberate and must not change. So the expected HTML string is:

```
<li><strong>Conduit Raceway:</strong> Solar run: 1-1/4" PVC &lt;east&gt;.</li>
```

Use that exact string in the assertion above rather than the `&quot;` version.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/template.test.ts`
Expected: FAIL — the post still renders `Installation Layout`.

- [ ] **Step 3: Narrow `effectiveNoteLines` and rewrite `buildLines`**

In `src/lib/template.ts`, add to the imports:

```ts
import { conduitRunLines, installNoteLines } from './installNotes';
```

Replace `effectiveNoteLines` with:

```ts
/** A feedback note's bullet lines: polished when available+enabled, else raw; the default phrase when empty. */
export function effectiveNoteLines(
  record: PostRecord,
  key: 'siteSurvey' | 'design' | 'homeowner',
  settings: Settings,
): string[] {
  const lines = noteLines(effectiveText(record.notes[key], key, record));
  if (lines.length) return lines;
  const defaults = settings.defaults ?? {
    siteSurvey: 'All good.',
    design: 'All good.',
    homeowner: 'No feedback.',
  };
  return [punctuate(defaults[key])];
}
```

In `buildLines`, replace the `Installation Layout` entry with two entries:

```ts
    { label: 'Installation Notes', values: installNoteLines(record.installNotes, record) },
    { label: 'Conduit Raceway', values: conduitRunLines(record.installNotes, record) },
```

They sit between `Project Classification` and `Clearance`. Everything else in the `items` array is unchanged, as is the `items.filter((it) => it.values.length > 0)` that drops empty bullets.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: the new tests PASS. `NORCA_EXPECTED` and any other golden-string assertion that still contains `• *Installation Layout:* …` now FAIL.

- [ ] **Step 5: Update the golden strings**

The `norcaRecord()` factory now produces an empty `installNotes`, so the expected post has **no** Installation Notes bullet at all. Edit `NORCA_EXPECTED` in `src/lib/template.test.ts`: delete the `• *Installation Layout:* …` line. Do the same for any other golden post string in the file and in `src/App.integration.test.tsx`.

Where a test was specifically exercising a multi-line layout note, move it to `installNotes.other` via the `installNotes` override rather than `notes.layout`.

Run: `npx vitest run`
Expected: PASS, all files.

- [ ] **Step 6: Run the gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src netlify
```

`tsc` should now be clean except for `src/components/ComposeTab.tsx`, which Task 8 fixes. If ComposeTab errors block the commit, fix them minimally here by replacing `record.usePolished[key]` with `record.usePolished[key] !== false` and `NOTE_FIELDS` with the three feedback keys — Task 8 replaces that code wholesale anyway.

```bash
git add src/lib/template.ts src/lib/template.test.ts src/App.integration.test.tsx
git commit -m "$(cat <<'EOF'
feat: post renders Installation Notes + Conduit Raceway bullets

Replaces the single free-text Installation Layout bullet. Both drop when
empty; Conduit Raceway drops independently. HTML mirrors the text version.

Spec: spec/10-installation-notes.md §4

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Record migration + `loadSettings` merge fix

**Files:**
- Modify: `src/lib/storage.ts` (`loadRecords`, `loadSettings`, `mergeRecords`, new `migrateRecord`)
- Test: `src/lib/storage.test.ts`, `src/lib/storage.settings.test.ts` (new, jsdom)

**Interfaces:**
- Consumes: `emptyInstallNotes` from Task 4.
- Produces: `migrateRecord(r: PostRecord): PostRecord`, exported. Called from `loadRecords()` and `mergeRecords()`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/storage.test.ts`:

```ts
import { migrateRecord } from './storage';
import { emptyInstallNotes } from './installNotes';

describe('migrateRecord — Phase 7 (spec/10 §2.2)', () => {
  /** A record as written before Phase 7: free-text layout, four-key polish maps. */
  const legacy = () =>
    makeRecord({
      installNotes: undefined,
      notes: { layout: 'Attic run\nBack-to-back', siteSurvey: 'survey', design: '', homeowner: '' },
      polished: { layout: 'Attic run.\nBack-to-back.' } as never,
      usePolished: { layout: false } as never,
    });

  it('moves notes.layout into installNotes.other and clears it', () => {
    const m = migrateRecord(legacy());
    expect(m.installNotes?.other).toBe('Attic run\nBack-to-back');
    expect(m.notes.layout).toBe('');
  });

  it('re-keys the polished text and the revert flag', () => {
    const m = migrateRecord(legacy());
    expect(m.polished?.['install.other']).toBe('Attic run.\nBack-to-back.');
    expect(m.usePolished['install.other']).toBe(false);
    expect((m.polished as Record<string, unknown>).layout).toBeUndefined();
    expect((m.usePolished as Record<string, unknown>).layout).toBeUndefined();
  });

  it('leaves the other notes and every other field alone', () => {
    const m = migrateRecord(legacy());
    expect(m.notes.siteSurvey).toBe('survey');
    expect(m.id).toBe('test-id');
    expect(m.installNotes?.loadRun).toBe('');
  });

  it('is a no-op on a record that already has installNotes and no legacy text', () => {
    const current = makeRecord({ installNotes: { ...emptyInstallNotes(), loadRun: '18 ft' } });
    expect(migrateRecord(current)).toBe(current);
  });

  it('never overwrites an existing installNotes.other', () => {
    const both = makeRecord({
      installNotes: { ...emptyInstallNotes(), other: 'already here' },
      notes: { layout: 'old text', siteSurvey: '', design: '', homeowner: '' },
    });
    expect(migrateRecord(both).installNotes?.other).toBe('already here');
  });
});
```

Create `src/lib/storage.settings.test.ts` — `loadSettings` touches `localStorage`, so this file needs the jsdom environment:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, saveSettings } from './storage';

describe('loadSettings chip merge (spec/10 §7.1)', () => {
  beforeEach(() => localStorage.clear());

  it('new chip keys reach a browser that already has saved settings', () => {
    // Simulate a settings object saved before the new chips existed.
    saveSettings({ ...defaultSettings(), chips: { siteSurvey: ['only the old one'] } });
    const loaded = loadSettings();
    expect(loaded.chips).toEqual(defaultSettings().chips);
    expect(loaded.chips['install.specialCases']).toBeDefined();
  });

  it('an edited default phrase still wins over the built-in default', () => {
    saveSettings({ ...defaultSettings(), defaults: { ...defaultSettings().defaults, design: 'Looks fine.' } });
    const loaded = loadSettings();
    expect(loaded.defaults.design).toBe('Looks fine.');
    expect(loaded.defaults.homeowner).toBe('No feedback.');
  });

  it('other settings keys still merge at the top level', () => {
    saveSettings({ ...defaultSettings(), lastAuthor: 'Omar Rajab' });
    expect(loadSettings().lastAuthor).toBe('Omar Rajab');
  });
});
```

`chips['install.specialCases']` does not exist until Task 11. Until then that one assertion fails — that is intentional; it is the failing test that Task 11 makes pass. Mark it with `it.fails` **only if** you need a green suite between Task 6 and Task 11, and remove the `.fails` in Task 11.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/storage.test.ts src/lib/storage.settings.test.ts`
Expected: FAIL — `migrateRecord` is not exported; `loadSettings` returns the stored `chips`.

- [ ] **Step 3: Write `migrateRecord`**

In `src/lib/storage.ts` add the import and the function, right after the existing `migrate()` stub:

```ts
import { emptyInstallNotes } from './installNotes';
import type { InstallNotes } from '../types';

/**
 * Phase 7 (spec/10 §2.2): the free-text `Installation Layout` note became the
 * guided Installation Notes section. A record written before Phase 7 carries
 * its text in `notes.layout` — move it to `installNotes.other` so a reopened
 * draft shows it under "Anything else", and re-key its polished version.
 *
 * Runs on every load AND inside mergeRecords(), so records pulled from the
 * shared Blobs store or from a JSON import are migrated too.
 */
export function migrateRecord(r: PostRecord): PostRecord {
  const legacyText = r.notes?.layout ?? '';
  const legacyPolished = (r.polished as Record<string, string> | undefined)?.layout;
  const legacyUse = (r.usePolished as Record<string, boolean> | undefined)?.layout;
  if (r.installNotes && !legacyText && legacyPolished === undefined && legacyUse === undefined) {
    return r; // already migrated — return the same object so callers can cheaply compare
  }

  const installNotes: InstallNotes = { ...emptyInstallNotes(), ...r.installNotes };
  if (legacyText && !installNotes.other) installNotes.other = legacyText;

  const polished: Record<string, string> = { ...(r.polished as Record<string, string> | undefined) };
  if (legacyPolished !== undefined && polished['install.other'] === undefined) {
    polished['install.other'] = legacyPolished;
  }
  delete polished.layout;

  const usePolished: Record<string, boolean> = { ...(r.usePolished as Record<string, boolean>) };
  if (legacyUse !== undefined && usePolished['install.other'] === undefined) {
    usePolished['install.other'] = legacyUse;
  }
  delete usePolished.layout;

  return {
    ...r,
    installNotes,
    notes: { ...r.notes, layout: '' },
    polished: Object.keys(polished).length ? (polished as PostRecord['polished']) : undefined,
    usePolished: usePolished as PostRecord['usePolished'],
  };
}
```

- [ ] **Step 4: Call it from both entry points**

In `loadRecords()`:

```ts
export function loadRecords(): PostRecord[] {
  const arr = read<PostRecord[]>(KEY_RECORDS);
  return Array.isArray(arr) ? arr.map((r) => migrateRecord(migrate(r))) : [];
}
```

In `mergeRecords()`, replace both `migrate(rec)` calls with `migrateRecord(migrate(rec))`. This is what covers records arriving from Netlify Blobs and from JSON import.

- [ ] **Step 5: Fix `loadSettings`**

Replace `loadSettings()` in `src/lib/storage.ts` with:

```ts
export function loadSettings(): Settings {
  const stored = read<Settings>(KEY_SETTINGS);
  const d = defaultSettings();
  if (!stored) return d;
  const s = migrate(stored);
  return {
    ...d,
    ...s,
    // Per-key, so an edited phrase wins but a newly added key still arrives.
    defaults: { ...d.defaults, ...s.defaults },
    // Chips are NOT user-editable yet (the chip editor is Phase 2), so a stored
    // `chips` can only ever be a stale copy of an older default — taking it
    // would hide every new suggestion from everyone except a fresh browser
    // (spec/10 §7.1). When chip editing ships, change this to a per-key merge.
    chips: d.chips,
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/storage.test.ts src/lib/storage.settings.test.ts`
Expected: PASS, except the `chips['install.specialCases']` assertion which waits for Task 11.

- [ ] **Step 7: Commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src netlify
git add src/lib/storage.ts src/lib/storage.test.ts src/lib/storage.settings.test.ts
git commit -m "$(cat <<'EOF'
feat: migrate notes.layout into installNotes.other; fix loadSettings merge

migrateRecord runs on load AND inside mergeRecords, so records from the shared
Blobs store and from JSON import are migrated too. loadSettings was shallow-
merging, so a stored chips object replaced the defaults wholesale and no new
suggestion could ever reach an existing browser.

Spec: spec/10-installation-notes.md §2.2, §7.1

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**CHECKPOINT 7a complete.** Data model, rendering and migration are done; the UI still shows the old single note field.

---

## Task 7: `NoteBox` — one reusable labelled textarea

**Files:**
- Create: `src/components/NoteBox.tsx`
- Modify: `src/theme.css` (append one rule block)

**Interfaces:**
- Consumes: `PolishKey` from Task 2.
- Produces:

```ts
interface NoteBoxProps {
  label: string;
  polishKey: PolishKey;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  rows?: number;
  chips?: string[];
  onChip?: (phrase: string) => void;
  polished?: string;
  usePolished: boolean;
  onToggle: (usePolished: boolean) => void;
  dropped?: string[];
  drift?: { from: number; to: number };
}
export default function NoteBox(props: NoteBoxProps): JSX.Element
```

- [ ] **Step 1: Create the component**

This is lifted verbatim from the per-field block that exists today in `ComposeTab.tsx:514-576`, parameterised. Create `src/components/NoteBox.tsx`:

```tsx
// One labelled free-text box: textarea + quick-insert chips + the polished
// preview, the two AI guards, and the per-box revert link. Extracted from
// ComposeTab in Phase 7 so Installation Notes and Feedback share one
// implementation instead of two copies.

import type { PolishKey } from '../types';

interface Props {
  label: string;
  polishKey: PolishKey;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  rows?: number;
  chips?: string[];
  onChip?: (phrase: string) => void;
  polished?: string;
  /** Absent usePolished key means ON — the parent resolves that before passing. */
  usePolished: boolean;
  onToggle: (usePolished: boolean) => void;
  dropped?: string[];
  drift?: { from: number; to: number };
}

export default function NoteBox({
  label,
  polishKey,
  value,
  onChange,
  onKeyDown,
  placeholder,
  rows = 3,
  chips,
  onChip,
  polished,
  usePolished,
  onToggle,
  dropped,
  drift,
}: Props) {
  const hasPolished = polished !== undefined && value.trim() !== '';

  return (
    <div className="note-block" key={polishKey}>
      <div className="note-head">
        <label className="field" style={{ marginBottom: 0 }}>
          {label}
        </label>
        {hasPolished && (
          <button type="button" className="btn link small" onClick={() => onToggle(!usePolished)}>
            {usePolished ? 'Revert to my draft' : 'Use polished'}
          </button>
        )}
      </div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      {hasPolished && usePolished && (
        <div className="muted" style={{ marginTop: 3, whiteSpace: 'pre-wrap' }}>
          ✨ {polished}
        </div>
      )}
      {dropped && dropped.length > 0 && (
        <div className="dropped-tokens">
          AI output dropped: {dropped.map((t) => `\`${t}\``).join(', ')} — check before posting
        </div>
      )}
      {drift && (
        <div className="dropped-tokens">
          AI returned {drift.to} bullet{drift.to === 1 ? '' : 's'} instead of {drift.from} — check it
          before posting, or “Revert to my draft”.
        </div>
      )}
      {chips && chips.length > 0 && onChip && (
        <div className="chips">
          {chips.map((c) => (
            <button type="button" key={c} className="chip" title={c} onClick={() => onChip(c)}>
              {c.length > 48 ? `${c.slice(0, 48)}…` : c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the layout rule for the dropdown rows**

Append to `src/theme.css`:

```css
/* Phase 7 — Installation Notes dropdown rows (spec/10 §6). */
.install-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 10px;
}
.install-row .field {
  margin-bottom: 0;
  min-width: 140px;
  flex: 0 1 auto;
}
.install-subhead {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dyn-navy);
  margin: 14px 0 6px;
}
```

`--dyn-navy`, `--dyn-ink`, `--dyn-muted` and `--dyn-line` are the tokens already used throughout `theme.css` and `AhjTab.tsx`; `.install-subhead` reuses the same treatment as the `Requirements (n)` heading in the AHJ tab.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit && npx eslint src netlify`
Expected: clean for the new file (ComposeTab may still error until Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/components/NoteBox.tsx src/theme.css
git commit -m "$(cat <<'EOF'
refactor: extract NoteBox — labelled textarea + chips + AI guards + revert

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `InstallNotesCard` + ComposeTab rewiring

**Files:**
- Create: `src/components/InstallNotesCard.tsx`
- Modify: `src/components/ComposeTab.tsx` (replace the Notes card, lines ~512-606)
- Test: `src/App.integration.test.tsx`

**Interfaces:**
- Consumes: `NoteBox` (Task 7); `ORIENTATIONS`, `SERVICE_WORK`, `INSTALL_TEXT_FIELDS`, `emptyInstallNotes` (Task 4).
- Produces:

```ts
interface InstallNotesCardProps {
  record: PostRecord;
  settings: Settings;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  dropped: Partial<Record<PolishKey, string[]>>;
  drift: Partial<Record<PolishKey, { from: number; to: number }>>;
  onToggle: (key: PolishKey, usePolished: boolean) => void;
}
export default function InstallNotesCard(props: InstallNotesCardProps): JSX.Element
```

- [ ] **Step 1: Write the failing integration test**

Add to `src/App.integration.test.tsx` (jsdom docblock is already at the top of that file):

```tsx
it('Installation Notes dropdowns and conduit boxes reach the preview', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.selectOptions(screen.getByLabelText(/^Walls/i), '2');
  await user.selectOptions(screen.getAllByLabelText(/^Wall 1 orientation/i)[0], 'North');
  await user.selectOptions(screen.getAllByLabelText(/^Wall 2 orientation/i)[0], 'West');
  await user.selectOptions(screen.getByLabelText(/^Stories/i), '1');
  await user.selectOptions(screen.getByLabelText(/^Service equipment/i), 'MPU');
  await user.type(screen.getByLabelText(/^Load run/i), '18 ft through the attic');

  const preview = document.querySelector('.preview') as HTMLElement;
  expect(preview.textContent).toContain('Installation on two walls (North, West).');
  expect(preview.textContent).toContain('1-story house.');
  expect(preview.textContent).toContain('This project requires an MPU.');
  expect(preview.textContent).toContain('Load run: 18 ft through the attic.');
});

it('a project with no install date can still be copied and marked as posted', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/Customer name/i), 'No Date Project');
  await user.type(screen.getByLabelText(/Jurisdiction/i), 'Pasadena');
  await user.type(screen.getByLabelText(/Site address/i), '1 Example St');

  expect(screen.getByRole('button', { name: /Copy for Slack/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Mark as posted/i })).toBeEnabled();
});
```

Match the existing file's import style for `render`, `screen`, `userEvent` — copy it from the tests already in that file rather than assuming.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/App.integration.test.tsx`
Expected: FAIL — no `Walls` control exists.

- [ ] **Step 3: Create `InstallNotesCard`**

Create `src/components/InstallNotesCard.tsx`:

```tsx
// Installation Notes card (Phase 7, spec/10 §6). Dropdowns for the facts that
// recur on every project, labelled boxes for the four conduit runs, and two
// free-text boxes. What is in these fields is exactly what the post prints —
// there is no intermediate editable note.

import { emptyInstallNotes, INSTALL_TEXT_FIELDS, ORIENTATIONS, SERVICE_WORK } from '../lib/installNotes';
import type { InstallNotes, Orientation, PolishKey, PostRecord, ServiceWork, Settings } from '../types';
import NoteBox from './NoteBox';

interface Props {
  record: PostRecord;
  settings: Settings;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  dropped: Partial<Record<PolishKey, string[]>>;
  drift: Partial<Record<PolishKey, { from: number; to: number }>>;
  onToggle: (key: PolishKey, usePolished: boolean) => void;
}

const RUN_FIELDS = ['loadRun', 'serviceRun', 'solarRun', 'batteryRun'] as const;

export default function InstallNotesCard({ record, settings, update, onKeyDown, dropped, drift, onToggle }: Props) {
  const n = record.installNotes ?? emptyInstallNotes();

  const setNotes = (patch: Partial<InstallNotes>) =>
    update((r) => ({ ...r, installNotes: { ...(r.installNotes ?? emptyInstallNotes()), ...patch } }));

  /** Editing a box invalidates that box's stale polished version. */
  const setText = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], key: PolishKey, value: string) =>
    update((r) => {
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return {
        ...r,
        installNotes: { ...(r.installNotes ?? emptyInstallNotes()), [field]: value },
        polished,
      };
    });

  const appendChip = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], phrase: string) =>
    setNotes({ [field]: n[field] ? `${n[field].replace(/\s+$/, '')}\n${phrase}` : phrase } as Partial<InstallNotes>);

  /** Reducing the wall count truncates orientations; increasing appends blanks. */
  const setWalls = (walls: 1 | 2 | 3 | undefined) => {
    const next = walls ? Array.from({ length: walls }, (_, i) => n.orientations[i] ?? '') : [];
    setNotes({ walls, orientations: next });
  };

  const setOrientation = (i: number, value: Orientation | '') => {
    const next = [...n.orientations];
    next[i] = value;
    setNotes({ orientations: next });
  };

  const box = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], rows = 2) => {
    const def = INSTALL_TEXT_FIELDS.find((f) => f.field === field)!;
    return (
      <NoteBox
        key={def.key}
        label={def.label}
        polishKey={def.key}
        value={n[field]}
        rows={rows}
        onChange={(v) => setText(field, def.key, v)}
        onKeyDown={onKeyDown}
        chips={settings.chips[def.key]}
        onChip={(phrase) => appendChip(field, phrase)}
        polished={record.polished?.[def.key]}
        usePolished={record.usePolished[def.key] !== false}
        onToggle={(use) => onToggle(def.key, use)}
        dropped={dropped[def.key]}
        drift={drift[def.key]}
      />
    );
  };

  return (
    <div className="card">
      <h3>Installation Notes</h3>

      <div className="install-row">
        <label className="field">
          Walls
          <select
            value={n.walls ?? ''}
            onChange={(e) => setWalls(e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined)}
          >
            <option value="">—</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        {Array.from({ length: n.walls ?? 0 }, (_, i) => (
          <label className="field" key={i}>
            Wall {i + 1} orientation
            <select
              value={n.orientations[i] ?? ''}
              onChange={(e) => setOrientation(i, e.target.value as Orientation | '')}
            >
              <option value="">—</option>
              {ORIENTATIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="install-row">
        <label className="field">
          Stories
          <select
            value={n.stories ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setNotes({ stories: v === '' ? undefined : v === 'other' ? 'other' : (Number(v) as 1 | 2) });
            }}
          >
            <option value="">—</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value="other">Other…</option>
          </select>
        </label>
        {n.stories === 'other' && (
          <label className="field" style={{ flex: '1 1 240px' }}>
            Describe the house
            <input
              type="text"
              value={n.storiesOther}
              placeholder="e.g. Split level, garage below"
              onChange={(e) => setNotes({ storiesOther: e.target.value })}
            />
          </label>
        )}
        <label className="field">
          Service equipment
          <select
            value={n.service ?? ''}
            onChange={(e) => setNotes({ service: (e.target.value || undefined) as ServiceWork | undefined })}
          >
            <option value="">—</option>
            {SERVICE_WORK.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {box('batteryLocation', 1)}
      {box('mainDisconnectLocation', 1)}

      <div className="install-subhead">Conduit raceway</div>
      {RUN_FIELDS.map((f) => box(f, 2))}

      {box('specialCases', 3)}
      {box('other', 3)}
    </div>
  );
}
```

`{n.stories === 'other' && …}` keeps `storiesOther` in state while hidden, so toggling back does not lose the text — required by spec/10 §6.

- [ ] **Step 4: Rewire `ComposeTab`**

In `src/components/ComposeTab.tsx`:

1. Change the imports: add `InstallNotesCard`, `NoteBox`, and `POLISH_KEYS` / `rawTextFor` from `../lib/installNotes`. Drop the now-unused `NoteKey` import if nothing else uses it.
2. Replace the `NOTE_FIELDS` constant with the three feedback boxes only:

```ts
const FEEDBACK_FIELDS: { key: PolishKey; label: string; placeholder: string }[] = [
  { key: 'siteSurvey', label: 'Site Survey Feedback', placeholder: 'One bullet per line. Empty → "All good."' },
  { key: 'design', label: 'Design Feedback', placeholder: 'One bullet per line. Empty → "All good."' },
  { key: 'homeowner', label: 'Homeowner Feedback', placeholder: 'One bullet per line. Empty → "No feedback."' },
];
```

3. Re-key the two guard state hooks from `NoteKey` to `PolishKey`:

```ts
const [dropped, setDropped] = useState<Partial<Record<PolishKey, string[]>>>({});
const [bulletDrift, setBulletDrift] = useState<Partial<Record<PolishKey, { from: number; to: number }>>>({});
```

4. Replace `setNote` and `revertNote` with key-generic versions:

```ts
const setNote = (key: 'siteSurvey' | 'design' | 'homeowner', value: string) => {
  setDropped((d) => ({ ...d, [key]: undefined }));
  setBulletDrift((d) => ({ ...d, [key]: undefined }));
  update((r) => {
    const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
    return { ...r, notes: { ...r.notes, [key]: value }, polished };
  });
};

const togglePolished = (key: PolishKey, usePolished: boolean) => {
  update((r) => ({ ...r, usePolished: { ...r.usePolished, [key]: usePolished } }));
};
```

5. Replace the whole `<div className="card"><h3>Notes</h3>…</div>` block with:

```tsx
<InstallNotesCard
  record={record}
  settings={settings}
  update={update}
  onKeyDown={noteKeyDown}
  dropped={dropped}
  drift={bulletDrift}
  onToggle={togglePolished}
/>

<div className="card">
  <h3>Feedback</h3>
  {FEEDBACK_FIELDS.map(({ key, label, placeholder }) => (
    <NoteBox
      key={key}
      label={label}
      polishKey={key}
      value={record.notes[key as 'siteSurvey' | 'design' | 'homeowner']}
      placeholder={placeholder}
      onChange={(v) => setNote(key as 'siteSurvey' | 'design' | 'homeowner', v)}
      onKeyDown={noteKeyDown}
      chips={settings.chips[key]}
      onChip={(phrase) => appendChip(key as 'siteSurvey' | 'design' | 'homeowner', phrase)}
      polished={record.polished?.[key]}
      usePolished={record.usePolished[key] !== false}
      onToggle={(use) => togglePolished(key, use)}
      dropped={dropped[key]}
      drift={bulletDrift[key]}
    />
  ))}

  <button
    type="button"
    className="btn primary"
    disabled={polishState.busy || !aiAvailable}
    onClick={() => void polish()}
    title={aiAvailable ? 'Ctrl+Enter in any note field' : 'AI offline — manual flow still works'}
  >
    {polishState.busy ? (
      <span>
        <span className="spin">✨</span> Polishing…
      </span>
    ) : (
      '✨ Polish with AI'
    )}
  </button>
  {polishState.ms !== undefined && !polishState.busy && (
    <span className="muted" style={{ marginLeft: 8 }}>
      Polished ✓ {(polishState.ms / 1000).toFixed(1)}s
    </span>
  )}
  {polishState.error && (
    <div className="error-inline">
      {polishState.error}{' '}
      <button type="button" className="btn link small" onClick={() => void polish()}>
        Retry
      </button>
    </div>
  )}
</div>
```

6. Update `appendChip` so a chip lands on its own line (the boxes are now bullet-per-line):

```ts
const appendChip = (key: 'siteSurvey' | 'design' | 'homeowner', phrase: string) => {
  update((r) => ({
    ...r,
    notes: { ...r.notes, [key]: r.notes[key] ? `${r.notes[key].replace(/\s+$/, '')}\n${phrase}` : phrase },
  }));
};
```

Leave `polish()` alone for now — Task 10 rewrites it.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/App.integration.test.tsx`
Expected: the new dropdown test PASSES. If `getByLabelText` cannot find a control, the `<label className="field">Walls<select/></label>` wrapping should already associate them — if not, add explicit `id`/`htmlFor` rather than changing the test's queries.

- [ ] **Step 6: Run the gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src netlify
git add src/components/InstallNotesCard.tsx src/components/ComposeTab.tsx src/App.integration.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): Installation Notes card — dropdowns, conduit runs, Feedback card

Walls/orientation/stories/service are dropdowns; the four conduit runs and the
two free-text boxes reuse NoteBox. The old single Notes card is gone.

Spec: spec/10-installation-notes.md §6

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**CHECKPOINT 7b complete.** The UI is live; Polish still sends the old four-field payload and will 400 against the new function — Tasks 9 and 10 land together.

---

## Task 9: `/api/rewrite` keyed contract

**Files:**
- Create: `netlify/functions/lib/rewriteSchema.ts`
- Create: `netlify/functions/lib/rewriteSchema.test.ts`
- Modify: `netlify/functions/rewrite.mts`

**Interfaces:**
- Consumes: nothing.
- Produces: `POLISH_KEYS` (const tuple), `RewriteRequest`, `RewriteResponse` zod schemas, and `REWRITE_JSON_SCHEMA` for the OpenAI call.

- [ ] **Step 1: Write the failing test**

Create `netlify/functions/lib/rewriteSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { POLISH_KEYS, RewriteRequest, RewriteResponse } from './rewriteSchema';

const ok = { items: [{ id: 'install.loadRun', text: '18ft thru attic' }, { id: 'siteSurvey', text: 'need height' }] };

describe('RewriteRequest', () => {
  it('accepts a valid keyed payload', () => {
    expect(RewriteRequest.safeParse(ok).success).toBe(true);
  });

  it('rejects an unknown id', () => {
    expect(RewriteRequest.safeParse({ items: [{ id: 'install.walls', text: 'x' }] }).success).toBe(false);
  });

  it('rejects a duplicate id', () => {
    const dup = { items: [{ id: 'design', text: 'a' }, { id: 'design', text: 'b' }] };
    expect(RewriteRequest.safeParse(dup).success).toBe(false);
  });

  it('rejects an empty list and text over 3000 chars', () => {
    expect(RewriteRequest.safeParse({ items: [] }).success).toBe(false);
    expect(RewriteRequest.safeParse({ items: [{ id: 'design', text: 'x'.repeat(3001) }] }).success).toBe(false);
  });

  it('rejects the pre-Phase-7 four-field payload', () => {
    const legacy = { layout: '', siteSurvey: '', design: '', homeowner: '' };
    expect(RewriteRequest.safeParse(legacy).success).toBe(false);
  });
});

describe('RewriteResponse', () => {
  it('accepts a well-formed model reply', () => {
    expect(RewriteResponse.safeParse(ok).success).toBe(true);
  });

  it('rejects a reply with an id the client never sends', () => {
    expect(RewriteResponse.safeParse({ items: [{ id: 'nonsense', text: 'x' }] }).success).toBe(false);
  });
});

// The server keeps its own copy of the key list because z.enum needs a const
// tuple. This test is the thing that catches the two drifting apart.
describe('key list stays in sync with the client', () => {
  it('matches POLISH_KEYS in src/lib/installNotes.ts', async () => {
    const client = await import('../../../src/lib/installNotes');
    expect([...POLISH_KEYS]).toEqual(client.POLISH_KEYS);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run netlify/functions/lib/rewriteSchema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the schema module**

Create `netlify/functions/lib/rewriteSchema.ts`:

```ts
// Request/response schemas for /api/<token>/rewrite — spec/10 §5.
// Kept out of rewrite.mts so they can be unit-tested without a Netlify
// runtime, the same way guard.ts is.

import { z } from 'zod';

/** MUST stay in sync with `PolishKey` in src/types.ts. */
export const POLISH_KEYS = [
  'install.batteryLocation',
  'install.mainDisconnectLocation',
  'install.loadRun',
  'install.serviceRun',
  'install.solarRun',
  'install.batteryRun',
  'install.specialCases',
  'install.other',
  'siteSurvey',
  'design',
  'homeowner',
] as const;

const RequestItem = z.object({ id: z.enum(POLISH_KEYS), text: z.string().max(3000) }).strict();

export const RewriteRequest = z
  .object({ items: z.array(RequestItem).min(1).max(POLISH_KEYS.length) })
  .strict()
  .refine((v) => new Set(v.items.map((i) => i.id)).size === v.items.length, {
    message: 'duplicate id',
  });

export const RewriteResponse = z
  .object({ items: z.array(z.object({ id: z.enum(POLISH_KEYS), text: z.string() }).strict()) })
  .strict();

/** OpenAI structured-output schema. `strict: true` requires named properties. */
export const REWRITE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
      },
    },
  },
  required: ['items'],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run netlify/functions/lib/rewriteSchema.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Rewrite the function**

In `netlify/functions/rewrite.mts`:

1. Delete the local `noteField`, `RequestSchema`, `ResponseSchema` and `JSON_SCHEMA` constants; import from the new module instead:

```ts
import { REWRITE_JSON_SCHEMA, RewriteRequest, RewriteResponse } from './lib/rewriteSchema';
```

2. Replace **only the opening paragraph** of `SYSTEM_PROMPT`. Everything from `Line rules (most important):` down to the final example stays **byte-for-byte identical** — it is the 2026-09-28 revision that fixed the bullet-merging complaint. The new opening:

```
You are a copy editor for a solar installation design team. You will receive a JSON object with an "items" array. Each item has an "id" and a "text" — a short note written by an engineer for a Slack handoff post to the installation crew. Each "text" is written as BULLET POINTS, one bullet per line.

Return one item for EVERY item you were given, with the SAME "id", in the SAME order. Never add an item, never drop an item, never merge two items, never invent an id.

Your job is a light copy-edit, NOT a rewrite. Stay as close to the engineer's own wording as possible. The line rules below apply to each item's "text" independently.
```

3. Update the handler body — only the three lines that reference the old schemas change:

```ts
  const parsed = RewriteRequest.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);
```

```ts
      schemaName: 'polished_notes',
      schema: REWRITE_JSON_SCHEMA,
```

```ts
    const polished = RewriteResponse.safeParse(raw);
    if (!polished.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);
    console.log(JSON.stringify({ at: new Date().toISOString(), endpoint: 'rewrite', ms: Date.now() - started, model, items: parsed.data.items.length }));
    return jsonResponse(200, { items: polished.data.items, model, ms: Date.now() - started }, cors);
```

`temperature: 0.1`, `maxTokens: 900` and `process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini'` are unchanged. The log line still carries no note text — only counts and timings.

- [ ] **Step 6: Run the gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src netlify
git add netlify/functions/lib/rewriteSchema.ts netlify/functions/lib/rewriteSchema.test.ts netlify/functions/rewrite.mts
git commit -m "$(cat <<'EOF'
feat(api): /rewrite takes a keyed items list instead of four fixed fields

Eight free-text boxes can't fit the old {layout,siteSurvey,design,homeowner}
shape. Only non-empty boxes are sent, so dropdown-derived sentences never
reach the model. Schemas extracted so they're testable without Netlify.
The line-preserving prompt body is unchanged.

Spec: spec/10-installation-notes.md §5

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Client polish path

**Files:**
- Modify: `src/lib/api.ts:370-378`
- Modify: `src/components/ComposeTab.tsx` (`polish()`)
- Test: `src/lib/tokenGuard.test.ts`

**Interfaces:**
- Consumes: `POLISH_KEYS`, `rawTextFor` from Task 4.
- Produces: `rewrite(items: PolishItem[]): Promise<RewriteResponse>` where `PolishItem = { id: PolishKey; text: string }` and `RewriteResponse = { items: PolishItem[]; model: string; ms: number }`.

- [ ] **Step 1: Update the client wrapper**

In `src/lib/api.ts`, replace the `RewriteResponse` interface and `rewrite()`:

```ts
import type { PolishKey } from '../types';

export interface PolishItem {
  id: PolishKey;
  text: string;
}

export interface RewriteResponse {
  items: PolishItem[];
  model: string;
  ms: number;
}

/** Polish every non-empty free-text box in one call (spec/10 §5). */
export function rewrite(items: PolishItem[]): Promise<RewriteResponse> {
  return post<RewriteResponse>('rewrite', { items });
}
```

Remove the now-unused `Notes` import if nothing else in the file uses it.

- [ ] **Step 2: Rewrite `polish()` in ComposeTab**

```ts
const polish = useCallback(async () => {
  if (polishState.busy) return;
  // Only non-empty free text is sent. Dropdown-derived sentences (walls,
  // orientation, stories, service) are never transmitted, so the model cannot
  // alter them (spec/10 §5).
  const items = POLISH_KEYS.map((id) => ({ id, text: rawTextFor(record, id) })).filter((i) => i.text.trim());
  if (!items.length) {
    toast('Nothing to polish yet — write a note first.');
    return;
  }
  setPolishState({ busy: true });
  try {
    const res = await rewrite(items);
    const byId = new Map(res.items.map((i) => [i.id, i.text]));
    const polished: Partial<Record<PolishKey, string>> = {};
    const use: Partial<Record<PolishKey, boolean>> = {};
    const nextDropped: Partial<Record<PolishKey, string[]>> = {};
    const nextDrift: Partial<Record<PolishKey, { from: number; to: number }>> = {};
    for (const sent of items) {
      const out = byId.get(sent.id);
      if (out === undefined) continue; // model skipped it — that box keeps its raw draft
      polished[sent.id] = out;
      use[sent.id] = true;
      nextDropped[sent.id] = droppedTokens(sent.text, out);
      nextDrift[sent.id] = bulletCountChange(sent.text, out) ?? undefined;
    }
    setDropped(nextDropped);
    setBulletDrift(nextDrift);
    update((r) => ({
      ...r,
      polished: { ...r.polished, ...polished },
      usePolished: { ...r.usePolished, ...use },
    }));
    setPolishState({ busy: false, ms: res.ms });
  } catch (err) {
    setPolishState({ busy: false, error: (err as { message?: string })?.message || 'Request failed.' });
  }
}, [record, polishState.busy, update, toast]);
```

- [ ] **Step 3: Add the guard test**

Add to `src/lib/tokenGuard.test.ts`:

```ts
describe('guards are per box (spec/10 §5)', () => {
  it('a dropped unit in one box does not flag another', () => {
    expect(droppedTokens('2" PVC on the east wall', 'PVC on the east wall.')).toEqual(['2"']);
    expect(droppedTokens('18 ft through the attic', '18 ft through the attic.')).toEqual([]);
  });

  it('bullet drift is detected per box', () => {
    expect(bulletCountChange('a\nb\nc', 'a. b. c.')).toEqual({ from: 3, to: 1 });
    expect(bulletCountChange('a\nb', 'A.\nB.')).toBeNull();
  });
});
```

- [ ] **Step 4: Run the gate**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src netlify`
Expected: all green. The AI path itself is not exercised — there is no local `OPENAI_API_KEY` (it lives only in Netlify). That verification is in the handoff list at the end.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/components/ComposeTab.tsx src/lib/tokenGuard.test.ts
git commit -m "$(cat <<'EOF'
feat: client sends the keyed polish payload, guards run per box

A box the model omits silently keeps its raw draft instead of failing the
whole call.

Spec: spec/10-installation-notes.md §5

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**CHECKPOINT 7c complete.**

---

## Task 11: Chip defaults

**Files:**
- Modify: `src/lib/storage.ts` (`defaultSettings().chips`)
- Test: `src/lib/storage.settings.test.ts` (remove the `.fails` marker from Task 6)

**Interfaces:**
- Consumes: `Settings.chips: Partial<Record<PolishKey, string[]>>` — the type was already widened in Task 2 so Task 8 could compile. This task only fills in the values.
- Produces: chip lists for `install.other`, `install.specialCases`, `siteSurvey`, `design`, `homeowner`.

- [ ] **Step 1: Replace the chip defaults**

In `src/lib/storage.ts`, `defaultSettings()`, replace the whole `chips` object:

```ts
    chips: {
      // Installation Notes — spec/10 §7. The 1-story / 2-story / two-walls
      // chips are gone: those are dropdowns now.
      'install.other': ['Back-to-back installation.', 'Attic run.'],
      'install.specialCases': [
        'Window to be closed off.',
        'Small junction boxes to be relocated.',
        'Existing equipment to be moved.',
      ],
      siteSurvey: [
        'Some of the uploaded photos in Salesforce appear to belong to another project.',
        'Please take sufficient measurements of all walls.',
        'Please provide the wall height.',
        'Please add a wide-angle photo of each wall.',
      ],
      design: [
        'The conduit material for the service path should be 2" PVC instead of 2" EMT.',
        'The solar tag, currently listed as #3 AWG Cu THWN in 1-1/4" EMT conduit, should instead read 1-1/4" PVC conduit.',
        'Please specify the conduit size for the solar portion of the installation.',
        'The AC disconnect rating must be 200A.',
        'This project is in {jurisdiction}; please confirm the AC disconnect brand required by the AHJ (Square D vs Eaton).',
        'We suggest using Cu instead of AL for this run, as it is short and requires several bends.',
        'The elevation drawing shows an expansion unit; this is not reflected in the one-line diagram.',
        'The wiring between the meter and inverter, and between the inverter and MDP, was changed from SER to THHN Cu because SER is used for attic runs only.',
        'The BOS covers both scenarios, with calculations provided for 1-1/4" PVC and 2" PVC.',
        'Please review the one-line diagram against the elevation.',
        'The one-line diagram is missing the {component}.',
      ],
      homeowner: [
        'The installation wall must be cleaned and prepared before installation.',
        'The wood fence/door will need to be drilled to accommodate the conduit routing.',
        'Homeowner confirmation is required before drilling through {area}, and confirmation that all affected areas will be properly restored.',
        'Only limited time will be available for garage clearing prior to installation.',
      ],
    },
```

Note the old `Please take sufficient measurements of all walls and wide-angle photos of each wall.` chip is split into two, per spec/10 §7.

- [ ] **Step 2: Un-skip the chip assertion**

In `src/lib/storage.settings.test.ts`, change the `it.fails` from Task 6 back to `it` if you marked it. The `expect(loaded.chips['install.specialCases']).toBeDefined()` assertion should now pass.

- [ ] **Step 3: Run the gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src netlify
git add src/lib/storage.ts src/lib/storage.settings.test.ts
git commit -m "$(cat <<'EOF'
feat: chip defaults for Installation Notes, site survey and SLD

Spec: spec/10-installation-notes.md §7

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Documentation + checkpoint

**Files:**
- Modify: `README.md`, `USAGE.md`
- Modify: `../spec/06-output-template.md` (revision banner)
- Create: `_CHECKPOINT_installation_notes.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `README.md`**

In the Layout block, change the `lib/` line to name the new modules:

```
  lib/          parser (SF paste), classify (L1–L4 names), installNotes (guided
                sections -> post bullets), noteText (shared text helpers),
                template (post + clipboard), storage (localStorage + export/import
                + Phase-7 migration), tokenGuard (AI drop/drift check),
                api / image / dates / record helpers, __fixtures__/ (test data)
  components/   ComposeTab, InstallNotesCard, NoteBox, OutputColumn, AhjTab,
                DraftsTab, HistoryTab, SettingsTab, TitleBlockCard, Toast
```

Update the test count on the `npm run test` row to the actual number `npx vitest run` reports.

- [ ] **Step 2: Update `USAGE.md`**

Replace step 4 of "Daily workflow" (the drivers-checklist step, which has been wrong since v2) and step 5:

```markdown
4. Pick the **Project Level** yourself — the scope and planning window under the
   select are there to remind you what each level covers.
5. Fill in **Installation Notes**: walls + their orientation, stories, and the
   service equipment are dropdowns; the four conduit runs, special cases and
   "anything else" are boxes. Everything you put here is exactly what the post
   prints — empty fields simply disappear. Then write the three **Feedback**
   boxes in your own words (Arabic/English ok), **one bullet per line** →
   **✨ Polish with AI** (Ctrl+Enter in any box). The AI only ever sees the
   free-text boxes — it cannot change a wall count, an orientation or an MPU.
   Red hints mean a number/unit went missing or the bullet count changed.
   "Revert to my draft" is per box.
```

Add a section after "AutoCAD title block":

```markdown
## Projects with no install date (2026-09-30)

A project with no scheduled install date is fine now. There is no warning, and
Copy for Slack / Mark as posted / Mark as done all work without one — the
"Installation Date & Day" line just does not appear in the post. Add the date
later and the line comes back.

## Installation Notes (2026-09-30)

The old free-text "Installation Layout" box is now a guided section. Anything
you had written in it on an existing draft has moved to **Anything else** at the
bottom of Installation Notes — nothing was lost.

The post now carries two bullets instead of one: **Installation Notes** (walls,
stories, service equipment, battery and main-disconnect locations, special
cases) and **Conduit Raceway** (load / grid-service / solar / battery runs).
Either disappears entirely when you leave it empty.
```

- [ ] **Step 3: Add the revision banner to `spec/06-output-template.md`**

Append to the existing REVISIONS block at the top:

```markdown
> - **2026-09-30 (Aboud):** the `Installation Layout` note is replaced by two
>   bullets built from guided fields — **Installation Notes** and **Conduit
>   Raceway**. See `10-installation-notes.md`. The install date is no longer
>   required and no longer warns when absent.
```

- [ ] **Step 4: Write the checkpoint doc**

Create `_CHECKPOINT_installation_notes.md` following the shape of
`_CHECKPOINT_drafts_bullets_titleblock.md`: date, requester, phase; one section
per change with the reasoning; a **Tested** section with the real numbers from
`npx vitest run`, `npx tsc --noEmit`, `npx eslint src netlify`, `npx vite build`
and `node scripts/check-no-secrets.mjs`; a **Not verified by tests — needs a
human** section; and a **Backup** line pointing at `_versions/v3-phase6/`.

The "needs a human" list must contain, at minimum:

1. **The revised AI prompt has never run.** There is no local `OPENAI_API_KEY`.
   On the live site: fill three conduit runs and a 3-line Design Feedback, press
   Polish, and confirm each box comes back separately with its bullet count
   intact. If the model merges them, the red "AI returned N bullets instead of M"
   hint fires under the specific box.
2. **A real pre-Phase-7 draft.** Open a draft created before this deploy and
   confirm its old Installation Layout text is sitting in **Anything else**, and
   that the post reads the same as it did.
3. The two items still open from Phase 6 (AutoCAD "Copy all 5" multi-cell paste;
   the Phase-6 polish prompt) if they are still unverified.

- [ ] **Step 5: Run the complete gate**

```bash
npx vitest run
npx tsc --noEmit
npx eslint src netlify
npx vite build
node scripts/check-no-secrets.mjs
```

All five must pass. Record the real test count in the checkpoint doc and in `README.md`.

- [ ] **Step 6: Commit and push**

```bash
git add README.md USAGE.md _CHECKPOINT_installation_notes.md
git commit -m "$(cat <<'EOF'
docs: Phase 7 checkpoint, README layout, USAGE workflow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

`spec/06-output-template.md` lives outside the repo and is not committed.

**CHECKPOINT 7d complete.**

---

## Task 13: Second AI mode — "هري ابو روي" (full rewrite)

> Added 2026-09-30 mid-execution at Aboud's request. **Executes inside Dispatch F, together with Tasks 9 and 10** — it modifies the same files those tasks create or rewrite, so doing it separately would mean editing them twice. Spec: `../spec/10-installation-notes.md` §11.

**Files:**
- Modify: `netlify/functions/lib/rewriteSchema.ts` and `netlify/functions/rewrite.mts` (both from Task 9)
- Modify: `src/lib/api.ts`, `src/components/ComposeTab.tsx`, `src/components/NoteBox.tsx`
- Test: `netlify/functions/lib/rewriteSchema.test.ts`, `src/App.integration.test.tsx`

**Note:** `RewriteMode` and `PostRecord.polishMode` already exist (added in Task 7), and `NoteBox` already accepts a `mode` prop and renders `🔄` vs `✨`. Both `NoteBox` call sites already pass `mode={record.polishMode?.[key]}` (Task 8). This task only has to set `polishMode` and add the button.

**Interfaces:**
- Consumes: everything Tasks 9 and 10 produce.
- Produces: `rewrite(items, mode)`; the second button; `polishMode` actually populated.

- [ ] **Step 1: Add `mode` to the wire schema**

In `netlify/functions/lib/rewriteSchema.ts`, inside the `RewriteRequest` object literal, before `.strict()`:

```ts
    // Optional and defaulted so a stale client that omits it keeps the old
    // behaviour instead of failing (spec/10 §11.2).
    mode: z.enum(['polish', 'rewrite']).optional().default('polish'),
```

- [ ] **Step 2: Add the schema tests**

In `netlify/functions/lib/rewriteSchema.test.ts`:

```ts
describe('rewrite mode (spec/10 §11.2)', () => {
  it('defaults to polish when mode is absent', () => {
    expect(RewriteRequest.parse(ok).mode).toBe('polish');
  });

  it('accepts both modes', () => {
    expect(RewriteRequest.parse({ ...ok, mode: 'rewrite' }).mode).toBe('rewrite');
    expect(RewriteRequest.parse({ ...ok, mode: 'polish' }).mode).toBe('polish');
  });

  it('rejects an unknown mode', () => {
    expect(RewriteRequest.safeParse({ ...ok, mode: 'freestyle' }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run netlify/functions/lib/rewriteSchema.test.ts`
Expected: FAIL — `mode` is not in the schema.

- [ ] **Step 4: Add the second system prompt**

In `netlify/functions/rewrite.mts`, rename the existing constant to `POLISH_SYSTEM_PROMPT`, leaving its text **byte-for-byte unchanged**, and add `REWRITE_SYSTEM_PROMPT` beside it.

`REWRITE_SYSTEM_PROMPT` reuses the polish prompt's `Line rules (most important):` block and its fact-preservation bullets **verbatim**. The only differences, per spec/10 §11.2:

**Delete** these three rules:
- `If a line is already correct English, return it UNCHANGED, character for character.`
- `Keep the engineer's own vocabulary and phrasing. Do not upgrade the register, do not make it more formal, do not add connectives like "however", "therefore", "additionally", "please note".`
- `Keep each bullet short — a single sentence or clause, the way it was written. Do not expand a bullet into several sentences.`

**Replace** the `Your job is a light copy-edit, NOT a rewrite…` sentence with:

```
Your job is a FULL REWRITE. The input is often rough: broken English, shorthand, half-sentences, missing words, or mixed Arabic and English. Turn each line into one clear, complete, professional sentence that an installation crew can act on.

Rewriting the wording completely is expected and wanted. What must survive untouched is the MEANING and every fact — you may change every word of a line, but you may not change what it says, add anything it does not say, or drop anything it does say.
```

**Keep unchanged:** every `Line rules` bullet (same number of lines, same order, never merge, never split, never reorder, never turn into a paragraph); the `Preserve every fact, number, unit, size, brand, wire type, conduit type and direction exactly` bullet; the engineering-terms list; `Do not add information, assumptions, recommendations or pleasantries. Do not remove any point.`; the no-headings/no-emoji/no-bullet-characters rule; questions-stay-questions; the empty-string rule; the Arabic translation rule.

**Replace** the worked examples with rewrite-shaped ones:

```
Examples (input line -> output line):
"the conduit he go from meter to attic then porch" -> "Conduit routed from the meter through the attic to the porch."
"i think 2 inch not enough for this run" -> "2\" conduit appears undersized for this run."
"tag say EMT but must PVC yes?" -> "The solar tag specifies EMT; it should read PVC."
"HO must know we drill the fence before" -> "The homeowner must be informed before the fence is drilled."
"All good." -> "All good."
```

- [ ] **Step 5: Select prompt and temperature by mode**

In the handler, after `RewriteRequest.safeParse` succeeds:

```ts
  const mode = parsed.data.mode;
  // A full rewrite needs room to rephrase; the copy-edit must not drift.
  const temperature = mode === 'rewrite' ? 0.3 : 0.1;
  const systemPrompt = mode === 'rewrite' ? REWRITE_SYSTEM_PROMPT : POLISH_SYSTEM_PROMPT;
```

Pass `temperature` and `{ role: 'system', content: systemPrompt }` into `callOpenAiJson`. `max_tokens` stays `900`; the model stays `process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini'`. Add `mode` to the existing `console.log` — it carries counts and timings only, never note text.

- [ ] **Step 6: Thread the mode through the client**

In `src/lib/api.ts`:

```ts
export function rewrite(items: PolishItem[], mode: RewriteMode = 'polish'): Promise<RewriteResponse> {
  return post<RewriteResponse>('rewrite', { items, mode });
}
```

In `src/components/ComposeTab.tsx`, widen the busy flag so only the pressed button spins, and rename `polish()` to `runAi(mode)`. It must also record `polishMode` per box:

```ts
const [polishState, setPolishState] = useState<{
  busy: false | RewriteMode;
  ms?: number;
  error?: string;
}>({ busy: false });

const runAi = useCallback(async (mode: RewriteMode) => {
  if (polishState.busy) return;
  const items = POLISH_KEYS.map((id) => ({ id, text: rawTextFor(record, id) })).filter((i) => i.text.trim());
  if (!items.length) {
    toast('Nothing to polish yet — write a note first.');
    return;
  }
  setPolishState({ busy: mode });
  try {
    const res = await rewrite(items, mode);
    const byId = new Map(res.items.map((i) => [i.id, i.text]));
    const polished: Partial<Record<PolishKey, string>> = {};
    const use: Partial<Record<PolishKey, boolean>> = {};
    const modes: Partial<Record<PolishKey, RewriteMode>> = {};
    const nextDropped: Partial<Record<PolishKey, string[]>> = {};
    const nextDrift: Partial<Record<PolishKey, { from: number; to: number }>> = {};
    for (const sent of items) {
      const out = byId.get(sent.id);
      if (out === undefined) continue; // model skipped it — that box keeps its raw draft
      polished[sent.id] = out;
      use[sent.id] = true;
      modes[sent.id] = mode;
      nextDropped[sent.id] = droppedTokens(sent.text, out);
      nextDrift[sent.id] = bulletCountChange(sent.text, out) ?? undefined;
    }
    setDropped(nextDropped);
    setBulletDrift(nextDrift);
    update((r) => ({
      ...r,
      polished: { ...r.polished, ...polished },
      usePolished: { ...r.usePolished, ...use },
      polishMode: { ...r.polishMode, ...modes },
    }));
    setPolishState({ busy: false, ms: res.ms });
  } catch (err) {
    setPolishState({ busy: false, error: (err as { message?: string })?.message || 'Request failed.' });
  }
}, [record, polishState.busy, update, toast]);
```

`Ctrl+Enter` stays bound to polish only — `noteKeyDown` calls `void runAi('polish')`.

Both guards stay on for both modes. Aboud chose one-bullet-in-one-bullet-out for the rewrite as well, so `bulletCountChange` stays meaningful rather than becoming constant noise.

- [ ] **Step 7: Add the second button**

Beside the existing Polish button in the Feedback card:

```tsx
<button
  type="button"
  className="btn secondary"
  disabled={polishState.busy !== false || !aiAvailable}
  onClick={() => void runAi('rewrite')}
  title="Full rewrite — for rough notes. Keeps one bullet per line and every number, but rewrites the wording completely."
>
  {polishState.busy === 'rewrite' ? (
    <span>
      <span className="spin">🔄</span> Rewriting…
    </span>
  ) : (
    'هري ابو روي'
  )}
</button>
```

The Polish button's `disabled` becomes `polishState.busy !== false || !aiAvailable`, and its spinner condition becomes `polishState.busy === 'polish'`.

Identifiers, comments and documentation stay English (CLAUDE.md §6); only this one displayed label is Arabic.

- [ ] **Step 8: Integration test**

In `src/App.integration.test.tsx`, mock `fetch` the way the existing AI tests in that file already do — copy their pattern, do not invent one. Note this project has **no** `@testing-library/user-event` and **no** jest-dom matchers: use `fireEvent` and plain `.disabled` checks. Assert:
- a button with the accessible name `هري ابو روي` renders;
- pressing it sends `mode: 'rewrite'` in the request body;
- pressing `✨ Polish with AI` sends `mode: 'polish'`;
- while one request is in flight, both buttons are disabled.

- [ ] **Step 9: Run the gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src netlify
```

Commit message body:

```
feat: second AI mode — full rewrite button beside Polish

Polish is deliberately constrained never to drift from the engineer's wording.
The new mode is for rough, half-formed or mixed-language notes: it rewrites
every word but keeps one bullet per line, every fact and every number. Both
guards stay on for both modes. polishMode records which button produced each
box, so a reopened draft shows what was machine-rewritten.

Spec: spec/10-installation-notes.md §11

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## Handoff — what a human must do after this plan

1. **Deploy:** `npx netlify deploy --build --prod` from the repo root. Netlify has no git integration; the push in Task 12 deploys nothing.
2. **Verify the AI prompt on the live site** — item 1 of the checkpoint's "needs a human" list. It cannot be tested locally.
3. **Open a pre-Phase-7 draft** and confirm the migration — item 2.
4. Tell Omar and Mohammad to **hard-refresh** once after the deploy. A tab left open across the deploy gets one `400 bad payload` on its next Polish, shown as the normal inline error with a Retry button.
