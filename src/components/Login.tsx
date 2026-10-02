// Phase 9 login screen. Shown by AuthGate (main.tsx) until a session exists.
// Checks the shared roster fetched from /api/users; falls back to the cached
// copy in localStorage when Netlify is unreachable, so a laptop that has
// logged in before still works offline.

import { useEffect, useRef, useState } from 'react';
import { fetchSharedUsers } from '../lib/api';
import { findUser, loadCachedUsers, saveCachedUsers, verifyPassword } from '../lib/auth';
import type { Session, TeamUser } from '../types';

export default function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<TeamUser[]>(() => loadCachedUsers());
  const [rosterState, setRosterState] = useState<'loading' | 'online' | 'offline'>('loading');
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
    fetchSharedUsers()
      .then((users) => {
        setRoster(users);
        saveCachedUsers(users);
        setRosterState('online');
      })
      .catch(() => setRosterState('offline'));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // A fast submit can beat the roster fetch; never fail on a list we
      // simply haven't received yet — fetch it now and decide on the result.
      let users = roster;
      if (users.length === 0) {
        users = await fetchSharedUsers().catch(() => roster);
        if (users.length > 0) {
          setRoster(users);
          saveCachedUsers(users);
          setRosterState('online');
        }
      }
      const user = findUser(users, username);
      if (!user || !(await verifyPassword(user, password))) {
        // One message for both cases, on purpose — do not confirm which usernames exist.
        setError('Wrong username or password.');
        return;
      }
      onLogin({ username: user.username, displayName: user.displayName, role: user.role });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={submit}>
        <img src="/dyn-logo.png" alt="Dynamic EcoHome" />
        <h2>SOW Operational Tool</h2>
        <p className="login-sub">Sign in to continue</p>
        <label>
          Username
          <input
            ref={userRef}
            type="text"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        {rosterState === 'offline' && roster.length === 0 && (
          <div className="login-error">
            Can’t reach the server, and this browser has never logged in before — connect once to sign in.
          </div>
        )}
        <button className="btn primary" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
