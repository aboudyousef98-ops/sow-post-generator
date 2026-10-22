import React, { useState } from 'react';
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
