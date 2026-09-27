# Checkpoint — AHJ Requirements tab (Phase 5)

> Built 2026-09-26 from the Claude Design v2 handoff
> (`../ahj-design-handoff/ahj-requirements-tab-design/project/AHJ Requirements v2.dc.html`).
> Phase 1 state backed up first to `_versions/v1-phase1/`.

## What was built

- **Data model** (`src/types.ts`): `Ahj` (name, aliases, posts, tombstone, meta `updatedAt`)
  and `AhjPost` (text, author, timestamps, pin, full edit `history[]`, per-post `updatedAt`,
  tombstone). `PostRecord.includeAhjInPost` (optional, additive — schemaVersion unchanged).
  `ExportFile.ahjs` included in Export/Import on both History and Settings tabs.
- **Core lib** (`src/lib/ahj.ts`): normalized name/alias matching, pinned-first ordering,
  name-conflict checks, global search with snippets, and a **deep merge** — AHJ meta merges
  by `updatedAt`, posts merge individually by id, so concurrent posts from two designers to
  the same board are never lost.
- **Team sync**: new `netlify/functions/ahjs.mts` (Netlify Blobs store `sowpost`, key `ahjs`)
  importing the SAME `mergeAhjs` as the client; `/api/:token/ahjs` redirect in `netlify.toml`;
  client wrappers in `src/lib/api.ts`; App does pull-merge-push on load + debounced push on
  every change. "Team synced" pill now requires both records AND ahjs round trips.
- **AHJ Requirements tab** (`src/components/AhjTab.tsx`): global search across names/aliases/
  posts (highlighted snippets, click-to-open), searchable AHJ picker + Name/Last-updated sort,
  Add/Rename AHJ modal with alias-conflict validation, board header with alias chips + stamp,
  composer with "Posting as" (reuses Settings.authors / lastAuthor) + Ctrl+Enter, post feed
  (pin, inline edit, per-post History modal with version restore, delete), collapsible Trash
  (AHJs + posts, restore with conflict re-check; restoring a post inside a deleted AHJ
  restores the AHJ too). Nothing is ever hard-deleted.
- **Compose integration** (`ComposeTab.tsx`): amber banner under Jurisdiction when the value
  matches an AHJ name/alias, with all live posts + "Open board" link. Checkbox
  **"Include AHJ requirements in the post"** — default OFF (ticking = designer approval),
  saved on the record, auto-reset when the jurisdiction resolves to a different AHJ.
  `buildPostText/buildPostHtml` append `*AHJ Requirements (Name):*` bullets before the
  @mention line; `markAsPosted` freezes it into `finalText` as usual.

## What was tested (99/99 green, tsc clean, eslint clean, vite build ok)

- `src/lib/ahj.test.ts` (13): matching, ordering, conflicts, deep merge (concurrent posts,
  tombstone propagation both directions), search.
- `src/lib/template.test.ts` (+4): off-by-default, no-match, alias match with multi-line
  indent + tags-stay-last, HTML version.
- `src/components/AhjTab.test.tsx` (7): add AHJ + alias conflict, post, edit→history→restore
  version, pin ordering, post trash/restore, AHJ trash/restore, global search jump.
- `src/App.integration.test.tsx` (+1): full Compose flow — alias banner, default-off preview,
  tick → post text, jurisdiction switch resets the tick. Existing sync test updated for the
  second endpoint.

## Pending

- **Deploy**: push/redeploy on Netlify (no new env vars needed — Blobs auto-wires; the new
  function reuses the same guard + token). `netlify dev` emulates everything locally.
- Prototype's demo seed data intentionally NOT shipped — boards start empty.
- Possible later: pin limit / ordering within pinned, AHJ notes in the Drafts list row.

## Code review + hardening 2026-09-27 (pre-deploy)

Independent code review found 1 Critical + 5 Important issues; all fixed:

1. **(Critical) Sync response clobbered newer local state** — a post created while a push was
   in flight could be silently lost. All server responses (debounced push AND initial sync,
   records AND ahjs) are now MERGED into current state via functional setState, never assigned.
2. **Approval is now per-AHJ** — `PostRecord.ahjApprovedId` stores WHICH AHJ the designer
   approved (replaces the boolean + reset-effect). A different AHJ shows unticked; a typo in
   the Jurisdiction field no longer destroys the approval; reopening a draft keeps it.
3. **Concurrent edits to the same post** — the losing edit's text is preserved as a history
   version during merge (histories unioned + deduped) instead of vanishing.
4. **Frozen rich copy** — `PostRecord.finalHtml` is frozen at "Mark as posted" alongside
   `finalText`; History copies never rebuild from live AHJ boards.
5. **Server compare-and-swap** — both `ahjs.mts` and `records.mts` PUT now use Blobs etag
   `onlyIfMatch`/`onlyIfNew` with retry (5 attempts → 503), eliminating the concurrent-PUT
   overwrite race. Falls back to unconditional write only when the emulator returns no etag.
6. **Sync pill** — "Team synced" now requires BOTH stores healthy (per-store status tracking).

Minors also fixed: alias dedupe + self-name drop in the Add/Rename form; multi-word search
matches across line breaks; malformed imports (AHJ without posts array) normalized; import
summary reports AHJ boards; stable trash row keys; scroll timer cleanup.

**Verification after fixes: 107/107 tests, tsc clean, eslint clean, vite build ok.**

### Accepted limitations (documented, not bugs)
- Last-write-wins uses ISO timestamps: a machine with a badly skewed clock wins merges until
  fixed. Acceptable for a 3-person team; noted here for future debugging.
- If two designers edit the SAME post concurrently, the newer edit becomes current and the
  older edit is kept as a history version (not auto-merged into the text).
