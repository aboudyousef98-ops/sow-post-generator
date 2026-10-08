// iPhone shell (design handoff 2026-10-06): bottom tab bar Board · Drafts ·
// AHJ · Hours · Admin (Admin only for admins). Replaces the desktop layout
// under 480px — same state, same sync, different skin. Compose stays
// desktop-only by design; the phone reviews, edits the board, logs hours.

import { useState } from 'react';
import type { BoardState } from '../board/types';
import type { ExtraWorkState } from '../extrawork/types';
import type { Ahj, PostRecord, Session, Settings } from '../types';
import MobileAdmin from './MobileAdmin';
import { boardsOfKind, replaceKind } from '../lib/ahj';
import MobileAhj from './MobileAhj';
import MobileBoard from './MobileBoard';
import MobileDrafts from './MobileDrafts';
import MobileHours from './MobileHours';

export type MobileScreen = 'board' | 'drafts' | 'ahj' | 'hours' | 'admin';

interface Props {
  session: Session;
  onLogout: () => void;
  board: BoardState;
  setBoard: (b: BoardState) => void;
  records: PostRecord[];
  setRecords: (r: PostRecord[]) => void;
  drafts: PostRecord[];
  settings: Settings;
  setSettings: (s: Settings) => void;
  ahjs: Ahj[];
  setAhjs: (a: Ahj[]) => void;
  extraWork: ExtraWorkState;
  setExtraWork: (s: ExtraWorkState) => void;
  /** Everyone with an account — NOT settings.authors. See extraWorkRoster(). */
  ewRoster: string[];
  markPostedById: (id: string) => void;
  duplicateDraft: (id: string) => void;
  deleteRecord: (id: string) => void;
  syncOk: boolean;
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
}

export default function MobileApp(props: Props) {
  const { session } = props;
  const isAdmin = session.role === 'admin';
  const [screen, setScreen] = useState<MobileScreen>('board');
  const [draftOpenId, setDraftOpenId] = useState<string | null>(null);

  const openDraftFromBoard = (recordId: string) => {
    setDraftOpenId(recordId);
    setScreen('drafts');
  };

  const tabs: [MobileScreen, string][] = [
    ['board', 'Board'],
    ['drafts', 'Drafts'],
    ['ahj', 'AHJ'],
    ['hours', 'Hours'],
    ...(isAdmin ? ([['admin', 'Admin']] as [MobileScreen, string][]) : []),
  ];

  return (
    <div className="m-app">
      {screen === 'board' && (
        <MobileBoard
          board={props.board}
          setBoard={props.setBoard}
          records={props.records}
          me={session.displayName}
          isAdmin={isAdmin}
          authors={props.settings.authors}
          toast={props.toast}
          onOpenDraft={openDraftFromBoard}
        />
      )}
      {screen === 'drafts' && (
        <MobileDrafts
          drafts={props.drafts}
          settings={props.settings}
          ahjs={props.ahjs}
          openId={draftOpenId}
          onOpenConsumed={() => setDraftOpenId(null)}
          markPostedById={props.markPostedById}
          duplicateDraft={props.duplicateDraft}
          deleteRecord={props.deleteRecord}
          toast={props.toast}
        />
      )}
      {/* AHJ boards only — the same store now also holds Utility / Funding /
          General boards, which are desktop-managed (2026-10-08). The setter
          stitches this slice back so the other kinds survive. */}
      {screen === 'ahj' && (
        <MobileAhj
          ahjs={boardsOfKind(props.ahjs, 'ahj')}
          setAhjs={(next) => props.setAhjs(replaceKind(props.ahjs, 'ahj', next))}
          me={session.displayName}
          toast={props.toast}
        />
      )}
      {screen === 'hours' && (
        <MobileHours
          state={props.extraWork}
          setState={props.setExtraWork}
          me={session.displayName}
          myUsername={session.username}
          isAdmin={isAdmin}
          roster={props.ewRoster}
          toast={props.toast}
        />
      )}
      {screen === 'admin' && isAdmin && (
        <MobileAdmin
          session={session}
          onLogout={props.onLogout}
          settings={props.settings}
          setSettings={props.setSettings}
          records={props.records}
          setRecords={props.setRecords}
          ahjs={props.ahjs}
          setAhjs={props.setAhjs}
          board={props.board}
          syncOk={props.syncOk}
          toast={props.toast}
        />
      )}

      <nav className="m-tabbar">
        {tabs.map(([key, label]) => (
          <button key={key} className={screen === key ? 'on' : ''} onClick={() => setScreen(key)}>
            <span className="m-tab-dash" />
            {label}
            {key === 'drafts' && props.drafts.length > 0 && (
              <span className="m-tab-badge">{props.drafts.length}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
