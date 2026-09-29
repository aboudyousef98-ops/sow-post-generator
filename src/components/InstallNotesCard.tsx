// Installation Notes card (Phase 7, spec/10 §6). Dropdowns for the facts that
// recur on every project, labelled boxes for the four conduit runs, and two
// free-text boxes. What is in these fields is exactly what the post prints —
// there is no intermediate editable note.

import { emptyInstallNotes, INSTALL_TEXT_FIELDS, ORIENTATIONS, SERVICE_WORK } from '../lib/installNotes';
import type { InstallNotes, Orientation, PolishKey, PostRecord, ServiceWork, Settings } from '../types';
import NoteBox from './NoteBox';

interface Props {
  record: PostRecord;
  settings: Settings;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  dropped: Partial<Record<PolishKey, string[]>>;
  drift: Partial<Record<PolishKey, { from: number; to: number }>>;
  onToggle: (key: PolishKey, usePolished: boolean) => void;
}

const RUN_FIELDS = ['loadRun', 'serviceRun', 'solarRun', 'batteryRun'] as const;

export default function InstallNotesCard({ record, settings, update, onKeyDown, dropped, drift, onToggle }: Props) {
  const n = record.installNotes ?? emptyInstallNotes();

  const setNotes = (patch: Partial<InstallNotes>) =>
    update((r) => ({ ...r, installNotes: { ...(r.installNotes ?? emptyInstallNotes()), ...patch } }));

  /** Editing a box invalidates that box's stale polished version. */
  const setText = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], key: PolishKey, value: string) =>
    update((r) => {
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return {
        ...r,
        installNotes: { ...(r.installNotes ?? emptyInstallNotes()), [field]: value },
        polished,
      };
    });

  const appendChip = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], phrase: string) =>
    setNotes({ [field]: n[field] ? `${n[field].replace(/\s+$/, '')}\n${phrase}` : phrase } as Partial<InstallNotes>);

  /** Reducing the wall count truncates orientations; increasing appends blanks. */
  const setWalls = (walls: 1 | 2 | 3 | undefined) => {
    const next = walls ? Array.from({ length: walls }, (_, i) => n.orientations[i] ?? '') : [];
    setNotes({ walls, orientations: next });
  };

  const setOrientation = (i: number, value: Orientation | '') => {
    const next = [...n.orientations];
    next[i] = value;
    setNotes({ orientations: next });
  };

  const box = (field: (typeof INSTALL_TEXT_FIELDS)[number]['field'], rows = 2) => {
    const def = INSTALL_TEXT_FIELDS.find((f) => f.field === field)!;
    return (
      <NoteBox
        key={def.key}
        label={def.label}
        polishKey={def.key}
        value={n[field]}
        rows={rows}
        onChange={(v) => setText(field, def.key, v)}
        onKeyDown={onKeyDown}
        chips={settings.chips[def.key]}
        onChip={(phrase) => appendChip(field, phrase)}
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
            onChange={(e) => setWalls(e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined)}
          >
            <option value="">—</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
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
              setNotes({ stories: v === '' ? undefined : v === 'other' ? 'other' : (Number(v) as 1 | 2) });
            }}
          >
            <option value="">—</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
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
          Service equipment
          <select
            value={n.service ?? ''}
            onChange={(e) => setNotes({ service: (e.target.value || undefined) as ServiceWork | undefined })}
          >
            <option value="">—</option>
            {SERVICE_WORK.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {box('batteryLocation', 1)}
      {box('mainDisconnectLocation', 1)}

      <div className="install-subhead">Conduit raceway</div>
      {RUN_FIELDS.map((f) => box(f, 2))}

      {box('specialCases', 3)}
      {box('other', 3)}
    </div>
  );
}
