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
  /**
   * If set, this span is a hyperlink and `text` is its (already Slack-unwrapped)
   * label. Only ever an http/https URL — see `tokenizeLinks`, which is the only
   * producer — so it is safe to drop straight into an href without a scheme check.
   */
  link?: string;
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
 * A mark may OPEN before any non-space, non-same-delimiter character — Slack's
 * real rule is "not followed by whitespace", not "followed by a letter". This
 * is why `*#4 panel*` renders bold even though a `#` follows the `*` (Aboud
 * 2026-11-23). Literals like `2*3`, `PV_MOD_01` and `3/4" * 2` stay safe
 * because the OPEN side still requires a boundary BEFORE the delimiter
 * (`!isWord(prev)`), which those all fail.
 */
const canOpenBefore = (c: string | undefined, delim: string) =>
  c !== undefined && !/\s/.test(c) && c !== delim;

/**
 * Split one line into marked spans. Single pass, no nesting of the same mark:
 * an unclosed delimiter is just a literal character, which is what Slack does
 * and what keeps `2*3` and `PV_MOD_01` intact.
 */
function parseMarks(text: string): Span[] {
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
    if (!isWord(prev) && canOpenBefore(next, c) && hasClose(text, i, c)) {
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

// Links. Two shapes, http/https only — deliberately NOT www./mailto:, to keep
// clear of the part numbers and conduit callouts the mark rules already guard:
//   1. Slack explicit: `<https://x|label>` → the label shows, href is the URL.
//      Also bare `<https://x>` (Slack wraps pasted URLs like this).
//   2. A raw URL anywhere in the text: `https://x`.
// A `<...>` is only a link when its contents start with http(s):// — so a typed
// `<b>` or `voltage < 600` is left alone and still escapes to literal text.
const LINK_RE = /<(https?:\/\/[^\s<>|]+)(?:\|([^<>]*))?>|(https?:\/\/[^\s<>]+)/g;

/**
 * A raw URL swallows trailing sentence punctuation it should not own — the dot
 * in "see https://x." or the paren in "(https://x)". Peel those back off so
 * they render as the prose they are, not part of the link.
 */
function trimUrlTail(url: string): { href: string; tail: string } {
  let href = url;
  let tail = '';
  for (;;) {
    const last = href[href.length - 1];
    if (last && '.,;:!?\'"'.includes(last)) {
      tail = last + tail;
      href = href.slice(0, -1);
      continue;
    }
    if (last === ')' && !href.includes('(')) {
      tail = last + tail;
      href = href.slice(0, -1);
      continue;
    }
    if (last === ']' && !href.includes('[')) {
      tail = last + tail;
      href = href.slice(0, -1);
      continue;
    }
    break;
  }
  return { href, tail };
}

type LinkSeg = { str: string } | { href: string; label: string };

/** Split a line into alternating plain-text and link segments. */
function tokenizeLinks(text: string): LinkSeg[] {
  const segs: LinkSeg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) {
    const pre = text.slice(last, m.index);
    if (m[1]) {
      // Slack <url|label> (label optional).
      if (pre) segs.push({ str: pre });
      const label = (m[2] ?? '').trim() || m[1];
      segs.push({ href: m[1], label });
      last = LINK_RE.lastIndex;
    } else {
      // Raw URL — give any trailing punctuation back to the following text.
      const { href, tail } = trimUrlTail(m[3]);
      if (pre) segs.push({ str: pre });
      segs.push({ href, label: href });
      last = LINK_RE.lastIndex - tail.length;
      LINK_RE.lastIndex = last;
    }
  }
  if (last < text.length) segs.push({ str: text.slice(last) });
  return segs;
}

/**
 * Split one line into spans. Links are lifted out FIRST — before the `*_~` mark
 * scanner ever sees them — so a URL's own punctuation can never be mistaken for
 * a mark, and a link's label is not re-parsed.
 */
export function parseSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const seg of tokenizeLinks(text)) {
    if ('str' in seg) out.push(...parseMarks(seg.str));
    else out.push({ text: seg.label, marks: [], link: seg.href });
  }
  return out;
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
  return parseRich(text).some(
    (l) => l.kind !== 'plain' || l.spans.some((s) => s.marks.length || s.link),
  );
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** As `esc`, plus the double-quote — for a value going inside an HTML attribute. */
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

const TAG: Record<Mark, string> = { bold: 'strong', italic: 'em', strike: 's' };

function spansHtml(spans: Span[]): string {
  return spans
    .map((s) => {
      const inner = s.marks.reduce((acc, m) => `<${TAG[m]}>${acc}</${TAG[m]}>`, esc(s.text));
      return s.link
        ? `<a href="${escAttr(s.link)}" target="_blank" rel="noopener">${inner}</a>`
        : inner;
    })
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
