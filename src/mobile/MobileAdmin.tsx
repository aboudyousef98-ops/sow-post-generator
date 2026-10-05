// Mobile Admin (iPhone design handoff 2026-10-06): segmented Settings / Users
// / Daily Progress. Settings is grouped iOS-style lists whose rows open
// bottom-sheet editors (roster chips + add, region-lead picker, phrase input);
// Data rows reuse the same handlers as desktop Settings v2. Users and Daily
// Progress embed the existing components — same logic, mobile CSS.

import { useRef, useState } from 'react';
import type { BoardState } from '../board/types';
import type { Ahj, PostRecord, Region, Session, Settings } from '../types';
import DailyProgressTab from '../components/DailyProgressTab';
import UsersTab from '../components/UsersTab';
import { downloadExport, readImportFile } from '../lib/dataio';
import { defaultSettings } from '../lib/storage';
import BottomSheet from './BottomSheet';

interface Props {
  session: Session;
  onLogout: () => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  records: PostRecord[];
  setRecords: (r: PostRecord[]) => void;
  ahjs: Ahj[];
  setAhjs: (a: Ahj[]) => void;
  board: BoardState;
  syncOk: boolean;
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
}

type RosterKey = 'authors' | 'fixedTags' | 'designers' | 'clrAgents' | 'projectManagers';

const ROSTERS: [RosterKey, string, string][] = [
  ['authors', 'Authors (Posting as)', 'Everyone who can sign in and post.'],
  ['fixedTags', 'Fixed tags', 'Tagged on every post, no matter the region.'],
  ['designers', 'Designers / installers', 'The Designer / Installer dropdown in Compose.'],
  ['clrAgents', 'CLR agents', 'The CLR Agent dropdown in Compose.'],
  ['projectManagers', 'Project managers', 'The Project Manager dropdown in Compose.'],
];

const PHRASES: [keyof Settings['defaults'], string][] = [
  ['siteSurvey', 'Site Survey Feedback'],
  ['design', 'Design Feedback'],
  ['homeowner', 'Homeowner Feedback'],
];

