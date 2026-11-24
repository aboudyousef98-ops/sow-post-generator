// "Polish a message" (Aboud 2026-11-24) — a scratch message polisher behind a
// button in the Compose AI-actions row. Paste a rough Slack/Teams message, get
// the professional SOW-team version back, copy it. Deliberately independent of
// the Compose boxes: it never reads or writes the record, so it cannot touch a
// live draft. The persona lives server-side in rewrite.mts (mode 'message').

import { useState } from 'react';
import { MAX_NOTE_CHARS, polishMessage, type ApiError } from '../lib/api';

interface Props {
  aiAvailable: boolean;
  onClose: () => void;
}

export default function MessagePolisher({ aiAvailable, onClose }: Props) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  const tooLong = input.length > MAX_NOTE_CHARS;
  const canRun = aiAvailable && !busy && input.trim() !== '' && !tooLong;

  const run = async () => {
    setBusy(true);
    setError(undefined);
    setCopied(false);
    try {
      setOutput(await polishMessage(input));
    } catch (err) {
      setError((err as ApiError)?.message || 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      setError('Could not copy — select the text and copy manually.');
    }
  };

  return (
    <div className="card msg-polisher">
      <div className="msg-polisher-head">
        <h3>Polish a message</h3>
        <button type="button" className="btn link small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">
        Paste a rough Slack/Teams message — feedback, a note, anything. It comes back professional, with your terms and
        friendly words kept. Nothing here touches the draft.
      </p>

      <label className="field">
        Your message
        <textarea
          rows={5}
          value={input}
          placeholder="e.g. salam team, elevation missing expansion unit, tag say EMT must be PVC, wallah nar good work otherwise"
          onChange={(e) => setInput(e.target.value)}
        />
        <span className={`field-hint${tooLong ? ' warn' : ''}`}>
          {input.length}/{MAX_NOTE_CHARS}
          {tooLong ? ' — too long, trim it first' : ''}
        </span>
      </label>

      <div className="ai-actions">
        <button
          type="button"
          className="btn primary"
          disabled={!canRun}
          onClick={() => void run()}
          title={aiAvailable ? 'Rewrite into a professional message' : 'AI offline — manual flow still works'}
        >
          {busy ? (
            <span>
              <span className="spin">✉️</span> Polishing…
            </span>
          ) : (
            '✉️ Polish this message'
          )}
        </button>
      </div>

      {error && <div className="error-inline">{error}</div>}

      {output && (
        <label className="field">
          Polished
          <textarea className="msg-polisher-out" rows={6} value={output} readOnly />
          <div className="ai-actions">
            <button type="button" className="btn secondary" onClick={() => void copy()}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </label>
      )}
    </div>
  );
}
