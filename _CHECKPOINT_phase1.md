# CHECKPOINT — SOW Post Generator, Phase 1 build

Date: 2026-09-26 · Built by Claude Code from `../spec/` (all 9 spec files + fixtures)

## What was built (all 10 Phase-1 steps)

1. ✅ Scaffold: Vite 6 + React 19 + TS strict, ESLint 9 flat config, Vitest, `netlify.toml`
   (Node 20, esbuild, tokenized `/api/:token/*` redirects, SPA fallback), Figtree font,
   brand theme tokens from spec/08, real DYN logo in `public/`.
2. ✅ Functions: `health` / `rewrite` / `extract` (`.mts`, Functions v2 API) with shared
   `lib/guard.ts` (Origin/Referer allowlist, path-token check, CORS = matched origin only,
   6 MB body cap, zod payload validation) + `lib/openai.ts` (plain fetch, strict JSON-schema
   structured outputs, 502 on non-conforming AI output, logs never contain notes/images).
3. ✅ SF text parser (spec/03 verbatim): label/value walk, empty-label handling, md-links,
   date→ISO + weekday from parts, region normalization, warnings, rawPairs debug, merge-on-
   second-paste, keyword→driver suggestions.
4. ✅ Classification (spec/04): official level names, L4→L1 decision sequence, driver checklist
   data, layout-seed sentence builder with descriptors.
5. ✅ Compose UI: 3 columns — Source (author, paste zone text+image, editable fields with
   source badges, warnings strip), Classification & Notes (grouped drivers with "suggested"
   styling, descriptors, level select + non-blocking hint, 4 note fields + chips), Output
   (live preview, Copy for Slack rich+plain, Copy plain, Mark as posted with 5s undo, New post).
6. ✅ Polish flow: `/api/rewrite`, per-field revert, raw drafts never overwritten, dropped-token
   guard with red hints, inline error + Retry, Ctrl+Enter / Ctrl+Shift+C shortcuts.
7. ✅ Drafts: 500 ms-debounced autosave from the moment a customer name exists; Open/Duplicate/
   Delete (delete has undo toast instead of a blocking confirm).
8. ✅ History: posted records table, read-only detail with re-copy, export/import JSON
   (merge by id, newer `updatedAt` wins, optional settings import).
9. ✅ Image path: client downscale to 2000 px JPEG q0.85, 6 MB reject, `/api/extract`, same
   region/weekday/warnings post-processing as text + confidence warning.
10. ✅ Settings: rosters, region leads, default phrases, reset to defaults, export/import/clear
    (two-click confirm). Chips editor deferred to Phase 2 as planned.

## Tested (51 tests green: `npm run test`)

- Parser: Norca Garcia fixture (all fields + visit warning + Thursday), Patrick Lingwall,
  coordination merge, shuffled-order independence, empty-`Installed` case, past-date warning.
- Classification: decision sequence, mpu+relocation→L3, layout seed order, keyword table.
- Template: canonical Norca post **verbatim** vs spec/06 §2, polished/revert logic,
  punctuation, OTHER region, tag dedupe, HTML escaping.
- Token guard: dropped `2" PVC` detection, spacing-insensitive matching.
- Storage: import merge rules, default rosters.
- Functions guard: foreign Origin → 403, Referer fallback, token path, lookalike-domain reject.
- Integration (jsdom, real `<App/>`): paste → fields/warning/Thursday/HOU/Diego Banegas →
  drivers → L3 + "MPU with relocation" seed → preview lines → autosave survives remount →
  mark as posted → History; offline flow with AI pill "AI offline" and Polish disabled.
- `npm run build` clean; `check:nosecrets` OK (no `sk-` in dist); ESLint clean.

## Pending (needs Aboud)

- **Deploy**: GitHub repo + Netlify site + env vars + OpenAI key with $10 cap — checklist in
  `USAGE.md` (~15 min). Not done: no Netlify/GitHub credentials in this session.
- **Manual acceptance after deploy**: screenshot extraction against
  `spec/fixtures/sf-screenshot-patrick-lingwall.png`, real Polish call (Sabrina Salinas note),
  curl 403 check, Copy-for-Slack paste into real Slack, one real project end-to-end.
- Three screenshots for `USAGE.md`.
- In-browser click-through was not run (browser automation permission declined this session);
  covered instead by the jsdom integration test.

## Decisions / SPEC-GAPs

- `descriptors` persisted on `PostRecord` (optional field, schemaVersion unchanged) so reopened
  drafts keep wall/story/battery choices — spec/02 omitted them (`// SPEC-GAP` in types.ts).
- Editing a raw note clears that field's stale polished version (preview follows typing).
- Level select follows the suggestion until the user manually overrides it (then it sticks).
- Per-field source badges: tracked in UI state; reopened drafts show the record-level source.
- Delete/clear use undo-toast / two-click confirm instead of blocking dialogs.
- STR system is Next.js; spec fixes Vite — mirrored its conventions (TS strict, zod, ESLint 9,
  Node 20, commented netlify.toml, env-in-UI-only) rather than its framework.

## v2 revision (2026-09-26, after Aboud's review)

- Removed the drivers checklist, descriptors and level-suggestion UI entirely — Aboud picks the
  level himself from a plain "Project Level" select (official names kept verbatim in the post).
- Compose changed from 3 side-by-side columns to a vertical one-page flow (max 860 px, centered):
  Source → Project details (2-col field grid) → Notes → Tags → Preview/Output.
- Scheduled Work Items / Coordinator notes now shown read-only in a collapsible
  "Coordination info" section instead of editable textareas.
- The classification library (`lib/classify.ts`: suggestLevel, layoutSeed, keyword table) and its
  tests are KEPT but unused by the UI — available if a compact "advanced" mode returns later.
- v1 snapshot: git tag `v1-phase1` + `../_versions/sow-post-generator-v1.zip`.

## Next

- Phase 2 (quality of life): merge-paste driver suggestions UI polish, history search/filters,
  reopen-as-draft, duplicate detection, chips editor, keyboard map, mini analytics.
