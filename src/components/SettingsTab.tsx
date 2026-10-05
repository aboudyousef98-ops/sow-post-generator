// Admin › Settings — v2 layout from the Claude Design handoff
// ("SOW Tool - Desktop Settings v2.dc.html", 2026-10-06). Same Settings shape,
// new skin: sticky section nav, roster avatar chips with inline add (Enter
// commits, × removes with Undo), region-lead pill pickers drawn from
// fixedTags ∪ authors ∪ designers, live Slack phrase preview, and Data rows
// with a two-step inline "Clear all" confirm.

import { useRef, useState } from 'react';
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
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
}

type RosterKey = 'authors' | 'fixedTags' | 'designers' | 'clrAgents' | 'projectManagers';

const ROSTERS: [RosterKey, string, string][] = [
  ['authors', 'Authors (Posting as)', 'Everyone who can sign in and post. Also the SOW coordinator list on the Board.'],
  ['fixedTags', 'Fixed tags', 'Tagged on every post, before the region lead.'],
  ['designers', 'Designers / installers', 'The Designer / Installer dropdown in Compose.'],
  ['clrAgents', 'CLR agents', 'The CLR Agent dropdown in Compose.'],
  ['projectManagers', 'Project managers', 'The Project Manager dropdown in Compose.'],
];

