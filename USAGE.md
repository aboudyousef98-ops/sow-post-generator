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

## Signing in (Phase 9, 2026-10-02)

The app now opens with a **login screen** — username + password, once per
browser (it stays signed in until you press **Log out** in the top bar).

- Your name on every post comes from your login. The "Posting as" picker is
  gone — nobody can post under someone else's name by accident.
- The team roster is managed in **Admin → Users** (admin only): add a member
  with a username, a display name (what appears on posts) and a password.
  Reset passwords and remove people from the same screen.
- **Change my password** is at the bottom of Admin → Users.
- The first account on a fresh deployment is the admin account; change its
  password right after the first login (Admin → Users → Change my password).
- Forgot a password? An admin resets it from Admin → Users. Nothing is ever
  emailed — there is no email anywhere in this.
- Honest scope: this is a *team-discipline* login, checked in the browser. It
  stops name mix-ups; it is not bank-grade security.

## Tabs (Phase 9)

Three main tabs in the navy bar, with sub-tabs underneath:

| Main tab | Sub-tabs | Who sees it |
|---|---|---|
| **Compose** | New Post · Drafts · History | everyone |
| **AHJ Requirements** | — | everyone |
| **Admin** | Settings · Users | admin only |

Everything about writing posts lives under Compose; future sections of the
SOW operational tool get their own main tab.

## Daily workflow (designers)

1. Sign in once, then **Compose** opens directly.
2. In Salesforce: Ctrl+A, Ctrl+C on the record page → click the paste zone → Ctrl+V.
   (Or paste/drag a screenshot — it goes through AI extraction; verify name + date.)
   Paste the Proj. Coordination tab too — the second paste merges in.
3. Check the warnings strip; fix any field (everything is editable).
4. Pick the **Project Level** yourself — the scope and planning window under the
   select are there to remind you what each level covers.
5. Fill in **Installation Notes**: walls + their orientation, stories, and the
   service equipment are dropdowns; the four conduit runs, special cases and
   "anything else" are boxes. Everything you put here is exactly what the post
   prints — empty fields simply disappear. Then write the three **Feedback**
   boxes in your own words (Arabic/English ok), **one bullet per line** →
   **✨ Polish with AI** (Ctrl+Enter in any box). The AI only ever sees the
   free-text boxes — it cannot change a wall count, an orientation or an MPU.
   Red hints mean a number/unit went missing or the bullet count changed.
   "Revert to my draft" is per box.
6. **Copy for Slack** (Ctrl+Shift+C) → paste in the channel → re-type the @mentions → attach the
   elevation PDF + BOS → **✅ Mark as posted**.
7. **Export JSON** from History regularly — history lives in your browser only.

## Nothing gets lost (2026-09-28)

- Your work is written to **Drafts automatically** as soon as you fill in *any* field — you no
  longer need a customer name first. It is also flushed when you close or switch away from the tab.
- **💾 Save** (top right, next to + New post) saves on the spot if you want the confirmation.
- **New post** saves whatever is open before clearing the form — it cannot discard your work.
- In the **Drafts** tab each row has **Mark as posted**, which freezes the post and sends it to
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

## Projects with no install date (2026-09-30)

A project with no scheduled install date is fine now. There is no warning, and
Copy for Slack and Mark as posted both work without one — the
"Installation Date & Day" line just does not appear in the post. Add the date
later and the line comes back.

## Installation Notes (2026-09-30)

The old free-text "Installation Layout" box is now a guided section. Anything
you had written in it on an existing draft has moved to **Anything else** at the
bottom of Installation Notes — nothing was lost.

The post now carries two bullets instead of one: **Installation Notes** (walls,
stories, service equipment, battery and main-disconnect locations, special
cases) and **Conduit Raceway** (load / grid-service / solar / battery runs).
Either disappears entirely when you leave it empty.

**Project Classification** now prints the planning window under the level, so
the crew reading the post can see how many crew-days to reserve:

```
• *Project Classification:*
    ◦ Level 3 – Service Equipment Modification.
    ◦ Planning window: 1.5 to 2 crew-days.
```

## The second AI button — 🦜 هري ابو روي (2026-09-30)

Beside **✨ Polish with AI** there is a second button. Both send only the
free-text boxes, and both keep one bullet per line and every number, unit and
brand exactly as you wrote it.

- **✨ Polish with AI** — a light copy-edit. A line that is already correct comes
  back unchanged. Use it when your English is fine and you want it tidy.
- **🦜 هري ابو روي** — a full rewrite. Use it when the note is rough, half-formed,
  or mixed Arabic and English. It will change every word of a line to make it
  read professionally; it still cannot change what the line says.

A box polished by the rewrite button is marked 🦜 in its preview instead of ✨,
so you can see which text the machine reworded. "Revert to my draft" works the
same for both.

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

## The 2026-09-30 redesign — what moved

Same app, new layout. Nothing about the post itself changed.

- **The tabs are in the navy bar now**, with the draft count beside "Drafts".
  "Posting as" is the pill at the top right, next to the Synced / AI dots.
- **Compose is two columns.** The form is on the left; on the right, a
  **readiness card** and a **live Slack preview** that follow you down the page.
  The readiness card replaces the old red "Required before copying" line — it
  ticks off what is done and tells you what is not, with the fix beside it.
- **Copy for Slack** and **Mark as posted** live in that readiness card.
  Copy plain text and the AutoCAD title block are behind its **···** button.
- **💾 Save** and **+ New post** are at the top right of Compose.
- **The Project Level is four cards** instead of a dropdown. Same four levels.
- **Drafts has a Readiness column**, so you can see at a glance which projects
  are ready to post without opening them.
- **The AHJ tab lists every board down the left**, instead of hiding them in a
  dropdown. One search box there covers both AHJ names and every post.
