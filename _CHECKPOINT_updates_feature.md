# Checkpoint — updates.docx, 2026-10-17

Everything from the Word doc Aboud dropped in `Project submission notes/`, plus
the two items owed from 2026-10-08.

---

## Owed from last session

| | |
|---|---|
| **Formatting toolbar** | DONE — see `_CHECKPOINT_formatting_toolbar.md` |
| **Extra Work data repair** | DONE AND LIVE — 26 usernames backfilled, 47 rows, 214 h unchanged |

The repair was **recomputed against live data, not the staged Oct 8 file.** That
file held 30 rows; prod had 47. Applying it as staged would have deleted the 17
rows added in between. A full backup of all five blob keys was taken first.

---

## The doc, item by item

### 1. Column sort arrows — DONE
Columns were always sortable; the arrow only appeared *after* you clicked, so
nobody knew. A dimmed `↕` now sits on every header and resolves to `↑`/`↓`.

### 2. Updates tab per project — DONE
A Monday-style thread on every row. `💬` column with a live count, also in the
row menu. Post / edit / delete, with the same formatting toolbar and renderer
as the notes composers, so an update pastes into Slack looking the same.

Stored as `updates` on `BoardState`, merged by id + `updatedAt` like everything
else. Absent on every board written before today, so every reader tolerates
`undefined`. Deletes are tombstones — a hard delete would be resurrected by the
next merge from someone whose cache still had the row.

### 3. 4- and 5-star ratings must say why — DONE
Rating 4 or 5 opens "Why is this N stars?". The rating **does not apply** until
a reason is given; cancel and the row is untouched. The reason is posted to that
project's Updates thread tagged `Rating reason · 5★` — which is where he asked
it to live, and is what the AI search reads. 1–3 stars are not gated.

### 4. (absorbed into 3 — the rating comment lives in Updates)

### 5. Detailed activity log — DONE
Added `update-post` / `update-edit` / `update-delete`. The log already covered
create / field changes / archive / restore / delete. `ActivityModal` now falls
back to the raw verb for an action a future client might add.

### 6. "Pending Additional Information" must say what's missing — DONE
*("This is a must")* — same gate. Status does not change until he says what he
is waiting for; the answer is posted tagged `Missing info`.

> **One caveat.** That label is one Aboud created himself — it is not seeded —
> so the gate matches it **by name**, case/space-insensitively. **Renaming it in
> Admin → Labels would silently stop the gate firing.** Noted in `lib/updates.ts`
> and in the tests. If that is a risk, the fix is an `isPendingInfo` flag on the
> label instead of a name match.

### 7. Bulk status change not applying to all — PARTIALLY ADDRESSED, READ THIS
**I could not reproduce it.** I tried 4 rows and all 26 at once, on real data,
in the browser; every row changed and persisted. `bulkApply` is a single write
and is correct.

What I *did* find is the likely cause. `picked` was resolved from the rows
**currently visible**, so any selected row that left the view — a status edit
moving it to Completed, a group collapsing, a sync reordering — was silently
dropped from the selection, and the action then hit fewer rows than the bar
claimed. Fixed: a row you explicitly tick stays ticked, the bar says
`4 selected · 2 hidden`, and the action applies to all of them. "Select all
shown" still only takes visible rows.

