# Checkpoint — board save outage, 2026-10-18

Aboud opened with "the current database structure is letting us miss a lot of
data, some of us have some stuff on their screens and some no — we need to
switch". The investigation found that this is **not** an architecture problem.
It is a one-key schema mismatch that silently rejected every board write for
37 hours.

**STATUS AT END OF SESSION: FIXED, DEPLOYED, DATA RECOVERED.**
Branch `fix/board-save-outage` at `0a86e4a` — **committed and deployed to prod
twice, but NOT pushed to GitHub.** Aboud approved the deploys; he never
approved a push, so `main` is two commits behind production.

---

## 1. Export (done first, as asked)

`_versions/v16-live-backup-2026-10-18/` — all five live blobs, valid JSON,
all five `.err` files empty.

| Key | Contents |
|---|---|
| `board` | 161 projects, 12 labels, 1000 activity rows, **no `updates` key** |
| `records` | 207 |
| `extrawork` | 47 entries |
| `users` | 5 |
| `ahjs` | 1 |

There are **no per-user blobs** — there never were. Five shared keys in store
`sowpost`, read by everyone. The divergence was never in the storage layout.

`.gitignore` widened from `_versions/v11-live-backup-*/` to
`_versions/*live-backup-*/` so this and every future backup stay out of the
repo — `users.json` holds the password salts and hashes. Verified with
`git check-ignore`.

---

## 2. Root cause

| Step | Where |
|---|---|
| `emptyBoard()` seeds a fourth collection, `updates: []` | `src/lib/board.ts:56` |
| `putSharedBoard` sends the whole `BoardState` | `src/lib/api.ts:214` |
| `PutSchema` is `.strict()` over only projects/labels/activity | `netlify/functions/board.mts` (old) |
| zod answers `unrecognized_keys` → function returns **400** | — |
| the rejection is swallowed into a status dot | `src/App.tsx:332` |

`mergeBoard` on the server also never carried `updates` through, so even a
passing parse would have dropped every update thread. Two bugs, one deploy.

### Evidence

| | |
|---|---|
| Updates deploy | `2026-10-17T07:16Z` |
| Last accepted board write | `2026-10-16T19:32Z` — *before* it |
| Writes since | **0** |
| Writes the week before | 108 / 74 / 78 / 131 / 149 / 66 per day |

Only `board` was affected. `records`, `ahjs`, `users` and `extrawork` each
build an explicit single-key payload (`{ records }`, `{ entries }`, …), so
they never drifted. Checked all four.

### Why it looked like a database problem

Every person's edits since Thursday evening went to their own localStorage and
nowhere else. Each saw their own work; nobody saw anyone else's.

---

## 3. The fix (local only)

| File | Change |
|---|---|
| `netlify/functions/lib/boardMerge.ts` | **new** — schema + merge extracted here so they are testable, per the `lib/guard.ts` precedent |
| `netlify/functions/lib/boardMerge.test.ts` | **new** — 8 tests |
| `netlify/functions/board.mts` | imports the above; `updates` added to the GET default and the log line |
| `src/App.tsx` | the pill now reads **"Not saved"**, not "Synced", when a store is failing |
| `src/theme.css` | `.status-item.danger` — red, pulsing, honours `prefers-reduced-motion` |
| `src/App.syncfailure.test.tsx` | **new** — 3 tests |
| `src/App.recovery.test.tsx` | **new** — 2 tests |

`updates` is `.optional().default([])`, so a client that predates the Updates
feature and omits the key keeps saving.

### The test that matters

`App.recovery.test.tsx` → *"sends a payload the server schema accepts"* feeds
the **real client PUT body** to the **real server `PutSchema`**. Reverting the
schema makes it fail with `code: 'unrecognized_keys'` — verified, not assumed.
That is the check whose absence allowed the outage.

### Recovery is automatic

`src/App.tsx:398-403` already pushes `mergeBoard(loadBoard(), server)` once on
mount. With the schema fixed, each person's stranded work uploads the next time
they open the app. No migration, no manual re-entry.

(The "Pull-only — pushes stay edit-driven" comment at `App.tsx:339` describes
only the 15-second poll, not mount. Misreading it cost one wrong assumption,
caught by a test that passed when it should have failed.)

---

## 4. Verification

| Gate | Result |
|---|---|
| `npx vitest run` | **706 passed / 48 files** (was 693 / 47) |
| `npx tsc --noEmit` | clean |
| `npx eslint src netlify` | clean |
| `node scripts/check-no-secrets.mjs` | clean |

Watched every new test fail first, for the right reason, before writing the fix.

---

## 4b. What happened after the deploy

Confirmed in production, not assumed:

| | |
|---|---|
| `updates` key on the board blob | **YES, 5 posts** — impossible under the old schema |
| projects | 161 → 175 |
| Anas's 11 stranded rows | **11/11 arrived** |
| The two update threads at risk | both recovered (Sylvester Hernandez, Susan Stone) |
| Duplicate rows created during the outage | 1 (Sony Joseph), deduped |

**A second, independent bug surfaced and was fixed in `0a86e4a`:** the Board's
people-pickers read `settings.authors` — localStorage-only, ships as three
names, App appends only the signed-in user. Anas's list had no Yarob; Refai's
had neither Anas nor Yarob. Fixed by using the synced account roster, the same
list Extra Work moved to on 2026-10-08 and mobile already used. That commit
also added column reordering and per-column value filters.

## 5. Still open

1. **⬜ YAROB HAS NOT SYNCED.** Last write `2026-10-16T19:24Z`. Everything he
   did 16–18 Oct is still only in his browser. He must open the app — and
   until he does, must not clear his cache, must not hit the crash-screen
   reset (`src/components/ErrorBoundary.tsx:43` calls `localStorage.clear()`),
   must not switch browsers. Check with `node scripts/check-sync.mjs`, then
   `node scripts/dedupe-projects.mjs` (dry run first) in case he brings
   duplicates.
2. **Push the branch / merge to `main`.** Prod is ahead of `main`.
3. **Settings is localStorage-only.** `sowpost.settings` — authors, designers,
   `clrAgents`, `projectManagers`, `utilities`, `regionLead`, `chips`,
   `defaults` — is **not** one of the five blobs. Every teammate has a private,
   divergent roster. This is a second, independent cause of "some of us have
   stuff on their screens and some no" and the fix above does **not** address
   it.
4. **`ACTIVITY_CAP = 1000` and the live board sits at exactly 1000.** Activity
   history is being silently truncated right now.
5. **Row-level last-write-wins.** `mergeStamped` replaces the whole row, so two
   people editing different columns of the same project in the same debounce
   window still clobber each other.
6. **Postgres.** Aboud chose "move to Postgres, preserve all history" before
   the root cause was known. Items 3-5 are the real case for it; the save
   outage is not. Worth re-deciding deliberately — note that
   `src/board/types.ts:1-5` records the original "NO Supabase" decision from
   2026-10-02, and `sow-post-generator` is **not** git-connected
   (`repo: null`, verified), so darona's migrate-on-deploy pattern cannot be
   reused here.
7. The five passwords still need rotating (hashes are in git history).
