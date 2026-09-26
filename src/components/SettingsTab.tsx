import { useRef, useState } from 'react';
import { downloadExport, readImportFile } from '../lib/dataio';
import { defaultSettings } from '../lib/storage';
import type { PostRecord, Region, Settings } from '../types';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  records: PostRecord[];
  setRecords: (r: PostRecord[]) => void;
  toast: (text: string) => void;
}

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
  return (
    <label className="field">
      {label} <span className="badge">one per line</span>
      <textarea
        value={values.join('\n')}
        rows={Math.max(3, values.length + 1)}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
      />
    </label>
  );
}

export default function SettingsTab({ settings, setSettings, records, setRecords, toast }: Props) {
  const importInput = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const patch = (p: Partial<Settings>) => setSettings({ ...settings, ...p });

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card">
        <h3>Rosters</h3>
        <LinesEditor label="Authors (Posting as)" values={settings.authors} onChange={(v) => patch({ authors: v })} />
        <LinesEditor label="Fixed tags" values={settings.fixedTags} onChange={(v) => patch({ fixedTags: v })} />
        <LinesEditor label="Designers / installers" values={settings.designers} onChange={(v) => patch({ designers: v })} />
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

      <div className="card">
        <h3>Default phrases</h3>
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

      <div className="card">
        <h3>Data</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn secondary" onClick={() => downloadExport(settings, records)}>
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
              void readImportFile(f, records, true)
                .then((result) => {
                  setRecords(result.records);
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
    </div>
  );
}
