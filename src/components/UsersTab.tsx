// Phase 9 — Admin › Users. Add/remove team members, reset passwords, change
// your own. Lives inside the admin-only Admin tab; the roster syncs through
// /api/users exactly like records do, so a user added here can sign in on any
// machine a few seconds later.

import { useCallback, useEffect, useState } from 'react';
import {
  fetchSharedUsers,
  generateApiToken,
  listApiTokens,
  putSharedUsers,
  revokeApiToken,
  type ApiTokenDisplay,
} from '../lib/api';
import {
  activeUsers,
  findUser,
  hashPassword,
  isLastAdmin,
  looksLikeEmail,
  makeUser,
  newSalt,
  normalizeEmail,
  saveCachedUsers,
  verifyPassword,
} from '../lib/auth';
import type { Session, TeamUser, UserRole } from '../types';
import { Bone, SkeletonStatus } from './Skeleton';

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
  const [newEmail, setNewEmail] = useState('');

  // Inline account editing (Aboud 2026-11-15): display name + email.
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // Per-row inline actions: which row has its reset box open, and the value.
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Change-my-password form.
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');

  // Bot API tokens (admin-only, item 14). The full secret is only ever held in
  // `newToken` — shown once in the modal, then dropped. Never logged.
  const isAdmin = session.role === 'admin';
  const [tokens, setTokens] = useState<ApiTokenDisplay[]>([]);
  const [tokensLoaded, setTokensLoaded] = useState<'loading' | 'ok' | 'error'>('loading');
  const [newToken, setNewToken] = useState<{ token: string; record: ApiTokenDisplay } | null>(null);

  useEffect(() => {
    fetchSharedUsers()
      .then((users) => {
        setRoster(users);
        saveCachedUsers(users);
        setLoaded('ok');
      })
      .catch(() => setLoaded('error'));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      listApiTokens()
        .then((list) => {
          setTokens(list);
          setTokensLoaded('ok');
        })
        .catch(() => setTokensLoaded('error'));
    } catch {
      setTokensLoaded('error');
    }
  }, [isAdmin]);

  const generateToken = async (username: string) => {
    try {
      const made = await generateApiToken(username);
      setNewToken(made);
      // Prepend so the newest sits at the top of the list immediately.
      setTokens((prev) => [made.record, ...prev.filter((t) => t.id !== made.record.id)]);
      setTokensLoaded('ok');
      toast(`Created an API token for ${username}.`);
    } catch {
      toast('Could not create the token — check the connection and try again.');
    }
  };

  const revokeToken = async (id: string) => {
    try {
      const { record } = await revokeApiToken(id);
      setTokens((prev) => prev.map((t) => (t.id === id ? record : t)));
      toast('Token revoked.');
    } catch {
      toast('Could not revoke the token — check the connection and try again.');
    }
  };

  const copyToken = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Token copied to the clipboard.');
    } catch {
      toast('Could not copy — select the field and copy it manually.');
    }
  };

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
    if (newEmail.trim() && !looksLikeEmail(newEmail)) {
      toast('That email does not look right — name@company.com, or leave it empty.');
      return;
    }
    if (findUser(roster, handle)) {
      toast(`"${handle}" is already taken.`);
      return;
    }
    const user = await makeUser(handle, newDisplay, newRole, newPassword, newEmail);
    push([...roster.filter((u) => u.username !== handle), user]);
    setNewUsername('');
    setNewDisplay('');
    setNewPassword('');
    setNewEmail('');
    setNewRole('member');
    toast(`Added ${user.displayName}.`);
  };

  /** Save an inline account edit: display name + email (Aboud 2026-11-15). */
  const saveEdit = (username: string) => {
    if (!editName.trim()) {
      toast('The display name cannot be empty.');
      return;
    }
    if (editEmail.trim() && !looksLikeEmail(editEmail)) {
      toast('That email does not look right — name@company.com, or leave it empty.');
      return;
    }
    const email = normalizeEmail(editEmail);
    const now = new Date().toISOString();
    push(
      roster.map((u) => {
        if (u.username !== username) return u;
        const next = { ...u, displayName: editName.trim(), updatedAt: now };
        // A cleared box REMOVES the email — undefined keys drop on save.
        if (email) next.email = email;
        else delete next.email;
        return next;
      }),
    );
    setEditFor(null);
    toast('Account updated.');
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
        {loaded === 'loading' && (
          // Same table the roster renders into, drawn in bones: the loaded
          // list replaces this without the card changing height or shape.
          <SkeletonStatus message="Loading the roster…">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td>
                      <Bone style={{ width: 72 }} />
                    </td>
                    <td>
                      <Bone style={{ width: 120 }} />
                    </td>
                    <td>
                      <Bone style={{ width: 150 }} />
                    </td>
                    <td>
                      <Bone style={{ width: 52 }} />
                    </td>
                    <td>
                      <Bone style={{ width: 90 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SkeletonStatus>
        )}
        {loaded === 'error' && <p>Could not load the roster — check the connection and reload.</p>}
        {loaded === 'ok' && (
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.username}>
                  <td>{u.username}</td>
                  <td>
                    {editFor === u.username ? (
                      <>
                        <input
                          type="text"
                          aria-label="Display name"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <span className="field-hint">
                          Old posts and board rows keep the previous name.
                        </span>
                      </>
                    ) : (
                      u.displayName
                    )}
                  </td>
                  <td>
                    {editFor === u.username ? (
                      <input
                        type="email"
                        aria-label="Email"
                        placeholder="name@company.com"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                      />
                    ) : (
                      u.email ?? '—'
                    )}
                  </td>
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
                    {editFor === u.username ? (
                      <>
                        <button className="btn small primary" onClick={() => saveEdit(u.username)}>
                          Save
                        </button>
                        <button className="btn small secondary" onClick={() => setEditFor(null)}>
                          Cancel
                        </button>
                      </>
                    ) : resetFor === u.username ? (
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
                        <button
                          className="btn small secondary"
                          onClick={() => {
                            setEditFor(u.username);
                            setEditName(u.displayName);
                            setEditEmail(u.email ?? '');
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn small secondary" onClick={() => setResetFor(u.username)}>
                          Reset password
                        </button>
                        {isAdmin && (
                          <button className="btn small secondary" onClick={() => void generateToken(u.username)}>
                            API token
                          </button>
                        )}
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

      {isAdmin && (
        <div className="card">
          <h3>API tokens</h3>
          <p className="field-hint" style={{ maxWidth: 'none' }}>
            Bot / integration tokens. Use the “API token” button on a team member above to mint one for them.
            The full value is shown once at creation and cannot be retrieved afterwards — copy it then.
          </p>
          {tokensLoaded === 'loading' && <p>Loading tokens…</p>}
          {tokensLoaded === 'error' && <p>Could not load the tokens — check the connection and reload.</p>}
          {tokensLoaded === 'ok' &&
            (tokens.length === 0 ? (
              <p className="field-hint" style={{ maxWidth: 'none' }}>
                No tokens yet.
              </p>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>User</th>
                    <th>Label</th>
                    <th>Created</th>
                    <th>Last used</th>
                    <th aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <code>{t.prefix}…</code>
                      </td>
                      <td>{t.username}</td>
                      <td>{t.label || '—'}</td>
                      <td>{fmtDate(t.createdAt)}</td>
                      <td>{t.lastUsedAt ? fmtDate(t.lastUsedAt) : '—'}</td>
                      <td className="users-actions">
                        {t.revokedAt ? (
                          <span className="field-hint" style={{ margin: 0 }}>
                            Revoked {fmtDate(t.revokedAt)}
                          </span>
                        ) : (
                          <button className="btn small danger" onClick={() => void revokeToken(t.id)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </div>
      )}

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
            Email (optional)
            <input
              type="email"
              placeholder="name@company.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
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

      {newToken && (
        <div className="modal-overlay" onClick={() => setNewToken(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, textTransform: 'none', letterSpacing: 0 }}>
              API token for {newToken.record.username}
            </h3>
            <p className="field-hint warn" style={{ maxWidth: 'none', margin: 0 }}>
              Copy this now — it will not be shown again. Store it somewhere safe; anyone with it can call the API as
              this user.
            </p>
            <div className="token-reveal">
              <input
                type="text"
                readOnly
                aria-label="API token"
                value={newToken.token}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="btn small primary" onClick={() => void copyToken(newToken.token)}>
                Copy
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setNewToken(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Short, local date for the token table — created / last used / revoked. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}
