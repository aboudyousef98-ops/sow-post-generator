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
import { SVT_PATHS } from '../lib/svtPost';
import { useEffect, useState } from 'react';
import type {
  InstallNotes,
  InstallTextField,
  Orientation,
  PolishKey,
  PostRecord,
  RoofMaterial,
  ServiceWork,
  Settings,
  SvtNotes,
  SvtTextField,
} from '../types';
import NoteBox from './NoteBox';

/** Tri-state mapping shared with InstallNotesCard: '' is "not answered yet". */
const yesNoValue = (v: boolean | undefined) => (v === undefined ? '' : v ? 'yes' : 'no');
const yesNoParse = (v: string) => (v === '' ? undefined : v === 'yes');

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
}: Props) {
  const n = record.installNotes ?? emptyInstallNotes();
  const s: SvtNotes = record.svt ?? {};

  const setNotes = (patch: Partial<InstallNotes>) =>
    update((r) => ({ ...r, installNotes: { ...(r.installNotes ?? emptyInstallNotes()), ...patch } }));

  const setSvt = (patch: Partial<SvtNotes>) => update((r) => ({ ...r, svt: { ...r.svt, ...patch } }));

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

  const removeAlt = (slot: 1 | 2) => {
    if (slot === 1) setSvt({ alt1Location: undefined, alt1Reason: undefined });
    else setSvt({ alt2Location: undefined, alt2Reason: undefined });
    setExtraAlts(slot - 1);
  };

  return (
    <div className="card">
      <h3>Pre-design analysis</h3>

      <div className="install-subhead">Battery location</div>
      <div className="note-grid">{installBox('batteryLocation', 'Battery location (SOW preferred)', 1)}</div>
      <div className="install-row">
        <label className="field">
          HO agrees with the proposed location?
          <select value={yesNoValue(s.hoAgrees)} onChange={(e) => setSvt({ hoAgrees: yesNoParse(e.target.value) })}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <span className="field-hint">No → prints the HO’s preferred location and why it does not work</span>
        </label>
      </div>
      {s.hoAgrees === false && (
        <div className="note-grid">
          {svtBox('hoLocation', 'HO preferred location', 1)}
          {svtBox('hoReason', 'Why it does not work', 2)}
        </div>
      )}
      {altCount >= 1 && (
        <div className="svt-alt">
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
        <div className="svt-alt">
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
            {SVT_PATHS.map((p) => (
              <label key={p.field} className="service-tick">
                <input
                  type="checkbox"
                  checked={s[p.field] ?? false}
                  onChange={(e) => setSvt({ [p.field]: e.target.checked || undefined })}
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="note-grid">{svtBox('pathNotes', 'Path notes', 2)}</div>

      <div className="install-subhead">Electrical upgrades &amp; site facts</div>
      <div className="install-row">
        <div className="field">
          Service equipment
          <div className="service-ticks">
            {SERVICE_WORK.map((w) => (
              <label key={w} className="service-tick">
                <input
                  type="checkbox"
                  checked={servicesOf(n).includes(w)}
                  onChange={() => {
                    const cur = servicesOf(n);
                    const next: ServiceWork[] = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w];
                    setNotes({ services: next, service: undefined });
                  }}
                />
                {w}
              </label>
            ))}
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

      <div className="install-subhead">Special</div>
      <div className="note-grid">{installBox('specialCases', 'Anything special about this project?', 3)}</div>
      <div className="install-row">
        <div className="field">
          Scheduling
          <div className="service-ticks">
            <label className="service-tick">
              <input
                type="checkbox"
                checked={s.twoDay ?? false}
                onChange={(e) => setSvt({ twoDay: e.target.checked || undefined })}
              />
              Two-day job
            </label>
          </div>
          <span className="field-hint">CLR books two consecutive crew days in the GANTT</span>
        </div>
      </div>
    </div>
  );
}
