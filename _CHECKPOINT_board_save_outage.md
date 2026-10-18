# Checkpoint — board save outage, 2026-10-18

Aboud opened with "the current database structure is letting us miss a lot of
data, some of us have some stuff on their screens and some no — we need to
switch". The investigation found that this is **not** an architecture problem.
It is a one-key schema mismatch that silently rejected every board write for
37 hours.

**NOTHING HAS BEEN COMMITTED, PUSHED OR DEPLOYED.** Aboud's instruction:
"don't deploy or push anything until we agree on the plan."

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

## 5. Still open

1. **Deploy.** Blocked on Aboud's agreement. Until then the team is still
   losing writes — this is the urgent item.
2. **Tell the team now:** do not clear the cache, do not use the "reset"
   button, stay in the same browser.
   `src/components/ErrorBoundary.tsx:43` calls `localStorage.clear()`, which
   would permanently destroy that person's stranded work.
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
