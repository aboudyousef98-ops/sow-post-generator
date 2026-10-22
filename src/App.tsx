import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BoardTab from './board/BoardTab';
import NotificationBell from './components/NotificationBell';
import type { BoardProject, BoardState } from './board/types';
import AhjTab from './components/AhjTab';
import ComposeTab from './components/ComposeTab';
import DailyProgressTab from './components/DailyProgressTab';
import DraftsTab from './components/DraftsTab';
import ExtraWorkTab from './components/ExtraWorkTab';
import HistoryTab from './components/HistoryTab';
import SettingsTab from './components/SettingsTab';
import SowNotesTab from './components/SowNotesTab';
import UsersTab from './components/UsersTab';
import { Toasts, type Toast } from './components/Toast';
import { extraWorkRoster, saveCachedUsers } from './lib/auth';
import {
  fetchSharedAhjs,
  fetchSharedBoard,
  fetchSharedExtraWork,
  fetchSharedRecords,
  fetchSharedUsers,
  health,
  putSharedAhjs,
  putSharedBoard,
  putSharedExtraWork,
  putSharedRecords,
} from './lib/api';
import { boardsOfKind, mergeAhjs, replaceKind } from './lib/ahj';
import { linkedPosts, mergeBoard } from './lib/board';
import { isoToUs, todayIso } from './lib/dates';
import { designStamp } from './lib/designStamp';
import { mergeExtraWork } from './lib/extraWork';
import type { ExtraWorkEntry, ExtraWorkState } from './extrawork/types';
import MobileApp from './mobile/MobileApp';
import { useIsMobile } from './mobile/useIsMobile';
import { titleCaseName } from './lib/nameCase';
import { blankRecord, hasContent } from './lib/record';
import {
  clearLiveDraft,
  loadAhjs,
  loadBoard,
  loadCurrentId,
  loadExtraWork,
  loadLiveDraft,
  loadRecords,
  loadSettings,
  mergeRecords,
  saveAhjs,
  saveBoard,
  saveCurrentId,
  saveExtraWork,
  saveLiveDraft,
  saveRecords,
  saveSettings,
} from './lib/storage';
import { buildPostHtml, buildPostText } from './lib/template';
import type { Ahj, PostRecord, RequirementKind, Session, Settings } from './types';

// Phase 9: two-level navigation. The flat Tab union stays (every old
// setTab('compose') call site still works); each tab belongs to a main group
// and the header renders a main strip plus the active group's sub strip.
type Tab =
  | 'board'
  | 'compose'
  | 'drafts'
  | 'history'
  | 'ahj'
  | 'utility'
  | 'funding'
  | 'sownotes'
  | 'extrawork'
  | 'settings'
  | 'users'
  | 'progress';
type MainTab = 'board' | 'compose' | 'ahj' | 'sownotes' | 'extrawork' | 'admin';

const MAIN_OF: Record<Tab, MainTab> = {
  board: 'board',
  compose: 'compose',
  drafts: 'compose',
  history: 'compose',
  ahj: 'ahj',
  utility: 'ahj',
  funding: 'ahj',
  sownotes: 'sownotes',
  extrawork: 'extrawork',
  settings: 'admin',
  users: 'admin',
  progress: 'admin',
};

/** Which requirement kind each board tab edits. */
const TAB_KIND = {
  ahj: 'ahj',
  utility: 'utility',
  funding: 'funding',
} as const satisfies Record<string, RequirementKind>;

const KIND_LABELS: Record<
  RequirementKind,
  { heading: string; itemNoun: string; itemPlural: string; subtitle: string }
> = {
  ahj: {
    heading: 'AHJ Requirements',
    itemNoun: 'AHJ',
    itemPlural: 'AHJs',
    subtitle: 'Compose shows a board automatically when the Jurisdiction matches',
  },
  utility: {
    heading: 'Utility Requirements',
    itemNoun: 'Utility',
    itemPlural: 'Utilities',
    subtitle: 'Compose shows a board automatically when the Utility matches',
  },
  funding: {
    heading: 'Solrite / Funding Requirements',
    itemNoun: 'Funding source',
    itemPlural: 'Funding sources',
    subtitle: 'Offered on every project — no matching needed',
  },
  // Team reference only — never reaches a post (Aboud 2026-10-08).
  general: {
    heading: 'SOW General Notes',
    itemNoun: 'Note group',
    itemPlural: 'Note groups',
    subtitle: 'Shared reference for the team — never added to a post',
  },
};

