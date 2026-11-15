# STUDY — Pre-Design / SVT Collab feature (research only, nothing built)
> Date: 2026-11-15 | Researcher: Claude | Status: RESEARCH COMPLETE — awaiting Aboud's extra details before any plan/implementation
> Sources: #sow-svt-collab + #site-survey-svt-collab (Slack), repo code map, 402 live records mined (v39 backup, 2026-11-11)

---

## 1. WHAT THE INITIATIVE IS (from Slack, 2026-11-13/14)

- **Taskforce goal (Issam):** SOW notes ready **within ~2 hours of the site survey**, before full design, "informative enough to make an informed decision" for scheduling.
- **Project selection (Daniel Beier / SVT):** surveys meeting ≥1 of: **20+ kW, county jurisdiction, Oncor**. Ayman's refinement: prioritize jobs **most likely to actually get scheduled**, not every big one.
- **Process observed:**
  1. SF bot posts "Project Assigned to <SVT member> + Site Survey Date" in `#site-survey-svt-collab`
  2. Survey crew uploads pics; SVT verifies and asks for extra measurements **while crew is still on site** (meter wall, return walls, attic access, roof profile, HOA)
  3. SVT tags SOW subteam: "<name> is uploaded and approved"
  4. SOW member analyzes (Scanifly + SF photos) and posts the pre-design note
  5. Note is pasted into SF (Yan Borges removed the visibility rule that hid SOW fields pre-design); Omar proposed a dedicated "Note for CLR" field
- **Key output for CLR (Issam):** SOW marks a job as **two-day** → CLR books 2 consecutive GANTT slots and sets HO expectations.
- **The model note (Omar Rajab, Louis Fritz):** equipment/battery wall placement → conduit routing options (external along overhang vs attic run) → HO-approval concern (view/pool) → cost impact (long SER run) → clearances met → verdict "good to go". **This is exactly the shape the SVT output tab should generate.**

## 2. WHAT THE 400+ POSTS SAY (mined 402 active records)

Doc-frequency (% of records mentioning it; run-fields column = share of the 335 records with run text):

| Work item | Full corpus | Run fields only |
|---|---|---|
| External/exterior conduit run | 42% | 30% |
| Standard / simple run (b2b) | 36% | 43% |
| Gutter box / wireway | 30% | 31% |
| Equipment relocation (meter-wall obstacles, boxes, gutters) | 29% | 14% |
| Attic run | 16% | 18% |
| Interior / garage run | 37%* | 16% (*full-corpus inflated by "interior wall") |
| MPU | 14% | — (also `services` field: MPU 52, FSU 43, FTP 54) |
| Drill through wall / penetration | 14% | 16% |
| Meter relocation/work | 11% | 3% |
| Existing system tie-in / combine | 10% | 10% |
| Concrete pad work | 9% | 2% |
| Long wire run (SER / 4-0 AL) | 8% | 9% |
| Trench / underground | 5% | 6% |
| Tree trimming / removal / shading | 5% | 1% |
| Detached structure (shop/barn/carport) | 3% | 1% |
| Crew-days ("1 crew-day") | 4% (finalText only) | — |
| Sub panel / combiner / pole-mounted | ≤2% each | — |

Top run-field bigrams: "standard run" 375, "gutter box" 168, "external run" 130, "simple run" 65, "attic run" 61, "lb condulet" 45, "long run" 44, "expansion unit" 64, "2 stacks/3 stacks" 51.

**Where this text lives today:** free text in `installNotes.loadRun / serviceRun / solarRun / batteryRun / specialCases / other` (attic: 63 records, trench: 20, drill: 51 — concentrated in serviceRun/loadRun). The checkboxes would formalize what is currently retyped free text.

## 3. WHAT THE APP ALREADY HAS (repo map highlights)