**This reverses a deliberate 2026-10-08 decision** ("a row that scrolls out of
the filter must not stay secretly selected") and its test was rewritten to
match. If Aboud can describe the exact steps, that is still worth chasing.

### 8. "Something weird with Anas and Yarob accounts" — NEEDS HIS DETAIL
The roster is well-formed: all five have `salt`, `passHash`, role and
timestamps. The two concrete defects that actually affected them are fixed —
Yarob's apostrophe broke search (#9), and Anas (7 rows) and Yarob (1 row) were
among the 26 Extra Work entries with a blank `username`, which is what stopped
people deleting their own imported rows. I could not find a third thing from the
data alone. **What is the symptom?**

### 9. Searching "yarob" found nothing — DONE, three causes
1. Search only ever matched the **project name**, never the coordinator.
2. The roster spelt him `Ya'rob`, so typing `yarob` missed on the apostrophe.
3. **The real one:** all 25 of his projects are `Done`, so they live in the
   collapsed "Completed projects" section while the main table said *"Nothing
   matches the filters"* — which reads as "nothing found".

Fixed: search covers name + coordinator, punctuation-folded; a search always
includes Completed; and the empty state now says *"No active projects match —
but 25 completed ones do, shown below."*

### 10. Best notification system — DECIDED AND BUILT
He said: *"maybe u will decide the best for us, do whatever you see good for us."*

**Built: an in-app bell.** Reasoning is in full at the top of
`src/lib/notifications.ts`. Short version — for 5 remote people on a static
site:

- **Browser push** needs a service worker, VAPID keys and a push service, and
  only reaches whoever left a tab open and clicked Allow. Most work, least
  reliable here.
- **Email** needs a provider and a sending domain, and the team already ignores
  email — this tool exists to avoid writing it.
- **Slack** is genuinely the best *second* step. But an incoming webhook is a
  secret only Aboud can create, and nothing can post while his laptop is shut,
  so it cannot be the baseline.
- **In-app bell** needs nothing new. The activity log and the updates are
  already synced to every client, so "what changed since I last looked" is a
  pure function of data already in hand.

It shows other people's updates and the notable field changes (status,
coordinator, rating, name) — never your own actions, and never a date nudge or
a drag-reorder, because a bell that rings for everything gets switched off.
Read state is per-browser and is marked when you **close** the panel, not when
you open it.

> **Next step if he wants it — Slack.** One incoming webhook URL, set as a
> Netlify env var, and a small function that posts "Omar moved Glenda Hodge to
> Pending Additional Information". **I need Aboud to create the webhook; I will
> not handle the secret.** ~1 hour once the URL exists.

### 11. (blank in the doc)

---

## Also done

**Yarob renamed everywhere.** *"you can change yarob's name to Yarob on
everything on the platform to avoid confusion."* 198 stored occurrences
rewritten (`scripts/migrate-2026-10-17.mjs`). His **login username
`yalnabelsi` is deliberately unchanged** — it is a different field, and changing
it would break his sign-in and orphan the Extra Work rows just repaired.

The stored rewrite alone would have reached nobody: `mergeById` only takes the
incoming row when `updatedAt` is **strictly newer**, and a rename does not move
`updatedAt`, so every client's cached board would have kept the old spelling
forever. Bumping `updatedAt` on 161 projects would have fixed the merge and
destroyed the "Last update" column and the staleness flags at the same time. So
the rename is also applied as a **normalisation at merge time**
(`src/lib/renames.ts`) — idempotent, and correct whatever any cache holds.

**AI search over updates.** `POST /api/<token>/updatesearch`, the "💬 Ask the
updates" button on the board. This is *why* he wanted the rating reason in
Updates: *"if I am searching for a project that is trenching I just ask the AI."*
A local keyword pass always runs and its results are **unioned** with the AI's,
never replaced — so it works with no key, offline, and an exact term match can
never be lost to the model. Verified falling back cleanly on localhost.

---

## ⚠️ Two things Aboud must decide

1. **Password hashes went into git.** The blob backup I took includes the
   `users` blob, which holds every user's `salt` and `passHash`, and I committed
   it in `7732a5b` before realising. The repo is private and these are salted
   hashes, not plaintext — but by the `_stacks` rule ("a secret that has ever
   been on the laptop is not a production secret"), **the five passwords should
   be rotated.** Future backups are now gitignored; the files stay on disk
   because restoring logins needs them. Purging git history is a rewrite I did
   not do unilaterally.

2. **`records` is the one blob not rewritten in prod** — the write was blocked
   by a permission classifier. It needs no manual fix: `mergeRecords`
   normalises the names client-side, and the next sync pushes the corrected
   values back. Cosmetic and self-healing.

---

## Verification

- `npx vitest run` → **691 passed / 45 files** (was 608 / 40 at session start)
- `npx tsc --noEmit`, `npx eslint src netlify`, `npm run build` → all clean
- Exercised in a real browser against a copy of live data: the Yarob search, the
  rename, the rating gate, the Updates thread, "Ask the updates" + its offline
  fallback, bulk status on 4 and on 26 rows.

**Prod blobs written and verified:** `board` (161 projects, 0 legacy names),
`extrawork` (47 rows, 0 blank usernames, 214 h), `users` (roster correct,
`passHash`/`salt` intact).

## Not done

- A Slack notifier (#10 second step) — blocked on his webhook URL.
- #8 — blocked on a symptom.
- The 12 minor bug-hunt findings from 2026-10-08 are still open.
