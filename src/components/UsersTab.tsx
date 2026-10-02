// Phase 9 — Admin › Users. Add/remove team members, reset passwords, change
// your own. Lives inside the admin-only Admin tab; the roster syncs through
// /api/users exactly like records do, so a user added here can sign in on any
// machine a few seconds later.

import { useCallback, useEffect, useState } from 'react';
import { fetchSharedUsers, putSharedUsers } from '../lib/api';
import {
  activeUsers,
  findUser,
  hashPassword,
  isLastAdmin,
  makeUser,
  newSalt,
  saveCachedUsers,
  verifyPassword,
} from '../lib/auth';
import type { Session, TeamUser, UserRole } from '../types';

interface Props {
  session: Session;
  toast: (text: string) => void;
}

export default function UsersTab({ session, toast }: Props) {
  // Full roster including tombstones — pushes must carry them for the merge.
  const [roster, setRoster] = useState<TeamUser[]>([]);
  const [loaded, setLoaded] = useState<'loading' | 'ok' | 'error'>('loading');

  // Add-user form.
  const [newUsername, setNewUsername] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [newPassword, setNewPassword] = useState('');

  // Per-row inline actions: which row has its reset box open, and the value.
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Change-my-password form.
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');

  useEffect(() => {
    fetchSharedUsers()
      .then((users) => {
        setRoster(users);
        saveCachedUsers(users);
        setLoaded('ok');
      })
      .catch(() => setLoaded('error'));
  }, []);

  /** Optimistic local update + push; the server's merged roster wins on return. */
  const push = useCallback(
    (next: TeamUser[]) => {
      setRoster(next);
      saveCachedUsers(next);
      putSharedUsers(next)
        .then((merged) => {
          setRoster(merged);
          saveCachedUsers(merged);
        })
        .catch(() => toast('Could not reach the server — the change is only on this machine until it syncs.'));
    },
    [toast],
  );

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const handle = newUsername.trim().toLowerCase();
    if (!handle || !newDisplay.trim()) return;
    if (newPassword.length < 4) {
      toast('Password must be at least 4 characters.');
      return;
    }
    if (findUser(roster, handle)) {
      toast(`"${handle}" is already taken.`);
      return;
    }
    const user = await makeUser(handle, newDisplay, newRole, newPassword);
    push([...roster.filter((u) => u.username !== handle), user]);
    setNewUsername('');
    setNewDisplay('');
    setNewPassword('');
    setNewRole('member');
    toast(`Added ${user.displayName}.`);
  };

  const resetPassword = async (username: string) => {
    if (resetValue.length < 4) {
      toast('Password must be at least 4 characters.');
      return;
    }
    const salt = newSalt();
    const passHash = await hashPassword(resetValue, salt);
    const now = new Date().toISOString();
    push(roster.map((u) => (u.username === username ? { ...u, salt, passHash, updatedAt: now } : u)));
    setResetFor(null);
    setResetValue('');
    toast(`Password reset for ${username}.`);
  };

  const removeUser = (username: string) => {
    if (username === session.username) {
      toast('You can’t remove the account you are signed in with.');
      return;
    }
    if (isLastAdmin(roster, username)) {
      toast('That is the last admin — add another admin first.');
      return;
    }
    const now = new Date().toISOString();
    push(roster.map((u) => (u.username === username ? { ...u, deletedAt: now, updatedAt: now } : u)));
    setConfirmRemove(null);
    toast(`Removed ${username}.`);
  };

  const toggleRole = (username: string) => {
    if (isLastAdmin(roster, username)) {
      toast('That is the last admin — add another admin first.');
      return;
    }
    const now = new Date().toISOString();
    push(
      roster.map((u) =>
        u.username === username ? { ...u, role: u.role === 'admin' ? 'member' : 'admin', updatedAt: now } : u,
      ),
    );
  };

  const changeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const me = findUser(roster, session.username);
    if (!me) return;
    if (!(await verifyPassword(me, curPw))) {
      toast('Current password is wrong.');
      return;
    }
    if (newPw.length < 4) {
      toast('New password must be at least 4 characters.');
      return;
    }
    const salt = newSalt();
    const passHash = await hashPassword(newPw, salt);
    const now = new Date().toISOString();
    push(roster.map((u) => (u.username === me.username ? { ...u, salt, passHash, updatedAt: now } : u)));
    setCurPw('');
    setNewPw('');
    toast('Your password has been changed.');
  };

  const team = activeUsers(roster).sort((a, b) => a.username.localeCompare(b.username));

  return (
    <div className="users-tab">
      <div className="card">
        <h3>Team members</h3>
        {loaded === 'loading' && <p>Loading the roster…</p>}
        {loaded === 'error' && <p>Could not load the roster — check the connection and reload.</p>}
        {loaded === 'ok' && (
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Role</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.username}>
                  <td>{u.username}</td>
                  <td>{u.displayName}</td>
                  <td>
                    <button
                      className="btn link small"
                      title="Click to switch between admin and member"
                      onClick={() => toggleRole(u.username)}
                    >
                      {u.role}
                    </button>
                  </td>
                  <td className="users-actions">
                    {resetFor === u.username ? (
                      <>
                        <input
                          type="password"
                          placeholder="New password"
                          value={resetValue}
                          onChange={(e) => setResetValue(e.target.value)}
                        />
                        <button className="btn small primary" onClick={() => void resetPassword(u.username)}>
                          Set
                        </button>
                        <button
                          className="btn small secondary"
                          onClick={() => {
                            setResetFor(null);
                            setResetValue('');
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : confirmRemove === u.username ? (
                      <>
                        <span>Remove {u.displayName}?</span>
                        <button className="btn small danger" onClick={() => removeUser(u.username)}>
                          Yes, remove
                        </button>
                        <button className="btn small secondary" onClick={() => setConfirmRemove(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn small secondary" onClick={() => setResetFor(u.username)}>
                          Reset password
                        </button>
                        <button className="btn small danger" onClick={() => setConfirmRemove(u.username)}>
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Add a team member</h3>
        <form className="users-add" onSubmit={(e) => void addUser(e)}>
          <label>
            Username
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
          </label>
          <label>
            Display name (appears on posts)
            <input type="text" value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} />
          </label>
          <label>
            Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label>
            Password
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <button className="btn primary" type="submit" disabled={!newUsername.trim() || !newDisplay.trim() || !newPassword}>
            Add user
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Change my password</h3>
        <form className="users-add" onSubmit={(e) => void changeMyPassword(e)}>
          <label>
            Current password
            <input type="password" value={curPw} autoComplete="current-password" onChange={(e) => setCurPw(e.target.value)} />
          </label>
          <label>
            New password
            <input type="password" value={newPw} autoComplete="new-password" onChange={(e) => setNewPw(e.target.value)} />
          </label>
          <button className="btn secondary" type="submit" disabled={!curPw || !newPw}>
            Change password
          </button>
        </form>
      </div>
    </div>
  );
}
