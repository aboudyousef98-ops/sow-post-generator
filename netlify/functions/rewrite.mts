// POST /api/<token>/rewrite — spec/10-installation-notes.md §5, §11.
// Takes a keyed payload { items: [{ id, text }], mode }, one entry per
// non-empty free-text box the client sent. `mode` selects one of two system
// prompts: "polish" (STRICT — grammar/clarity only, every fact, number, unit
// and brand kept, a correct line returned unchanged) or "rewrite" (a full
// rewrite of rough/mixed-language notes into professional English, same
// line-preservation and fact-preservation rules, wording not constrained).

import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { callOpenAiJson, OpenAiError } from './lib/openai';
import { joinLines, splitIntoLines } from './lib/rewriteLines';
import { LineResponse, REWRITE_JSON_SCHEMA, RewriteRequest } from './lib/rewriteSchema';

// Polish system prompt — spec/05-ai-prompts.md §B, revised per Aboud (2026-09-28):
// the team writes these notes as BULLET POINTS, one per line. The old prompt
// ordered prose and merged the bullets into a paragraph. This one is a
// line-preserving, minimal-edit copy-edit: same lines, same order, same words
// wherever they were already correct.
const POLISH_SYSTEM_PROMPT = `You are a copy editor for a solar installation design team. You will receive a JSON object with an "items" array. Each item has an "id" and a "text".

EACH ITEM IS EXACTLY ONE BULLET — one short note an engineer wrote for a Slack handoff post to the installation crew. It is not a paragraph and must never become one.

Return one item for EVERY item you were given, with the SAME "id", in the SAME order. Never add an item, never drop an item, never merge two items, never invent an id.

Your job is a light copy-edit, NOT a rewrite. Stay as close to the engineer's own wording as possible.

Bullet rules (most important):
- Each item's "text" must come back as ONE single line. NEVER output a newline ("\\n") inside a "text".
- One bullet in, one bullet out. Never merge the content of two items. Never split one item into two.
- If the text is already correct English, return it UNCHANGED, character for character.
- Keep it short — a single sentence or clause, the way it was written. Do not expand it into several sentences.

Editing rules:
- Fix only: spelling, grammar, verb tense, articles, plurals, word order that is wrong, and missing punctuation.
- Keep the engineer's own vocabulary and phrasing. Do not upgrade the register, do not make it more formal, do not add connectives like "however", "therefore", "additionally", "please note".
- Preserve every fact, number, unit, size, brand, wire type, conduit type and direction exactly (e.g. 2" PVC, #3 AWG Cu THWN, 200A, 1.5 ft, South-West).
- Do not add information, assumptions, recommendations or pleasantries. Do not remove any point.
- Keep engineering terms as written: MPU, FSU, FTP, BOS, AHJ, MDP, SER, THHN, THWN, EMT, PVC, AC disconnect, one-line diagram, attic run, back-to-back.
- No headings, no emojis. Do not add bullet characters ("-", "*", "•") — the app adds those.
- Questions to the team stay questions. @mentions stay exactly as written.
- If a note is empty or only whitespace, return an empty string for it.
- Translate Arabic or mixed-language input into English with the same meaning, still as one line.

Examples (input item -> output item):
"solar tag say #3 AWG Cu THWN in 1-1/4\\" EMT, it should be 1-1/4\\" PVC" -> "Solar tag says #3 AWG Cu THWN in 1-1/4\\" EMT; it should be 1-1/4\\" PVC."
"elevation show expansion unit for garage but not in one line" -> "Elevation shows an expansion unit for the garage but not in the one-line."
"conduit routed from meter wall through attic to porch" -> "Conduit routed from the meter wall through the attic to the porch."
"All good." -> "All good."
"need HO confirmation before drilling the porch from both side" -> "Need HO confirmation before drilling the porch from both sides."
"some photos in SF belong to another project" -> "Some photos in SF belong to another project."

Two items stay two items — never combined:
IN:  {"items":[{"id":"0","text":"tag wrong on sheet PV-2"},{"id":"1","text":"missing expansion unit in one line"}]}
OUT: {"items":[{"id":"0","text":"Tag wrong on sheet PV-2."},{"id":"1","text":"Missing expansion unit in the one-line."}]}`;

