// SVT — Pre-design analysis card (Aboud 2026-11-15, the #sow-svt-collab
// taskforce). The Compose form's SVT tab: the battery-location agreement
// block, the likely conduit path, and the handful of shared facts the SVT
// post needs early.
//
// SHARED fields (walls, stories, services, roof material, disconnect
// duration, battery location, special cases) are the SAME InstallNotes fields
// the SOW tab edits — rendered here a second time, bound to the same record,
// so pre-design work pre-fills the full SOW compose with no sync layer. The
// control markup mirrors InstallNotesCard on purpose; the state cannot drift
// because there is only one record underneath.

import {
  disconnectDurationFor,
  DURATION_WORD,
  emptyInstallNotes,
  INSTALL_TEXT_FIELDS,
  ORIENTATIONS,
  ROOF_MATERIALS,
  SERVICE_WORK,
  servicesOf,
  SVT_TEXT_FIELDS,
} from '../lib/installNotes';
import {
  CLEAR_REQUIRED_DEFAULT,
  COST_DRIVERS,
  HO_ACTIONS,
  NOT_REVIEWED,
  STACK_KWH,
  SVT_PATHS,
  wallNeeded,
} from '../lib/svtPost';
import { useEffect, useState } from 'react';
import type {
  ClearEquipment,
  CostDirection,
  InstallNotes,
  InstallTextField,
  Orientation,
  PolishKey,
  PostRecord,
  RoofMaterial,
  ServiceWork,
  Settings,
  SvtAsk,
  SvtNotes,
  SvtTextField,
} from '../types';
import NoteBox from './NoteBox';

/** Tri-state mapping shared with InstallNotesCard: '' is "not answered yet". */
const yesNoValue = (v: boolean | undefined) => (v === undefined ? '' : v ? 'yes' : 'no');
const yesNoParse = (v: string) => (v === '' ? undefined : v === 'yes');

/** hoAgrees is FOUR-state — "unknown" is an answer that prints, '' does not. */
const hoAgreesValue = (v: boolean | 'unknown' | undefined) =>
  v === undefined ? '' : v === 'unknown' ? 'unknown' : v ? 'yes' : 'no';
const hoAgreesParse = (v: string): boolean | 'unknown' | undefined =>
  v === '' ? undefined : v === 'unknown' ? 'unknown' : v === 'yes';

