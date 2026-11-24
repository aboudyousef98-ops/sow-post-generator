// Draws a note the way Slack would. Mirrors renderMarksHtml exactly — the
// point is that selecting this on the page and pasting into Slack produces the
// same result as the Copy button, because both are real <ul>/<strong> nodes.

import { Fragment } from 'react';
import { parseRich, type Line, type Span } from '../lib/richText';

const spanNodes = (spans: Span[]) =>
  spans.map((s, i) => {
    let node = <>{s.text}</>;
    // Innermost mark first, matching the tag nesting in renderMarksHtml.
    for (const m of s.marks) {
      node = m === 'bold' ? <strong>{node}</strong> : m === 'italic' ? <em>{node}</em> : <s>{node}</s>;
    }
    // A link wraps outermost — href is http(s)-only (see tokenizeLinks).
    if (s.link) {
      node = (
        <a href={s.link} target="_blank" rel="noopener noreferrer">
          {node}
        </a>
      );
    }
    return <Fragment key={i}>{node}</Fragment>;
  });

/** Consecutive same-kind lines become one list, so Slack sees a real list. */
function group(lines: Line[]) {
  const out: { type: 'ul' | 'ol' | 'p' | 'br'; lines: Line[]; start?: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    const k = lines[i].kind;
    if (k === 'bullet' || k === 'check' || k === 'check-done') {
      const g: Line[] = [];
      while (i < lines.length && ['bullet', 'check', 'check-done'].includes(lines[i].kind)) g.push(lines[i++]);
      out.push({ type: 'ul', lines: g });
    } else if (k === 'number') {
      const start = parseInt(lines[i].marker ?? '1', 10) || 1;
      const g: Line[] = [];
      while (i < lines.length && lines[i].kind === 'number') g.push(lines[i++]);
      out.push({ type: 'ol', lines: g, start });
    } else {
      out.push({ type: lines[i].spans.length ? 'p' : 'br', lines: [lines[i]] });
      i++;
    }
  }
  return out;
}

export default function RichText({ text, className }: { text: string; className?: string }) {
  const groups = group(parseRich(text));
  return (
    <div className={className ? `rich ${className}` : 'rich'}>
      {groups.map((g, gi) => {
        if (g.type === 'br') return <br key={gi} />;
        if (g.type === 'p') return <div key={gi}>{spanNodes(g.lines[0].spans)}</div>;
        if (g.type === 'ol')
          return (
            <ol key={gi} start={g.start}>
              {g.lines.map((l, li) => (
                <li key={li}>{spanNodes(l.spans)}</li>
              ))}
            </ol>
          );
        return (
          <ul key={gi}>
            {g.lines.map((l, li) => (
              <li key={li} className={l.kind === 'bullet' ? undefined : 'rich-check'}>
                {l.kind === 'bullet' ? null : <span className="rich-box">{l.kind === 'check-done' ? '☑' : '☐'}</span>}
                {l.kind === 'check-done' ? <s>{spanNodes(l.spans)}</s> : spanNodes(l.spans)}
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
