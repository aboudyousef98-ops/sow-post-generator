// Column permissions — the admin's control panel (Aboud 2026-11-15: "refai
// to edit the stars column but khaled mattar view only … hide columns from
// some users"). One dense row per board column, two pickers each: who can
// edit (Everyone by default), and who the column is hidden from (nobody by
// default). Rules key on USERNAME and admins are never restricted, so the
// pickers list members only.

import { useState } from 'react';
import { HIDEABLE_COLUMNS, MANAGEABLE_COLUMNS, permFor } from '../lib/columnPerms';
import type { ColumnPerm } from './types';
import Popover from './Popover';

export interface TeamMember {
  username: string;
  displayName: string;
  role: 'admin' | 'member';
}

/** The picker chip's text: the default word, or who is picked. */
function chipText(names: string[], defaultWord: string): string {
  if (!names.length) return defaultWord;
  if (names.length <= 2) return names.join(', ');
  return `${names.length} people`;
}

function MemberPicker({
  label,
  defaultWord,
  members,
  picked,
  onChange,
}: {
  label: string;
  /** What the empty set means — "Everyone" / "Nobody". */
  defaultWord: string;
  members: TeamMember[];
  picked: string[];
  onChange: (usernames: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const names = members.filter((m) => picked.includes(m.username)).map((m) => m.displayName);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className={`btn small ${picked.length ? 'primary' : 'secondary'}`} title={label}>
          {label}: {chipText(names, defaultWord)} ▾
        </button>
      }
    >
      <div className="board-menu" role="group" aria-label={label}>
        <button type="button" className="board-menu-item muted" onClick={() => onChange([])}>
          {defaultWord} (default)
        </button>
        {members.map((m) => (
          <label key={m.username} className="board-menu-item">
            <input
              type="checkbox"
              checked={picked.includes(m.username)}
              onChange={(e) =>
                onChange(e.target.checked ? [...picked, m.username] : picked.filter((u) => u !== m.username))
              }
            />
            {m.displayName}
          </label>
        ))}
      </div>
    </Popover>
  );
}

export default function PermissionsModal({
  perms,
  members,
  onSet,
  onClose,
}: {
  perms: ColumnPerm[];
  members: TeamMember[];
  /** Write one column's rule — the board owns the write. */
  onSet: (columnKey: string, patch: Partial<Pick<ColumnPerm, 'editors' | 'hiddenFor'>>) => void;
  onClose: () => void;
}) {
  // Admins are never restricted, so offering them in a picker would be a
  // lying checkbox — members only.
  const pickable = members.filter((m) => m.role === 'member');
  const hideable = new Set(HIDEABLE_COLUMNS.map((c) => c.key));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal board-labels" onClick={(e) => e.stopPropagation()}>
        <h3>Column permissions</h3>
        <p className="muted" style={{ marginTop: -8 }}>
          Who may edit each board column, and who it is hidden from. Admins always edit and always see
          everything. Changes apply to the whole team, instantly.
        </p>
        {pickable.length === 0 && (
          <p className="muted">Every account is an admin right now — add members in Admin → Users first.</p>
        )}
        <div className="perm-rows">
          {MANAGEABLE_COLUMNS.map((c) => {
            const rule = permFor(perms, c.key);
            return (
              <div key={c.key} className="perm-row">
                <span className="perm-col">{c.label}</span>
                <MemberPicker
                  label="Edit"
                  defaultWord="Everyone"
                  members={pickable}
                  picked={rule?.editors ?? []}
                  onChange={(editors) => onSet(c.key, { editors: editors.length ? editors : undefined })}
                />
                {hideable.has(c.key) && (
                  <MemberPicker
                    label="Hide from"
                    defaultWord="Nobody"
                    members={pickable}
                    picked={rule?.hiddenFor ?? []}
                    onChange={(hiddenFor) => onSet(c.key, { hiddenFor: hiddenFor.length ? hiddenFor : undefined })}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
