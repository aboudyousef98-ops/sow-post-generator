# PLAN — Bot API, Installation Review parity, Notifications, Extra-work privacy
> Author: Claude | Date: 2026-11-20 | Status: **PROPOSAL — awaiting Aboud's decisions (§8)**
> Companion briefing: `_PLAN_bot_api_and_team_scale.html` (open in a browser — the teaching version)
> Audit sources: full code audit 2026-11-20 (4 parallel passes) + web research (Grok agents, notification libs, dedupe, API-key patterns)

---

## 0. The one insight that shapes everything

All four asks collide on the same missing piece: **the server has no idea who is calling it.**

- Auth today = shared `API_PATH_TOKEN` path segment (shipped in the public JS bundle, documented as
  "not a secret" — `src/lib/api.ts:1-7`) + an Origin/Referer allowlist (`netlify/functions/lib/guard.ts:75-80`).
- Roles (`admin`/`member`) are checked **only in the browser**. The server never reads a role on any write.
- `GET /api/<token>/users` returns **every user's salt + passHash** so the browser can verify passwords
  locally (`users.mts:47-55`, `Login.tsx:48-49`). A hardcoded admin seed is committed in source (`users.mts:19-28`).
- Sessions live in localStorage, never expire, and `!session` is treated as **admin** (`App.tsx:815`).
- `updatedBy` / `createdBy` / `actor` are client-supplied free text — any caller can write as anyone.

So:
- The **bot** can't authenticate → item 1 of the bot spec (per-user API token) is not a feature, it's the
  **foundation**.
- **Extra-work privacy** can't be enforced server-side → it needs the *same* identity lane.
- **Notification targeting** ("tell Omar his row changed") needs to know who Omar is → same lane.

**Therefore: build one server-side identity mechanism (bearer tokens, §2A) and let all four features ride it.**

---

## 1. Audit summary — what exists today (verified, with file refs)

### 1A. Server / API surface
| Fact | Where |
|---|---|
| 12 functions, all guarded by Origin + path token; a request with neither header → flat 403 (blocks curl/bots) | `guard.ts:45,75-80` |
| Blob CRUD is GET-whole-collection / PUT-whole-collection with a server merge (LWW by `updatedAt`, tombstones, etag CAS ×5 → 503) | `board.mts:36-64`, `boardMerge.ts:75-114` |
| **Single-row upsert already works** as an emergent property: PUT one project + the required strict keys → merge upserts just that row | `boardMerge.ts:26-58` |
| Top-level board PutSchema is `.strict()` — an undeclared key 400s **every** save (caused the 37-hour outage) | `boardMerge.ts:35-39` |
| Audit log exists: `BoardActivity {id, projectId, actor, action, changes{field:{old,new}}, at}` — append-only, immutable server-side, capped 5000 | `types.ts:136-150`, `boardMerge.ts:88-95` |
| Store selection: `BLOBS_STORE_NAME` env per deploy context (`sowpost` prod / `sowpost-test` previews), reported by `/health` | `store.ts:21-27`, `health.mts:24` |
| No cron, no webhooks, no outbound HTTP except OpenAI | grep-verified |
| `AutomationRule.exceptActors` already exists **because of sow_bot** (bot-added rows kept self-assigning) | `types.ts:277-290` |
| Address is NOT on board rows (lives on Compose records); install date is derived from records | `types.ts:38`, `boardViews.ts:55` |
| Sections (Pre-Design / Review / Scope) are derived from flags on **status labels**, not a row field | `types.ts:39-61`, `board.ts:117-168` |
| No ETag to clients; requirements import + match report + board export are **browser-only** modules | `requirementsExport.ts`, `boardExport.ts:105-112` |

### 1B. Board UI (Installation Review gap)
- One monolith: `src/board/BoardTab.tsx` (3,278 lines). Two renderers: **`FullTable`** (drag/resize/filter/group/
  row-drag — used by Active + Pre-Design) and the **light table branch** of `SectionCard` (used by Installation
  Review, Out of SOW scope, Completed).