- **Board = 4 hard sections** (`src/lib/boardViews.ts:118` `splitSections()`, precedence done > review > outOfScope > active), driven by **status-label flags with by-name defaults** (`src/lib/board.ts:95-126`). "Installation Review" section = labels named `installation review`. **A Pre-Design section is a 5th section type + one new flag/name default — same recipe as `review`.**
- **Statuses are data, not enums** — 13 live labels. **"Working on it", "Done", "Pending Additional Information", "Pending Update" already exist** as status labels (the last two carry a requires-note gate by name, `src/lib/updates.ts`).
- **Per-project sub-status precedents:** (a) `phaseId` — a second label column, full machinery (colors, dropdown, editable in EditLabelsModal); (b) `reviewer` — scalar shown **only in the Installation Review section** (`BoardTab.tsx:1743`, `1960`). → New sub-status = **new label column `columnKey:'predesign'` rendered only in the Pre-Design section** (option a + scoping of b).
- **Compose output tabs:** `src/components/OutputColumn.tsx:63` `useState<'sf'|'slack'>` + tab bar at `:298-317`. Third tab = extend the union + one new panel component (SfSubmissionCard is the model). The red box in Aboud's screenshot = exactly this tab bar.
- **Checkbox recipe exists** (the parked Trench? feature, HEAD `e30753f`): optional boolean on `InstallNotes` (no migration) → derived sentence const → pushed in a `*Lines()` builder (one source feeds Slack AND SF) → `.service-tick` UI → `hasContent()` entry (`src/lib/record.ts:68`) → wording-pin tests. **New checkboxes repeat this 6-step recipe.**
- **Record lifecycle fits:** drafts link to board projects via `projectId` (361/409 linked); a pre-design draft can be created early and grow into the full SOW post later.

## 4. STANDING RULES THAT CONSTRAIN THE BUILD

1. **No required fields** — advisory rows only (`missingRequired()` stays at 4 entries).
2. **No-migration contract** — all new fields optional; `undefined` renders as today; `schemaVersion` stays 1.
3. **One source feeds both outputs** — SVT tab content must come from the same line builders as Slack/SF where they overlap.
4. **Board controls Compose, never the reverse.**
5. **Package deploys only** — trench checkbox is already pending at HEAD; this feature stacks on the same package. Next backup folder is `v40-…`. Pre-deploy gate: `vitest run --no-file-parallelism` (1258 tests), `tsc`, `eslint`.
6. Slack posting stays **copy-paste** (precedent: 0/51 voluntary board updates; webhook idea dead 2026-10-22).

## 5. PROPOSED DESIGN (draft — for Aboud's review)

### A. Board
- New status label **"Pre-Design"** (data, added in EditLabelsModal) + new section type `'predesign'` with by-name default `pre-design`/`predesign`, rendered **between "the board" (active) and "Installation Review"**. Pipeline reads: active → Pre-Design → Installation Review → Done.
- New label column `columnKey:'predesign'` + `BoardProject.preDesignStatusId`, **column visible only in the Pre-Design section**, seeded labels: **Working on it / Done / Pending Additional Information / Pending Updates** (own colors, editable later like any label).

### B. Compose — input
- New card/header **"Pre-design"** in the compose form with:
  - **Work checkboxes** (trench-recipe each, shortlist from §2 — proposed 10):
    `Attic run · External run · Interior/garage run · Trench (underground) · Drill through wall · Gutter box/wireway · Long wire run · Equipment relocation needed · Tree trimming/removal · Existing system tie-in`
    (MPU/FSU/FTP already covered by `services`; concrete pad by `batteryBase`; trench checkbox already built — reuse, don't duplicate.)
  - **Two-day job?** checkbox (the CLR GANTT flag — explicitly requested by Issam).
  - **"Points to confirm with HO"** free text (battery location, external conduit visibility — the recurring theme in both example analyses).
- Each checkbox gets an approved derived sentence (like TRENCH_LINE) so wording is consistent across 400+ future posts.

### C. Compose — output
- Third tab **"SVT Team"** in OutputColumn, after "Slack post": a formatted pre-design post for #sow-svt-collab following Omar's model-note shape (equipment placement → routing/works → HO confirmations → cost/schedule impact incl. two-day flag → clearances/verdict), with one Copy button (dual-format clipboard like Copy for Slack).

## 6. OPEN QUESTIONS FOR ABOUD

1. Section placement + title: "Pre-Design" between active board and Installation Review — correct? And should Pre-Design rows ALSO appear in the active table or only in the new section?
2. Sub-status: label-column (colored, editable — recommended) vs fixed dropdown? Should "Pending Additional Information / Pending Updates" sub-statuses trigger the same note-gate as their status-column namesakes?
3. Checkbox shortlist in §5B — approve/edit? Which ones feed ONLY the SVT tab vs also the main Slack/SF outputs?
4. SVT tab template — exact wording/sections wanted (he said more details coming).
5. Does marking sub-status "Done" do anything to the main status (automation), or stay manual?
6. Two-day flag: checkbox on compose (proposed) or board column?

---
*Research artifacts: mining scripts at `%TEMP%\sow-predesign-research\`; frequencies from `_versions/v39-live-backup-2026-11-11-postdeploy/records.json` (402 active of 409).*
