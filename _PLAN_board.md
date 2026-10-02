# Plan — Project Board (10-project-board.md), re-based 2026-10-02

Aboud's direction after the B0 review: **"no need for this complicated login
process, all I need is the monday.com CRM system in ours."** So the Supabase /
Google-OAuth architecture from the spec is dropped and the board rides the
app's existing infrastructure instead. Where this file disagrees with
`10-project-board.md`, this file wins.

## Architecture (actual)

- **No Supabase, no new login.** Identity = the existing Phase 9 session
  (display name). Access control = the existing origin allowlist + tokenized
  API paths — the same protection the drafts/history store already has.
- **Storage** = Netlify Blobs store `sowpost`, key `board`, holding
  `{ projects, labels, activity }` — served by `netlify/functions/board.mts`
  (GET/PUT, merge by id/`updatedAt`, etag compare-and-swap), exactly like
  `records.mts`.
- **Client** = localStorage cache `sowpost.board` + optimistic edits +
  debounced push (1 s). "Live" updates are **polling**: refetch every 15 s
  while the page is visible, and on window focus. Plenty for 3 users.
- Labels (status + Design/Schedule) are data with fixed-id seeds, so renames
  survive merges and two browsers can't duplicate the seed set.
- Activity log is append-only client-written entries, union-merged by id,
  capped at 1000 server-side.

## Libraries

`@tanstack/react-table@8.21.3` (table, sorting, CSS-var resizing) and
`@floating-ui/react@0.27.20` (pickers' popovers). `@supabase/supabase-js`
was removed. Dates: native `<input type="date">`; toasts: existing Toast.

## Shipped in the board phase (see `_CHECKPOINT_board_core.md`)

Board main tab (first, default landing when signed in) with: quick add +
duplicate guard, label cells with Edit-labels panel (rename/recolor/reorder/
default/done/archive-with-reassign), person picker, date cell, 1–3 star
rating, search/filters/My projects/Show archived, sortable headers,
resizable + hideable columns persisted per browser, row menu (copy name,
activity, archive w/ Undo, admin delete), activity viewer.

## Next phase (not started — needs Aboud's go)

Compose ↔ Board linking: a Post column on the board, a Project field in
Compose with suggestions from the parsed customer name, status automations
(draft linked → Working on it; Mark as posted → Done, forward-only with
Undo), deep links. PostRecord gains an optional `projectId`.

## Deliberately dropped from the spec (with the Supabase exit)

Google sign-in + allowlist (D4) · RLS/Bearer hardening (§10) · `/api/backup`
scheduled function (Blobs is already the store; export/import JSON remains
the manual backup) · realtime websockets (polling instead) · one-time
localStorage→DB migration (§8 — nothing moves, the stores stay where they are).
