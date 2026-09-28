import { useCallback, useEffect } from 'react';
import { buildPostHtml, buildPostText, missingRequired } from '../lib/template';
import type { Ahj, PostRecord, Settings } from '../types';

interface Props {
  record: PostRecord;
  settings: Settings;
  ahjs?: Ahj[];
  onMarkPosted: () => void;
  onNewPost: () => void;
  toast: (text: string) => void;
}

export default function OutputColumn({ record, settings, ahjs, onMarkPosted, onNewPost, toast }: Props) {
  const text = buildPostText(record, settings, ahjs);
  const html = buildPostHtml(record, settings, ahjs);

  const missing = missingRequired(record);
  const ready = missing.length === 0;

  const copyForSlack = useCallback(async () => {
    if (missingRequired(record).length) return; // also blocks the Ctrl+Shift+C shortcut
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    toast('Copied. Paste into Slack, then re-type the @mentions if they appear as plain text.');
  }, [html, text, toast, record]);

  const copyPlain = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    toast('Plain text copied.');
  }, [text, toast]);

  // Ctrl+Shift+C = Copy for Slack (spec/01 UX rules).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        void copyForSlack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyForSlack]);

  return (
    <div>
      <div className="card">
        <h3>Preview</h3>
        {/* buildPostHtml escapes all user text — safe to render. */}
        <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn primary"
            disabled={!ready}
            onClick={() => void copyForSlack()}
            title="Ctrl+Shift+C"
          >
            Copy for Slack
          </button>
          <button type="button" className="btn secondary" disabled={!ready} onClick={() => void copyPlain()}>
            Copy plain text
          </button>
          <button type="button" className="btn secondary" disabled={!ready} onClick={onMarkPosted}>
            ✅ Mark as posted
          </button>
          <button type="button" className="btn secondary" onClick={onNewPost}>
            New post
          </button>
        </div>
        {!ready && (
          <div className="error-inline" style={{ marginTop: 6 }}>
            Required before copying: {missing.join(', ')}.
          </div>
        )}
      </div>
    </div>
  );
}
