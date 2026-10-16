// The notification bell in the top bar. See lib/notifications.ts for WHY this
// shape was chosen over push / email / Slack.
//
// It owns no data: everything it shows is derived from the board that is
// already synced, so it costs one pass over arrays the app is holding anyway.

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildNotifications, loadLastSeen, saveLastSeen } from '../lib/notifications';
import { relativeTime } from '../lib/dates';
import type { BoardProject, BoardState } from '../board/types';

export default function NotificationBell({
  board,
  me,
  onOpen,
}: {
  board: BoardState;
  me: string;
  /** Jump to the project this notification is about. */
  onOpen: (project: BoardProject, kind: 'update' | 'activity') => void;
}) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(() => loadLastSeen());
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => buildNotifications(board.activity, board.updates, board.projects, me, since),
    [board.activity, board.updates, board.projects, me, since],
  );

  // Click outside to dismiss, same as the board's row menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const count = items.length;

  /**
   * Marking read is deliberate: it happens when you CLOSE the panel, not when
   * you open it. Opening, glancing and clicking away should not silently throw
   * away things you have not read yet.
   */
  const close = () => {
    setOpen(false);
    const now = new Date().toISOString();
    saveLastSeen(now);
    setSince(now);
  };

  const byId = new Map(board.projects.map((p) => [p.id, p]));

  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className={`notif-btn${count ? ' has' : ''}`}
        aria-label={count ? `Notifications — ${count} new` : 'Notifications'}
        title={count ? `${count} new since you last looked` : 'Nothing new'}
        onClick={() => (open ? close() : setOpen(true))}
      >
        🔔
        {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>What changed</strong>
            {count > 0 && (
              <button type="button" className="ahj-action" onClick={close}>
                Mark all read
              </button>
            )}
          </div>

          {count === 0 ? (
            <p className="muted" style={{ padding: '14px 12px', margin: 0 }}>
              Nothing new since you last looked.
            </p>
          ) : (
            <div className="notif-list">
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="notif-item"
                  onClick={() => {
                    const p = byId.get(n.projectId);
                    close();
                    if (p) onOpen(p, n.kind);
                  }}
                >
                  <span className="notif-item-top">
                    <strong>{n.projectName}</strong>
                    <span className="muted nowrap" title={new Date(n.at).toLocaleString()}>
                      {relativeTime(n.at)}
                    </span>
                  </span>
                  <span className="notif-item-body">
                    <span className="muted">{n.actor}</span> {n.text}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
