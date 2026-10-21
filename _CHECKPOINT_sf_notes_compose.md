# Checkpoint — Salesforce notes on Compose (2026-10-21)

## What was asked
Aboud: "i want the alerts, ahj notes, all the notes to appear on the compose
as alerts for us to read" — the five note columns of the Salesforce
`Export → Details Only (.xlsx)`:

- `Fulfillment: Scheduling Alerts!`
- `Fulfillment: Jurisdiction: Design/City Requirements`
- `Fulfillment: Jurisdiction: Battery Requirements`
- `Fulfillment: Utility Company: Requirements - Design`
- `Fulfillment: Utility Company: Battery Requirements`

Then: "do this then deploy."

## How it works
1. **Import from Salesforce** now mirrors those five columns onto the board
   row (`BoardProject.sfNotes` + `sfNotesAt`, optional — no migration, same
   contract as `BoardLabel.outOfScope`).
2. **Compose** shows a yellow banner under Customer name whenever the draft's
   customer matches a board row that carries notes — one labelled block per
   filled section. Display-only, never enters the post text (same rule as the
   aluminum banner).

## What was built
| File | Change |
|---|---|
| `src/lib/sfNotes.ts` | NEW — `SfNotes` + sections/equality/summary helpers, shared by all consumers |
| `src/lib/sfWorkbook.ts` | reads the five columns by header name, CRLF→LF; absent columns ⇒ `notes` undefined |
| `src/lib/sfReport.ts` | `SfReportRow.notes?` — only the .xlsx sets it; a paste never can |
| `src/lib/sfImport.ts` | plan rows carry notes; `counts.notes` = existing rows whose copy changes; `{}` = Salesforce cleared them |
| `src/board/BoardTab.tsx` | `runImport` writes/clears `sfNotes`, logs via `activityForPatch`, Undo restores the old notes |
| `src/board/ImportModal.tsx` | preview line "N existing rows get updated Salesforce notes"; notes-only change enables Import |
| `src/lib/board.ts` | `ProjectPatch` + activity summary (section names, never the text); **`ACTIVITY_CAP` 1000 → 5000** |
| `src/components/ComposeTab.tsx` | the `.sf-notes-banner` under Customer name |

## Decisions (made autonomously, flagged here)
- **The export is the truth for notes**: a matched row's notes update on every
  xlsx import, and notes cleared in Salesforce clear on the board. A paste
  can never touch them (it has no such columns).
- **Activity logs section names only** ("Scheduling alerts · Utility — design
  requirements"), never the note text — entries stay small.
- `ACTIVITY_CAP` raised in this change because the importer going live makes
  the 1000-cap truncation urgent (open item #5 since 2026-10-19).
- Banner sits under **Customer name** (match is by customer), aluminum stays
  under Jurisdiction.

## What was tested (TDD — watched each fail first)
- 31 new tests: 8 `sfNotes`, 6 `sfWorkbook` (real fixture: Eric Webber's
  alerts/utility text, CRLF, old-layout fallback), 7 `sfImport`, 4+1
  `board` (activity summary, clear, no-change, cap 5000), 2 `BoardTab`
  (write + activity log, Undo restores old notes), 2 `ImportModal`
  (preview line; **notes-only change still enables Import**), 2 `ComposeTab`
  banner (sections shown, display-only).
- Full suite **888 tests / 59 files, 0 fail** (twice). `tsc -b`, `npm run
  lint`, `check:nosecrets`, `npm run build` all clean. No fixture customer
  name reaches `dist/`.

## Deploy
Per CLAUDE.md §6: live-data backup → deploy → re-pull + diff. Recorded below
when done.