type Sheet =
  | { kind: 'roster'; key: RosterKey; label: string; hint: string }
  | { kind: 'lead'; region: Region }
  | { kind: 'phrase'; key: keyof Settings['defaults']; label: string };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export default function MobileAdmin({
  session,
  onLogout,
  settings,
  setSettings,
  records,
  setRecords,
  ahjs,
  setAhjs,
  board,
  syncOk,
  toast,
}: Props) {
  const [seg, setSeg] = useState<'settings' | 'users' | 'progress'>('settings');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [rosterInput, setRosterInput] = useState('');
  const [phraseInput, setPhraseInput] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const close = () => setSheet(null);
  const leadPool = [...new Set([...settings.fixedTags, ...settings.authors, ...settings.designers])];
  const liveCount = records.filter((r) => !r.deletedAt).length;

  const rosterAdd = () => {
    if (sheet?.kind !== 'roster') return;
    const v = rosterInput.trim();
    if (!v) return;
    if (settings[sheet.key].some((n) => n.toLowerCase() === v.toLowerCase())) {
      toast(`${v} is already on the list.`);
      return;
    }
    setSettings({ ...settings, [sheet.key]: [...settings[sheet.key], v] });
    setRosterInput('');
  };

  return (
    <div className="m-screen">
      <header className="m-head">
        <div className="m-head-row">
          <h1>Admin</h1>
          <span className="m-spacer" />
          <button className="m-chip" onClick={onLogout}>
            Log out
          </button>
        </div>
        <div className="m-segment">
          <button className={seg === 'settings' ? 'on' : ''} onClick={() => setSeg('settings')}>
            Settings
          </button>
          <button className={seg === 'users' ? 'on' : ''} onClick={() => setSeg('users')}>
            Users
          </button>
          <button className={seg === 'progress' ? 'on' : ''} onClick={() => setSeg('progress')}>
            Daily Progress
          </button>
        </div>
      </header>

      <div className="m-list-scroll">
        {seg === 'settings' && (
          <>
            <div className="m-card m-pad m-me-card">
              <span className="m-avatar big">{initials(session.displayName)}</span>
              <div className="m-me-main">
                <div className="m-me-name">{session.displayName}</div>
                <div className="m-me-sub">
                  @{session.username} · {session.role} · posting as you
                </div>
              </div>
              <span className={`m-sync-pill ${syncOk ? '' : 'off'}`}>
                <span className="m-sync-dot" />
                {syncOk ? 'Synced' : 'Local'}
              </span>
            </div>

            <div className="m-section-label">Rosters</div>
            <div className="m-card">
              {ROSTERS.map(([key, label, hint]) => (
                <button
                  key={key}
                  className="m-admin-row"
                  onClick={() => {
                    setSheet({ kind: 'roster', key, label, hint });
                    setRosterInput('');
                  }}
                >
                  <span className="m-admin-main">
                    <span className="m-admin-label">{label}</span>
                    <span className="m-admin-preview">
                      {settings[key].length ? settings[key].join(', ') : 'Nobody yet'}
                    </span>
                  </span>
                  <span className="m-ahj-count">{settings[key].length}</span>
                  <span className="m-chev">›</span>
                </button>
              ))}
            </div>

            <div className="m-section-label">Region leads</div>
            <div className="m-card">
              {(['HOU', 'DFW'] as Region[]).map((region) => {
                const v = settings.regionLead[region];
                return (
                  <button key={region} className="m-admin-row" onClick={() => setSheet({ kind: 'lead', region })}>
                    <span className="m-admin-label grow">
                      {region === 'HOU' ? 'Houston (HOU)' : 'Dallas–Fort Worth (DFW)'}
                    </span>
                    <span className="m-lead-value">
                      <span className="m-avatar tiny" style={{ background: v ? '#043d4f' : '#c9d3d6' }}>
                        {v ? initials(v) : '—'}
                      </span>
                      <span className={v ? '' : 'm-cell-muted'}>{v || 'None'}</span>
                    </span>
                    <span className="m-chev">›</span>
                  </button>
                );
              })}
            </div>

            <div className="m-section-label">Default phrases</div>
            <div className="m-card">
              {PHRASES.map(([key, label]) => (
                <button
                  key={key}
                  className="m-admin-row"
                  onClick={() => {
                    setSheet({ kind: 'phrase', key, label });
                    setPhraseInput(settings.defaults[key]);
                  }}
                >
                  <span className="m-admin-label grow">{label}</span>
                  <span className="m-phrase-value">“{settings.defaults[key]}”</span>
                  <span className="m-chev">›</span>
                </button>
              ))}
            </div>

            <div className="m-section-label">Data</div>
            <div className="m-card">
              <button className="m-admin-row" onClick={() => downloadExport(settings, records, ahjs)}>
                <span className="m-admin-main">
                  <span className="m-admin-label">Export all</span>
                  <span className="m-admin-preview">JSON backup · records, AHJs, settings</span>
                </span>
                <span className="m-chev">›</span>
              </button>
              <button className="m-admin-row" onClick={() => importInput.current?.click()}>
                <span className="m-admin-main">
                  <span className="m-admin-label">Import</span>
                  <span className="m-admin-preview">Merge a teammate's backup into this phone</span>
                </span>
                <span className="m-chev">›</span>
              </button>
              <button
                className="m-admin-row"
                onClick={() => {
                  const snapshot = settings;
                  setSettings({ ...defaultSettings(), lastAuthor: settings.lastAuthor });
                  toast('Settings reset to defaults.', { label: 'Undo', fn: () => setSettings(snapshot) });
                }}
              >
                <span className="m-admin-label grow">Reset settings to defaults</span>
              </button>
              {!clearArmed ? (
                <button className="m-admin-row" onClick={() => setClearArmed(true)}>
                  <span className="m-admin-label grow danger">Clear all records…</span>
                  <span className="m-admin-preview">whole team</span>
                </button>
              ) : (
                <div className="m-admin-row m-clear-armed">
                  <span className="m-admin-label grow danger">
                    Really clear <b>{liveCount}</b> records for everyone?
                  </span>
                  <button className="m-chip" onClick={() => setClearArmed(false)}>
                    Cancel
                  </button>
                  <button
                    className="m-chip danger"
                    onClick={() => {
                      const now = new Date().toISOString();
                      setRecords(records.map((r) => ({ ...r, deletedAt: now, updatedAt: now })));
                      setClearArmed(false);
                      toast('All records cleared (for the whole team).');
                    }}
                  >
                    Yes, clear
                  </button>
                </div>
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
          </>
        )}

        {seg === 'users' && <UsersTab session={session} toast={(t) => toast(t)} />}
        {seg === 'progress' && <DailyProgressTab board={board} records={records} toast={(t) => toast(t)} />}
      </div>

      {sheet?.kind === 'roster' && (
        <BottomSheet title={sheet.label} onClose={close}>
          <div className="m-roster-chips">
            {settings[sheet.key].map((name) => (
              <span key={name} className="m-roster-chip">
                {name}
                <button
                  aria-label="Remove"
                  onClick={() => {
                    const snapshot = settings[sheet.key];
                    setSettings({ ...settings, [sheet.key]: snapshot.filter((n) => n !== name) });
                    toast(`Removed ${name} from ${sheet.label}.`, {
                      label: 'Undo',
                      fn: () => setSettings({ ...settings, [sheet.key]: snapshot }),
                    });
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {settings[sheet.key].length === 0 && <span className="m-roster-empty">Nobody yet — add a name below.</span>}
          </div>
          <div className="m-roster-add">
            <input
              type="text"
              placeholder="Add a name"
              value={rosterInput}
              onChange={(e) => setRosterInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rosterAdd();
              }}
            />
            <button className="m-btn-orange small" disabled={!rosterInput.trim()} onClick={rosterAdd}>
              Add
            </button>
          </div>
          <p className="m-sheet-hint left">{sheet.hint} Changes sync to the team.</p>
        </BottomSheet>
      )}

      {sheet?.kind === 'lead' && (
        <BottomSheet title={`Region lead — ${sheet.region}`} onClose={close}>
          <div className="m-sheet-list">
            {leadPool.map((name) => (
              <button
                key={name}
                className={`m-sheet-item ${settings.regionLead[sheet.region] === name ? 'current' : ''}`}
                onClick={() => {
                  setSettings({ ...settings, regionLead: { ...settings.regionLead, [sheet.region]: name } });
                  close();
                }}
              >
                <span className="m-avatar tiny">{initials(name)}</span>
                <span className="m-sheet-item-label">{name}</span>
                {settings.regionLead[sheet.region] === name && <span className="m-tick">✓</span>}
              </button>
            ))}
            <button
              className="m-sheet-item muted"
              onClick={() => {
                setSettings({ ...settings, regionLead: { ...settings.regionLead, [sheet.region]: null } });
                close();
              }}
            >
              No lead for this region
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === 'phrase' && (
        <BottomSheet title={`${sheet.label} (empty →)`} onClose={close}>
          <input
            type="text"
            className="m-phrase-input"
            aria-label={sheet.label}
            value={phraseInput}
            onChange={(e) => setPhraseInput(e.target.value)}
          />
          <p className="m-sheet-hint left">
            Preview: <span className="m-phrase-preview">• <strong>{sheet.label}:</strong> {phraseInput}</span>
          </p>
          <button
            className="m-btn-orange full"
            onClick={() => {
              const v = phraseInput.trim();
              if (!v) {
                toast('A default phrase can’t be empty.');
                return;
              }
              setSettings({ ...settings, defaults: { ...settings.defaults, [sheet.key]: v } });
              close();
              toast('Saved.');
            }}
          >
            Save
          </button>
        </BottomSheet>
      )}
    </div>
  );
}
