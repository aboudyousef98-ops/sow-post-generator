# Plan — SOW Post Generator onto self-hosted Supabase

> Researched 2026-11-05. **Status: PLAN. Nothing built, nothing migrated.**
> Decision owner: Aboud. Sequencing agreed: Phase 1 now, Phase 2 later.

---

## 0. Why this exists

The 15-second sync poll is re-downloading the entire board, for every user, all
day. Measured against the live 2026-11-03 backup:

| | |
|---|---|
| Payload per poll | **847 KB** (whole board + whole extrawork, every time) |
| Function invocations | **19,200/day** (5 users × 8 h × 4/min × 2 endpoints) |
| Bandwidth | **~170 GB/month** (22 working days) |

That is the October Netlify credit exhaustion, quantified. Almost every one of
those polls returns bytes the browser already has.

The trigger for this plan was "connect the SOW tool to the self-hosted Supabase
since it would be an almost-free DB". The research below says the *polling
pattern* is the expensive thing, not the database — so the plan splits into a
cheap fix that solves the actual pain, and a separate architectural move that
has to stand on its own merits.

---

# PHASE 1 — Stop the bleeding (ETag / 304)

**Independent of Supabase. Worth doing even if Phase 2 never happens.**

### The change

`netlify/functions/board.mts` and `extrawork.mts` return the whole blob on
every GET, unconditionally.

1. On GET, compute a weak `ETag` for the blob. Cheapest correct source: the
   maximum `updatedAt` across the collections plus the row count — it changes
   exactly when the data does, and avoids hashing 849 KB per request. A SHA of
   the serialised blob is the safer, slightly more expensive alternative.
2. Return it as `ETag:` alongside the body.
3. If the request carries `If-None-Match` matching the current tag, return
   **`304` with an empty body** and no JSON.
4. Client (`src/lib/api.ts` `fetchSharedBoard` / `fetchSharedExtraWork`): keep
   the last ETag per endpoint in memory, send `If-None-Match`, and on `304`
   return a sentinel meaning "unchanged" so `applyServerBoard` is skipped
   entirely — no merge, no re-render, no `setBoard`.

### Expected effect

~99% of 170 GB/month disappears, because the overwhelming majority of polls
are no-ops. The board only actually changes a few dozen times a day.

### The honest caveat

**A 304 still invokes the function.** If Netlify's credit model meters
invocations as well as bandwidth, this removes the 170 GB but not the 19,200
calls.

→ **Verify against the Netlify billing page which of the two is actually
consuming credits before calling this done.** If invocations matter:
  - back the poll off when the tab has been idle (e.g. 15 s → 60 s after two
    minutes without focus, back to 15 s on focus), and/or
  - collapse the two endpoint polls into one combined `GET /sync` that returns
    both ETags, halving invocations immediately.

### Cost / risk

~1 day. Two server files, one client file. No data migration, no new login,
offline behaviour untouched, trivially reversible. Tests: the existing
`boardMerge.test.ts` pattern covers the server contract; add cases for "same
ETag → 304, empty body" and "changed data → new ETag, full body".

---

# PHASE 2 — Supabase as the data layer

**Blocked. Do not start until the prerequisites in §2.4 are met.**

## 2.1 The finding that changes the case

The expectation going in was that migrating would let us delete the
merge-by-`updatedAt` layer — 612 lines across `lib/board.ts`,
`functions/lib/boardMerge.ts` and `lib/renames.ts`, plus 7 test files — as
obsolete complexity.

**That is wrong, and it is the most important conclusion here.**

