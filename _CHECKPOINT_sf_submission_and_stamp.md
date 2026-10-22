# Checkpoint — SF per-field submission, Designed-date auto-stamp, Scheduled filter
> 2026-10-22, overnight session (Aboud's full delegation). Deploy `6ad96d2b`, commit `6d8cce8`.

## What was built

### 1. Salesforce per-field submission (replaces posting to Slack)
- `src/lib/sfSubmission.ts` — builds 15 fields in the SF page's order from the
  same polished record data the Slack post used. Battery location and special
  cases are OMITTED from the "Installation Window and Planning" blob because
  each has its own SF field (every fact stated once). Wiring Route deliberately
  not generated (Aboud: no picker, filled by hand).
- `src/components/SfSubmissionCard.tsx` — one row per SF field, copy button per
  field, ✓-copied tracker ("N of M copied"). The tick stores the copied VALUE,
  so editing the form after copying drops the tick.
- `OutputColumn.tsx` — "Salesforce fields / Slack post" toggle, SF is default;
  the Slack card stays mounted (hidden) so manual edit, note-check and
  Ctrl+Shift+C still work during the transition.
- New form fields in Installation Notes: **Panel facing front of house** tick
  and **Concrete pad installation** box (AI-polishable; feeds SF Site
  Modification Notes together with Special cases). Both OPTIONAL on the stored
  record — no migration, old records just lack the keys.
- `install.concretePad` added to POLISH_KEYS on client AND server (sync test
  guards it).

### 2. Designed-date auto-stamp (`src/lib/designStamp.ts`, wired in App.tsx commitDraft)
Rules (all from the 2026-10-22 activity study, 1000 entries, Oct 11–21):
- Fill ONLY when blank — 35% of manual sets are "tomorrow" planning, never touched
- Local day via `todayIso()`, never UTC — 40% of evening edits straddle midnight UTC
- Requires real work beyond the openFromBoard prefill (customerName alone ≠ designed)
- Never re-stamps a project whose designedDate was EVER touched in the activity
  log — a deliberate manual clear sticks
- Logged through activityForPatch like any hand edit; toast announces the write

### 3. Board "Scheduled" preset
Filters phase=Schedule and sorts by install date ascending (no-date rows last).
ViewPreset gained an optional `sort`; only presets carrying one touch sorting.

### 4. Server activity cap (the backlog's #1 item)
- `boardMerge.ts` ACTIVITY_CAP 1000→5000 (client was already 5000)
- **Audit catch:** PutSchema still had `activity.max(2000)` — past 2000 entries
  EVERY board PUT would 400 (silent total write failure). Raised to the cap,
  regression tests added for both.

## Data operations (order: backup → deploy → backfill → diff)
- `_versions/v23-live-backup-2026-10-22/` — all five stores (gitignored, local)
- `scripts/backfill-designed-dates.mjs --apply`:
  - 25 projects with a linked draft but no Designed date filled from their
    earliest draft's local day (draft day == design day within 1 day in 89% of
    the studied cases)
  - 75 activity entries evicted by the old server cap restored from v22
- Post-op diff vs v23: records/ahjs/extrawork/users byte-identical; board shows
  exactly 25 designedDate fills (nothing else changed on any project), +100
  activity (75 restored + 25 stamps), 0 entries removed.

## Tested
920/920 tests (61 files), tsc, eslint, check:nosecrets, local build — all green
before deploy. Fresh-eyes audit agent reviewed the full diff; 1 BLOCKER
(PutSchema max) + 5 edges fixed pre-deploy, 3 accepted (below).

## Accepted / pending
- Backfill script writes blobs directly (no compare-and-swap) — ran at ~05:00
  with the team asleep; don't reuse it during work hours without thought.
- `localDay` hardcodes UTC+3; fine until Palestine's DST ends (±1 day tolerance).
- Scheduled preset: sorting isn't persisted to localStorage, so after a reload
  the chip shows active without its sort. Cosmetic.
- First real team board-push tomorrow is the live proof of the raised PutSchema
  limit; v22/v23/_prodcheck backups cover a rollback.
- Still open from the backlog: delete-notifications unreachable, Ya'rob name
  drift, rotating the 5 passwords.
