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
5. Write the four notes in your own words (Arabic/English ok), **one bullet per line** →
   **✨ Polish with AI** (Ctrl+Enter in any note field). The AI edits each line separately and
   keeps your wording — it will not merge your bullets into a paragraph. Red hints mean either a
   number/unit went missing or the AI changed the number of bullets — check before posting.
   "Revert to my draft" is per field.
6. **Copy for Slack** (Ctrl+Shift+C) → paste in the channel → re-type the @mentions → attach the
   elevation PDF + BOS → **✅ Mark as posted**.
7. **Export JSON** from History regularly — history lives in your browser only.

## Nothing gets lost (2026-09-28)

- Your work is written to **Drafts automatically** as soon as you fill in *any* field — you no
  longer need a customer name first. It is also flushed when you close or switch away from the tab.
- **💾 Save as Draft** (next to Mark as posted) saves on the spot if you want the confirmation.
- **New post** saves whatever is open before clearing the form — it cannot discard your work.
- In the **Drafts** tab each row has **✅ Mark as done**, which freezes the post and sends it to
  History without opening it first. It asks once to confirm, and the toast has an **Undo**.
  The button is disabled until the required fields (customer, date, jurisdiction, address) are in.

## AutoCAD title block (2026-09-28)

Under the preview in Compose, open **AutoCAD title block**. It shows the five values the
PROJECT INFORMATION table needs — Project Name, Property Address, Region, AHJ, SOW Coordinator
(the "Posting as" name).

- **Copy** next to a row copies that one value — paste into the cell, `Esc`, next cell.
- **Copy all 5** puts all five on the clipboard as a column: in AutoCAD double-click the table,
  click the first *value* cell and `Ctrl+V`. If your AutoCAD version refuses the multi-cell paste,
  use the five single Copy buttons — same result.
- The Region cell is the Salesforce region text only (`Corpus Christi`), without the
  `– Near HOU` tag that the Slack post carries.

## Screenshots

_TODO: add three screenshots (Compose after paste, polished notes, final preview) after the first
deploy._

## Shared team history (Phase 4 — built in)

- Drafts and history are stored in **Netlify Blobs** (store `sowpost`), shared by all three
  designers. No extra setup, no env vars — it activates automatically once the site is deployed
  (and `netlify dev` emulates it locally).
- The top-bar pill shows **Team synced** / **Local only**. When offline, everything keeps working
  from the browser cache and re-syncs on the next successful save.
- Conflicts merge by "newer edit wins" per record; deletions sync too (and Clear All in Settings
  clears for the WHOLE team).
- Export JSON is now just an occasional offline backup, not a routine chore.

## Known limitations

- Pasted `@Name` text does not become a live Slack mention — re-type `@` after pasting
  (direct Slack posting is Phase 3).
- Chips editor arrives in Phase 2.
