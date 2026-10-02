import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './components/Login';
import { clearSession, loadSession, saveSession } from './lib/auth';
import type { Session } from './types';
import './theme.css';

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
