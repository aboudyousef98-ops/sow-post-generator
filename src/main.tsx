import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './components/Login';
import { clearSession, loadSession, saveSession } from './lib/auth';
import { installStaleChunkAutoReload } from './lib/staleChunk';
import type { Session } from './types';
import './theme.css';

// After a deploy, a tab from the previous build asks for lazy chunks that no
// longer exist (the 2026-10-22 "Could not read the export" incident) — reload
// once to pick up the new build instead of surfacing a misleading error.
installStaleChunkAutoReload();

// The login gate lives OUTSIDE App on purpose: App (and its whole test suite)
// stays a pure "already signed in" application; the gate only decides which
// of the two screens the browser gets.
function AuthGate() {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  // Stable identity: App's roster effect lists this in its deps, and an inline
  // arrow would give it a new one every render and re-fetch the team list on
  // each one.
  const onSessionChange = useCallback((s: Session) => {
    saveSession(s);
    setSession(s);
  }, []);

  if (!session) {
    return (
      <Login
        onLogin={(s) => {
          saveSession(s);
          setSession(s);
        }}
      />
    );
  }

  return (
    <App
      session={session}
      // The users blob is authoritative for who someone is; the session is a
      // copy taken at login that nothing used to refresh. App calls this when
      // the roster pull shows the two have drifted — a rename or a role change
      // then lands without anyone having to sign out, which matters because
      // nobody ever does.
      onSessionChange={onSessionChange}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </React.StrictMode>,
);
