// Wire material check (Aboud 2026-11-11) — two dropdowns and the sentence they
// write. Lives at the TOP of the Feedback card, directly above the Design
// Feedback box, so cause sits beside effect: the coordinator reads the exact
// bullet their picks just put into the post and into Salesforce.
//
// There is no required gate (this site does not gate fields). What replaces it
// is visibility: the strip always says something, and the readiness card
// carries an advisory row while the answer is still missing.

import { useState } from 'react';
import { matchAluminum } from '../lib/aluminumWiring';
import {
  SERVICE_AMPS,
  SHORT,
  TABLE_310_12,
  WIRE_MATERIALS,
  wireFeedbackLine,
  wireRequestText,
  wireStatus,
} from '../lib/wireMaterial';
import type { PostRecord, ServiceAmps, WireMaterial } from '../types';

interface Props {
  record: PostRecord;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  toast: (text: string) => void;
}

/** A jurisdiction stance worth interrupting for — the two that can get an aluminum BOS rejected. */
function restrictsAluminum(requirement: string): boolean {
  return /^(not allowed|restricted)/i.test(requirement);
}

export default function WireCheckRow({ record, update, toast }: Props) {
  const w = record.wire ?? {};
  const status = wireStatus(record);
  const [copied, setCopied] = useState('');

  const setWire = (patch: Partial<NonNullable<PostRecord['wire']>>) =>
    update((r) => ({ ...r, wire: { ...(r.wire ?? {}), ...patch } }));

  const sizes = w.serviceAmps ? TABLE_310_12[w.serviceAmps] : undefined;
  const sentence = wireFeedbackLine(record);
  const ask = wireRequestText(record);

  // Only when the BOS actually commits to aluminum — a copper BOS in a
  // copper-only city is exactly right, and warning there would be noise.
  // Display-only, never posted: same contract as the Jurisdiction alu-banner.
  const alu = w.bos === 'AL' ? matchAluminum(record.sf.jurisdiction) : null;
  const aluFlag = alu && restrictsAluminum(alu.requirement) ? alu : null;

  const copyAsk = async () => {
    try {
      await navigator.clipboard.writeText(ask);
      setCopied(ask);
    } catch {
      toast('Could not reach the clipboard — copy the request by hand.');
    }
  };

  return (
    <>
      <div className="install-subhead">Wire material check</div>

      <div className="install-row">
        <label className="field">
          Service rating
          <select
            value={w.serviceAmps ?? ''}
            onChange={(e) => setWire({ serviceAmps: e.target.value ? (Number(e.target.value) as ServiceAmps) : undefined })}
          >
            <option value="">—</option>
            {SERVICE_AMPS.map((a) => (
              <option key={a} value={a}>
                {a} A
              </option>
            ))}
          </select>
          <span className="field-hint">Optional — names the conductor size in the feedback</span>
        </label>

        <label className="field">
          Design SLD shows
          <select
            value={w.design ?? ''}
            onChange={(e) => setWire({ design: (e.target.value || undefined) as WireMaterial | undefined })}
          >
            <option value="">—</option>
            {WIRE_MATERIALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="field-hint">What the planset in Salesforce says</span>
        </label>

        <label className="field">
          BOS / install uses
          <select
            value={w.bos ?? ''}
            onChange={(e) => setWire({ bos: (e.target.value || undefined) as WireMaterial | undefined })}
          >
            <option value="">—</option>
            {WIRE_MATERIALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="field-hint">What will actually be installed</span>
        </label>

        {/* The common case — nothing changed — in one click. Never automatic:
            a silent default is how the mismatches went unnoticed. */}
        <button
          type="button"
          className="btn small secondary wire-same"
          disabled={!w.design}
          onClick={() => setWire({ bos: w.design })}
          title={w.design ? 'Set BOS to the same material as the design' : 'Pick the design material first'}
        >
          Same as design
        </button>
      </div>

      {sizes && (
        <p className="wire-size-hint">
          <strong>{w.serviceAmps} A</strong> · Table 310.12 → Copper {sizes.cu} · Aluminum {sizes.al}
          <span className="field-hint">
            Dwelling service/feeder conductors, where no adjustment or correction factors apply.
          </span>
        </p>
      )}

      <div className={`wire-strip ${status}`}>
        {status === 'unknown' && <span>Pick both to state the match in Design Feedback.</span>}
        {status !== 'unknown' && (
          <>
            <div className="wire-verdict">
              <strong>
                {status === 'match'
                  ? `✓ Match — ${SHORT[w.bos!].toLowerCase()} in both.`
                  : `✗ Mismatch — SLD ${SHORT[w.design!].toLowerCase()}, BOS ${SHORT[w.bos!].toLowerCase()}.`}
              </strong>
              {status === 'mismatch' && (
                <button
                  type="button"
                  className={`btn small ${copied === ask ? 'secondary' : 'primary'}`}
                  onClick={() => void copyAsk()}
                  title="Copy just the request, to send to the designer"
                >
                  {copied === ask ? '✓ Copied' : 'Copy ask'}
                </button>
              )}
            </div>
            <div className="wire-sentence">
              <span className="muted">Design Feedback will say:</span> {sentence}
            </div>
          </>
        )}
        {aluFlag && (
          <div className="wire-alu-flag">
            <strong>⚠ {aluFlag.name}:</strong> {aluFlag.requirement}
          </div>
        )}
      </div>
    </>
  );
}
