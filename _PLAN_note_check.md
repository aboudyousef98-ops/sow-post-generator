# Design — pre-post note check ("did I miss a requirement?")

> Brainstormed with Aboud 2026-10-08. His idea: before a post goes to Slack, have the AI read the
> post, compare it against our notes, and surface anything relevant — his example: the post says
> "Trench", so show every trench note we hold and make the coordinator confirm it.

## The problem it solves

The AHJ / Utility / Funding / SOW notes are **passive**. They only help someone who remembers to go
and read them, which is exactly what fails under time pressure. This makes them active at the one
moment where catching a miss is still free: before the post leaves the app.

## Decisions (Aboud's answers)

| Decision | Choice | Why |
|---|---|---|
| Which notes are eligible | **Only notes that already apply** — matched AHJ + matched Utility + Funding + all SOW general | Keeps the list short and every item genuinely binding. He rejected searching every jurisdiction: a Dallas-only rule shown on a Harris job is worse than nothing |
| When it runs | **Blocks Copy for Slack** | The moment the post actually leaves the app — the last point where a miss costs nothing |
| If the AI is down | **Fall back to keyword matching**, labelled | The team is never blocked by an OpenAI outage, and never silently loses the net either |
| Interaction | **Warning list + ONE button** — no per-item ticking | Aboud, after seeing the ticking version: "better this way" |

## The overriding design constraint: PRECISION

If a typical post surfaces more than ~5 notes, this feature is failing. A long list trains people to
click through without reading, which manufactures false confidence — strictly worse than no check.

With per-item ticking dropped, the short list is the *only* thing protecting attention. Tune the
prompt stricter rather than let the list grow.

## Matching — two passes, union

1. **Keyword (deterministic, local, free).** Meaningful terms per note (stopwords removed) looked up
   in the post text. Exact hits can never be missed; this pass is also the AI-down fallback.
2. **AI semantic (`gpt-4o-mini`).** Post + the applicable notes only → which notes to confirm, each
   with a one-line reason. Catches "excavation" matching a note that says "trench".

Union, deduped by note id. **Every item shows why it surfaced** (`matched "trench"`, or the AI's
reason) so the coordinator can judge the suggestion instead of trusting it.

## The popup

```
Before posting — 3 notes may apply           Harris County · CenterPoint

 ⚠  Trench depth minimum 24"                      AHJ: Harris County
    matched "trench"

 ⚠  Meter clearance 3 ft from the gas riser   Utility: CenterPoint
    AI: post mentions a meter relocation

 ⚠  Upload signed NTP before scheduling          Funding: Solrite
    AI: install date is set, so NTP must exist

                                   [Cancel]   [Confirm and copy to Slack]
```

Nothing matched → no popup at all; the copy proceeds as it does today. The check must be invisible
when it has nothing to say.

## What gets saved (on the PostRecord)

```ts
noteCheck?: {
  at: string;            // ISO
  by: string;            // session display name
  postHash: string;      // the post text this confirmation covers
  source: 'ai' | 'keyword';   // keyword = the AI was unavailable
  items: { noteId: string; board: string; text: string; why: string }[];
}
```

`text` is a **snapshot**, not a reference: if the AHJ note is edited next month, the record still
shows what the coordinator actually saw. That is what makes it an audit trail rather than a
footnote. It is also the data that tells us whether the matching is too noisy.

## Staleness

`postHash` covers the post text. **If the post changes after a confirmation, the confirmation is
void** and the next copy re-runs the check — otherwise the gate is trivially defeated by confirming
an empty draft and then writing the real post.

## Deliberately NOT included

No auto-fixing, no AI rewriting the post, no severity scores, no "you should add this sentence".
The AI's only job is to **surface and explain**; every judgement stays with the coordinator. Same
reasoning as the five Installation Notes dropdowns: the AI must not be able to change an engineering
decision.

## Risks

- **Noise kills it.** Watch the saved `items` counts on real projects; if lists run long, tighten
  the prompt before adding features.
- **One button means someone can confirm without reading.** Accepted trade-off (Aboud's call), but
  it is the reason precision matters more here than in the ticking design.
- **Cost:** one extra `gpt-4o-mini` call per post — negligible, same model as Polish.
- **Cannot be tested locally** — `netlify dev` never receives `OPENAI_API_KEY` (verified: local
  health `hasKey:false`, prod `hasKey:true`). Verify on a **draft deploy**, never straight to prod.

## Build order

1. `src/lib/noteMatch.ts` — pure keyword matching + eligible-note selection. Unit-tested.
2. `netlify/functions/notecheck.mts` — the AI pass, structured output, same guard as the others.
3. The popup + wiring into Copy for Slack, with the hash/staleness rule.
4. Draft deploy → Aboud runs his Trench example → prod only on his word.

---

## Built 2026-10-08 — and what local testing changed

Verified locally end to end on the keyword path (the AI pass cannot run on localhost —
`netlify dev` never receives `OPENAI_API_KEY`):

- Project in Harris County on CenterPoint, post says "We will trench along the north fence."
- Popup appeared, labelled "AI unavailable — keyword matches only"
- Confirm and copy wrote the clipboard AND stamped `record.noteCheck`
- A second Copy click did **not** re-prompt (hash matched) ✓

**The first run surfaced 3 notes for that post, and 2 were noise** — exactly the precision
failure this plan warned would kill the feature:

| Fired | Why it was wrong |
|---|---|
| "matched *clearance*" | The template prints "All required clearance requirements have been met." on **every** post |
| "matched *wall*" | A single 4-letter word is not evidence of anything |

Two fixes, both now pinned by tests:
1. **Strip the template's own wording before matching** — the constant sentences, plus every
   `*Label:*` bullet heading via one regex (stripping the clearance sentence alone was not
   enough; the word survived in the `*Clearance:*` label).
2. **Raise the bar**: a note needs ONE distinctive (≥6 char) shared term, or TWO shorter ones.

Same post now surfaces **1 note — the trench one, and nothing else.**

This is the tuning dial. If real projects start producing long lists, `BOILERPLATE` and
`DISTINCTIVE_LEN` in `src/lib/noteMatch.ts` are where to tighten it, and the saved
`record.noteCheck.items` are the evidence of what is actually firing.