- Installation Review **reads** the shared column layout but cannot author it (`reviewTable` omits the
  resize/order handlers, `BoardTab.tsx:2435-2444`). Rows are hardcoded `recentFirst` (`boardViews.ts:155`).
- The item-12 notes literally say the light table was kept "deliberately… Say the word if you want them too."
  **Precedent commit `43ab22c` cost 49/3 + 34/5 prod lines; Review parity is smaller because `FullTable` already exists.**
- Zero `data-testid` anywhere in `src/board/`. Only stable hook today: `data-project-id` on `<tr>`.
- Mobile board has **no Installation Review section at all** (`MobileBoard.tsx:222`) — pre-existing, documented gap.

### 1C. Notifications
- **Nothing is stored.** The bell is a pure derived view over `board.activity` + `board.updates`, computed
  client-side (`src/lib/notifications.ts:76-120`, `NotificationBell.tsx` — "It owns no data").
- Broadcast-only, no recipient concept, no @mentions. `reviewer` / `phaseId` / `preDesignStatusId` /
  `designedDate` changes **never notify** (`NOTABLE_FIELDS`, `notifications.ts:60`). Slack-captured requests
  write no activity → invisible to the bell (`BoardTab.tsx:1181-1189`).
- Confirmed bugs: **delete notifications are structurally unreachable** (project is tombstoned in the same
  write; name-map filter at `notifications.ts:84,105` always drops it); **click-through `kind` routing is
  dead** (`App.tsx:862` ignores it — a notification never opens the thread/log it points at); `99+` badge
  branch unreachable (limit 50); read-state = one localStorage timestamp, not per-user, survives logout,
  no cross-tab sync; **no bell on mobile at all**.
- Delivery: 15 s full-blob poll, visible-tab only — **847 KB/poll, 19,200 invocations/day, ~170 GB/month**
  (`_PLAN_supabase_migration.md:13-20`). ETag/304 fix written up but NOT implemented (was deferred only to
  avoid colliding with guard.ts work that is now committed).
- Zero desktop-notification / service-worker / push code (a recorded decision, `notifications.ts:12-14`).

### 1D. Extra work
- `GET /api/<token>/extrawork` returns **every entry for every person, unfiltered** (`extrawork.mts:26-31`);
  all "members see only their own" logic is client-side cosmetics.
- **Live bug found: on mobile, a member can tap any teammate in the Team list and read their full log,
  export their .xlsx, and open the overtime-pay calculator** — the `isAdmin` guard desktop has at
  `ExtraWorkTab.tsx:140` was never added to `MobileHours.tsx:449-452`. No test covers it.
- Desktop members still see: everyone's totals + bars (sidebar), the whole-team payroll summary table,
  whole-team export/print/copy — all derived from the full dataset that's always downloaded.
- PUT has **no ownership check** (`PutSchema` validates only `id`+`updatedAt`) — any client can write or
  tombstone anyone's entries.

### 1E. The bot (research)
- Grok Bot (xAI, beta since Aug 2026) runs on a persistent cloud VM with a real browser; sessions persist;
  scheduled "Automations" have **no browser and no public API** — which is exactly why the bot falls back to
  stale CSVs. It (probably) **cannot receive inbound webhooks** — it's a VM-driven browser, not a server.
- What browser agents need from the app: accessibility-tree-readable UI (roles + `aria-label`), `data-testid`
  on the ~20 elements it touches, DOM-persistent status messages (toasts vanish), stable layout.
- Best practice for the API side: show-once tokens stored as SHA-256 digests with a display prefix
  (`sow_live_…ab4c`), role re-checked live at request time, `Idempotency-Key` per batch, field-level
  append-only change log with `batch_id`, revert that skips fields changed since (conflict-safe).
- Fuzzy dedupe: **fuzzball.js** `token_set_ratio(normalize(a), normalize(b)) >= 85` handles
  "antony torres" vs "Anthony S Torres" (set semantics absorb the middle initial). One small pure-JS dep,
  Netlify-function-safe. Advisory, never a hard block (house rule: no Required).

---

## 2. The plan — five workstreams

### 2A. Foundation: server-side identity (bearer-token lane) — **prerequisite for everything**

