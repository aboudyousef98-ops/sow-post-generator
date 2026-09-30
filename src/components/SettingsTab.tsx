import { useEffect, useRef, useState } from 'react';
import { downloadExport, readImportFile } from '../lib/dataio';
import { defaultSettings } from '../lib/storage';
import type { Ahj, PostRecord, Region, Settings } from '../types';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  records: PostRecord[];
  setRecords: (r: PostRecord[]) => void;
  ahjs: Ahj[];
  setAhjs: (a: Ahj[]) => void;
  toast: (text: string) => void;
}

const parseLines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);

/** One name per line ↔ string[]. */
function LinesEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  // The textarea shows raw text so Enter / blank lines survive while typing;
  // the parent only ever sees the cleaned list.
  const [text, setText] = useState(values.join('\n'));
  useEffect(() => {
    // Re-sync only on external changes (reset, import) — not our own echoes.
    setText((prev) => (parseLines(prev).join('\n') === values.join('\n') ? prev : values.join('\n')));
  }, [values]);

  return (
    <label className="field">
      {label} <span className="badge">one per line</span>
      <textarea
        value={text}
        rows={Math.max(3, values.length + 1)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseLines(e.target.value));
        }}
      />
    </label>
  );
}

export default function SettingsTab({ settings, setSettings, records, setRecords, ahjs, setAhjs, toast }: Props) {
  const importInput = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const patch = (p: Partial<Settings>) => setSettings({ ...settings, ...p });

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <div className="card settings-card">
      <section className="settings-section">
        <div className="settings-label">
          <div className="section-label">Rosters</div>
          <p>Who can post, who always gets tagged, and who leads each region.</p>
        </div>
        <div className="settings-body settings-grid">
        <LinesEditor label="Authors (Posting as)" values={settings.authors} onChange={(v) => patch({ authors: v })} />
        <LinesEditor label="Fixed tags" values={settings.fixedTags} onChange={(v) => patch({ fixedTags: v })} />
        <LinesEditor label="Designers / installers" values={settings.designers} onChange={(v) => patch({ designers: v })} />
        <div className="settings-stack">
        {(['HOU', 'DFW'] as Region[]).map((region) => (
          <label className="field" key={region}>
            Region lead — {region}
            <input
              type="text"
              value={settings.regionLead[region] ?? ''}
              onChange={(e) =>
                patch({ regionLead: { ...settings.regionLead, [region]: e.target.value.trim() || null } })
              }
            />
          </label>
        ))}
        </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-label">
          <div className="section-label">Default phrases</div>
          <p>Printed when a feedback box is left empty.</p>
        </div>
        <div className="settings-body">
        <div className="settings-grid">
        {(
          [
            ['siteSurvey', 'Site Survey Feedback (empty →)'],
            ['design', 'Design Feedback (empty →)'],
            ['homeowner', 'Homeowner Feedback (empty →)'],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <input
              type="text"
              value={settings.defaults[key]}
              onChange={(e) => patch({ defaults: { ...settings.defaults, [key]: e.target.value } })}
            />
          </label>
        ))}
        </div>
        <p className="muted">
          Quick-insert chips are seeded from the spec defaults; a chip editor is planned for Phase 2.
        </p>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            const d = defaultSettings();
            setSettings({ ...d, lastAuthor: settings.lastAuthor });
            toast('Settings reset to defaults.');
          }}
        >
          Reset to defaults
        </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-label">
          <div className="section-label">Data</div>
          <p>History and AHJ boards sync to the team automatically. JSON is an offline backup.</p>
        </div>
        <div className="settings-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn secondary" onClick={() => downloadExport(settings, records, ahjs)}>
            Export all
          </button>
          <button type="button" className="btn secondary" onClick={() => importInput.current?.click()}>
            Import (records + settings)
          </button>
          {!confirmClear ? (
            <button type="button" className="btn danger" onClick={() => setConfirmClear(true)}>
              Clear all…
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  // Tombstone instead of hard-delete so the clear also syncs
                  // to the shared team history (otherwise records resurrect).
                  const now = new Date().toISOString();
                  setRecords(records.map((r) => ({ ...r, deletedAt: now, updatedAt: now })));
                  setConfirmClear(false);
                  toast('All records cleared (for the whole team).');
                }}
              >
                Really clear ALL records — for the whole team?
              </button>
              <button type="button" className="btn secondary" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
        <input
          ref={importInput}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              void readImportFile(f, records, true, ahjs)
                .then((result) => {
                  setRecords(result.records);
                  setAhjs(result.ahjs);
                  if (result.settings) setSettings(result.settings);
                  toast(result.summary);
                })
                .catch((err: Error) => toast(err.message));
            }
            e.target.value = '';
          }}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          Everything is stored in this browser's localStorage. Export regularly; use Import on a teammate's
          browser to consolidate.
        </p>
        </div>
      </section>
      </div>
    </div>
  );
}
