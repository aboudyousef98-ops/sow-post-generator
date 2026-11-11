// Wire material check (Aboud 2026-11-11) — two dropdowns at the top of the
// Feedback card, directly above the Design Feedback box, whose answer becomes
// the first bullet of Design Feedback in both the Slack post and the
// Salesforce field.
//
// The picks plus a one-word flag are the whole UI. The strip that echoed the
// generated sentence was cut on sight (Aboud 2026-11-11: "i want it, but only
// a flag saying if we match or not, no need for this long things") — the
// sentence itself is already on screen twice, in the Slack preview and in the
// SF Design Feedback field on the right.
//
// There is no required gate either (this site does not gate fields). What
// replaces it is the readiness row, which stays advisory while the answer is
// missing but never blocks posting.

import { matchAluminum } from '../lib/aluminumWiring';
import { SERVICE_AMPS, SHORT, TABLE_310_12, WIRE_MATERIALS, wireStatus } from '../lib/wireMaterial';
import type { PostRecord, ServiceAmps, WireMaterial } from '../types';

interface Props {
  record: PostRecord;
  update: (updater: (r: PostRecord) => PostRecord) => void;
}

/** A jurisdiction stance worth interrupting for — the two that can get an aluminum BOS rejected. */
function restrictsAluminum(requirement: string): boolean {
  return /^(not allowed|restricted)/i.test(requirement);
}

/** The flag text, short enough to sit on the dropdown row. */
function flagText(r: PostRecord): string {
  const { design, bos } = r.wire ?? {};
  switch (wireStatus(r)) {
    case 'match':
      return `✓ Match — ${SHORT[bos!].toLowerCase()}`;
    case 'mismatch':
      return `✗ Mismatch — SLD ${SHORT[design!].toLowerCase()}, BOS ${SHORT[bos!].toLowerCase()}`;
    default:
      return 'Not confirmed';
  }
}

export default function WireCheckRow({ record, update }: Props) {
  const w = record.wire ?? {};
  const status = wireStatus(record);

  const setWire = (patch: Partial<NonNullable<PostRecord['wire']>>) =>
    update((r) => ({ ...r, wire: { ...(r.wire ?? {}), ...patch } }));

  const sizes = w.serviceAmps ? TABLE_310_12[w.serviceAmps] : undefined;

  // Only when the BOS actually commits to aluminum — a copper BOS in a
  // copper-only city is exactly right, and warning there would be noise.
  // Display-only, never posted: same contract as the Jurisdiction alu-banner.
  const alu = w.bos === 'AL' ? matchAluminum(record.sf.jurisdiction) : null;
  const aluFlag = alu && restrictsAluminum(alu.requirement) ? alu : null;

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

        {/* The flag. Deliberately the only verdict in the form — one line,
            on the same row as the picks that produce it. */}
        <span className={`wire-flag ${status}`}>{flagText(record)}</span>
      </div>

      {sizes && (
        <p className="wire-size-hint">
          <strong>{w.serviceAmps} A</strong> · Table 310.12 → Copper {sizes.cu} · Aluminum {sizes.al}
        </p>
      )}

      {aluFlag && (
        <p className="wire-alu-flag">
          <strong>⚠ {aluFlag.name}:</strong> {aluFlag.requirement}
        </p>
      )}
    </>
  );
}
