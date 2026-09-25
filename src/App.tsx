import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ComposeTab from './components/ComposeTab';
import DraftsTab from './components/DraftsTab';
import HistoryTab from './components/HistoryTab';
import SettingsTab from './components/SettingsTab';
import { Toasts, type Toast } from './components/Toast';
import { health } from './lib/api';
import { blankRecord } from './lib/record';
import {
  loadCurrentId,
  loadRecords,
  loadSettings,
  saveCurrentId,
  saveRecords,
  saveSettings,
} from './lib/storage';
import { buildPostText } from './lib/template';
import type { PostRecord, Settings } from './types';

type Tab = 'compose' | 'drafts' | 'history' | 'settings';

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [records, setRecordsState] = useState<PostRecord[]>(() => loadRecords());
  const [tab, setTab] = useState<Tab>('compose');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [aiStatus, setAiStatus] = useState<'checking' | 'ok' | 'off'>('checking');

  const [current, setCurrent] = useState<PostRecord>(() => {
    const stored = loadRecords();
    const id = loadCurrentId();
    const found = id ? stored.find((r) => r.id === id && r.status === 'draft') : undefined;
    return found ?? blankRecord(loadSettings().lastAuthor ?? 'Aboud Yousef', loadSettings());
  });

  // ---- persistence -------------------------------------------------------

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  const setRecords = useCallback((r: PostRecord[]) => {
    setRecordsState(r);
    saveRecords(r);
  }, []);

  // Autosave the Compose form (debounced 500 ms). A draft exists the moment
  // a customer name exists (spec/01 Drafts).
  const recordsRef = useRef(records);
  recordsRef.current = records;
  useEffect(() => {
    if (!current.sf.customerName.trim()) return;
    const t = setTimeout(() => {
      const rest = recordsRef.current.filter((r) => r.id !== current.id);
      setRecords([...rest, current]);
      saveCurrentId(current.id);
    }, 500);
    return () => clearTimeout(t);
  }, [current, setRecords]);

  useEffect(() => {
    health()
      .then((h) => setAiStatus(h.ok && h.hasKey ? 'ok' : 'off'))
      .catch(() => setAiStatus('off'));
  }, []);

  // ---- toasts ------------------------------------------------------------

  const toast = useCallback((text: string, action?: Toast['action']) => {
    const id = crypto.randomUUID();
    setToasts((ts) => [...ts, { id, text, action }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 5000);
  }, []);

  // ---- record lifecycle --------------------------------------------------

  const updateCurrent = useCallback((updater: (r: PostRecord) => PostRecord) => {
    setCurrent((r) => ({ ...updater(r), updatedAt: new Date().toISOString() }));
  }, []);

  const newPost = useCallback(() => {
    // Current work is already in Drafts via autosave.
    setCurrent(blankRecord(settings.lastAuthor ?? settings.authors[0], settings));
    saveCurrentId(null);
    setTab('compose');
  }, [settings]);

  const markAsPosted = useCallback(() => {
    const posted: PostRecord = {
      ...current,
      status: 'posted',
      finalText: buildPostText(current, settings),
      postedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRecords([...recordsRef.current.filter((r) => r.id !== posted.id), posted]);
    const fresh = blankRecord(current.author, settings);
    setCurrent(fresh);
    saveCurrentId(null);
    toast('Marked as posted.', {
      label: 'Undo',
      fn: () => {
        const reverted: PostRecord = { ...posted, status: 'draft', postedAt: undefined, finalText: undefined };
        setRecords([...recordsRef.current.filter((r) => r.id !== posted.id), reverted]);
        setCurrent(reverted);
        saveCurrentId(reverted.id);
        setTab('compose');
      },
    });
  }, [current, settings, setRecords, toast]);

  const openDraft = useCallback(
    (id: string) => {
      const rec = recordsRef.current.find((r) => r.id === id);
      if (!rec) return;
      setCurrent(rec);
      saveCurrentId(id);
      setTab('compose');
    },
    [],
  );

  const duplicateDraft = useCallback(
    (id: string) => {
      const rec = recordsRef.current.find((r) => r.id === id);
      if (!rec) return;
      const now = new Date().toISOString();
      const copy: PostRecord = {
        ...rec,
        id: crypto.randomUUID(),
        status: 'draft',
        postedAt: undefined,
        finalText: undefined,
        createdAt: now,
        updatedAt: now,
      };
      setRecords([...recordsRef.current, copy]);
      toast('Draft duplicated.');
    },
    [setRecords, toast],
  );

  const deleteRecord = useCallback(
    (id: string) => {
      const rec = recordsRef.current.find((r) => r.id === id);
      if (!rec) return;
      setRecords(recordsRef.current.filter((r) => r.id !== id));
      toast('Deleted.', {
        label: 'Undo',
        fn: () => setRecords([...recordsRef.current, rec]),
      });
    },
    [setRecords, toast],
  );

  // The current record appears here once it has a customer name (autosave adds it).
  const allDrafts = useMemo(
    () =>
      records
        .filter((r) => r.status === 'draft')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records],
  );

  const history = useMemo(
    () => records.filter((r) => r.status === 'posted').sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '')),
    [records],
  );

  return (
    <>
      <header className="topbar">
        <img src="/dyn-logo.png" alt="Dynamic EcoHome" />
        <span className="title">SOW Post Generator</span>
        <nav>
          {(
            [
              ['compose', 'Compose'],
              ['drafts', `Drafts (${allDrafts.length})`],
              ['history', `History (${history.length})`],
              ['settings', '⚙ Settings'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <span className={`ai-pill ${aiStatus === 'ok' ? 'ok' : 'off'}`}>
          {aiStatus === 'checking' ? 'AI…' : aiStatus === 'ok' ? 'AI available' : 'AI offline'}
        </span>
      </header>

      <main className="page">
        {tab === 'compose' && (
          <ComposeTab
            record={current}
            settings={settings}
            setSettings={setSettings}
            update={updateCurrent}
            onMarkPosted={markAsPosted}
            onNewPost={newPost}
            toast={toast}
            aiAvailable={aiStatus === 'ok'}
          />
        )}
        {tab === 'drafts' && (
          <DraftsTab drafts={allDrafts} onOpen={openDraft} onDuplicate={duplicateDraft} onDelete={deleteRecord} />
        )}
        {tab === 'history' && (
          <HistoryTab
            history={history}
            settings={settings}
            records={records}
            setRecords={setRecords}
            setSettings={setSettings}
            toast={toast}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            settings={settings}
            setSettings={setSettings}
            records={records}
            setRecords={setRecords}
            toast={toast}
          />
        )}
      </main>

      <Toasts toasts={toasts} />
    </>
  );
}