**New auth lane in `guard.ts`, alongside (not replacing) the existing one:**
- `Authorization: Bearer sow_live_<32-byte base62>` accepted on the new `/api/bot/v1/*` routes.
  Valid bearer ⇒ Origin check waived (machine clients have no Origin); path token not required on that lane.
- Token storage: new blob key `tokens` (same store): `{ [sha256hex]: {username, prefix, createdAt, lastUsedAt, revokedAt?} }`.
  Token value shown **once** at creation, never retrievable; UI shows `sow_live_…ab4c`.
- Role is **re-checked live** against the `users` blob on every request — demote/archive the user and every
  token dies with them. Revoke button per token.
- Generation: Admin → Users → "Generate API token" (per user row) → `POST /api/<token>/tokens`.
  ⚠ Honest-team caveat: until humans get server-verified sessions, the generation endpoint can't *prove* the
  caller is an admin (same trust model as the rest of the app). Mitigation: generation is logged, tokens are
  listable/revocable on the Users screen, and the long-term fix is §2F.
- All writes through this lane are attributed server-side: `updatedBy: "SOW Bot - Aboud"` (from the token's
  user, not from the request body) — the first attribution in the app a client cannot fake.

**Env required:** none new (tokens live in the blob store; no secret in env).

### 2B. Bot API — the 8 items, mapped to this codebase

One new function `netlify/functions/bot.mts` with an internal router (one cold-start, one netlify.toml splat
redirect `/api/bot/*` → the function), plus `lib/botAuth.ts`, `lib/changelog.ts`, `lib/dedupe.ts`.
**All endpoints are thin, documented wrappers over the existing merge layer — no storage rewrite.**

