# Plan — Project Board (10-project-board.md), approved by Aboud 2026-10-02

Phase B0 plan as posted and OK'd ("go"). Defaults below stand unless Aboud
says otherwise; open items are in the SPEC-GAP list.

## Libraries (installed, exact versions)

| Package | Version | Why |
|---|---|---|
| `@supabase/supabase-js` | 2.117.2 | D2 — DB + auth + realtime |
| `@tanstack/react-table` | 8.21.3 | D5 — latest 8.x (v9 is now stable; D5 locked 8.x, Aboud can overrule) |
| `@floating-ui/react` | 0.27.20 | No popover exists in the repo; label/person/date pickers need viewport-edge handling |

Not installed: `sonner` (own `Toast` has 5-s Undo) · `react-day-picker`
(**native `<input type="date">`** — already the repo pattern in Compose) ·
`@dnd-kit` (backlog).

## Phase map (§11)

- **B0 (this phase):** libs, `supabase/migrations/0001_board.sql`,
  `supabase/seed.sql`, `src/lib/supabase.ts`, `src/board/types.ts`,
  `dates.ts` board helpers + tests, `.env.example`, `check-no-secrets.mjs`
  hardening, `SETUP.md`. No visible UI change.
- **B1:** replace the Phase 9 password login with Supabase Google auth +
  allowlist; access-pending screen; Settings → Team on `team_members`;
  Bearer checks in `/api/extract`, `/api/rewrite` (and `/api/ahjs`).
- **B2:** Board tab — TanStack table, column registry, editors, Edit labels,
  quick add, duplicate guard, archive/undo, search/filter/sort, resizing +
  per-user persistence, realtime.
- **B3:** drafts/history → `posts` table; one-time localStorage upload;
  Compose ↔ Board linking; status automations; retire `records.mts`/`users.mts`.
- **B4:** scheduled `/api/backup` to Netlify Blobs (30-day retention),
  health pill reports DB.

## Decisions taken on defaults (flagged in the B0 review)

1. **Auth:** Phase 9 username/password login is replaced in B1 by Supabase
   Google sign-in (D4). Phase 9 was never deployed, so nothing in prod churns.
2. **AHJ tab:** stays on its Netlify Blobs sync in v1; only drafts/history
   move to Supabase. (AHJs → Supabase = backlog.)
3. **`posts.deleted_at`** added to the §5.2 migration — the app's tombstone
   delete + Undo needs a real column.
4. **Tabs:** Board becomes a new main tab (first, default landing per Q6);
   two-level nav stays.
5. **TanStack 8.21.3**, not v9 — D5 is locked.
6. **Guard:** keep tokenized paths + origin check AND add Bearer auth
   (spec §10 said "replace"; both is zero churn + defense in depth).
7. **Deep link `#/compose/<postId>`:** hand-rolled hash listener, no router.
8. **Migration author mapping:** exact `display_name` match; unmatched →
   current user + logged SPEC-GAP.

## Open SPEC-GAPs for Aboud (§13)

- [ ] Real team emails for `seed.sql`; who besides Aboud is admin
- [ ] Company-owned Supabase account + boss sign-off (D10); Free vs Pro
- [ ] Q1 Design/Schedule meaning (labels vs date) — coded as labels
- [ ] Q2 Rating meaning — coded generic 1–3, not L1–L4
- [ ] Q3 Designed date — coded manual
- [ ] Q5 Automations — coded ON (draft→Working on it, posted→Done), each toggleable
