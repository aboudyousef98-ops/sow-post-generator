# SETUP.md — Supabase + Google sign-in for the Project Board

Manual steps for Aboud (10-project-board.md §9). Do these once, in order.
Nothing in the app needs the board DB until Phase B1 ships, but the env vars
must exist before the first B1 deploy.

## 1. Create the Supabase project

- Sign in to [supabase.com](https://supabase.com) with the **company-owned
  account/email** (decision D10 — get boss sign-off first; customer names are
  PII and must not live under a personal account).
- New project → name `sow-post-generator` → **Region: US East (or US Central)** —
  closest to the Texas users, not to you.
- Note the project ref (the `xyzabc` in `https://xyzabc.supabase.co`).
- Free tier works, with two caveats the app works around: projects **pause
  after 7 days of inactivity** and there are **no automatic backups** — the
  daily `/api/backup` function (Phase B4) covers both. Pro ($25/mo) removes
  both caveats; your call (§13).

## 2. Run the SQL

In the Supabase dashboard → SQL editor:

1. Paste and run `supabase/migrations/0001_board.sql` (whole file, once).
2. Open `supabase/seed.sql`, **replace the three `REPLACE-…` emails** with the
   real Google account emails each person signs in with (yours = admin), then
   paste and run it.

Sanity check: Table editor → `labels` shows 5 rows, `team_members` shows 3.

## 3. Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com) (any Google
account works; the company one is cleaner):

1. Create/pick a project → APIs & Services → OAuth consent screen →
   External → fill the app name + your email → add the 3 team emails as test
   users (or publish the app).
2. Credentials → Create credentials → **OAuth client ID** → type **Web
   application**.
3. Authorized redirect URI (exactly one, from Supabase):
   `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret** into
   Supabase → Authentication → Providers → **Google** → enable → paste → save.

## 4. Supabase URL configuration

Supabase → Authentication → URL configuration:

- **Site URL** = the production Netlify URL (e.g. `https://<site>.netlify.app`).
- **Redirect URLs** = the Netlify URL **plus** `http://localhost:8888`
  (the `netlify dev` origin; add `http://localhost:5173` too if you ever run
  `npm run dev:vite` bare).

## 5. Netlify environment variables

Site settings → Environment variables → add (names exactly as in
`.env.example`):

| Variable | Value | Scope |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | build (public by design) |
| `VITE_SUPABASE_ANON_KEY` | Project settings → API → **anon / publishable** key | build (public by design) |
| `SUPABASE_URL` | same URL | functions only |
| `SUPABASE_SERVICE_ROLE_KEY` | Project settings → API → **secret** key (`sb_secret_…` — use this format, not the legacy JWT) | functions only |

Mirror the same four into your local `.env` for `netlify dev`. Never commit
`.env`; the service key is the one secret that must never appear anywhere
client-side — `npm run check:nosecrets` scans the bundle for it after every
build.

Then **redeploy** (deploys are manual CLI — pushing to GitHub deploys nothing).

## 6. Smoke test (after Phase B1 is deployed)

Acceptance tests 1, 2 and 11 from 10-project-board.md §11:

- Two browsers, two different team members: a project added in one appears in
  the other within ~2 s without reload (T1) and a status change follows (T2).
- `curl https://<project-ref>.supabase.co/rest/v1/projects -H "apikey: <anon key>"`
  returns `[]` or 401 — never data (T11). A Google account that is **not** in
  `team_members` signs in but sees "Access pending" and zero rows.