/** A number box: blank and garbage both mean "not answered". */
const numParse = (v: string): number | undefined => {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** Multi-select tick lists store `undefined` when emptied, not `[]`. */
const toggleIn = (list: string[] | undefined, v: string): string[] | undefined => {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
};

/** Remove one entry, keeping the same empty-is-undefined contract. */
const dropFrom = (list: string[] | undefined, v: string): string[] | undefined => {
  const next = (list ?? []).filter((x) => x !== v);
  return next.length ? next : undefined;
};

interface Props {
  record: PostRecord;
  settings: Settings;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  dropped: Partial<Record<PolishKey, string[]>>;
  drift: Partial<Record<PolishKey, { from: number; to: number }>>;
  onToggle: (key: PolishKey, usePolished: boolean) => void;
  onClearDropped: (key: PolishKey) => void;
  onClearDrift: (key: PolishKey) => void;
  /** The Polish/rewrite buttons, rendered at the card's end — ComposeTab owns
   * them (runAi state); a lone "AI polish" card for two buttons was a box too
   * many (audit 2026-11-15). */
  actions?: React.ReactNode;
}

export default function SvtCard({
  record,
  settings,
  update,
  onKeyDown,
  dropped,
  drift,
  onToggle,
  onClearDropped,
  onClearDrift,
  actions,
}: Props) {
  const n = record.installNotes ?? emptyInstallNotes();
  const s: SvtNotes = record.svt ?? {};

  const setNotes = (patch: Partial<InstallNotes>) =>
    update((r) => ({ ...r, installNotes: { ...(r.installNotes ?? emptyInstallNotes()), ...patch } }));

  const setSvt = (patch: Partial<SvtNotes>) => update((r) => ({ ...r, svt: { ...r.svt, ...patch } }));

  /**
   * One tick chip. Every tick group in this card renders through here so the
   * `on` class can never be forgotten on one of them — that class is what
   * fills the pill (see `.service-tick` in theme.css), and a group missing it
   * would look permanently unchecked.
   */
  const tick = (key: string, label: string, checked: boolean, onChange: () => void) => (
    <label key={key} className={`service-tick${checked ? ' on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );

  /** Editing a box invalidates that box's stale polished version and guard hints. */
  const setInstallText = (field: InstallTextField, key: PolishKey, value: string) => {
    onClearDropped(key);
    onClearDrift(key);
    update((r) => {
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return { ...r, installNotes: { ...(r.installNotes ?? emptyInstallNotes()), [field]: value }, polished };
    });
  };

  const setSvtText = (field: SvtTextField, key: PolishKey, value: string) => {
    onClearDropped(key);
    onClearDrift(key);
    update((r) => {
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return { ...r, svt: { ...r.svt, [field]: value }, polished };
    });
  };

  /** Chip clicks append a line and invalidate stale polish, like typing does
   * (the chips went missing here at first — audit 2026-11-15). */
  const appendInstallChip = (field: InstallTextField, key: PolishKey, phrase: string) => {
    onClearDropped(key);
    onClearDrift(key);
    update((r) => {
      const cur = r.installNotes ?? emptyInstallNotes();
      const existing = cur[field];
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return {
        ...r,
        installNotes: { ...cur, [field]: existing ? `${existing.replace(/\s+$/, '')}\n${phrase}` : phrase },
        polished,
      };
    });
  };

  const appendSvtChip = (field: SvtTextField, key: PolishKey, phrase: string) => {
    onClearDropped(key);
    onClearDrift(key);
    update((r) => {
      const existing = r.svt?.[field];
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return {
        ...r,
        svt: { ...r.svt, [field]: existing ? `${existing.replace(/\s+$/, '')}\n${phrase}` : phrase },
        polished,
      };
    });
  };

  /** Same wall/orientation preservation rules as InstallNotesCard. */
  const setWalls = (walls: InstallNotes['walls']) =>
    update((r) => {
      const cur = r.installNotes ?? emptyInstallNotes();
      const next = walls ? Array.from({ length: walls }, (_, i) => cur.orientations[i] ?? '') : cur.orientations;
      return { ...r, installNotes: { ...cur, walls, orientations: next } };
    });

  const setOrientation = (i: number, value: Orientation | '') =>
    update((r) => {
      const cur = r.installNotes ?? emptyInstallNotes();
      const next = [...cur.orientations];
      next[i] = value;
      return { ...r, installNotes: { ...cur, orientations: next } };
    });

  const installBox = (field: InstallTextField, label?: string, rows = 2) => {
    const def = INSTALL_TEXT_FIELDS.find((f) => f.field === field)!;
    return (
      <NoteBox
        key={def.key}
        label={label ?? def.label}
        polishKey={def.key}
        value={n[field] ?? ''}
        rows={rows}
        onChange={(v) => setInstallText(field, def.key, v)}
        onKeyDown={onKeyDown}
        chips={settings.chips[def.key]}
        onChip={(phrase) => appendInstallChip(field, def.key, phrase)}
        polished={record.polished?.[def.key]}
        usePolished={record.usePolished[def.key] !== false}
        onToggle={(use) => onToggle(def.key, use)}
        dropped={dropped[def.key]}
        drift={drift[def.key]}
        mode={record.polishMode?.[def.key]}
      />
    );
  };

  const svtBox = (field: SvtTextField, label?: string, rows = 2) => {
    const def = SVT_TEXT_FIELDS.find((f) => f.field === field)!;
    return (
      <NoteBox
        key={def.key}
        label={label ?? def.label}
        polishKey={def.key}
        value={s[field] ?? ''}
        rows={rows}
        onChange={(v) => setSvtText(field, def.key, v)}
        onKeyDown={onKeyDown}
        chips={settings.chips[def.key]}
        onChip={(phrase) => appendSvtChip(field, def.key, phrase)}
        polished={record.polished?.[def.key]}
        usePolished={record.usePolished[def.key] !== false}
        onToggle={(use) => onToggle(def.key, use)}
        dropped={dropped[def.key]}
        drift={drift[def.key]}
        mode={record.polishMode?.[def.key]}
      />
    );
  };

  // "+ Add alternative location" reveals slot 1, then slot 2. A slot with
  // content is always shown — reopening a draft must never hide typed work.
  const filledAlts = (s.alt2Location ?? '') || (s.alt2Reason ?? '') ? 2 : (s.alt1Location ?? '') || (s.alt1Reason ?? '') ? 1 : 0;
  const [extraAlts, setExtraAlts] = useState(0);
  useEffect(() => setExtraAlts(0), [record.id]);
  const altCount = Math.max(filledAlts, extraAlts);

  // The live clearance verdict, mirroring clearanceLines() in svtPost.ts:
  // both numbers are needed, equal counts as met, and the remainder is
  // rounded the same way the printed sentence rounds it.
  const clearVerdict = (() => {
    const { clearAvailable: avail, clearDepth: depth } = s;
    if (avail === undefined || depth === undefined) return undefined;
    const required = s.clearRequired ?? CLEAR_REQUIRED_DEFAULT;
    const left = Math.round(avail - depth);
    return { left, required, ok: left >= required };
  })();

  // The live wall-fit verdict, mirroring wallFitLines() in svtPost.ts —
  // same rounding, and equal counts as a fit.
  const wallFit = (() => {
    const { batteryStacks: stacks, wallAvailable: avail } = s;
    if (stacks === undefined || avail === undefined) return undefined;
    const need = Math.round(wallNeeded(stacks) * 10) / 10;
    const spare = Math.round((avail - need) * 10) / 10;
    return { stacks, need, spare, short: Math.round(-spare * 10) / 10, ok: spare >= 0 };
  })();

  const removeAlt = (slot: 1 | 2) => {
    if (slot === 1) setSvt({ alt1Location: undefined, alt1Reason: undefined });
    else setSvt({ alt2Location: undefined, alt2Reason: undefined });
    setExtraAlts(slot - 1);
  };

  return (
    <div className="card">
      <h3>Pre-Design analysis</h3>

      <div className="install-subhead">Battery location</div>
      <div className="note-grid">{installBox('batteryLocation', 'Battery location (SOW preferred)', 1)}</div>
      <div className="install-row">
        <label className="field">
          Homeowner agrees with the proposed location?
          <select value={hoAgreesValue(s.hoAgrees)} onChange={(e) => setSvt({ hoAgrees: hoAgreesParse(e.target.value) })}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unknown">No stated preference</option>
          </select>
          <span className="field-hint">
            No → prints the HO’s preferred location and why it does not work. No stated preference → says we optimised
            for cost and the installers
          </span>
        </label>
      </div>
      {s.hoAgrees === false && (
        <div className="note-grid">
          {svtBox('hoLocation', 'HO preferred location', 1)}
          {svtBox('hoReason', 'Why it does not work', 2)}
        </div>
      )}
      {altCount >= 1 && (
        <div>
          <div className="svt-alt-head">
            <span className="install-subhead">Alternative location</span>
            {altCount === 1 && (
              <button type="button" className="btn link small" onClick={() => removeAlt(1)}>
                Remove
              </button>
            )}
          </div>
          <div className="note-grid">
            {svtBox('alt1Location', 'Location', 1)}
            {svtBox('alt1Reason', 'Reason', 1)}
          </div>
        </div>
      )}
      {altCount >= 2 && (
        <div>
          <div className="svt-alt-head">
            <span className="install-subhead">Alternative location 2</span>
            <button type="button" className="btn link small" onClick={() => removeAlt(2)}>
              Remove
            </button>
          </div>
          <div className="note-grid">
            {svtBox('alt2Location', 'Location', 1)}
            {svtBox('alt2Reason', 'Reason', 1)}
          </div>
        </div>
      )}
      {altCount < 2 && (
        <button type="button" className="btn secondary small" onClick={() => setExtraAlts(altCount + 1)}>
          + Add alternative location
        </button>
      )}

      <div className="install-subhead">Most likely conduit path</div>
      <div className="install-row">
        <div className="field">
          Tick all that apply
          <div className="service-ticks">
            {SVT_PATHS.map((p) =>
              tick(p.field, p.label, s[p.field] ?? false, () =>
                // Ticking a path as likely drops it from "ruled out" — the two
                // groups are mutually exclusive, so the contradiction is made
                // unstorable rather than caught later.
                setSvt({
                  [p.field]: !s[p.field] || undefined,
                  ruledOut: s[p.field] ? s.ruledOut : dropFrom(s.ruledOut, p.field),
                }),
              ),
            )}
          </div>
        </div>
      </div>
      <div className="install-row">
        <div className="field tick-field">
          Ruled out — considered and rejected
          <div className="service-ticks">
            {SVT_PATHS.map((p) =>
              tick(`out-${p.field}`, p.label, (s.ruledOut ?? []).includes(p.field), () =>
                setSvt({
                  ruledOut: toggleIn(s.ruledOut, p.field),
                  // …and the reverse: ruling a path out unticks it as likely.
                  ...((s.ruledOut ?? []).includes(p.field) ? {} : { [p.field]: undefined }),
                }),
              ),
            )}
          </div>
          <span className="field-hint">
            Saying why an option does not work is what stops the reply asking “could we not just do X?”
          </span>
        </div>
      </div>
      {(s.ruledOut ?? []).length > 0 && (
        <div className="install-row">
          <label className="field" style={{ flex: '1 1 420px' }}>
            Why those do not work
            <input
              type="text"
              value={s.ruledOutReason ?? ''}
              placeholder="e.g. only partially external — would still need both attics and a trench"
              onChange={(e) => setSvt({ ruledOutReason: e.target.value || undefined })}
            />
          </label>
        </div>
      )}
      <div className="note-grid">{svtBox('pathNotes', 'Path notes', 2)}</div>

      <div className="install-subhead">Site conditions</div>
      <div className="install-row">
        <label className="field">
          Attic accessible?
          <select
            value={yesNoValue(s.atticAccessible)}
            onChange={(e) => setSvt({ atticAccessible: yesNoParse(e.target.value) })}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="field">
          Detached buildings?
          <select
            value={yesNoValue(s.detachedStructure)}
            onChange={(e) => setSvt({ detachedStructure: yesNoParse(e.target.value) })}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        {/* Only meaningful once there IS a second structure. Asking it
            otherwise invites an answer about a question nobody has. */}
        {s.detachedStructure === true && (
          <label className="field">
            Attics continuous between them?
            <select
              value={yesNoValue(s.atticsContinuous)}
              onChange={(e) => setSvt({ atticsContinuous: yesNoParse(e.target.value) })}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            <span className="field-hint">
              A catwalk joining two buildings does not join their attics — this is what decides a trench
            </span>
          </label>
        )}
        <label className="field">
          HOA?
          <select value={yesNoValue(s.hoa)} onChange={(e) => setSvt({ hoa: yesNoParse(e.target.value) })}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="field">
          Battery stacks sold
          <select
            value={s.batteryStacks ?? ''}
            onChange={(e) =>
              setSvt({ batteryStacks: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined })
            }
          >
            <option value="">—</option>
            {([1, 2, 3] as const).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'stack' : 'stacks'} — {STACK_KWH[n]} kWh
              </option>
            ))}
          </select>
          <span className="field-hint">Read it off the scope of the project — the kWh is written into the post too</span>
        </label>
        {/* Only asked once there is a stack count to measure against. */}
        {s.batteryStacks !== undefined && (
          <label className="field">
            Wall space for the batteries (in)
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={s.wallAvailable ?? ''}
              placeholder="96"
              onChange={(e) => setSvt({ wallAvailable: numParse(e.target.value) })}
            />
          </label>
        )}
      </div>
      {wallFit && (
        <div className={`svt-verdict ${wallFit.ok ? 'ok' : 'bad'}`}>
          {wallFit.ok ? '✓' : '✗'} {wallFit.stacks} stack{wallFit.stacks === 1 ? '' : 's'} need{' '}
          {wallFit.need}&quot; —{' '}
          {wallFit.ok ? `${wallFit.spare}" to spare` : `short by ${wallFit.short}"`}
        </div>
      )}

      <div className="install-subhead">Clearance check</div>
      <div className="install-row">
        <label className="field">
          Measured on
          <select
            value={s.clearEquipment ?? ''}
            onChange={(e) => setSvt({ clearEquipment: (e.target.value || undefined) as ClearEquipment | undefined })}
          >
            <option value="">Equipment</option>
            <option value="inverter">Inverter</option>
            <option value="battery">Battery</option>
          </select>
        </label>
        <label className="field">
          Wall space available (in)
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={s.clearAvailable ?? ''}
            placeholder="40"
            onChange={(e) => setSvt({ clearAvailable: numParse(e.target.value) })}
          />
        </label>
        <label className="field">
          Equipment depth (in)
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={s.clearDepth ?? ''}
            placeholder="11.9"
            onChange={(e) => setSvt({ clearDepth: numParse(e.target.value) })}
          />
        </label>
        <label className="field">
          Required clearance (in)
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={s.clearRequired ?? ''}
            placeholder={String(CLEAR_REQUIRED_DEFAULT)}
            onChange={(e) => setSvt({ clearRequired: numParse(e.target.value) })}
          />
          <span className="field-hint">
            Blank = {CLEAR_REQUIRED_DEFAULT}&quot;. Varies by equipment and AHJ — confirm it, don’t assume
          </span>
        </label>
      </div>
      {clearVerdict && (
        <div className={`svt-verdict ${clearVerdict.ok ? 'ok' : 'bad'}`}>
          {clearVerdict.ok ? '✓' : '✗'} Leaves about {clearVerdict.left}&quot; —{' '}
          {clearVerdict.ok
            ? `meets the ${clearVerdict.required}" requirement`
            : `short of ${clearVerdict.required}" by about ${clearVerdict.required - clearVerdict.left}"`}
        </div>
      )}
      <div className="install-row">
        <div className="field">
          <div className="service-ticks">
            {tick('allMet', 'All required clearances met (no measurement quoted)', s.clearanceAllMet ?? false, () =>
              setSvt({ clearanceAllMet: !s.clearanceAllMet || undefined }),
            )}
          </div>
          {clearVerdict && !clearVerdict.ok && s.clearanceAllMet && (
            <span className="field-hint warn">
              This contradicts the measurement above — the post will print both. Advisory only, nothing is blocked.
            </span>
          )}
        </div>
      </div>

      <div className="install-subhead">Electrical upgrades &amp; site facts</div>
      <div className="install-row">
        <div className="field">
          Service equipment
          <div className="service-ticks">
            {SERVICE_WORK.map((w) =>
              tick(w, w, servicesOf(n).includes(w), () => {
                const cur = servicesOf(n);
                const next: ServiceWork[] = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w];
                setNotes({ services: next, service: undefined });
              }),
            )}
          </div>
        </div>
        <label className="field">
          Walls
          <select
            value={n.walls ?? ''}
            onChange={(e) => setWalls(e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5) : undefined)}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        {Array.from({ length: n.walls ?? 0 }, (_, i) => (
          <label className="field" key={i}>
            Wall {i + 1} orientation
            <select
              value={n.orientations[i] ?? ''}
              onChange={(e) => setOrientation(i, e.target.value as Orientation | '')}
            >
              <option value="">—</option>
              {ORIENTATIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="install-row">
        <label className="field">
          Stories
          <select
            value={n.stories ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setNotes({ stories: v === '' ? undefined : v === 'other' ? 'other' : (Number(v) as 1 | 2 | 3) });
            }}
          >
            <option value="">—</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value="other">Other…</option>
          </select>
        </label>
        {n.stories === 'other' && (
          <label className="field" style={{ flex: '1 1 240px' }}>
            Describe the house
            <input
              type="text"
              value={n.storiesOther}
              placeholder="e.g. Split level, garage below"
              onChange={(e) => setNotes({ storiesOther: e.target.value })}
            />
          </label>
        )}
        <label className="field">
          Roof material
          <select
            value={n.roofMaterial ?? ''}
            onChange={(e) => setNotes({ roofMaterial: (e.target.value || undefined) as RoofMaterial | undefined })}
          >
            <option value="">—</option>
            {ROOF_MATERIALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {n.roofMaterial === 'other' && (
          <label className="field" style={{ flex: '1 1 200px' }}>
            Describe the roof material
            <input
              type="text"
              value={n.roofMaterialOther ?? ''}
              placeholder="e.g. Flat TPO membrane"
              onChange={(e) => setNotes({ roofMaterialOther: e.target.value })}
            />
          </label>
        )}
        <label className="field">
          Power disconnect duration
          <select
            value={n.disconnectDuration ?? ''}
            onChange={(e) =>
              setNotes({ disconnectDuration: (e.target.value || undefined) as '1-2' | '4-6' | undefined })
            }
          >
            <option value="">Automatic — {DURATION_WORD[disconnectDurationFor(n, record.sf.utility)]}</option>
            <option value="1-2">1–2 hours</option>
            <option value="4-6">4–6 hours</option>
          </select>
          <span className="field-hint">Automatic: MPU/FSU or TNMP utility → 4–6, otherwise 1–2</span>
        </label>
      </div>

      <div className="install-subhead">Cost impact</div>
      <div className="install-row">
        <label className="field">
          Direction
          <select
            value={s.costDirection ?? ''}
            onChange={(e) => setSvt({ costDirection: (e.target.value || undefined) as CostDirection | undefined })}
          >
            <option value="">—</option>
            <option value="adds">Adds cost</option>
            <option value="saves">Saves cost</option>
            <option value="neutral">No significant change</option>
          </select>
        </label>
      </div>
      {s.costDirection && s.costDirection !== 'neutral' && (
        <>
          {/* The chips get a row to themselves. Sharing one with a text box
              squeezed eight of them into a strip too narrow to hold a
              two-word label, which is what broke them in half. */}
          <div className="install-row">
            <div className="field tick-field">
              Why — tick all that apply
              <div className="service-ticks">
                {COST_DRIVERS.map((d) =>
                  tick(d, d, (s.costDrivers ?? []).includes(d), () =>
                    setSvt({ costDrivers: toggleIn(s.costDrivers, d) }),
                  ),
                )}
              </div>
            </div>
          </div>
          <div className="install-row">
            <label className="field" style={{ flex: '1 1 320px' }}>
              Another driver
              <input
                type="text"
                value={s.costNotes ?? ''}
                placeholder="e.g. second meter pedestal"
                onChange={(e) => setSvt({ costNotes: e.target.value || undefined })}
              />
              <span className="field-hint">Joins the list above in the sentence</span>
            </label>
          </div>
        </>
      )}

      <div className="install-subhead">Special</div>
      <div className="note-grid">{installBox('specialCases', 'Anything special about this project?', 3)}</div>

      <div className="install-subhead">Scheduling</div>
      <div className="install-row">
        <label className="field">
          Crew days
          <select
            value={s.crewDays ?? ''}
            onChange={(e) => setSvt({ crewDays: e.target.value ? (Number(e.target.value) as 1 | 2) : undefined })}
          >
            <option value="">—</option>
            <option value={1}>One-day job</option>
            <option value={2}>Two-day job</option>
          </select>
          <span className="field-hint">Two-day → CLR books two consecutive crew days in the Gantt chart</span>
        </label>
      </div>
      <div className="note-grid">{svtBox('schedulingNotes', 'Scheduling notes', 2)}</div>

      <div className="install-subhead">Homeowner actions</div>
      <div className="install-row">
        <div className="field tick-field">
          What the homeowner needs to do before the crew arrives
          <div className="service-ticks">
            {HO_ACTIONS.map((a) =>
              tick(a, a, (s.hoActions ?? []).includes(a), () => setSvt({ hoActions: toggleIn(s.hoActions, a) })),
            )}
          </div>
        </div>
      </div>
      <div className="install-row">
        <label className="field" style={{ flex: '1 1 320px' }}>
          Something else
          <input
            type="text"
            value={s.hoActionsOther ?? ''}
            placeholder="e.g. unlock the side gate"
            onChange={(e) => setSvt({ hoActionsOther: e.target.value || undefined })}
          />
          <span className="field-hint">Joins the list above</span>
        </label>
      </div>

      <div className="install-subhead">Not covered here</div>
      <div className="install-row">
        <div className="field tick-field">
          Questions this note does not answer
          <div className="service-ticks">
            {NOT_REVIEWED.map((x) =>
              tick(`nr-${x.key}`, x.key, (s.notReviewed ?? []).includes(x.key), () =>
                setSvt({ notReviewed: toggleIn(s.notReviewed, x.key) }),
              ),
            )}
          </div>
          <span className="field-hint">Panel fit and production range point at the PR team</span>
        </div>
      </div>

      <div className="install-subhead">The ask</div>
      <div className="install-row">
        <label className="field">
          How this post closes
          <select
            value={s.ask ?? ''}
            onChange={(e) => setSvt({ ask: (e.target.value || undefined) as SvtAsk | undefined })}
          >
            <option value="">—</option>
            <option value="goodToGo">Good to go</option>
            <option value="hoConfirm">Needs HO confirmation</option>
            <option value="hoConvince">Needs HO convincing</option>
            <option value="blocked">Blocked — info needed</option>
          </select>
          <span className="field-hint">Writes the closing line only — the board sub-status stays yours to set</span>
        </label>
        {s.ask === 'blocked' && (
          <label className="field" style={{ flex: '1 1 280px' }}>
            What do we need?
            <input
              type="text"
              value={s.blockedOn ?? ''}
              placeholder="e.g. confirmation of 2 vs 3 battery stacks sold"
              onChange={(e) => setSvt({ blockedOn: e.target.value || undefined })}
            />
          </label>
        )}
      </div>

      {actions}
    </div>
  );
}
