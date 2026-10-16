// Slack-native light formatting for the notes/requirements panels.
//
// Aboud 2026-10-08, verbatim: "when i do copy paste to slack to have the format
// as it is on our website." So the storage format IS Slack's own wire format —
// `*bold*`, `_italic_`, `~strike~`, `• ` / `1. ` / `☐ ` line leaders. Text goes
// into Blobs exactly as typed; this module only decides how to DRAW it. That
// means a browser selection-copy off the website carries real <ul>/<strong>
// into Slack, and the raw text still reads fine anywhere that never renders it.
//
// Deliberately NOT a markdown library. Engineers type `#`, `>` and `_` inside
// part numbers and conduit callouts all day — a real parser would silently eat
// `PV_MOD_01` and `2*3`. Every rule below is boundary-guarded for that reason.

export type Mark = 'bold' | 'italic' | 'strike';

export interface Span {
  text: string;
  marks: Mark[];
}

export type LineKind = 'bullet' | 'number' | 'check' | 'check-done' | 'plain';

export interface Line {
  kind: LineKind;
  /** The literal marker the writer typed, e.g. "3." — kept so numbering survives. */
  marker?: string;
  spans: Span[];
}

/** Line leaders. The trailing space is required, so "•" or "1." alone stays plain text. */
const BULLET = /^\s*([•◦·])\s+/;
const NUMBER = /^\s*(\d{1,3}[.)])\s+/;
const CHECK = /^\s*(?:\[([ xX])\]|([☐☑]))\s+/;

const DELIM: Record<string, Mark> = { '*': 'bold', _: 'italic', '~': 'strike' };

/** A mark can only open after, and close before, a non-word character. */
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

/**
 * Split one line into marked spans. Single pass, no nesting of the same mark:
 * an unclosed delimiter is just a literal character, which is what Slack does
 * and what keeps `2*3` and `PV_MOD_01` intact.
 */
export function parseSpans(text: string): Span[] {
  const spans: Span[] = [];
  // `since` is how many spans existed when the mark opened, so a mark that
  // wrapped an inner mark still counts as having content: in `*_both_*` the
  // buffer is empty by the time the outer `*` closes.
  const open: { mark: Mark; char: string; since: number }[] = [];
  let buf = '';

  const flush = () => {
    if (buf) spans.push({ text: buf, marks: open.map((o) => o.mark) });
    buf = '';
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const mark = DELIM[c];
    if (!mark) {
      buf += c;
      continue;
    }
    const prev = text[i - 1];
    const next = text[i + 1];
    const openIdx = open.findIndex((o) => o.char === c);

    if (openIdx >= 0) {
      // Candidate close: must sit tight against the word it ends, and the mark
      // must have actual content. `_a _b` closes nothing.
      const hasContent = !!buf || spans.length > open[openIdx].since;
      if (openIdx === open.length - 1 && isWord(prev) && !isWord(next) && hasContent) {
        flush();
        open.pop();
        continue;
      }
      buf += c;
      continue;
    }

    // Candidate open: preceded by a boundary, followed by real content, and a
    // matching close must actually exist later on this line.
    if (!isWord(prev) && isWord(next) && hasClose(text, i, c)) {
      flush();
      open.push({ mark, char: c, since: spans.length });
      continue;
    }
    buf += c;
  }

  // Anything still open never closed — re-emit its delimiter as literal text.
  if (open.length) {
    const literal = open.map((o) => o.char).join('') + buf;
    return [...spans, { text: literal, marks: [] }].filter((s) => s.text);
  }
  flush();
  return spans.filter((s) => s.text);
}

/** Is there a valid closing delimiter for `char` after index `from`? */
function hasClose(text: string, from: number, char: string): boolean {
  for (let j = from + 2; j < text.length; j++) {
    if (text[j] === char && isWord(text[j - 1]) && !isWord(text[j + 1])) return true;
  }
  return false;
}

/** Parse a whole note into lines. Blank lines are preserved as empty plain lines. */
export function parseRich(text: string): Line[] {
  return text.split('\n').map((raw) => {
    let m = BULLET.exec(raw);
    if (m) return { kind: 'bullet' as const, spans: parseSpans(raw.slice(m[0].length)) };

    m = NUMBER.exec(raw);
    if (m) return { kind: 'number' as const, marker: m[1], spans: parseSpans(raw.slice(m[0].length)) };

    m = CHECK.exec(raw);
    if (m) {
      const done = m[1] === 'x' || m[1] === 'X' || m[2] === '☑';
      return { kind: (done ? 'check-done' : 'check') as LineKind, spans: parseSpans(raw.slice(m[0].length)) };
    }
    return { kind: 'plain' as const, spans: parseSpans(raw) };
  });
}

/** Does this text use any of our marks? Lets callers skip the renderer entirely. */
export function hasFormatting(text: string): boolean {
  return parseRich(text).some((l) => l.kind !== 'plain' || l.spans.some((s) => s.marks.length));
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAG: Record<Mark, string> = { bold: 'strong', italic: 'em', strike: 's' };

function spansHtml(spans: Span[]): string {
  return spans
    .map((s) => s.marks.reduce((inner, m) => `<${TAG[m]}>${inner}</${TAG[m]}>`, esc(s.text)))
    .join('');
}

/**
 * HTML for the Slack clipboard payload. Slack's paste handler understands
 * <ul>/<ol>/<strong>/<em>/<s>, so this is what makes the paste look like the
 * website. Consecutive same-kind lines are grouped into one list.
 */
export function renderMarksHtml(text: string): string {
  const lines = parseRich(text);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const kind = lines[i].kind;

    if (kind === 'bullet' || kind === 'check' || kind === 'check-done') {
      const items: string[] = [];
      while (i < lines.length && ['bullet', 'check', 'check-done'].includes(lines[i].kind)) {
        const l = lines[i];
        const box = l.kind === 'check' ? '☐ ' : l.kind === 'check-done' ? '☑ ' : '';
        items.push(`<li>${box}${spansHtml(l.spans)}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (kind === 'number') {
      const items: string[] = [];
      const start = parseInt(lines[i].marker ?? '1', 10) || 1;
      while (i < lines.length && lines[i].kind === 'number') {
        items.push(`<li>${spansHtml(lines[i].spans)}</li>`);
        i++;
      }
      out.push(`<ol${start === 1 ? '' : ` start="${start}"`}>${items.join('')}</ol>`);
      continue;
    }

    const html = spansHtml(lines[i].spans);
    out.push(html ? `<div>${html}</div>` : '<br>');
    i++;
  }
  return out.join('');
}
