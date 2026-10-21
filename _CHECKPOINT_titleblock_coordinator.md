# Checkpoint — Title block SOW Coordinator from the board (2026-10-21)

## What was built
The AutoCAD title block's **SOW Coordinator** cell now shows the coordinator
**assigned on the board**, not the record's author.

- `src/lib/template.ts` — new `titleBlockCoordinator(record, boardProjects?)`:
  the LINKED board row's `coordinator` (via `record.projectId`, skipping
  deleted rows) wins; falls back to `record.author` when the record is
  unlinked, the row was deleted/unassigned, or no board data is passed.
  `titleBlockFields` / `titleBlockTsv` take an optional `boardProjects` param.
- Plumbing: `ComposeTab` → `OutputColumn` → `TitleBlockCard` now pass
  `boardProjects` down (new required prop on both components).
- Deliberate scope: an UNLINKED record that merely name-matches a board row
  still shows the author — Compose's link bar is the way to opt in.

## What was tested
- TDD: 6 new tests in `template.test.ts` ("SOW Coordinator comes from the
  linked board row") — linked wins, TSV payload, unlinked / deleted /
  unassigned / no-board fallbacks. Watched the 2 behavior tests fail RED
  before implementing.
- Full suite: 57 files / 857 tests pass. `tsc -b` clean.
- `OutputColumn.noteCheck.test.tsx` harness updated for the new prop.

## Backup
Pre-change copies in `_versions/v21-titleblock-coordinator/`
(template.ts, template.test.ts, TitleBlockCard.tsx, OutputColumn.tsx, ComposeTab.tsx).

## Pending
- Not committed / not deployed. Deploy requires the live-data backup +
  post-deploy diff procedure (CLAUDE.md §6 deploy rule).
