# Checkpoint — Claude Design handoff implementation (2026-10-06/07, overnight)

Mocks: `../design-handoff/iphone-app-mobile-design/project/` — implemented per
Aboud's pasted brief (3 work streams). **NOT deployed, NOT committed.**
Extra Work desktop (stream 1) is documented in `_CHECKPOINT_extra_work.md`.

## Stream 2 — Admin › Settings v2 (`SettingsTab.tsx` rewritten)
- Sticky section nav (Rosters / Region leads / Default phrases / Data) with
  counts + hint box; "Saved · time · synced to the team" line.
- Rosters: avatar chips, inline "+ Add" (Enter commits, Escape cancels, blur
  commits, case-insensitive dup guard), × remove with **Undo**; empty-roster
  warning line.
- Region leads: HOU/DFW cards with pill pickers from fixedTags ∪ authors ∪
  designers + "No lead".
- Default phrases: inputs + live "How it reads in Slack" preview + Reset phrases.
- Data rows: Export / Import / Reset-to-defaults (with Undo) / **Clear all** as
  a two-step inline confirm showing the live record count. Same handlers as
  before (tombstone clear, merge import). Settings shape unchanged.
- Old textarea-based tests replaced by 7 new ones (chips, dups, undo, leads,
  preview, clear, reset).

## Stream 3 — iPhone shell (`src/mobile/`, additive — desktop untouched)
`useIsMobile()` (≤480px) swaps App's tree for `MobileApp`: bottom tab bar
**Board · Drafts · AHJ · Hours · Admin** (Admin = admins only), same state and
sync underneath. jsdom/odd browsers without matchMedia default to desktop.

- **MobileBoard** — sideways-scrolling table, sticky Project column,
  drag-resizable columns (double-tap grip = reset one, "Reset columns" chip =
  all), search + chips (My projects / Status / Coordinator / Design-Schedule
  filters via bottom sheets), EVERY cell opens a bottom sheet (label grid with
  real board labels + labelTextColor, person w/ "Assign to me", 5-star rating,
  date w/ Today/Clear, row menu: open draft / copy name / view activity /
  archive w/ Undo / delete admin-only w/ Undo). Add-project row with dup guard.
  Collapsible Completed section. Mutations use the SAME funnel as desktop
  (patchProject + activityForPatch) so activity/merge behave identically.
- **MobileDrafts** — card list (level pill, readiness via missingRequired,
  relative edited time) → review screen: checklist, REAL Slack preview
  (buildPostText), pinned "Copy for Slack / Mark posted" (gated on missing
  fields), ··· sheet (copy text / duplicate / delete). Editing fields stays on
  desktop Compose (by design).
- **MobileAhj** — searchable list (name/alias + full-text post hits with
  highlight via searchAhjs), sort Name/Last updated → board detail: composer
  ("Posting as"), pinned-first posts, pin/unpin, delete → Trash with Undo.
  Rename/aliases/history/trash management stay desktop.
- **MobileHours** — month switcher, My hours/Team segment, navy summary card,
  day cards (date tile colored by day type) with delete+Undo, team rows with
  stacked bars + Copy summary; full-screen **Log extra hours**: 14-day strip
  starting TODAY (weekends tinted, orange dot = already logged, teal ring =
  today), native date fallback, day-type pills (auto from date, override note),
  56px ± stepper (whole hours) + 1/2/4/6/8 quick picks, description + reuse
  chips from the user's own history, submit disabled until a description
  exists, Undo toast after logging.
- **MobileAdmin** — segmented Settings/Users/Daily Progress. Settings = me
  card + grouped lists; rows open bottom sheets (roster chips + add, lead
  picker, phrase editor with preview); Data rows incl. two-step Clear all.
  Users + Daily Progress embed the existing components.

### Known deviations from the mock (deliberate)
- "Designed date" filter chip omitted (inert in the mock too).
- AutoCAD title block line left out of the mobile ··· sheet (desktop job).
- Slack preview renders the real generated post text, not the mock's
  hand-styled lines — same content, correct by construction.

## Gate
417/417 tests (33 files) · tsc · eslint · vite build · check:nosecrets — all
green. New dep: exceljs (lazy-loaded). Deploy + commit: **on Aboud's word.**