/** Where each main tab lands when clicked directly. */
const MAIN_HOME: Record<MainTab, Tab> = {
  board: 'board',
  compose: 'compose',
  ahj: 'ahj',
  sownotes: 'sownotes',
  extrawork: 'extrawork',
  admin: 'settings',
};

interface AppProps {
  /** Absent only in tests, which render the inner app without the login gate. */
  session?: Session;
  onLogout?: () => void;
}

export default function App({ session, onLogout }: AppProps = {}) {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [records, setRecordsState] = useState<PostRecord[]>(() => loadRecords());
  const [ahjs, setAhjsState] = useState<Ahj[]>(() => loadAhjs());
  const [boardState, setBoardState] = useState<BoardState>(() => loadBoard());
  const [extraWork, setExtraWorkState] = useState<ExtraWorkState>(() => loadExtraWork());
  const [ahjSelectedId, setAhjSelectedId] = useState<string | null>(null);
  // Default landing = Board (spec/10-project-board Q6). The gateless test
  // render keeps landing on Compose so the whole pre-board suite stays valid.
  const [tab, setTab] = useState<Tab>(session ? 'board' : 'compose');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const isMobile = useIsMobile();
  // Everyone with an ACCOUNT, not Settings.authors — that list is device-local,
  // so Anas and Ya'rob were missing from their own hours screen (2026-10-08).
  // See extraWorkRoster().
  //
  // The Board needs the same list and was still on settings.authors until
  // 2026-10-18: its shipped default is three names, and App only appends the
  // signed-in user, so Anas's coordinator filter and "Set coordinator" menu
  // offered Aboud/Omar/Refai/Anas and no Ya'rob — he could neither filter for
  // him nor assign him. Refai saw neither Anas nor Ya'rob. Any people-picker
  // added later belongs on this roster too, never on settings.authors.
  //
  // `usersStamp` is bumped whenever the shared user list is refetched. Without
  // it this memo would never recompute: extraWorkRoster() reads localStorage,
  // which React cannot track, so a member kept whatever roster existed at their
  // last LOGIN — sessions never expire, so that could be weeks stale and a
  // reload did not fix it (found by review, 2026-10-08).
  const [usersStamp, setUsersStamp] = useState(0);
  const accountRoster = useMemo(
    () => extraWorkRoster(session?.displayName, settings.authors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.displayName, settings.authors, usersStamp],
  );

  // Refresh the shared roster on mount and whenever the tab regains focus.
  // Deliberately NOT on the 15 s poll — the team list changes a few times a
  // year, unlike the board.
  useEffect(() => {
    if (!session) return;
    const pullUsers = () => {
      if (document.visibilityState !== 'visible') return;
      fetchSharedUsers()
        .then((users) => {
          if (users.length === 0) return; // never cache an empty roster over a good one
          saveCachedUsers(users);
          setUsersStamp((n) => n + 1);
        })
        .catch(() => {
          /* offline — the cached roster from login still works */
        });
    };
    pullUsers();
    window.addEventListener('focus', pullUsers);
    return () => window.removeEventListener('focus', pullUsers);
  }, [session]);
  const [aiStatus, setAiStatus] = useState<'checking' | 'ok' | 'off'>('checking');
  const [syncStatus, setSyncStatus] = useState<'checking' | 'synced' | 'local'>('checking');

  const [current, setCurrent] = useState<PostRecord>(() => {
    const stored = loadRecords();
    const id = loadCurrentId();
    const found = id ? stored.find((r) => r.id === id && r.status === 'draft') : undefined;
    // Crash recovery: the live key is written on every keystroke, the draft
    // list on a 500 ms debounce. After a power cut the live copy is the newer
    // of the two, and it is the one with the work in it.
    const live = loadLiveDraft();
    if (live && live.status === 'draft' && !live.deletedAt) {
      const onDisk = stored.find((r) => r.id === live.id);
      if (!onDisk || live.updatedAt > onDisk.updatedAt) return live;
    }
    return found ?? blankRecord(session?.displayName ?? loadSettings().lastAuthor ?? 'Aboud Yousef', loadSettings());
  });

  // The signed-in identity IS the author (Phase 9). Pinning lastAuthor keeps
  // every author consumer (blankRecord, AhjTab's "posting as") on the session
  // name without threading the session through them all.
  useEffect(() => {
    if (!session) return;
    setSettingsState((s) => {
      if (s.lastAuthor === session.displayName && s.authors.includes(session.displayName)) return s;
      const next = {
        ...s,
        lastAuthor: session.displayName,
        authors: s.authors.includes(session.displayName) ? s.authors : [...s.authors, session.displayName],
      };
      saveSettings(next);
      return next;
    });
  }, [session]);

  // ---- persistence -------------------------------------------------------

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  // Per-store sync health; the pill is green only when ALL stores are ok.
  const storeSync = useRef<{ records: boolean; ahjs: boolean; board: boolean; extrawork: boolean }>({
    records: false,
    ahjs: false,
    board: false,
    extrawork: false,
  });
  const reportSync = useCallback((store: 'records' | 'ahjs' | 'board' | 'extrawork', ok: boolean) => {
    storeSync.current[store] = ok;
    const s = storeSync.current;
    setSyncStatus(s.records && s.ahjs && s.board && s.extrawork ? 'synced' : 'local');
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

  // The Project Board syncs the same way: localStorage cache + debounced push;
  // the server merges and returns the authoritative state.
  const applyServerBoard = useCallback((server: Partial<BoardState>) => {
    setBoardState((cur) => {
      const merged = mergeBoard(cur, server);
      saveBoard(merged);
      return merged;
    });
  }, []);
  // Extra Work syncs the same way: localStorage cache + debounced push.
  const applyServerExtraWork = useCallback((server: ExtraWorkEntry[]) => {
    setExtraWorkState((cur) => {
      const merged = mergeExtraWork(cur, { entries: server });
      saveExtraWork(merged);
      return merged;
    });
  }, []);
  const extraWorkPushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setExtraWork = useCallback(
    (s: ExtraWorkState) => {
      setExtraWorkState(s);
      saveExtraWork(s);
      clearTimeout(extraWorkPushTimer.current);
      extraWorkPushTimer.current = setTimeout(() => {
        putSharedExtraWork(s.entries)
          .then((merged) => {
            applyServerExtraWork(merged);
            reportSync('extrawork', true);
          })
          .catch(() => reportSync('extrawork', false));
      }, 1500);
    },
    [applyServerExtraWork, reportSync],
  );

  const boardPushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setBoard = useCallback(
    (b: BoardState) => {
      setBoardState(b);
      saveBoard(b);
      clearTimeout(boardPushTimer.current);
      boardPushTimer.current = setTimeout(() => {
        putSharedBoard(b)
          .then((merged) => {
            applyServerBoard(merged);
            reportSync('board', true);
          })
          .catch(() => reportSync('board', false));
      }, 1000);
    },
    [applyServerBoard, reportSync],
  );

  // "Live" board updates without websockets: refetch on an interval while the
  // page is visible, and on window focus. Pull-only — pushes stay edit-driven.
  useEffect(() => {
    const pull = () => {
      if (document.visibilityState !== 'visible') return;
      fetchSharedBoard()
        .then((server) => {
          applyServerBoard(server);
          reportSync('board', true);
        })
        .catch(() => reportSync('board', false));
      fetchSharedExtraWork()
        .then((server) => {
          applyServerExtraWork(server);
          reportSync('extrawork', true);
        })
        .catch(() => reportSync('extrawork', false));
    };
    const interval = setInterval(pull, 15000);
    window.addEventListener('focus', pull);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', pull);
    };
  }, [applyServerBoard, applyServerExtraWork, reportSync]);

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
        (async () => {
          const server = await fetchSharedBoard();
          applyServerBoard(server);
          const final = await putSharedBoard(mergeBoard(loadBoard(), server));
          applyServerBoard(final);
        })(),
        (async () => {
          const server = await fetchSharedExtraWork();
          applyServerExtraWork(server);
          const final = await putSharedExtraWork(
            mergeExtraWork(loadExtraWork(), { entries: server }).entries,
          );
          applyServerExtraWork(final);
        })(),
      ]);
      reportSync('records', results[0].status === 'fulfilled');
      reportSync('ahjs', results[1].status === 'fulfilled');
      reportSync('board', results[2].status === 'fulfilled');
      reportSync('extrawork', results[3].status === 'fulfilled');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const recordsRef = useRef(records);
  recordsRef.current = records;
  const currentRef = useRef(current);
  currentRef.current = current;
  const boardRef = useRef(boardState);
  boardRef.current = boardState;

  // ---- toasts ------------------------------------------------------------

  const toast = useCallback((text: string, action?: Toast['action']) => {
    const id = crypto.randomUUID();
    setToasts((ts) => [...ts, { id, text, action }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 5000);
  }, []);

  /**
   * Write the Compose record into the draft list immediately (local + queued
   * push). `stamp: false` is for commits of records the user has not actually
   * worked on (the openFromBoard prefill) — a prefill must not write a
   * Designed date to the board.
   */
  const commitDraft = useCallback(
    (rec: PostRecord, stamp = true) => {
      setRecords([...recordsRef.current.filter((r) => r.id !== rec.id), rec]);
      saveCurrentId(rec.id);
      if (!stamp) return;
      // Designed-date auto-stamp: a saved draft linked to a board project fills
      // the project's BLANK date with the local day. Fires on every autosave but
      // stamps at most once (blank-only), and the toast tells the coordinator
      // the board was written on their behalf.
      const stamped = designStamp(boardRef.current, rec, todayIso());
      if (stamped) {
        const name = boardRef.current.projects.find((p) => p.id === rec.projectId)?.name ?? 'the linked project';
        // Keep the ref in step immediately: openFromBoard commits twice in one
        // tick, and a stale ref here would rebuild the board WITHOUT this stamp
        // and silently drop it on the second commit.
        boardRef.current = stamped;
        setBoard(stamped);
        toast(`Board: Designed date set to ${isoToUs(todayIso())} for ${name}.`);
      }
    },
    [setRecords, setBoard, toast],
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

  // Another tab of this app wrote to the store. saveRecords() already merges
  // rather than overwrites, so nothing is lost either way — this just stops
  // THIS tab showing a stale list until it is reloaded.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'sowpost.records') return;
      setRecordsState(loadRecords());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    health()
      .then((h) => setAiStatus(h.ok && h.hasKey ? 'ok' : 'off'))
      .catch(() => setAiStatus('off'));
  }, []);

  // ---- record lifecycle --------------------------------------------------

  const updateCurrent = useCallback((updater: (r: PostRecord) => PostRecord) => {
    setCurrent((r) => {
      const next = { ...updater(r), updatedAt: new Date().toISOString() };
      // Synchronous, every change, no debounce. This is the copy that survives
      // a power cut; the draft list behind it is still debounced.
      if (hasContent(next)) saveLiveDraft(next);
      return next;
    });
  }, []);

  const newPost = useCallback(() => {
    // Force-save before clearing: the 500 ms autosave may not have fired yet,
    // so "New post" must never be able to discard typed work.
    if (hasContent(currentRef.current)) commitDraft(currentRef.current);
    clearLiveDraft();
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
      // Same rule as newPost: replacing `current` cancels the pending 500 ms
      // autosave, so flush first or the last keystrokes are gone.
      const open = currentRef.current;
      if (hasContent(open)) commitDraft(open);
      // Re-opening the draft already in Compose: use the in-memory copy. The
      // commit above has not reached recordsRef yet, and the stored copy is
      // the stale one we just replaced.
      const rec = open.id === id ? open : recordsRef.current.find((r) => r.id === id);
      if (!rec) return;
      setCurrent(rec);
      saveCurrentId(id);
      setTab('compose');
    },
    [commitDraft],
  );

  const duplicateDraft = useCallback(
    (id: string) => {
      // Duplicating the draft that is open in Compose must copy what is on
      // screen, not the last autosaved version of it.
      const open = currentRef.current;
      if (open.id === id && hasContent(open)) commitDraft(open);
      const rec = open.id === id ? open : recordsRef.current.find((r) => r.id === id);
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
    [setRecords, toast, commitDraft],
  );

  // ---- Board → Compose (one-way: the board controls Compose) --------------

  const [boardFocusId, setBoardFocusId] = useState<string | null>(null);

  /** The Compose chip's jump back to the board, row highlighted. */
  const openBoardAt = useCallback((projectId: string) => {
    setBoardFocusId(projectId);
    setTab('board');
  }, []);

  /**
   * The Post cell / "Open in Compose": open the project's draft if it has
   * one, go to History if it is posted, otherwise start a prefilled draft
   * already linked to the row.
   */
  const openFromBoard = useCallback(
    (project: BoardProject) => {
      const lp = linkedPosts(recordsRef.current, project.id);
      if (lp.draft) {
        openDraft(lp.draft.id);
        return;
      }
      if (lp.posted) {
        setTab('history');
        toast(`${project.name} is posted — it lives in History.`);
        return;
      }
      // Same flush rule as newPost: never discard what is on screen.
      const open = currentRef.current;
      if (hasContent(open)) commitDraft(open);
      clearLiveDraft();
      const author = session?.displayName ?? settings.lastAuthor ?? settings.authors[0] ?? '';
      const blank = blankRecord(author, settings);
      const rec: PostRecord = {
        ...blank,
        projectId: project.id,
        sf: { ...blank.sf, customerName: titleCaseName(project.name) },
      };
      setCurrent(rec);
      // stamp: false — a prefilled record is not design work; stamping here
      // would write today's Designed date on a mere "Open in Compose" click.
      // The first REAL autosave (the user typed something) stamps as usual.
      commitDraft(rec, false);
      setTab('compose');
    },
    [openDraft, commitDraft, settings, session, toast],
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

  // iPhone shell (≤480px, design handoff 2026-10-06). Same state and sync as
  // the desktop tree — only the skin changes. Gateless test renders (no
  // session) always use the desktop tree.
  if (isMobile && session) {
    return (
      <>
        <MobileApp
          session={session}
          onLogout={onLogout ?? (() => {})}
          board={boardState}
          setBoard={setBoard}
          records={records}
          setRecords={setRecords}
          drafts={allDrafts}
          settings={settings}
          setSettings={setSettings}
          ahjs={ahjs}
          setAhjs={setAhjs}
          extraWork={extraWork}
          setExtraWork={setExtraWork}
          ewRoster={accountRoster}
          markPostedById={markPostedById}
          duplicateDraft={duplicateDraft}
          deleteRecord={deleteRecord}
          syncOk={syncStatus === 'synced'}
          toast={toast}
        />
        <Toasts toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <img src="/dyn-logo.png" alt="Dynamic EcoHome" />
        <span className="title">SOW Operational Tool</span>
        <nav>
          {(
            [
              ['board', 'Board'],
              ['compose', 'Compose'],
              ['ahj', 'Requirements'],
              ['sownotes', 'SOW Notes'],
              ['extrawork', 'Extra Work'],
              // Admin is visible to admins (and to the gateless test render).
              ...(!session || session.role === 'admin' ? [['admin', 'Admin'] as [MainTab, string]] : []),
            ] as [MainTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={MAIN_OF[tab] === key ? 'active' : ''}
              onClick={() => setTab(MAIN_HOME[key])}
            >
              {label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {/* One pill, a dot per service (spec/11 — Option A). The full wording
            stays on each item's title, which is also what the tests read. */}
        <span className="status-pill">
          {/* The label itself has to change, not just the dot. On 2026-10-17
              the board rejected every PUT for 37 hours and this pill still
              read "Synced" with only the dot greyed out, so nobody noticed
              their work was never leaving the browser. */}
          <span
            className={`status-item ${
              syncStatus === 'synced' ? 'ok' : syncStatus === 'local' ? 'danger' : 'off'
            }`}
            title={
              syncStatus === 'checking'
                ? 'Sync…'
                : syncStatus === 'synced'
                  ? 'Team synced'
                  : 'NOT SAVED — your changes are only in this browser. Do not clear your cache; tell Aboud.'
            }
          >
            <span className="status-dot" />
            {syncStatus === 'local' ? 'Not saved' : 'Synced'}
          </span>
          <span
            className={`status-item ${aiStatus === 'ok' ? 'ok' : 'off'}`}
            title={aiStatus === 'checking' ? 'AI…' : aiStatus === 'ok' ? 'AI available' : 'AI offline'}
          >
            <span className="status-dot" />
            AI
          </span>
        </span>
        {/* Aboud 2026-10-17 #10 — see lib/notifications.ts for the decision. */}
        <NotificationBell
          board={boardState}
          me={session?.displayName ?? settings.lastAuthor ?? settings.authors[0] ?? ''}
          onOpen={(project) => {
            setBoardFocusId(project.id);
            setTab('board');
          }}
        />
        {session ? (
          // Signed in: identity comes from the login — nobody picks a name.
          <>
            <span className="author-pill author-fixed" title="Posting as">
              {session.displayName}
            </span>
            <button className="btn small secondary logout-btn" onClick={onLogout}>
              Log out
            </button>
          </>
        ) : (
          <select
            className="author-pill"
            title="Posting as"
            aria-label="Posting as"
            value={current.author}
            onChange={(e) => updateCurrent((r) => ({ ...r, author: e.target.value }))}
          >
            {/* An author who has been removed from the roster would otherwise
                make this render blank, which reads as "the control is missing". */}
            {(settings.authors.includes(current.author)
              ? settings.authors
              : [current.author, ...settings.authors].filter(Boolean)
            ).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        )}
      </header>

      {/* Requirements: one sub-tab per kind. Each is the SAME board UI over a
          different slice of the `ahjs` store — see _PLAN_requirements_split.md. */}
      {MAIN_OF[tab] === 'ahj' && (
        <nav className="subnav">
          {(
            [
              ['ahj', 'AHJ'],
              ['utility', 'Utility'],
              ['funding', 'Solrite / Funding'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              onClick={() => {
                setTab(key);
                setAhjSelectedId(null); // ids are per-kind; keeping one would select nothing
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* Sub strip for the active main tab. */}
      {MAIN_OF[tab] === 'compose' && (
        <nav className="subnav">
          {(
            [
              ['compose', 'New Post', 0],
              ['drafts', 'Drafts', allDrafts.length],
              ['history', 'History', history.length],
            ] as [Tab, string, number][]
          ).map(([key, label, count]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
              {count > 0 && <span className="tab-badge">{count}</span>}
            </button>
          ))}
        </nav>
      )}
      {MAIN_OF[tab] === 'admin' && (
        <nav className="subnav">
          {(
            [
              ['settings', 'Settings'],
              ['users', 'Users'],
              ['progress', 'Daily Progress'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
      )}

      <main className="page">
        {tab === 'board' && (
          <BoardTab
            board={boardState}
            setBoard={setBoard}
            me={session?.displayName ?? settings.lastAuthor ?? settings.authors[0] ?? ''}
            isAdmin={!session || session.role === 'admin'}
            authors={accountRoster}
            toast={toast}
            records={records}
            onOpenCompose={openFromBoard}
            focusId={boardFocusId}
            onFocusHandled={() => setBoardFocusId(null)}
          />
        )}
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
            boardProjects={boardState.projects}
            boardLabels={boardState.labels}
            onOpenBoard={openBoardAt}
          />
        )}
        {/* SOW Notes is ONE panel, not a set of boards (Aboud 2026-10-08) —
            it gets its own component rather than the per-board AhjTab. */}
        {tab === 'sownotes' && (
          <SowNotesTab
            ahjs={ahjs}
            setAhjs={setAhjs}
            settings={settings}
            setSettings={setSettings}
            toast={toast}
            lockedAuthor={session?.displayName}
          />
        )}
        {(['ahj', 'utility', 'funding'] as const).includes(tab as 'ahj' | 'utility' | 'funding') && (
          <AhjTab
            // Keyed so switching kind remounts with clean local state rather
            // than carrying the previous kind's search/composer across.
            key={tab}
            ahjs={boardsOfKind(ahjs, TAB_KIND[tab as keyof typeof TAB_KIND])}
            setAhjs={(next) => setAhjs(replaceKind(ahjs, TAB_KIND[tab as keyof typeof TAB_KIND], next))}
            selectedId={ahjSelectedId}
            onSelect={setAhjSelectedId}
            settings={settings}
            setSettings={setSettings}
            toast={toast}
            lockedAuthor={session?.displayName}
            heading={KIND_LABELS[TAB_KIND[tab as keyof typeof TAB_KIND]].heading}
            itemNoun={KIND_LABELS[TAB_KIND[tab as keyof typeof TAB_KIND]].itemNoun}
            itemPlural={KIND_LABELS[TAB_KIND[tab as keyof typeof TAB_KIND]].itemPlural}
            subtitle={KIND_LABELS[TAB_KIND[tab as keyof typeof TAB_KIND]].subtitle}
          />
        )}
        {tab === 'extrawork' && (
          <ExtraWorkTab
            state={extraWork}
            setState={setExtraWork}
            me={session?.displayName ?? settings.lastAuthor ?? settings.authors[0] ?? ''}
            myUsername={session?.username ?? ''}
            isAdmin={!session || session.role === 'admin'}
            roster={accountRoster}
            toast={toast}
          />
        )}
        {tab === 'drafts' && (
          <DraftsTab
            onNewPost={newPost}
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
        {tab === 'users' &&
          (session ? (
            <UsersTab session={session} toast={(t) => toast(t)} />
          ) : (
            <div className="card">Sign in to manage users.</div>
          ))}
        {tab === 'progress' && (
          <DailyProgressTab board={boardState} records={records} toast={toast} />
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