const PHRASES: [keyof Settings['defaults'], string][] = [
  ['siteSurvey', 'Site Survey Feedback'],
  ['design', 'Design Feedback'],
  ['homeowner', 'Homeowner Feedback'],
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function SettingsTab({ settings, setSettings, records, setRecords, ahjs, setAhjs, toast }: Props) {
  const importInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<RosterKey | null>(null);
  const [input, setInput] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const patch = (p: Partial<Settings>) => {
    setSettings({ ...settings, ...p });
    setSavedAt(new Date());
  };

  const commitAdd = (key: RosterKey) => {
    const v = input.trim();
    if (!v) {
      setAdding(null);
      setInput('');
      return;
    }
    if (settings[key].some((n) => n.toLowerCase() === v.toLowerCase())) {
      toast(`${v} is already on the list.`);
      return;
    }
    patch({ [key]: [...settings[key], v] } as Partial<Settings>);
    setInput('');
  };

  const removeName = (key: RosterKey, label: string, name: string) => {
    const snapshot = settings[key];
    patch({ [key]: snapshot.filter((n) => n !== name) } as Partial<Settings>);
    toast(`Removed ${name} from ${label}.`, {
      label: 'Undo',
      fn: () => setSettings({ ...settings, [key]: snapshot }),
    });
  };

  const leadPool = [...new Set([...settings.fixedTags, ...settings.authors, ...settings.designers])];
  const liveCount = records.filter((r) => !r.deletedAt).length;

  const savedLine = savedAt
    ? `Saved · ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · synced to the team`
    : 'All changes saved';

  const navItems: [string, string, string][] = [
    ['sv2-rosters', 'Rosters', String(ROSTERS.reduce((n, [k]) => n + settings[k].length, 0))],
    ['sv2-leads', 'Region leads', String(Object.values(settings.regionLead).filter(Boolean).length)],
    ['sv2-phrases', 'Default phrases', String(PHRASES.length)],
    ['sv2-data', 'Data', ''],
  ];

  return (
    <div className="settings-page sv2">
      <div className="sv2-head">
        <h1>Settings</h1>
        <span className="sv2-subtitle">Changes save instantly and sync to the whole team</span>
        <span className="sv2-spacer" />
        <span className="sv2-saved">{savedLine}</span>
      </div>

      <div className="sv2-grid">
        <aside className="sv2-nav">
          {navItems.map(([id, label, count]) => (
            <a key={id} href={`#${id}`}>
              <span>{label}</span>
              {count && <span className="sv2-nav-count">{count}</span>}
            </a>
          ))}
          <div className="sv2-nav-hint">
            Rosters feed the Compose dropdowns and the tag line of every post. Region leads are tagged
            automatically.
          </div>
        </aside>

        <div className="sv2-sections">
          <section id="sv2-rosters" className="sv2-card">
            <div className="sv2-card-head">
              <h3>Rosters</h3>
              <span>Who can post, who always gets tagged, who shows up in Compose.</span>
            </div>
            {ROSTERS.map(([key, label, hint]) => (
              <div key={key} className="sv2-roster-row">
                <div>
                  <div className="sv2-roster-label">{label}</div>
                  <div className="sv2-roster-hint">{hint}</div>
                </div>
                <div className="sv2-roster-chips">
                  <div className="sv2-chip-wrap">
                    {settings[key].map((name) => (
                      <span key={name} className="sv2-chip">
                        <span className="sv2-chip-avatar">{initials(name)}</span>
                        {name}
                        <button
                          aria-label="Remove"
                          title="Remove"
                          onClick={() => removeName(key, label, name)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {adding === key ? (
                      <input
                        type="text"
                        autoFocus
                        placeholder="Full name, Enter to add"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitAdd(key);
                          if (e.key === 'Escape') {
                            setAdding(null);
                            setInput('');
                          }
                        }}
                        onBlur={() => commitAdd(key)}
                      />
                    ) : (
                      <button
                        className="sv2-add"
                        onClick={() => {
                          setAdding(key);
                          setInput('');
                        }}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  {settings[key].length === 0 && (
                    <div className="sv2-empty-warn">Empty — this dropdown will only offer “none” in Compose.</div>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section id="sv2-leads" className="sv2-card">
            <div className="sv2-card-head">
              <h3>Region leads</h3>
              <span>Tagged automatically on every post in their region — “Near HOU” projects count as HOU.</span>
            </div>
            <div className="sv2-leads">
              {(['HOU', 'DFW'] as Region[]).map((region) => {
                const v = settings.regionLead[region] ?? '';
                const pick = (name: string | null) =>
                  patch({ regionLead: { ...settings.regionLead, [region]: name } });
                return (
                  <div key={region} className="sv2-lead">
                    <span className="sv2-lead-region">{region}</span>
                    <span className="sv2-lead-avatar" style={{ background: v ? '#043d4f' : '#c9d3d6' }}>
                      {v ? initials(v) : '—'}
                    </span>
                    <div className="sv2-lead-pills">
                      {leadPool.map((name) => (
                        <button
                          key={name}
                          className={v === name ? 'on' : ''}
                          onClick={() => pick(name)}
                        >
                          {name}
                        </button>
                      ))}
                      <button className={`none ${!v ? 'on' : ''}`} onClick={() => pick(null)}>
                        No lead
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="sv2-card-foot">
              Pick from fixed tags, authors and designers. Add someone to a roster first if they're missing here.
            </div>
          </section>

          <section id="sv2-phrases" className="sv2-card">
            <div className="sv2-card-head">
              <h3>Default phrases</h3>
              <span>Printed when a feedback box is left empty.</span>
            </div>
            <div className="sv2-phrases">
              <div className="sv2-phrase-inputs">
                {PHRASES.map(([key, label]) => (
                  <label key={key}>
                    {label} <span className="sv2-arrow">empty →</span>
                    <input
                      type="text"
                      value={settings.defaults[key]}
                      onChange={(e) => patch({ defaults: { ...settings.defaults, [key]: e.target.value } })}
                    />
                  </label>
                ))}
                <div>
                  <button
                    className="sv2-btn"
                    onClick={() => {
                      patch({ defaults: defaultSettings().defaults });
                      toast('Phrases reset.');
                    }}
                  >
                    Reset phrases
                  </button>
                </div>
              </div>
              <div className="sv2-preview">
                <div className="sv2-preview-title">How it reads in Slack</div>
                <div className="sv2-preview-box">
                  {PHRASES.map(([key, label]) => (
                    <div key={key}>
                      • <strong>{label}:</strong> {settings.defaults[key]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="sv2-data" className="sv2-card">
            <div className="sv2-card-head">
              <h3>Data</h3>
              <span>History and AHJ boards sync to the team automatically. JSON is an offline backup.</span>
            </div>
            <div className="sv2-data-row">
              <div>
                <div className="sv2-data-label">Export all</div>
                <div className="sv2-data-hint">Records, AHJ boards and these settings as one JSON file.</div>
              </div>
              <button className="sv2-btn" onClick={() => downloadExport(settings, records, ahjs)}>
                Export
              </button>
            </div>
            <div className="sv2-data-row">
              <div>
                <div className="sv2-data-label">Import</div>
                <div className="sv2-data-hint">
                  Merge a teammate's backup — newer edits win, nothing is overwritten blindly.
                </div>
              </div>
              <button className="sv2-btn" onClick={() => importInput.current?.click()}>
                Choose file…
              </button>
            </div>
            <div className="sv2-data-row">
              <div>
                <div className="sv2-data-label">Reset settings to defaults</div>
                <div className="sv2-data-hint">
                  Rosters, leads and phrases go back to the seeded values. Records are untouched.
                </div>
              </div>
              <button
                className="sv2-btn"
                onClick={() => {
                  const snapshot = settings;
                  const d = defaultSettings();
                  setSettings({ ...d, lastAuthor: settings.lastAuthor });
                  setSavedAt(new Date());
                  toast('Settings reset to defaults.', { label: 'Undo', fn: () => setSettings(snapshot) });
                }}
              >
                Reset
              </button>
            </div>
            <div className="sv2-data-row sv2-danger-row">
              <div>
                <div className="sv2-data-label danger">Clear all records</div>
                <div className="sv2-data-hint">
                  Tombstones every draft and posted record for the <b>whole team</b>. AHJ boards stay.
                </div>
              </div>
              {!clearArmed ? (
                <button className="sv2-btn danger" onClick={() => setClearArmed(true)}>
                  Clear all…
                </button>
              ) : (
                <>
                  <span className="sv2-armed">
                    Really clear <b>{liveCount}</b> records for everyone?
                  </span>
                  <button className="sv2-btn" onClick={() => setClearArmed(false)}>
                    Cancel
                  </button>
                  <button
                    className="sv2-btn danger-solid"
                    onClick={() => {
                      // Tombstone instead of hard-delete so the clear also syncs
                      // to the shared team history (otherwise records resurrect).
                      const now = new Date().toISOString();
                      setRecords(records.map((r) => ({ ...r, deletedAt: now, updatedAt: now })));
                      setClearArmed(false);
                      toast('All records cleared (for the whole team).');
                    }}
                  >
                    Yes, clear
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
          </section>
        </div>
      </div>
    </div>
  );
}
