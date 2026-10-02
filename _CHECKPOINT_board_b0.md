# Checkpoint — Project Board Phase B0 (plan & plumbing)

Date: 2026-10-02 · Spec: `../10-project-board.md` §11 B0 · Plan: `_PLAN_board.md`

## Built

- Dependencies (exact-pinned): `@supabase/supabase-js@2.117.2`,
  `@tanstack/react-table@8.21.3`, `@floating-ui/react@0.27.20`.
- `supabase/migrations/0001_board.sql` — spec §5.2 verbatim **plus
  `posts.deleted_at`** (tombstone; the app's delete+Undo needs a real column).
- `supabase/seed.sql` — 5 labels + 3 team members (emails are `REPLACE-…`,
  Aboud fills them).
- `src/lib/supabase.ts` — lazy singleton client; `supabaseConfigured()` so the
  app builds/runs before the Supabase project exists.
- `src/board/types.ts` — `TeamMember` / `Label` / `Project` / `PostRow`
  (snake_case, mirrors the migration; `payload` = existing `PostRecord`).
- `src/lib/dates.ts` — added `parseIsoLocal()` (local-midnight parse, the T8
  timezone rule) and `relativeTime()` (clock-skew safe, injectable `now`).
- `src/lib/dates.test.ts` — 14 tests, covers the pre-existing helpers too
  (they had none).
- `.env.example` — 4 Supabase vars documented (2 client-public, 2 functions-only).
- `scripts/check-no-secrets.mjs` — now also fails on `sb_secret_…` and
  plaintext service-role references in `dist/`.
- `SETUP.md` — Aboud's manual steps: company Supabase project (D10), run SQL,
  Google OAuth client, redirect URLs, Netlify env vars, smoke test.
- `spec/00-README.md` file map now lists `10-project-board.md` (§0.5).

## Tested

- `npm test`: **302/302 pass** (24 files) — includes the 14 new date tests.
- `npm run lint`: clean. `npm run build` (tsc + vite): clean.
- `npm run check:nosecrets`: OK on the fresh build.

## Pending / waiting on Aboud

- SETUP.md steps 1–5 (Supabase project, SQL, OAuth, env vars) — blocks B1
  testing, not B1 coding.
- Real emails in `seed.sql`; second admin? Free vs Pro; D10 boss sign-off.
- §13 defaults confirmation (Q1/Q2/Q3/Q5) — all coded switchable either way.
- No visible UI change in this phase (by design). Next: **B1 — Supabase
  Google auth replaces the Phase 9 password login** (approved default #1).
