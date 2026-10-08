// Bullet-level splitting for /api/<token>/rewrite.
//
// WHY THIS EXISTS (Aboud, 2026-10-08): the هري ابو روي rewrite was returning
// one paragraph instead of the bullets it was given. Both system prompts
// already said "NEVER merge two lines" — a prompt rule the model simply did
// not always honour, especially in rewrite mode where rephrasing is the point.
//
// So the guarantee moved out of the prompt and into the code: each bullet is
// sent to the model as its OWN item, and the model never sees a multi-line
// string it could flatten. The lines are stitched back together here. The
// public request/response contract (POLISH_KEYS ids) is unchanged.

export interface KeyedItem {
  id: string;
  text: string;
}

/** One line of one item, as sent to the model. */
export interface LineRef {
  /** Index into the caller's items array. */
  itemIndex: number;
  /** Index into that item's lines. */
  lineIndex: number;
}

export interface SplitResult {
  /** What goes to the model — one entry per non-blank line, ids are "0","1",… */
  modelItems: KeyedItem[];
  /** modelItems[n] came from refs[n]. */
  refs: LineRef[];
  /** Every item's original lines, used as the base when stitching back. */
  originalLines: string[][];
}

/**
 * Explode items into one model item per non-blank line.
 *
 * Blank lines are never sent (nothing to edit, and they cost tokens) — they
 * are restored verbatim by joinLines, so spacing the engineer typed survives.
 */
export function splitIntoLines(items: KeyedItem[]): SplitResult {
  const modelItems: KeyedItem[] = [];
  const refs: LineRef[] = [];
  const originalLines: string[][] = [];

  items.forEach((item, itemIndex) => {
    const lines = item.text.split('\n');
    originalLines.push(lines);
    lines.forEach((line, lineIndex) => {
      if (line.trim() === '') return; // blank — keep as-is, don't spend a call on it
      refs.push({ itemIndex, lineIndex });
      modelItems.push({ id: String(refs.length - 1), text: line });
    });
  });

  return { modelItems, refs, originalLines };
}

/**
 * A single bullet must come back as a single line. If the model still slipped
 * a newline in, fold it to a space rather than silently gaining a bullet.
 */
export function collapseToOneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/**
 * Stitch the model's per-line answers back into one text per original item.
 *
 * Returns null when the model did not answer every line it was asked about —
 * the caller turns that into a 502 so the UI keeps the engineer's raw drafts
 * untouched, which is the established contract (spec/07).
 */
export function joinLines(
  items: KeyedItem[],
  split: SplitResult,
  answers: KeyedItem[],
): KeyedItem[] | null {
  const byId = new Map(answers.map((a) => [a.id, a.text]));
  const out = split.originalLines.map((lines) => [...lines]);

  for (let n = 0; n < split.refs.length; n++) {
    const answer = byId.get(String(n));
    if (answer === undefined) return null; // a line went missing — fail loudly
    const { itemIndex, lineIndex } = split.refs[n];
    out[itemIndex][lineIndex] = collapseToOneLine(answer);
  }

  return items.map((item, i) => ({ id: item.id, text: out[i].join('\n') }));
}
