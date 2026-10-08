# Board benchmark study — what we have, what we're missing, what to adapt

> Requested by Aboud 2026-10-08. Research + code audit only — **nothing built, nothing deployed.**
> Verified against the code at `f4193ee` + local uncommitted roster fix. Line refs are real.

---

## 1. What the board HAS today (verified in `src/board/`, 2,153 LOC)

Do not re-propose any of these — they exist and work.

| Area | What's there | Where |
|---|---|---|
| Columns (8) | Project name, SOW coordinator, Status, Designed date, Design/Schedule, Rating (1–5 ★), Post, Last update | `BoardTab.tsx:553–713` |
| Custom labels | Per-column label sets, 16-swatch colors, sortOrder, isDefault, isDone, isSystem, archive | `EditLabelsModal.tsx`, `types.ts:10–28` |
| Search | Name substring | `BoardTab.tsx:442` |
| Filters (6) | coordinators, statusIds, phaseIds, mine, showArchived, designed-date range | `BoardTab.tsx:52–61`, `441–460` |
| Filter persistence | All filters survive reload (localStorage) | `BoardTab.tsx:306` |
| Sort | Per-column, shared between main + Completed tables | `BoardTab.tsx:726`, `742` |
| Column resize | Persisted, debounced 300 ms | `BoardTab.tsx:299` |
| Column show/hide | "Columns ▾" picker, persisted | `BoardTab.tsx:283–304`, `875–897` |
| Row reorder | Monday-style drag the row itself (no handle — Aboud's explicit call), `position` midpoints, clears sort | `lib/board.ts` `positionForMove()` |
| Completed section | isDone status ⇒ row drops below, collapsible, persisted | `BoardTab.tsx:294`, `1025` |
| Activity log | Field-level old→new per edit, actor + timestamp | `types.ts:53–63`, `ActivityModal.tsx` |
| Lifecycle | Archive / restore / permanent-delete tombstones | `types.ts:42–44` |
| Compose link | Post column, prefilled linked drafts, chip, name-match Link suggestion | `_CHECKPOINT_board_core.md` |
| Sync | Blobs + localStorage cache + merge-by-updatedAt, 15 s polling | `App.tsx` |

**Honest read: this is already a competent Monday-lite table.** The gaps below are real but the base is
further along than a feature-count comparison suggests.

---

## 2. What's genuinely MISSING (verified absent, not guessed)

Ordered by what it would actually change for a 5-person solar design team.

| # | Missing | Evidence | Why it matters here |
|---|---|---|---|
| 1 | **Group by** any column | `getGroupedRowModel` never imported | Monday's signature move. "Show me everything per coordinator / per status" is the daily question |
| 2 | **Install date on the board** | Only `designedDate` exists (`types.ts:38`); install date lives on the linked post, computed in Daily Progress via `linkedPosts()` | The board cannot sort or filter by the date the team actually plans around |
| 3 | **Bulk select + bulk edit** | no checkbox column, no bulk bar, `bulk` = 0 hits | Changing status on 8 rows = 8 popovers today |
| 4 | **Aging / stale signal** | nothing reads `updatedAt` for staleness | A project parked in Design for 3 weeks looks identical to today's |
| 5 | **Per-row Updates / comments** | activity log is machine-written only; `comment` = 0 hits | Monday's #1 collaboration surface. Today this conversation happens in Slack, detached from the row |
| 6 | **Alternative views** | table only — no Kanban-by-status, no calendar, no timeline | Scheduling is inherently calendar-shaped |
| 7 | **Dashboard / analytics** | none | No throughput, cycle time, or per-coordinator load |
| 8 | **URL-encoded view state** | filters are localStorage-only | Can't send a teammate "look at this filtered view" |
| 9 | Command palette (⌘K), `?` overlay, keyboard DnD + `aria-live` | `aria-live` = 0 hits | Accessibility + speed. Drag is mouse-only; **touch still untested** (known) |
| 10 | Subitems / checklists | none | Would cover per-project task breakdown |
| 11 | Dependencies between rows | none | Low value at 5 people |
| 12 | File attachments | none | Plan sets live elsewhere anyway |
| 13 | Virtualization | TanStack Virtual not installed | Irrelevant until ~1,000+ rows |
| 14 | Notifications / @mentions | none | Nothing tells Omar his row changed |
| 15 | Row-density toggle | none | Cosmetic |

---

## 3. Libraries — what to use, what to avoid

### Already installed and under-used (the cheap wins)
**`@tanstack/react-table` 8.21.3** — MIT, free, zero new dependency. Three unused features map
directly onto gaps #1, #3:
- `getGroupedRowModel()` + `getExpandedRowModel()` → **group by** with per-group aggregates
- `enableRowSelection` + `getIsSomeRowsSelected()` → **bulk select**
- `getFacetedUniqueValues()` → filter dropdowns that show counts

> This is the headline finding of the study: **the two highest-value gaps need no new library.**

### Worth adding, only when the trigger hits
| Library | Size | Add when |
|---|---|---|
| `@tanstack/react-virtual` | ~5 kB | Rows pass ~1,000. Not now |
| `dnd-kit` | ~30 kB | You want accessible keyboard DnD + reliable touch. **Caveat:** replaces the hand-rolled drag you specifically designed (row itself, no handle) — real regression risk |

### Explicitly do NOT adopt
- **AG Grid** — 90–100 kB Community, and grouping / pivot / Excel export sit behind **Enterprise at ~$999/dev**. You'd pay for features TanStack gives free, and lose the custom cell rendering.
- **Glide Data Grid** — canvas-rendered for 100k+ spreadsheet cells. Wrong shape for an 8-column board.
- **MUI X Data Grid** — only compelling inside Material UI; this app isn't.
- **Handsontable** — Excel-like editing, commercial for non-OSS.

---

## 4. Projects worth reading before building

| Project | License | What to steal |
|---|---|---|
| **Focalboard** | OSS (verify — upstream maintenance in flux) | Board / table / gallery over the *same* data, filter+group by any property. Closest existing model for gap #1 and #6 |
| **Plane** | AGPL-3.0, TypeScript | Modern issue-tracker UX, configurable views, analytics. Read its table + board view code |
| **Vikunja** | AGPLv3 | Small-team restraint — list/table/Gantt/calendar without bloat. Good taste reference |
| **Linear** | closed | The bar for keyboard-first UX, command palette, triage/aging. Study patterns only |
| **Teable / NocoDB** | OSS | Airtable-style *column-type system*, if custom column types are ever wanted |
| **Monday** | commercial | You already use it for structural calc boards — its column-type catalog is the canonical checklist |

---

## 5. Recommendation — three tiers

Shaped against the standing preference for **simple, vertical, manual-choice UI** (see
`aboud-prefers-simple-ui`). The point is NOT to clone Monday.

### Tier 1 — do these (high value, low cost, no new dependency)
1. **Group by** (Status / Coordinator / Design-Schedule / none) — one `select`, collapsible groups with count + hours/rating aggregate
2. **Install date as a real column** — read-only, mirrored from the linked post, sortable + filterable
   ⚠️ **Must stay read-only.** Editing it on the board would write back to Compose, which breaks the locked
   rule "the board controls Compose, never the opposite"
3. **Aging signal** — subtle warm tint / dot when a row hasn't moved in N days, or designed date has passed
   with no install date. Reads `updatedAt`, no schema change
4. **Bulk select + bulk status / coordinator change** — checkbox column + sticky bottom action bar, with Undo
5. **View presets** — 3–4 named one-click presets ("My projects", "Awaiting schedule", "Designed this week")
   rather than a full saved-views engine

### Tier 2 — real value, bigger build (pick at most one at a time)
6. **Per-row Updates thread** — human comments on the row; the single biggest workflow change available.
   Needs a new synced store or a `board` blob extension
7. **Calendar / month view** on designed + install dates — mirrors the Daily Progress report already built
8. **Dashboard tiles** — per-status counts, per-coordinator load, avg rating, designed-this-week
   (the Extra Work stat tiles are the proven pattern to reuse)
9. **Kanban-by-status view** — drag between status columns

### Tier 3 — defer, probably never at 5 people
Subitems, dependencies, Gantt, attachments, formula/mirror/connect columns, cross-board automations,
AI columns, notifications, virtualization.

---

## 6. Open questions for Aboud

1. Tier 1 is ~5 items. Take all five as one batch, or start with Group by + Install date only?
2. Gap #5 (per-row Updates) — is Slack actually fine, or is detached conversation a real problem?
3. Calendar view vs Kanban view — which matches how the team actually thinks about the pipeline?
4. Touch dragging is still untested on a real phone. Worth fixing, or stay mouse-only?

---

## Sources
- monday.com column types / subitems / dependencies / cross-board automations (support + developer docs)
- React data-grid comparisons 2026 (dev.to, sencha, pkgpulse, simple-table)
- Open-source monday alternatives round-ups 2026 (openalternative, ones.com, selfhostedworld)
- Bulk-actions UX best practices (Eleken)
