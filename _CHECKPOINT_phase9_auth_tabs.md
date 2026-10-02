# CHECKPOINT — Phase 9: tabs/sub-tabs, team login, name formatting

> Date: 2026-10-02 · Status: **built and tested locally — NOT pushed, NOT deployed** (Aboud's instruction)

## What was built

### 1. Two-level navigation
- Main tabs: **Compose · AHJ Requirements · Admin** (Admin visible to admins only).
- Sub-tabs: Compose → *New Post / Drafts / History* (with the old count badges);
  Admin → *Settings / Users*. AHJ has no sub strip.
- Internally the flat `Tab` union survived (`MAIN_OF` / `MAIN_HOME` maps in
  `App.tsx`), so every existing `setTab('compose')` call site kept working.
- New CSS: `.subnav` strip sticky under the navy bar (`theme.css`, Phase 9 block).

### 2. Browser-side team login
- **Login screen** (`src/components/Login.tsx`) gates the app via `AuthGate` in
  `main.tsx` — `App` itself stays login-free, which is why the whole existing
  test suite still renders `<App />` directly.
- Roster lives in **Netlify Blobs** behind `/api/<token>/users`
  (`netlify/functions/users.mts` — same guard/merge/etag pattern as
  `records.mts`; `netlify.toml` got the redirect). Passwords stored as
  `sha256(salt:password)`, never plain. Roster is cached in localStorage so a
  laptop that signed in before can sign in offline.
- **Seeded admin:** username `aboudyousef` (case-insensitive), display name
  "Aboud Yousef", role admin. Seeded on first GET of an empty store. The
  password is NOT in the code — only its salted hash; a unit test pins the
  hash so the seed and `auth.ts` can never drift.
- **Author = session.** Signed in: the header shows a fixed "Posting as" name +
  Log out; the author `<select>` is gone; `settings.lastAuthor` is pinned to
  the session name so AHJ posts and new records stamp correctly; AhjTab's
  "Posting as" picker is locked (`lockedAuthor` prop).
- **Admin → Users** (`src/components/UsersTab.tsx`): add member (username /
  display name / role / password), reset password, toggle role, remove
  (tombstone), change-my-password. Guards: can't remove yourself, can't remove
  or demote the last admin, min 4-char passwords, no username duplicates.

### 3. Customer name formatting (mid-session request)
- `titleCaseName()` (`src/lib/nameCase.ts`): "ANTHONY STEREFF" → "Anthony
  Stereff". Applied at ALL entry points: SF text paste (`parser.ts`), image
  extraction (`extractedToFields`), and manual typing (ComposeTab input).

## Tested
- **288 tests / 23 files — all green** (`npm test`), including 27 new ones:
  `auth.test.ts` (hashing, seed-hash pin, merge, last-admin guard, session),
  `Login.test.tsx` (success, wrong password, unknown user → same message,
  offline-from-cache, offline-no-cache message),
  `App.phase9.test.tsx` (nav structure, member sees no Admin, Users screen,
  fixed author pill + logout, author stamping, no-session fallback, title-case
  typing), `nameCase.test.ts`.
- `tsc --noEmit` clean · `eslint` clean · `npm run build` clean ·
  `check:nosecrets` OK · verified the real password string appears nowhere in
  `dist/`.
- Test-suite edits: two `/New post/i` queries pinned to the exact `'+ New
  post'` button (the new "New Post" sub-tab would have made them ambiguous);
  one draft test's names updated to already-title-cased strings (behavior
  change is intentional).

## Pending / notes for Aboud
- **Not committed-pushed/deployed** — commit exists locally only (see git log);
  deploy is a deliberate CLI step per `_stacks/runbooks/netlify-deploy.md`.
- **Live smoke test owed:** `netlify dev` would not boot from the sandboxed
  shell, so `/api/users` seeding hasn't been exercised against the real Blobs
  emulator. First `npm run dev`: open the site, log in as the admin account,
  then check Admin → Users shows the roster.
- **Rotate the admin password after first login** (Admin → Users → Change my
  password). It was typed in a chat window — by your own rule it is burned.
- Members cannot change their own password (no Admin access) — they ask an
  admin to reset. Deliberate scope cut; revisit if it annoys people.
- Browser-only auth = team discipline, not hard security (Aboud chose this
  knowingly). Upgrade path: move the password check + a session token into the
  Netlify functions; the UI would not change.
- Backup taken before work: `_versions/v5-phase8/` + git tag
  `v5-phase8-pre-auth`.
