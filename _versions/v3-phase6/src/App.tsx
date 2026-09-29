import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AhjTab from './components/AhjTab';
import ComposeTab from './components/ComposeTab';
import DraftsTab from './components/DraftsTab';
import HistoryTab from './components/HistoryTab';
import SettingsTab from './components/SettingsTab';
import { Toasts, type Toast } from './components/Toast';
import { fetchSharedAhjs, fetchSharedRecords, health, putSharedAhjs, putSharedRecords } from './lib/api';
import { mergeAhjs } from './lib/ahj';
import { blankRecord, hasContent } from './lib/record';
import {
  loadAhjs,
  loadCurrentId,
  loadRecords,
  loadSettings,
  mergeRecords,
  saveAhjs,
  saveCurrentId,
  saveRecords,
  saveSettings,
} from './lib/storage';
import { buildPostHtml, buildPostText } from './lib/template';
import type { Ahj, PostRecord, Settings } from './types';

type Tab = 'compose' | 'drafts' | 'history' | 'ahj' | 'settings';

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [records, setRecordsState] = useState<PostRecord[]>(() => loadRecords());
  const [ahjs, setAhjsState] = useState<Ahj[]>(() => loadAhjs());
  const [ahjSelectedId, setAhjSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('compose');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [aiStatus, setAiStatus] = useState<'checking' | 'ok' | 'off'>('checking');
  const [syncStatus, setSyncStatus] = useState<'checking' | 'synced' | 'local'>('checking');

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

  // Per-store sync health; the pill is green only when BOTH stores are ok.
  const storeSync = useRef<{ records: boolean; ahjs: boolean }>({ records: false, ahjs: false });
  const reportSync = useCallback((store: 'records' | 'ahjs', ok: boolean) => {
    storeSync.current[store] = ok;
    setSyncStatus(storeSync.current.records && storeSync.current.ahjs ? 'synced' : 'local');
  }, []);

  // A server response is a SNAPSHOT of what we pushed, merged with the store —
  // by the time it arrives the user may have made newer local changes, so it
  // must be MERGED into current state, never assigned over it (otherwise a
  // post/record created while a push is in flight is silently dropped).
  const applyServerRecords = useCallback((server: PostRecord[]) => {
    setRecordsState((cur) => {
      const { records: merged } = mergeRecords(cur, server);
      saveRecords(merged);
      return merged;
    });
  }, []);
  const applyServerAhjs = useCallback((server: Ahj[]) => {
    setAhjsState((cur) => {
      const merged = mergeAhjs(cur, server);
      saveAhjs(merged);
      return merged;
    });
  }, []);

  // Phase 4: every records change is pushed to the shared Netlify Blobs store
  // (debounced). localStorage stays the offline cache; a failed push just
  // flips the pill to "Local only" and the next successful push self-heals.
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setRecords = useCallback((r: PostRecord[]) => {
    setRecordsState(r);
    saveRecords(r);
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      putSharedRecords(r)
        .then((merged) => {
          applyServerRecords(merged);
          reportSync('records', true);
        })
        .catch(() => reportSync('records', false));
    }, 1500);
  }, [applyServerRecords, reportSync]);

  // AHJ boards sync the same way (Phase 5): debounced deep-merge push.
  const ahjPushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setAhjs = useCallback((a: Ahj[]) => {
    setAhjsState(a);
    saveAhjs(a);
    clearTimeout(ahjPushTimer.current);
    ahjPushTimer.current = setTimeout(() => {
      putSharedAhjs(a)
        .then((merged) => {
          applyServerAhjs(merged);
          reportSync('ahjs', true);
        })
        .catch(() => reportSync('ahjs', false));
    }, 1500);
  }, [applyServerAhjs, reportSync]);

  // Initial sync: pull the shared history + AHJ boards, merge (newer updatedAt
  // wins; AHJ posts merge individually), then push so local-only data reaches
  // the team store. "Team synced" only when both stores made the round trip.
  useEffect(() => {
    (async () => {
      const results = await Promise.allSettled([
        (async () => {
          const server = await fetchSharedRecords();
          applyServerRecords(server);
          const final = await putSharedRecords(mergeRecords(loadRecords(), server).records);
          applyServerRecords(final);
        })(),
        (async () => {
          const server = await fetchSharedAhjs();
          applyServerAhjs(server);
          const final = await putSharedAhjs(mergeAhjs(loadAhjs(), server));
          applyServerAhjs(final);
        })(),
      ]);
      reportSync('records', results[0].status === 'fulfilled');
      reportSync('ahjs', results[1].status === 'fulfilled');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const recordsRef = useRef(records);
  recordsRef.current = records;
  const currentRef = useRef(current);
  currentRef.current = current;

  /** Write the Compose record into the draft list immediately (local + queued push). */
  const commitDraft = useCallback(
    (rec: PostRecord) => {
      setRecords([...recordsRef.current.filter((r) => r.id !== rec.id), rec]);
      saveCurrentId(rec.id);
    },
    [setRecords],
  );

  // Autosave the Compose form (debounced 500 ms). A draft now exists the moment
  // ANY field holds content (Aboud, 2026-09-28) — it used to require a customer
  // name, which meant notes typed before the name existed were never saved.
  useEffect(() => {
    if (!hasContent(current)) return;
    const t = setTimeout(() => commitDraft(current), 500);
    return () => clearTimeout(t);
  }, [current, commitDraft]);

  // Last-resort flush: closing the tab inside the 500 ms autosave window would
  // otherwise drop the most recent keystrokes, so write straight to
  // localStorage synchronously. The next load merges it back to the team store.
  useEffect(() => {
    const flush = () => {
      const rec = currentRef.current;
      if (!hasContent(rec)) return;
      saveRecords([...recordsRef.current.filter((r) => r.id !== rec.id), rec]);
      saveCurrentId(rec.id);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

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
    // Force-save before clearing: the 500 ms autosave may not have fired yet,
    // so "New post" must never be able to discard typed work.
    if (hasContent(currentRef.current)) commitDraft(currentRef.current);
    setCurrent(blankRecord(settings.lastAuthor ?? settings.authors[0], settings));
    saveCurrentId(null);
    setTab('compose');
  }, [settings, commitDraft]);

  /** Explicit "Save as Draft" — bypasses the debounce and confirms out loud. */
  const saveDraftNow = useCallback(() => {
    const rec = currentRef.current;
    if (!hasContent(rec)) {
      toast('Nothing to save yet — fill in at least one field.');
      return;
    }
    commitDraft(rec);
    toast('Saved to Drafts.');
  }, [commitDraft, toast]);

  const ahjsRef = useRef(ahjs);
  ahjsRef.current = ahjs;

  /**
   * Freeze a record and move it to History. Works on any draft id, so it can be
   * driven from a Drafts row without opening the draft in Compose first
   * (Aboud, 2026-09-28).
   */
  const markPostedById = useCallback(
    (id: string) => {
      const rec =
        currentRef.current.id === id
          ? currentRef.current
          : recordsRef.current.find((r) => r.id === id && !r.deletedAt);
      if (!rec || rec.status === 'posted') return;
      const now = new Date().toISOString();
      const posted: PostRecord = {
        ...rec,
        status: 'posted',
        finalText: buildPostText(rec, settings, ahjsRef.current),
        finalHtml: buildPostHtml(rec, settings, ahjsRef.current),
        postedAt: now,
        updatedAt: now,
      };
      setRecords([...recordsRef.current.filter((r) => r.id !== posted.id), posted]);
      // Only clear Compose when the record being posted is the one open in it.
      const wasOpen = currentRef.current.id === posted.id;
      if (wasOpen) {
        setCurrent(blankRecord(rec.author, settings));
        saveCurrentId(null);
      }
      toast(`Marked as posted${rec.sf.customerName ? ` — ${rec.sf.customerName}` : ''}.`, {
        label: 'Undo',
        fn: () => {
          const reverted: PostRecord = {
            ...posted,
            status: 'draft',
            postedAt: undefined,
            finalText: undefined,
            finalHtml: undefined,
            updatedAt: new Date().toISOString(),
          };
          setRecords([...recordsRef.current.filter((r) => r.id !== posted.id), reverted]);
          if (wasOpen) {
            setCurrent(reverted);
            saveCurrentId(reverted.id);
            setTab('compose');
          }
        },
      });
    },
    [settings, setRecords, toast],
  );

  const markAsPosted = useCallback(() => markPostedById(currentRef.current.id), [markPostedById]);

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
        finalHtml: undefined,
        createdAt: now,
        updatedAt: now,
      };
      setRecords([...recordsRef.current, copy]);
      toast('Draft duplicated.');
    },
    [setRecords, toast],
  );

  // Delete = tombstone (deletedAt) so the deletion syncs to every browser
  // instead of the record resurrecting on the next merge.
  const deleteRecord = useCallback(
    (id: string) => {
      const rec = recordsRef.current.find((r) => r.id === id);
      if (!rec) return;
      const now = new Date().toISOString();
      setRecords(
        recordsRef.current.map((r) => (r.id === id ? { ...r, deletedAt: now, updatedAt: now } : r)),
      );
      toast('Deleted.', {
        label: 'Undo',
        fn: () => {
          const undoAt = new Date().toISOString();
          setRecords(
            recordsRef.current.map((r) =>
              r.id === id ? { ...r, deletedAt: undefined, updatedAt: undoAt } : r,
            ),
          );
        },
      });
    },
    [setRecords, toast],
  );

  // The current record appears here once it has a customer name (autosave adds it).
  // Tombstoned (deleted) records are hidden everywhere.
  const allDrafts = useMemo(
    () =>
      records
        .filter((r) => r.status === 'draft' && !r.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records],
  );

  const history = useMemo(
    () =>
      records
        .filter((r) => r.status === 'posted' && !r.deletedAt)
        .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '')),
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
              ['ahj', 'AHJ Requirements'],
              ['settings', '⚙ Settings'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <span
          className={`ai-pill ${syncStatus === 'synced' ? 'ok' : 'off'}`}
          title="Shared team history via Netlify. 'Local only' = changes stay in this browser until the connection returns."
        >
          {syncStatus === 'checking' ? 'Sync…' : syncStatus === 'synced' ? 'Team synced' : 'Local only'}
        </span>
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
            onSaveDraft={saveDraftNow}
            toast={toast}
            aiAvailable={aiStatus === 'ok'}
            ahjs={ahjs}
            onOpenAhjBoard={(id) => {
              setAhjSelectedId(id);
              setTab('ahj');
            }}
          />
        )}
        {tab === 'ahj' && (
          <AhjTab
            ahjs={ahjs}
            setAhjs={setAhjs}
            selectedId={ahjSelectedId}
            onSelect={setAhjSelectedId}
            settings={settings}
            setSettings={setSettings}
            toast={toast}
          />
        )}
        {tab === 'drafts' && (
          <DraftsTab
            drafts={allDrafts}
            onOpen={openDraft}
            onDuplicate={duplicateDraft}
            onDelete={deleteRecord}
            onMarkDone={markPostedById}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            history={history}
            settings={settings}
            records={records}
            setRecords={setRecords}
            setSettings={setSettings}
            ahjs={ahjs}
            setAhjs={setAhjs}
            toast={toast}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            settings={settings}
            setSettings={setSettings}
            records={records}
            setRecords={setRecords}
            ahjs={ahjs}
            setAhjs={setAhjs}
            toast={toast}
          />
        )}
      </main>

      <Toasts toasts={toasts} />
    </>
  );
}
