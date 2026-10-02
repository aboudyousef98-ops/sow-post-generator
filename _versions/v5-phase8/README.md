# SOW Post Generator — Dynamic EcoHome

Internal tool for the design team (Aboud Yousef, Omar Rajab, Mohammad Refai): paste a Salesforce
fulfillment record (text or screenshot) + four short notes → the standardized Slack "project
submission" post, with AI polishing, L1–L4 classification assistance, local drafts and history.

Spec: `../spec/` (read `00-README.md` first). Phase 1 complete — see `_CHECKPOINT_phase1.md`.

## Stack

- React 19 + Vite 6 SPA (TypeScript, no UI framework — theme tokens in `src/theme.css`)
- Netlify Functions (`netlify/functions/*.mts`): `/api/<token>/health|rewrite|extract`
- OpenAI only server-side; browser never sees the key
- Persistence: browser `localStorage` (+ JSON export/import). No database, no login.

## Commands

| Command | What |
|---|---|
| `npm run dev` | `netlify dev` — SPA + functions on :8888 (needs `.env`, see `.env.example`) |
| `npm run dev:vite` | Vite only (no functions — offline/manual flow) |
| `npm run test` | Vitest: 219 unit + integration tests |
| `npm run build` | typecheck + production bundle to `dist/` |
| `npm run lint` | ESLint over `src` + `netlify` |
| `npm run check:nosecrets` | scan `dist/` for key-like `sk-` strings (run after build) |

## Layout

```
src/
  lib/          parser (SF paste), classify (L1–L4 names), installNotes (guided
                sections -> post bullets), noteText (shared text helpers),
                template (post + clipboard), storage (localStorage + export/import
                + Phase-7 migration), tokenGuard (AI drop/drift check),
                api / image / dates / record helpers, __fixtures__/ (test data)
  components/   ComposeTab, InstallNotesCard, NoteBox, OutputColumn, AhjTab,
                DraftsTab, HistoryTab, SettingsTab, TitleBlockCard, Toast
netlify/functions/  health.mts, rewrite.mts, extract.mts, lib/ (guard + openai, unit-tested)
scripts/        check-no-secrets.mjs
```

Deployment + first-use steps: see `USAGE.md`.
