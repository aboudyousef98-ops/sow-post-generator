# USAGE — deploy & first run

## One-time deploy (~15 min, Aboud)

1. **OpenAI key with a spend cap** (the real safety net):
   - platform.openai.com → create a NEW API key named `sowpost` (do not reuse other keys).
   - Set a monthly budget hard limit of ~$10 for the project/key.
2. **Generate the path token** (any short random string):
   ```
   node -e "console.log(require('crypto').randomBytes(6).toString('hex'))"
   ```
3. **Create the Netlify site** (same account as the STR system):
   - Push this folder to a GitHub repo, then Netlify → Add new site → Import from Git.
   - Build command `npm run build`, publish `dist/` (already in `netlify.toml`).
4. **Environment variables** (Site settings → Environment variables):
   | Name | Value |
   |---|---|
   | `OPENAI_API_KEY` | the new key |
   | `OPENAI_MODEL_VISION` | `gpt-4o` (default if unset) |
   | `OPENAI_MODEL_TEXT` | `gpt-4o-mini` (default if unset) |
   | `ALLOWED_ORIGINS` | `https://<your-site>.netlify.app,http://localhost:8888` |
   | `API_PATH_TOKEN` | the token from step 2 |
   | `VITE_API_PATH_TOKEN` | the SAME token (build-time copy for the client) |
5. Redeploy after setting the vars. Open the site → the top-right pill must say **AI available**.
6. Verify protection: `curl -H "Origin: https://evil.example" https://<site>/api/<token>/health` → 403.

## Local development

```
cp .env.example .env    # fill in the same values
npm install
npm run dev             # netlify dev on http://localhost:8888
npm run test
```

## Daily workflow (designers)

1. **Compose** opens directly (no login).
2. In Salesforce: Ctrl+A, Ctrl+C on the record page → click the paste zone → Ctrl+V.
   (Or paste/drag a screenshot — it goes through AI extraction; verify name + date.)
   Paste the Proj. Coordination tab too — the second paste merges in.
3. Check the warnings strip; fix any field (everything is editable).
4. Tick the drivers → the suggested level and the Installation Layout seed update automatically.
   The Project Level select is yours — the hint never blocks.
5. Write the four notes in your own words (Arabic/English ok) → **✨ Polish with AI**
   (Ctrl+Enter in any note field). Red "AI output dropped:" hints mean a number/unit went
   missing — check before posting. "Revert to my draft" is per field.
6. **Copy for Slack** (Ctrl+Shift+C) → paste in the channel → re-type the @mentions → attach the
   elevation PDF + BOS → **✅ Mark as posted**.
7. **Export JSON** from History regularly — history lives in your browser only.

## Screenshots

_TODO: add three screenshots (Compose after paste, polished notes, final preview) after the first
deploy._

## Known limitations (Phase 1)

- Pasted `@Name` text does not become a live Slack mention — re-type `@` after pasting
  (direct Slack posting is Phase 3).
- History/drafts are per-browser; consolidate via export/import (shared history is Phase 4).
- Chips editor and history search/filters/reopen arrive in Phase 2.
