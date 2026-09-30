// Last line of defence. Everything the team writes lives in localStorage, so a
// render crash used to mean a white screen that came back on every reload —
// the only way out was clearing site data by hand. This catches the throw,
// shows what happened, and offers the two escapes: reload, or export the data
// and then clear it.

import React from 'react';
import { loadRecords } from '../lib/storage';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[sowpost] render crash', error, info.componentStack);
  }

  /** Download whatever is still readable, so "clear and start over" is not destructive. */
  private downloadBackup = () => {
    try {
      const blob = new Blob([JSON.stringify({ records: loadRecords() }, null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sow-posts-rescue.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // The store itself may be the thing that is broken — nothing else to try.
      alert('Could not read the saved posts. Copy them from the browser devtools if you need them.');
    }
  };

  private clearAndReload = () => {
    localStorage.clear();
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <h1>Something broke while drawing the page</h1>
        <p>
          Your saved posts are still on this computer. Try reloading first — if it keeps crashing,
          download a backup and then clear the local data.
        </p>
        <pre className="crash-detail">{this.state.error.message}</pre>
        <div className="crash-actions">
          <button type="button" className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button type="button" className="btn" onClick={this.downloadBackup}>
            Download backup
          </button>
          <button type="button" className="btn danger" onClick={this.clearAndReload}>
            Clear local data and restart
          </button>
        </div>
      </div>
    );
  }
}
