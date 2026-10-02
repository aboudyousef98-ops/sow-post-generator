import { useMemo, useRef, useState } from 'react';
import { downloadExport, readImportFile } from '../lib/dataio';
import { isoToUs } from '../lib/dates';
import { applyQuery, authorsIn, defaultQuery } from '../lib/listQuery';
import { buildPostHtml, buildPostText } from '../lib/template';
import type { Ahj, PostRecord, Settings } from '../types';
import ListControls from './ListControls';

interface Props {
  history: PostRecord[];
  settings: Settings;
  records: PostRecord[];
  setRecords: (r: PostRecord[]) => void;
  setSettings: (s: Settings) => void;
  ahjs: Ahj[];
  setAhjs: (a: Ahj[]) => void;
  toast: (text: string) => void;
}

export default function HistoryTab({ history, settings, records, setRecords, setSettings, ahjs, setAhjs, toast }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [importSettingsToo, setImportSettingsToo] = useState(false);
  const [query, setQuery] = useState(() => defaultQuery('posted'));
  const shown = useMemo(() => applyQuery(history, query), [history, query]);
  const open = history.find((r) => r.id === openId);

  // Posted records copy their FROZEN text/html (finalText/finalHtml). The
  // rebuild fallbacks (old records posted before finalHtml existed) never see
  // live AHJ boards, so History output can't drift after posting.
  const copy = async (rec: PostRecord, rich: boolean) => {
    const text = rec.finalText ?? buildPostText(rec, settings);
    if (rich) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([rec.finalHtml ?? buildPostHtml(rec, settings)], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } catch {
        await navigator.clipboard.writeText(text);
      }
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast('Copied.');
  };

  const onImport = async (file: File) => {
    try {
      const result = await readImportFile(file, records, importSettingsToo, ahjs);
      setRecords(result.records);
      setAhjs(result.ahjs);
      if (result.settings) setSettings(result.settings);
      toast(result.summary);
    } catch (err) {
      toast((err as Error).message);
    }
  };

  if (open) {
    return (
      <div className="card">
        <button type="button" className="btn link" onClick={() => setOpenId(null)}>
          ← Back to history
        </button>
        <h3>
          {open.sf.customerName} — posted {open.postedAt ? new Date(open.postedAt).toLocaleString() : ''}
        </h3>
        <div className="preview" style={{ marginBottom: 12 }}>
          {open.finalText ?? buildPostText(open, settings)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn primary" onClick={() => void copy(open, true)}>
            Copy for Slack
          </button>
          <button type="button" className="btn secondary" onClick={() => void copy(open, false)}>
            Copy plain text
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="list-page">
      <div className="list-head">
        <h1>History</h1>
        <span className="muted">
          {history.length === 0 ? 'nothing posted yet' : `${history.length} posted · shared with the team`}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn secondary" onClick={() => downloadExport(settings, records, ahjs)}>
          Export JSON
        </button>
        <button type="button" className="btn secondary" onClick={() => importInput.current?.click()}>
          Import JSON
        </button>
        <label className="muted import-settings">
          <input
            type="checkbox"
            checked={importSettingsToo}
            onChange={(e) => setImportSettingsToo(e.target.checked)}
          />
          also import settings
        </label>
        <input
          ref={importInput}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
      </div>

      {history.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing posted yet. History is shared with the whole team — the Synced dot in the top bar
            shows whether this browser has reached the team store.
          </p>
        </div>
      ) : (
        <div className="card list-card">
          <ListControls
            query={query}
            onChange={setQuery}
            authors={authorsIn(history)}
            sortOptions={['posted', 'installDate', 'customer', 'level', 'region', 'author']}
            count={shown.length}
            total={history.length}
          />
          <table className="list">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Install</th>
                <th>Region</th>
                <th>Level</th>
                <th>Drivers</th>
                <th>Posted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="row" onClick={() => setOpenId(r.id)}>
                  <td>
                    <div className="cell-name">{r.sf.customerName || <span className="muted">Untitled</span>}</div>
                    <div className="cell-meta">by {r.author}</div>
                  </td>
                  <td className="nowrap">
                    {r.sf.installScheduledDate ? isoToUs(r.sf.installScheduledDate) : '—'}
                  </td>
                  <td className="nowrap">{r.sf.region}</td>
                  <td>
                    <span className={`level-badge l${r.level}`}>L{r.level}</span>
                  </td>
                  <td className="cell-meta">{r.drivers.join(', ') || '—'}</td>
                  <td className="nowrap cell-meta">
                    {r.postedAt ? new Date(r.postedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn small secondary" onClick={() => void copy(r, true)}>
                      Copy again
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
