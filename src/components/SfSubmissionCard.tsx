// Salesforce submission panel (Aboud 2026-10-22) — the per-field counterpart
// of the Slack preview. One row per SF field, in the SF page's order, each with
// its own copy button and a "copied" tick so the coordinator can walk down the
// SF page without losing their place. Values come from buildSfSubmission —
// the same polished data the Slack post renders.

import { useEffect, useState } from 'react';
import { buildSfSubmission } from '../lib/sfSubmission';
import type { PostRecord, Settings } from '../types';

interface Props {
  record: PostRecord;
  settings: Settings;
  toast: (text: string) => void;
}

export default function SfSubmissionCard({ record, settings, toast }: Props) {
  const fields = buildSfSubmission(record, settings);
  // The tick remembers WHAT was copied, not just that a copy happened — if the
  // form changes a value after it was copied, its tick must drop so a stale
  // paste is never mistaken for done.
  const [copied, setCopied] = useState<Record<string, string>>({});

  // A different project starts a fresh walk down the SF page.
  useEffect(() => setCopied({}), [record.id]);

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied((c) => ({ ...c, [id]: value }));
    } catch {
      toast('Could not reach the clipboard — copy the text by hand.');
    }
  };

  const isCopied = (f: { id: string; value: string }) => !!f.value && copied[f.id] === f.value;
  const done = fields.filter(isCopied).length;
  const total = fields.filter((f) => f.value).length;

  return (
    <div className="card sf-submit-card">
      <div className="preview-head">
        <span className="section-label">Salesforce fields</span>
        <span className="muted">
          {done} of {total} copied
        </span>
      </div>
      <ul className="sf-submit-list">
        {fields.map((f) => (
          <li key={f.id} className={isCopied(f) ? 'copied' : ''}>
            <div className="sf-submit-top">
              <span className="sf-submit-label">{f.label}</span>
              <button
                type="button"
                className={`btn small ${isCopied(f) ? 'secondary' : 'primary'}`}
                disabled={!f.value}
                onClick={() => void copy(f.id, f.value)}
                title={f.value ? `Copy the ${f.label} value` : 'Nothing to copy yet'}
              >
                {isCopied(f) ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            {f.value ? (
              <div className={`sf-submit-value ${f.multiline ? 'multi' : ''}`}>{f.value}</div>
            ) : (
              <div className="sf-submit-value empty">—</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