| # | Spec item | Design decision for THIS codebase |
|---|---|---|
| 1 | Per-user API token | §2A. Bot keeps role `admin` as Aboud set it — but note the option to issue it a `member`-scoped token for writes; audit+revert (item 4) is the safety valve either way |
| 2 | `GET /api/bot/v1/board?section=&status=&coordinator=` | Server resolves label ids → names, derives `section` from label flags, computes `daysInStatus` from the newest `statusId` change in activity (fallback: `updatedAt` when evicted past the 5,000 cap — documented in the response as `daysInStatusSource`). ⚠ `address` and `installDate` are **not on board rows**: server joins the `records` blob by linked project to return them read-only (or `null`). ETag honoured (§2D) |
| 2 | `GET /api/bot/v1/projects/:id` | Row + resolved labels + its `updates` thread + its activity slice |
| 2 | `GET /api/bot/v1/requirements`, `/match-report` | Requirements: serialize the `ahjs` blob with kind/category/status. Match report: port the pure `requirementsExport.ts:149-215` computation server-side (it's already a pure function of records+boards) |
| 3 | `POST /api/bot/v1/projects` | Builds a `BoardProject` exactly like `newProject()` does, **including the server-authored activity entry** (today the client's job). `coordinator: null` honoured (and `exceptActors` already protects against the auto-assign automation). **Fuzzy duplicate check** (fuzzball `token_set_ratio ≥ 85` vs live names + requestedBy) → `409 {duplicates:[...]}` unless `force: true`. Accepts `sourceUrl`, `requestedBy` (item 5) |
| 3 | `PATCH /api/bot/v1/projects/:id` | Accepts status / pre-design status / coordinator **by name** (server resolves to label ids — the bot should never juggle uuids). Emergent single-row-merge under the hood; returns the changed row. `If-Match`/stale-`updatedAt` conflict → 409 |
| 3 | `POST /api/bot/v1/projects/:id/updates` | Appends a `ProjectUpdate` authored as the token user |
| 4 | Audit + undo | Extend `BoardActivity` with optional `batchId` + `source: 'api'` (element schemas are `.loose()` — passes today's strict top-level schema untouched). Every bot write + every bulk call returns a `batchId`; `Idempotency-Key` header dedupes webhook-style retries (new `idempotency` blob key, 24 h TTL). `POST /api/bot/v1/changes/:batchId/revert`: builds reverse patches from the logged `{old,new}`, **skips any field changed again since the batch** (reported as conflicts), logs the revert under a fresh batchId. `GET /api/bot/v1/changes?projectId=&batchId=&since=` reads the log — this also replaces the webhook for a client that can't receive one |
| 5 | New fields | `sourceUrl?`, `requestedBy?` on `BoardProject` (loose element schema = zero migration). Shown in the Updates side panel header as "Requested by X · Slack ↗". `daysInStatus` stays **computed**, never stored |
| 6 | Outgoing webhook | Buildable (Admin → Settings stores URL+secret; `board.mts` diffs pre/post-merge for creates + status changes; HMAC-signed POST, fire-and-forget). **But flagged: the bot likely cannot receive webhooks** (it's a browser on a VM, not a server). Recommendation: build `GET /changes?since=` first (free with item 4, cheap with ETag) and park the webhook until there's a confirmed receiver. **Phase 2, needs Aboud's call** |
| 7 | Stable UI hooks | `data-testid` additions at the three cheap insertion points the audit found: `BodyInner` cells (`data-column-id`), `SectionCard` wrapper (`data-section`), Updates panel root. `data-project-id` already exists on every row. Plus `aria-label` sweep on icon-only buttons (helps the bot AND accessibility). Zero behavior change |
| 8 | `/api/docs` | Static page (public/, no token values) listing every endpoint with a curl example using `$SOW_BOT_TOKEN` placeholders |

**Bot pain points → resolved by:** scheduled jobs with no browser → read API (no more stale CSV); no stable
row/field locator → item 7; no batch id → item 4; duplicates → item 3's fuzzy check; board re-render churn →
partially item 7 (stable selectors survive re-renders); full re-render reduction itself is out of scope here.

### 2C. Installation Review — full-table parity

**Small, per the audit: ~20 production lines in 2 files + ~100 test lines**, following the Pre-Design
precedent (`43ab22c`):
1. `reviewTable` gains the 4 options `predesignTable` has (`onColumnSizingChange`, `onColumnOrderChange`,
   `enableColumnResizing: true`, `columnResizeMode: 'onChange'`) — `BoardTab.tsx:2435-2444`.
2. `moveReviewRow = rowMover(reviewRef, (p) => p.statusId, 'status')` — one flat band (all review rows share
   the status), so any in-section drag is allowed.
3. Review `SectionCard` gets `full={{…}}` copied from the Pre-Design call — `BoardTab.tsx:2905`.
4. Drop `installReview.sort(recentFirst)` (`boardViews.ts:155`) so dragged order persists.

**⚠ The one team-visible change:** review rows stop auto-sorting newest-first and keep their manual order —
the same one-time reorder the team saw when Pre-Design converted. Will be in the deploy note.

**Separate decision (NOT in this package unless Aboud says so):** a real review sub-status column
(Working on it / Done / …) like Pre-Design's — that's the ~220-line medium job across 6 files.
**Recommendation: parity now, sub-status only if the team asks for it.**

Also logged: mobile board still has no Installation Review section at all — cheap to add while in here;
needs a yes/no.

### 2D. Notifications — fix, target, pop up (3 phases)

**Rejected first:** Novu self-hosted (needs MongoDB+Redis on a server we don't have), Novu cloud (3-member
cap), MagicBell/Knock ($249–250/mo cliff one tier up). For a ~6-person team on Netlify-only, roll-your-own
wins on every axis. `sonner`-style toasts are not a notification system.

**Phase N1 — fix the bell + desktop pop-ups (this package):**
- Fix the dead paths: delete notifications (keep tombstoned projects in the name map for activity text),
  kind routing (clicking a notification opens the Updates panel / Activity modal it points at —
  `setUpdatesFor`/`setActivityFor` already exist, just not exposed to App), badge >50 shown as "50+".
- Widen `NOTABLE_FIELDS`: `reviewer` (the audit's worst miss — "nothing tells Omar his row changed"),
  `preDesignStatusId`, `phaseId`. Write an activity entry when a Slack request is attached (today invisible).
- **Targeting without a schema change:** an "All | Mine" toggle in the panel — "Mine" = projects where I am
  coordinator or reviewer, or replies to my updates. Pure derived filter.
- Read-state hygiene: namespace the seen-key per username, clear on logout, `storage` listener for cross-tab.
- **Desktop pop-ups (tab open or minimized — no push infra):** "Enable desktop notifications" button in the
  bell panel (permission prompt on gesture — hard browser requirement), fire `new Notification` from the
  existing 15 s poll on new "Mine" items. `tag: 'sow-<projectId>'` + `renotify` dedupes per project; no
  `requireInteraction`. One help line: "If nothing pops, check Windows Focus Assist" (the #1 support issue).
- **Mobile bell:** mount the same bell in `MobileApp`'s topbar.
- **The ETag/304 fix ships in this same package** — it was deferred only for the guard.ts collision that no
  longer exists, it cuts ~170 GB/month (the paused-credits history makes this urgent), and it makes faster
  polls affordable, which is what makes notifications timely. Server: return blob etag as `ETag`, honour
  `If-None-Match` → 304. Client: in-memory etag cache in `api.ts`.

**Phase N2 — persisted per-user inbox (later package):** a `notifications` blob (per-user entries, read/
unread per item, synced across devices), written by board merges and bot API writes. Enables "delete
notification", per-item read state, and an inbox the bot can also write to ("assignment suggestions ready").

**Phase N3 — Web Push (later, only if closed-tab delivery proves necessary):** service worker + VAPID keys +
`web-push` in a scheduled/on-demand function — fully feasible on Netlify-only (stateless POST to the push
service, no always-on server), ~a day of work, iOS requires Add-to-Home-Screen. Decide after living with N1.

### 2E. Extra-work privacy (Khaled must not see others' extra work)

**Layer 1 — client (same honest-team model as the rest of the app), this package:**
1. New pure `visibleEntries(entries, myUsername, myPerson, isAdmin)` in `src/lib/extraWork.ts` (keeps a
   `person`-name fallback — imported 2026-09 history has `username: ''`).
2. Apply at the two prop seams (`App.tsx:1032-1042`, `MobileApp.tsx:100-109`) — one filter kills the member
   view of: sidebar roster, payroll summary, print block, team .xlsx, copy-summary, mobile drill-in.
3. **Fix the mobile bug** (`MobileHours.tsx:449-452` — unguarded drill-in) regardless of everything else.
4. Members' Extra Work screen becomes: their own log, their own totals, their own export. Admins unchanged.

**Layer 2 — server enforcement, same package (it rides the §2A identity lane):**
- `GET /extrawork` with a valid bearer or (for humans, until §2F) as today → but the **bot lane** filters
  server-side by token user role; the human lane stays honest-team until sessions are server-verified.
- `PUT` rejects entries whose `username` ≠ the authenticated caller (bot lane) — and the ownership check
  function is written once, shared, ready for the human lane.

**Honest ceiling, stated plainly:** until humans authenticate server-side (§2F), a technical user with
DevTools can still fetch the raw blob. Layer 1 stops *colleagues seeing colleagues' compensation data in the
UI*, which is the actual Khaled requirement. Full enforcement = §2F.

### 2F. The long-term identity fix (separate decision, not this package)

Two routes, both already partially studied:
- **Minimal in-house:** a `login.mts` function that verifies the password **server-side** and mints a signed
  session token (HttpOnly cookie or bearer); `GET /users` stops serving salts+hashes; guard resolves
  `{username, role}` on every request; client filters become server filters everywhere.
- **Supabase migration** (`_PLAN_supabase_migration.md` already drafted): Auth + RLS; forces a team password
  reset (current hashes are client-side sha256).

Either one also fixes: password hashes served to any allowed origin, hardcoded admin seed in source,
forgeable `updatedBy`, non-expiring sessions. **Recommendation: decide after the bot package ships —
the §2A token lane is forward-compatible with both.**

---

## 3. What does NOT change (constraints honoured)

- Human users' flows: zero behavior change except (a) review-section sort order (§2C, announced) and
  (b) members' Extra Work screen showing only their own log (the point of the ask).
- Current board rows: untouched. New fields are optional + loose-schema; no migration; `schemaVersion` stays 1.
- The strict top-level `PutSchema`: every new top-level key (none planned for `board`) must be declared —
  the 37-hour-outage lesson is a standing check in review.
- No production deploy. Draft only; Aboud reviews and triggers ("yalla deploy") per the package rule.
- No Required fields anywhere — duplicate warnings and clearance checks stay advisory (house rule, called twice).

---

## 4. Draft-deploy procedure (safety-critical)

1. Build + deploy a draft: `netlify deploy --build` — **with `--context deploy-preview`** so the
   per-context env resolves `BLOBS_STORE_NAME=sowpost-test`. (Plain `netlify deploy --build` resolves the
   *production* context on this laptop per CLAUDE.md §0 — which would point the draft at the **live store**.)
2. **Gate: `GET <draft-url>/api/<token>/health` must answer `"store": "sowpost-test"`. Any other answer = STOP.**
3. Seed `sowpost-test` with an anonymized copy of the board for realistic testing (never live PII beyond
   what's already in the test store).
4. All verification (endpoints, curl examples, UI) runs against the draft URL only. Compose testing uses a
   blank New Post (autosave rule).
5. Nothing in this plan pushes to `main` until the package deploy; sow is not git-connected, so even a push
   deploys nothing — but the package rule stands regardless.

## 5. Testing gate (unchanged house standard)

`vitest run --no-file-parallelism` (83 files / 1,538 tests today — every workstream adds pins),
`tsc --noEmit`, `eslint src netlify --max-warnings 0`, `npm run build`, `check:nosecrets`.
New-code priorities: token hash round-trip + revocation, dedupe thresholds (the antony/Anthony pair as a
fixture), revert-with-conflict, 304 path, member-visibility (desktop AND the mobile regression),
review-table parity (the Pre-Design test file is the template). Keep App-mounting tests lean (flake rule).

## 6. Effort + sequencing

| Workstream | Size | Depends on |
|---|---|---|
| A. Identity lane (tokens, guard, Users UI) | M (~2 sessions) | — |
| B. Bot API read + write + dedupe + changelog/revert + docs | L (~3–4 sessions) | A |
| C. Review table parity (+ mobile review section if yes) | S (~half session) | — |
| D. Notifications N1 + desktop pop-ups + ETag | M (~2 sessions) | — (targeting benefits from A later) |
| E. Extra-work privacy L1 + mobile bug + L2 server checks | S–M (~1 session) | L2 needs A |
| Item 6 webhook | M | A + a confirmed receiver — **parked** |

Suggested build order: **C + E-L1 (quick, independent) → A → B → D → E-L2** — all on one draft, one package.

## 7. Env Required (new)

None mandatory. Optional/when enabled: `WEBHOOK_SECRET` (item 6, parked), VAPID key pair (Phase N3 only).
Tokens, idempotency keys, and the changelog all live in the existing Blobs stores.

---

## 8. DECISIONS NEEDED FROM ABOUD (everything else proceeds without you)

1. **Review sub-status column** — parity only (recommended), or also the Pre-Design-style sub-status (+220 lines)?
2. **Mobile Installation Review section** — add while in there (cheap), or leave?
3. **Extra-work ceiling** — is client-side filtering acceptable short-term (recommended, honest-team), with
   server enforcement landing on the bot's identity lane? Or do you want §2F (real login) pulled forward?
4. **Webhook (item 6)** — can the bot actually receive an HTTP POST anywhere? If unknown → park it and the
   bot polls `GET /changes?since=` (recommended).
5. **Bot token scope** — keep `admin` (as you set the user), or issue the token as `member` so the API can't
   touch labels/permissions? (Revert exists either way.)
6. **ETag fix riding in this package** — recommended strongly (170 GB/month); confirm.
7. **Desktop notifications default** — per-user opt-in via the Enable button (recommended; browsers force a
   gesture anyway).

---

*When approved: work lands feature-by-feature in `_CHECKPOINT_pending_package.md` per the package rule;
the draft URL + endpoint list + token-generation steps are the §2B deliverables. Token values never in chat.*