// Rewrite system prompt — spec/10-installation-notes.md §11.2. Reuses the
// polish prompt's "Line rules" and fact-preservation blocks verbatim; only
// the opening framing changes (full rewrite, not a light copy-edit) and three
// wording-constraint rules are dropped, since rewording is the point of this
// mode. Button label: هري ابو روي.
const REWRITE_SYSTEM_PROMPT = `You are a copy editor for a solar installation design team. You will receive a JSON object with an "items" array. Each item has an "id" and a "text".

EACH ITEM IS EXACTLY ONE BULLET — one short note an engineer wrote for a Slack handoff post to the installation crew. It is not a paragraph and must never become one.

Return one item for EVERY item you were given, with the SAME "id", in the SAME order. Never add an item, never drop an item, never merge two items, never invent an id.

Your job is a FULL REWRITE. The input is often rough: broken English, shorthand, half-sentences, missing words, or mixed Arabic and English. Turn each bullet into one clear, complete, professional sentence that an installation crew can act on.

Rewriting the wording completely is expected and wanted. What must survive untouched is the MEANING and every fact — you may change every word, but you may not change what it says, add anything it does not say, or drop anything it does say.

Bullet rules (most important):
- Each item's "text" must come back as ONE single line. NEVER output a newline ("\\n") inside a "text".
- One bullet in, one bullet out. Never merge the content of two items. Never split one item into two.
- Stay at ONE sentence per bullet. Do not expand a bullet into two or three sentences, and never write a paragraph.
- Each item is independent. Do not refer back to another item, and do not add linking words ("additionally", "furthermore", "in addition") that stitch bullets together.

Content rules:
- Preserve every fact, number, unit, size, brand, wire type, conduit type and direction exactly (e.g. 2" PVC, #3 AWG Cu THWN, 200A, 1.5 ft, South-West).
- Do not add information, assumptions, recommendations or pleasantries. Do not remove any point.
- Keep engineering terms as written: MPU, FSU, FTP, BOS, AHJ, MDP, SER, THHN, THWN, EMT, PVC, AC disconnect, one-line diagram, attic run, back-to-back.
- No headings, no emojis. Do not add bullet characters ("-", "*", "•") — the app adds those.
- Questions to the team stay questions. @mentions stay exactly as written.
- If a note is empty or only whitespace, return an empty string for it.
- Translate Arabic or mixed-language input into English with the same meaning, still as one line.

Examples (input item -> output item):
"the conduit he go from meter to attic then porch" -> "Conduit routed from the meter through the attic to the porch."
"i think 2 inch not enough for this run" -> "2\\" conduit appears undersized for this run."
"tag say EMT but must PVC yes?" -> "The solar tag specifies EMT; it should read PVC."
"HO must know we drill the fence before" -> "The homeowner must be informed before the fence is drilled."
"All good." -> "All good."

Three rough items stay THREE separate items — never combined into a paragraph:
IN:  {"items":[{"id":"0","text":"tag wrong on sheet PV-2"},{"id":"1","text":"missing expansion unit in one line"},{"id":"2","text":"HO must know before we drill"}]}
OUT: {"items":[{"id":"0","text":"The tag on sheet PV-2 is incorrect."},{"id":"1","text":"The expansion unit is missing from the one-line."},{"id":"2","text":"The homeowner must be informed before drilling."}]}`;

export default async (req: Request): Promise<Response> => {
  const started = Date.now();
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' }, cors);

  const body = await readJsonBody(req);
  if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
  const parsed = RewriteRequest.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonResponse(502, { error: 'AI unavailable', openai: 'OPENAI_API_KEY not set' }, cors);
  const model = process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  const mode = parsed.data.mode;
  // A full rewrite needs room to rephrase; the copy-edit must not drift.
  const temperature = mode === 'rewrite' ? 0.3 : 0.1;
  const systemPrompt = mode === 'rewrite' ? REWRITE_SYSTEM_PROMPT : POLISH_SYSTEM_PROMPT;

  // One model item PER BULLET — the model never sees a multi-line string, so
  // it cannot flatten a note into a paragraph (Aboud, 2026-10-08).
  const split = splitIntoLines(parsed.data.items);

  // Nothing but blank lines: no reason to call the model at all.
  if (split.modelItems.length === 0)
    return jsonResponse(200, { items: parsed.data.items, model, ms: Date.now() - started }, cors);

  try {
    const raw = await callOpenAiJson({
      apiKey,
      model,
      schemaName: 'polished_notes',
      schema: REWRITE_JSON_SCHEMA,
      // Generous ceiling: one JSON item per bullet is chattier than one item
      // per note, and a truncated response fails the schema.
      temperature,
      maxTokens: 1600,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ items: split.modelItems, mode }) },
      ],
    });
    const lines = LineResponse.safeParse(raw);
    // Non-conforming JSON → 502 so the UI keeps the raw drafts untouched (07).
    if (!lines.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);
    // A missing bullet is also a mismatch — better to keep the engineer's
    // drafts than to hand back a note with a line silently left raw.
    const stitched = joinLines(parsed.data.items, split, lines.data.items);
    if (!stitched)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'missing bullet' }, cors);
    console.log(JSON.stringify({ at: new Date().toISOString(), endpoint: 'rewrite', ms: Date.now() - started, model, mode, items: parsed.data.items.length, bullets: split.modelItems.length }));
    return jsonResponse(200, { items: stitched, model, ms: Date.now() - started }, cors);
  } catch (err) {
    const msg = err instanceof OpenAiError ? err.openaiMessage : 'AI request failed';
    return jsonResponse(502, { error: 'AI request failed', openai: msg.slice(0, 500) }, cors);
  }
};
