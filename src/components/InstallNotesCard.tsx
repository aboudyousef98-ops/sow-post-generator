// Installation Notes card (Phase 7, spec/10 §6). Dropdowns for the facts that
// recur on every project, labelled boxes for the four conduit runs, and two
// free-text boxes. What is in these fields is exactly what the post prints —
// there is no intermediate editable note.

import { isoToUs } from '../lib/dates';
import {
  disconnectDurationFor,
  DURATION_WORD,
  emptyInstallNotes,
  INSTALL_TEXT_FIELDS,
  needsRoofConduitRework,
  ORIENTATIONS,
  ROOF_CONDUIT_REWORK,
  ROOF_MATERIALS,
  roofBand,
  roofMaterialLabel,
  SERVICE_WORK,
  servicesOf,
} from '../lib/installNotes';
import type {
  InstallNotes,
  Orientation,
  PolishKey,
  PostRecord,
  RoofMaterial,
  RoofRating,
  ServiceWork,
  Settings,
} from '../types';
import NoteBox from './NoteBox';

/** 10 → 1, labelled with the Roof Rating System band names. */
const ROOF_OPTIONS: RoofRating[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

interface Props {
  record: PostRecord;
  settings: Settings;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  dropped: Partial<Record<PolishKey, string[]>>;
  drift: Partial<Record<PolishKey, { from: number; to: number }>>;
  onToggle: (key: PolishKey, usePolished: boolean) => void;
  /** Editing a box clears its stale AI-guard hints, mirroring ComposeTab.setNote. */
  onClearDropped: (key: PolishKey) => void;
  onClearDrift: (key: PolishKey) => void;
}

const RUN_FIELDS = ['loadRun', 'serviceRun', 'solarRun', 'batteryRun'] as const;

export default function InstallNotesCard({
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

  const setNotes = (patch: Partial<InstallNotes>) =>
    update((r) => ({ ...r, installNotes: { ...(r.installNotes ?? emptyInstallNotes()), ...patch } }));

  /** Editing a box invalidates that box's stale polished version and guard hints. */
  const setText = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], key: PolishKey, value: string) => {
    onClearDropped(key);
    onClearDrift(key);
    update((r) => {
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return {
        ...r,
        installNotes: { ...(r.installNotes ?? emptyInstallNotes()), [field]: value },
        polished,
      };
    });
  };

  /** A chip click also invalidates that box's stale polished version — it changes the raw text. */
  const appendChip = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], key: PolishKey, phrase: string) => {
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

  /**
   * Reducing the wall count truncates orientations; increasing appends blanks.
   * Returning to "—" (walls undefined) keeps whatever orientations were chosen
   * — they're sliced to `walls` everywhere they're read, so nothing leaks into
   * the post, and re-picking a count doesn't lose prior choices (mirrors
   * storiesOther's preservation below).
   */
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

  const box = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], rows = 2) => {
    const def = INSTALL_TEXT_FIELDS.find((f) => f.field === field)!;
    return (
      <NoteBox
        key={def.key}
        label={def.label}
        polishKey={def.key}
        value={n[field] ?? ''}
        rows={rows}
        onChange={(v) => setText(field, def.key, v)}
        onKeyDown={onKeyDown}
        chips={settings.chips[def.key]}
        onChip={(phrase) => appendChip(field, def.key, phrase)}
        polished={record.polished?.[def.key]}
        usePolished={record.usePolished[def.key] !== false}
        onToggle={(use) => onToggle(def.key, use)}
        dropped={dropped[def.key]}
        drift={drift[def.key]}
        mode={record.polishMode?.[def.key]}
      />
    );
  };

  return (
    <div className="card">
      <h3>Installation Notes</h3>

      <div className="install-row">
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
        <div className="field">
          Service equipment
          <div className="service-ticks">
            {SERVICE_WORK.map((s) => (
              <label key={s} className="service-tick">
                <input
                  type="checkbox"
                  checked={servicesOf(n).includes(s)}
                  onChange={() => {
                    // Base the toggle on servicesOf() so a legacy single pick
                    // shows up ticked; clearing `service` here retires the
                    // deprecated field the first time the ticks are touched.
                    const cur = servicesOf(n);
                    const next: ServiceWork[] = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
                    setNotes({ services: next, service: undefined });
                  }}
                />
                {s}
              </label>
            ))}
          </div>
        </div>
        {/* SF "Panel Facing Front of House" checkbox (Aboud 2026-10-22).
            Unticked = No, matching the SF default. */}
        <div className="field">
          Panel facing
          <div className="service-ticks">
            <label className="service-tick">
              <input
                type="checkbox"
                checked={n.panelFacesFront ?? false}
                onChange={(e) => setNotes({ panelFacesFront: e.target.checked || undefined })}
              />
              Front of house
            </label>
          </div>
        </div>
      </div>

      <div className="install-row install-row-even">
        <label className="field">
          Roof rating
          <select
            value={n.roofRating ?? ''}
            onChange={(e) =>
              setNotes({ roofRating: e.target.value ? (Number(e.target.value) as RoofRating) : undefined })
            }
          >
            <option value="">—</option>
            {ROOF_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} — {roofBand(r).name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Roof material
          <select
            value={n.roofMaterial ?? ''}
            onChange={(e) =>
              setNotes({ roofMaterial: (e.target.value || undefined) as RoofMaterial | undefined })
            }
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
        {/* Defaults to Automatic (follows the ticks/utility); picking a value
            pins it (revision 2026-10-05: "if needed we change"). */}
        <label className="field">
          Power disconnect duration
          <select
            value={n.disconnectDuration ?? ''}
            onChange={(e) =>
              setNotes({ disconnectDuration: (e.target.value || undefined) as '1-2' | '4-6' | undefined })
            }
          >
            <option value="">
              Automatic — {DURATION_WORD[disconnectDurationFor(n, record.sf.utility)]}
            </option>
            <option value="1-2">1–2 hours</option>
            <option value="4-6">4–6 hours</option>
          </select>
          <span className="field-hint">Automatic: MPU/FSU or TNMP utility → 4–6, otherwise 1–2</span>
        </label>
      </div>
      {n.roofRating !== undefined && n.roofRating <= 2 && (
        <p className="roof-warning">
          Roof rated {n.roofRating}/10 (Unviable) — do not install.
        </p>
      )}
      {n.roofRating !== undefined && n.roofRating >= 3 && n.roofRating <= 4 && record.sf.installScheduledDate && (
        <p className="roof-warning">
          Roof rated {n.roofRating}/10 (Poor) and this project already has an installation date (
          {isoToUs(record.sf.installScheduledDate)}) — alert the team.
        </p>
      )}
      {/* Metal / clay-tile conduit rework (Aboud 2026-10-27). Display-only,
          like the aluminum-wiring banner — it is never posted. */}
      {needsRoofConduitRework(n) && (
        <p className="roof-warning">
          <strong>⚠ {roofMaterialLabel(n)} roof:</strong> {ROOF_CONDUIT_REWORK}
        </p>
      )}

      {/* Two-up from here down (Phase 8, Option A). One box per row made the
          form roughly twice as tall as it needed to be.
          (Main disconnect location retired, meeting 2026-10-04.) */}
      <div className="note-grid">{box('batteryLocation', 1)}</div>

      <div className="install-subhead">Conduit raceway</div>
      <div className="note-grid">{RUN_FIELDS.map((f) => box(f, 2))}</div>

      <div className="note-grid">
        {box('specialCases', 3)}
        {box('other', 3)}
      </div>

      {/* Prints as "Concrete pads will be installed …" inside the install
          notes / SF window blob (2026-10-27 audit — moved out of the SF Site
          Modification Notes field). */}
      <div className="note-grid">{box('concretePad', 2)}</div>
    </div>
  );
}