Supabase has **no native offline sync engine**: no cached reads, no durable
write queue, no reconciler (supabase/discussions#40664). The pattern the
community converges on is three layers you build yourself:

1. a local store that is the source of truth for the UI,
2. a durable outbox every write lands in before it touches the screen,
3. a reconciler that drains the outbox on reconnect and resolves conflicts.

**This app already has all three.** localStorage cache + `putShared*` +
merge-by-`updatedAt` *is* an offline-first architecture. It was never labelled
as one, which is why it read as removable complexity.

A naive migration converts the app from **offline-first** to **online-first**:
try the network, fall back to cache only on failure. For a team working in
Palestine on variable connectivity, that is a regression, not an upgrade.

**Consequence:** the merge layer must survive the migration in some form.
The single largest "code we delete" benefit does not materialise.

PowerSync solves this properly (Postgres↔SQLite sync, non-invasive, listed in
Supabase's own integrations) but adds a paid third-party dependency. For five
users that is disproportionate.

## 2.2 What genuinely improves

| Win | Real? | Notes |
|---|---|---|
| Activity log's 5,000-entry cap disappears | **Yes** | At 2,589 now; `ACTIVITY_CAP` already silently truncated history once (see the comment at `lib/board.ts`) |
| Real auth — RLS instead of client-side sha256 | **Yes** | `lib/auth.ts` states plainly: *"this is identity, not hard security"*. Role is currently a claim the browser makes about itself |
| `pg_cron` unblocks time-based automations | **Yes** | The rule engine was deliberately limited to change-triggers *because* there is no server that can run a job |
| Realtime replaces polling | Partly | Genuine, but Phase 1 already removes the pain for ~1 day of work |
| Delete the merge layer | **No** | See §2.1 — it is the offline engine |
| Row-level writes instead of whole-blob races | Yes | Reduces a real class of bug, but no such bug is currently open |

## 2.3 Infrastructure reality

**Realtime is cheap at this scale.** Enabled by default in the official
compose; 150–300 MB RAM. `postgres_changes` uses WAL decoding, so cost scales
with *write volume and number of distinct subscriptions* — with five people
editing a board occasionally, negligible. Keep Logflare/analytics **off**; it
is the actual memory hog (~480 MB), not Realtime.

**But the VPS does not fit as planned.** `supabase-selfhost/SERVER-PLAN.md`
sizes a 4 GB OVH VPS-1 for **two** projects at ~0.9 GB each (darona +
ajjirni). SOW would be the **third**. That plan's own scaling note puts five
projects at the 8 GB tier.

→ **Adding SOW means resizing the VPS earlier than planned.** Not free. Budget
for the 8 GB tier (~$6–11/mo per that plan's research) rather than $4.54.

## 2.4 Prerequisites — all currently unmet

1. **The server does not exist.** `supabase-selfhost/RESUME.md`: the stack runs
   in Docker *on the laptop*, currently stopped. `SERVER-PLAN.md`: *"nothing
   purchased or deployed yet"*, blocked on (a) buying a domain, (b) go-ahead on
   the monthly spend.
2. **Darona must prove the box first.** This tool is five people's entire
   workday. If the VPS dies at 2 a.m., nobody at Mardi can work, and there is
   no SLA on a budget VPS. Darona going down costs recoverable bookings; this
   going down costs a working day. **Do not make the SOW tool the first thing
   onto new infrastructure.**
3. **Phase 1 should already be shipped**, so the migration is never under time
   pressure from a billing problem.

## 2.5 Auth migration — and the one piece of good luck

Current: salted **sha256**, hashed client-side, verified client-side, role
enforced only in the UI (`lib/auth.ts`).

Supabase Auth uses **bcrypt**. sha256 hashes cannot be converted. **Every user
must set a new password.** That reverses the explicit "no new login" decision
of 2026-10-02 and is a real people-cost for five people.

**The luck:** "rotate 5 passwords" is already an open queued item. If those
passwords are being reset anyway, folding the reset into an auth migration is
meaningfully less disruption than doing it twice. If Phase 2 is ever going to
happen, **do not rotate the passwords separately first** — that wastes the one
moment where this costs nothing extra.

Session handling gets better for free: Supabase issues refreshing JWTs, which
removes the entire class of bug fixed on 2026-11-05 (a login-time session copy
that nothing refreshed, which kept Yarob's pre-rename name alive for weeks).

## 2.6 Schema sketch

The blobs are already relational in shape. One table per collection:

```
projects        ← BoardState.projects      (id, name, coordinator, reviewer,
                                            status_id, phase_id, designed_date,
                                            rating, position, sf_notes jsonb,
                                            archived_at, deleted_at, …)
labels          ← BoardState.labels        (+ is_done, review, out_of_scope,
                                            requires_note, sort_order)
activity        ← BoardState.activity      (no cap — the point)
updates         ← BoardState.updates
automations     ← BoardState.automations
board_prefs     ← BoardState.prefs         (single row)
records         ← PostRecord[]
ahjs / ahj_posts← Ahj[] + nested posts     (nested array becomes a real table)
extrawork       ← ExtraWorkEntry[]
profiles        ← TeamUser[]               (auth.users holds credentials)
settings        ← the device-local Settings blob, finally shared (see §4)
```

`updated_at` stops being conflict-resolution machinery and becomes the sync
checkpoint the outbox reconciles against.

**RLS:** this is a 5-person internal tool where everyone legitimately sees
everything, so policies are simple — authenticated read/write on all tables,
with admin-only restrictions on `profiles`, `labels` and `automations` mirroring
the current UI gates. The value is that the gates become *real* rather than
cosmetic.

## 2.7 Migration mechanics

1. Export the five blobs (the existing `_versions/vNN-live-backup-*` procedure).
2. Load into Supabase via a one-off script; verify counts match exactly —
   387 projects, 2,589 activity, 44 updates, 5 users, etc.
3. Run **both** stacks in parallel, Blobs authoritative, Supabase shadow-written,
   for at least a week. Diff nightly.
4. Cut over behind a flag, one user (Aboud) first.
5. Keep the Blobs path intact and revertible for a full month.

## 2.8 Honest bottom line

Phase 2's case is **weaker than "almost free DB" suggests** — not because
Supabase is the wrong tool, but because:

- the three genuine wins (activity cap, real auth, `pg_cron`) are
  *improvements*, not *problems anyone is currently having*;
- the headline savings are largely consumed by keeping the offline layer that
  would otherwise have been deleted, plus an earlier VPS resize;
- Phase 1 removes the only urgent pain for ~1 day of work and no risk.

**Recommendation: ship Phase 1. Leave Phase 2 parked until the VPS exists,
Darona has lived on it through a bad night, and someone actually wants
time-based automations or a longer activity history.** At that point the
password rotation should be folded in rather than done separately.

---

# 3. Related, cheaper, and not blocked on any of this

**Settings is not shared.** `sowpost.settings` lives in localStorage and nothing
ever pushes it: `authors`, `fixedTags`, `regionLead`, `designers`, `clrAgents`,
`projectManagers`, `utilities`, `defaults`, `chips`. That is *team
configuration*, not viewer preference — so when Aboud adds a CLR agent or a
utility, nobody else ever receives it. This is the real answer to "why aren't we
all sharing the same things on that website?"

It is the same root cause as two bugs already fixed by moving one list at a time
off Settings (Extra Work roster, 2026-10-08; coordinator picker, 2026-10-18).
The rest never moved.

**Fix: a sixth blob with the same merge contract as the other five.** ~1 day,
near-zero risk, no Supabase required. This should probably happen before
either phase.

---

## Sources

- supabase/discussions#40664 — no native offline sync layer (cached reads,
  write queue, conflict resolution all absent)
- powersync.com/blog/bringing-offline-first-to-supabase — why a cache is
  online-first, not offline-first
- supabase.com/partners/integrations/powersync — official integration listing
- supascale.app — self-host RAM budgets; Realtime 150–300 MB
- dev.to/voieducode — container-by-container teardown; Logflare is the hog
- `supabase-selfhost/SERVER-PLAN.md`, `RESUME.md` — the existing, already
  well-researched server plan this would have to fit into
- Measurements in §0 taken from `_versions/v33-live-backup-2026-11-03/`
