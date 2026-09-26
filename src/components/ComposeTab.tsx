import { useCallback, useEffect, useRef, useState } from 'react';
import { extract, rewrite } from '../lib/api';
import { LEVEL_INFO } from '../lib/classify';
import { todayIso } from '../lib/dates';
import { fileToDataUrl, ImageTooLargeError } from '../lib/image';
import { extractedToFields, installWeekday, mergeSfFields, parseSfText } from '../lib/parser';
import { autoTags } from '../lib/record';
import { droppedTokens } from '../lib/tokenGuard';
import type { Level, NoteKey, PostRecord, Region, Settings } from '../types';
import OutputColumn from './OutputColumn';

interface Props {
  record: PostRecord;
  settings: Settings;
  setSettings: (s: Settings) => void;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onMarkPosted: () => void;
  onNewPost: () => void;
  toast: (text: string) => void;
  aiAvailable: boolean;
}

const NOTE_FIELDS: { key: NoteKey; label: string }[] = [
  { key: 'layout', label: 'Installation Layout' },
  { key: 'siteSurvey', label: 'Site Survey Feedback' },
  { key: 'design', label: 'Design Feedback' },
  { key: 'homeowner', label: 'Homeowner Feedback' },
];

export default function ComposeTab({
  record,
  settings,
  setSettings,
  update,
  onMarkPosted,
  onNewPost,
  toast,
  aiAvailable,
}: Props) {
  const [manualFields, setManualFields] = useState<Set<string>>(new Set());
  const [rawPairs, setRawPairs] = useState<Record<string, string> | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [polishState, setPolishState] = useState<{ busy: boolean; ms?: number; error?: string }>({ busy: false });
  const [extractState, setExtractState] = useState<{ busy: boolean; error?: string; thumb?: string }>({ busy: false });
  const [dropped, setDropped] = useState<Partial<Record<NoteKey, string[]>>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  // ---- paste / extract ---------------------------------------------------

  const applyParsed = useCallback(
    (fields: Partial<PostRecord['sf']>, warnings: string[], pairs: Record<string, string>) => {
      setRawPairs(Object.keys(pairs).length ? pairs : null);
      update((r) => {
        const sf = mergeSfFields(r.sf, fields);
        sf.source = fields.source ?? r.sf.source;
        const region = sf.region ?? r.sf.region;
        const tags = region !== r.sf.region ? autoTags(region, settings, r.tags) : r.tags;
        return { ...r, sf, warnings, tags };
      });
      setManualFields(new Set());
    },
    [update, settings],
  );

  const handleText = useCallback(
    (text: string) => {
      const res = parseSfText(text, todayIso());
      applyParsed(res.fields, res.warnings, res.rawPairs);
    },
    [applyParsed],
  );

  const handleImage = useCallback(
    async (file: File | Blob) => {
      setExtractState({ busy: true });
      try {
        const dataUrl = await fileToDataUrl(file);
        const res = await extract(dataUrl);
        const mapped = extractedToFields(res.fields, todayIso());
        applyParsed(mapped.fields, mapped.warnings, {});
        setExtractState({ busy: false, thumb: dataUrl });
      } catch (err) {
        const msg =
          err instanceof ImageTooLargeError
            ? err.message
            : (err as { message?: string })?.message || 'Extraction failed.';
        setExtractState({ busy: false, error: msg });
      }
    },
    [applyParsed],
  );

  const onPaste = (e: React.ClipboardEvent) => {
    // Image first, then text (spec/01 §Paste zone).
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void handleImage(file);
          return;
        }
      }
    }
    const text = e.clipboardData.getData('text/plain');
    if (text.trim()) {
      e.preventDefault();
      handleText(text);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) void handleImage(file);
  };

  // ---- SF field edits ----------------------------------------------------

  const setSf = (patch: Partial<PostRecord['sf']>, fieldName: string) => {
    setManualFields((s) => new Set(s).add(fieldName));
    update((r) => {
      const sf = { ...r.sf, ...patch };
      const tags = patch.region && patch.region !== r.sf.region ? autoTags(patch.region, settings, r.tags) : r.tags;
      return { ...r, sf, tags };
    });
  };

  const badge = (fieldName: string) => {
    if (record.sf.source === 'manual') return null;
    const src = manualFields.has(fieldName) ? 'manual' : record.sf.source;
    return <span className="badge">source: {src}</span>;
  };

  // ---- notes / polish ----------------------------------------------------

  const setNote = (key: NoteKey, value: string) => {
    setDropped((d) => ({ ...d, [key]: undefined }));
    update((r) => {
      // Editing the raw draft invalidates that field's stale polished version.
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return { ...r, notes: { ...r.notes, [key]: value }, polished };
    });
  };

  const appendChip = (key: NoteKey, phrase: string) => {
    update((r) => ({
      ...r,
      notes: { ...r.notes, [key]: r.notes[key] ? `${r.notes[key].replace(/\s+$/, '')} ${phrase}` : phrase },
    }));
  };

  const polish = useCallback(async () => {
    if (polishState.busy) return;
    setPolishState({ busy: true });
    try {
      const res = await rewrite(record.notes);
      const nextDropped: Partial<Record<NoteKey, string[]>> = {};
      for (const { key } of NOTE_FIELDS) {
        if (record.notes[key].trim() && res.polished[key]) {
          nextDropped[key] = droppedTokens(record.notes[key], res.polished[key]);
        }
      }
      setDropped(nextDropped);
      update((r) => ({
        ...r,
        polished: res.polished,
        usePolished: { layout: true, siteSurvey: true, design: true, homeowner: true },
      }));
      setPolishState({ busy: false, ms: res.ms });
    } catch (err) {
      setPolishState({ busy: false, error: (err as { message?: string })?.message || 'Request failed.' });
    }
  }, [record.notes, polishState.busy, update]);

  const revertNote = (key: NoteKey, usePolished: boolean) => {
    update((r) => ({ ...r, usePolished: { ...r.usePolished, [key]: usePolished } }));
  };

  // Keyboard: Ctrl+Enter in a note field = Polish (bound on the textareas);
  // Ctrl+Shift+C = Copy for Slack (bound globally in OutputColumn).
  const noteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void polish();
    }
  };

  // Persist "Posting as" last choice.
  useEffect(() => {
    if (record.author && settings.lastAuthor !== record.author) {
      setSettings({ ...settings, lastAuthor: record.author });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.author]);

  const weekday = installWeekday(record.sf.installScheduledDate || undefined);

  return (
    <div className="compose-grid">
      <div className="card">
        <h3>Source</h3>
        <label className="field">
          Posting as
          <select value={record.author} onChange={(e) => update((r) => ({ ...r, author: e.target.value }))}>
            {settings.authors.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>

        <div
          className="paste-zone"
          tabIndex={0}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInput.current?.click()}
        >
          {extractState.busy ? (
            <span>
              <span className="spin">⏳</span> Extracting…
            </span>
          ) : (
            <span>
              Click here, then <b>Ctrl+V</b> the Salesforce page text or a screenshot.
              <br />
              <span className="muted">(or drag-drop / click to pick an image)</span>
            </span>
          )}
          {extractState.thumb && !extractState.busy && (
            <div>
              <img className="thumb" src={extractState.thumb} alt="pasted screenshot" />
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImage(f);
              e.target.value = '';
            }}
          />
        </div>
        {extractState.error && <div className="error-inline">{extractState.error}</div>}

        {record.warnings.length > 0 && (
          <div className="warnings">
            {record.warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Project details</h3>
        <div className="fields-2col">
          <label className="field">
            Customer name *{badge('customerName')}
            <input
              type="text"
              value={record.sf.customerName}
              onChange={(e) => setSf({ customerName: e.target.value }, 'customerName')}
            />
          </label>
          <label className="field">
            Install Scheduled Date * {weekday && <span className="badge">→ {weekday}</span>}
            {badge('installScheduledDate')}
            <input
              type="date"
              value={record.sf.installScheduledDate}
              onChange={(e) => setSf({ installScheduledDate: e.target.value }, 'installScheduledDate')}
            />
          </label>
          <label className="field">
            Install Region *{badge('region')}
            <select
              value={record.sf.region}
              onChange={(e) => setSf({ region: e.target.value as Region }, 'region')}
            >
              <option value="HOU">HOU</option>
              <option value="DFW">DFW</option>
              <option value="OTHER">Other…</option>
            </select>
          </label>
          <label className="field">
            Jurisdiction{badge('jurisdiction')}
            <input
              type="text"
              value={record.sf.jurisdiction ?? ''}
              onChange={(e) => setSf({ jurisdiction: e.target.value }, 'jurisdiction')}
            />
          </label>
          {record.sf.region === 'OTHER' && (
            <label className="field">
              Region text (printed in the post)
              <input
                type="text"
                value={record.sf.installRegionRaw ?? ''}
                onChange={(e) => setSf({ installRegionRaw: e.target.value }, 'installRegionRaw')}
              />
            </label>
          )}
          <label className="field">
            Site address{badge('siteAddress')}
            <input
              type="text"
              value={record.sf.siteAddress ?? ''}
              onChange={(e) => setSf({ siteAddress: e.target.value }, 'siteAddress')}
            />
          </label>
          <label className="field">
            System size (kW){badge('systemSizeKw')}
            <input
              type="number"
              step="0.01"
              value={record.sf.systemSizeKw ?? ''}
              onChange={(e) =>
                setSf({ systemSizeKw: e.target.value ? Number(e.target.value) : undefined }, 'systemSizeKw')
              }
            />
          </label>
          <label className="field">
            Project Level
            <select
              value={record.level}
              onChange={(e) =>
                update((r) => {
                  const level = Number(e.target.value) as Level;
                  return { ...r, level, suggestedLevel: level };
                })
              }
            >
              <option value={1}>Level 1 – Standard Installation</option>
              <option value={2}>Level 2 – Extended Routing & Integration</option>
              <option value={3}>Level 3 – Service Equipment Modification</option>
              <option value={4}>Level 4 – Major Electrical & Civil Construction</option>
            </select>
            <span className="level-info">
              <b>Scope:</b> {LEVEL_INFO[record.level].scope}
              <br />
              <b>Planning window:</b> {LEVEL_INFO[record.level].window}
            </span>
          </label>
        </div>
        {(record.sf.scheduledWorkItems || record.sf.coordinatorNotes) && (
          <details style={{ marginTop: 4 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              Coordination info from Salesforce (reference only)
            </summary>
            {record.sf.scheduledWorkItems && (
              <pre className="muted" style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{record.sf.scheduledWorkItems}</pre>
            )}
            {record.sf.coordinatorNotes && (
              <pre className="muted" style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{record.sf.coordinatorNotes}</pre>
            )}
          </details>
        )}
        {rawPairs && (
          <>
            <button type="button" className="btn link small" onClick={() => setShowRaw((s) => !s)}>
              {showRaw ? 'Hide raw' : 'Show raw'}
            </button>
            {showRaw && (
              <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(rawPairs, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>Notes</h3>
        {NOTE_FIELDS.map(({ key, label }) => {
          const polished = record.polished?.[key];
          const hasPolished = polished !== undefined && record.notes[key].trim() !== '';
          return (
            <div className="note-block" key={key}>
              <div className="note-head">
                <label className="field" style={{ marginBottom: 0 }}>
                  {label}
                </label>
                {hasPolished && (
                  <button
                    type="button"
                    className="btn link small"
                    onClick={() => revertNote(key, !record.usePolished[key])}
                  >
                    {record.usePolished[key] ? 'Revert to my draft' : 'Use polished'}
                  </button>
                )}
              </div>
              <textarea
                value={record.notes[key]}
                onChange={(e) => setNote(key, e.target.value)}
                onKeyDown={noteKeyDown}
                placeholder={
                  key === 'siteSurvey' || key === 'design'
                    ? 'Empty → "All good."'
                    : key === 'homeowner'
                      ? 'Empty → "No feedback."'
                      : 'Describe the layout in your own words (Arabic/English ok — AI will polish)'
                }
              />
              {hasPolished && record.usePolished[key] && (
                <div className="muted" style={{ marginTop: 3 }}>
                  ✨ {polished}
                </div>
              )}
              {dropped[key] && dropped[key]!.length > 0 && (
                <div className="dropped-tokens">
                  AI output dropped: {dropped[key]!.map((t) => `\`${t}\``).join(', ')} — check before posting
                </div>
              )}
              <div className="chips">
                {settings.chips[key]?.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className="chip"
                    title={c}
                    onClick={() => appendChip(key, c)}
                  >
                    {c.length > 48 ? `${c.slice(0, 48)}…` : c}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className="btn primary"
          disabled={polishState.busy || !aiAvailable}
          onClick={() => void polish()}
          title={aiAvailable ? 'Ctrl+Enter in any note field' : 'AI offline — manual flow still works'}
        >
          {polishState.busy ? (
            <span>
              <span className="spin">✨</span> Polishing…
            </span>
          ) : (
            '✨ Polish with AI'
          )}
        </button>
        {polishState.ms !== undefined && !polishState.busy && (
          <span className="muted" style={{ marginLeft: 8 }}>
            Polished ✓ {(polishState.ms / 1000).toFixed(1)}s
          </span>
        )}
        {polishState.error && (
          <div className="error-inline">
            {polishState.error}{' '}
            <button type="button" className="btn link small" onClick={() => void polish()}>
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Tags</h3>
        <div className="chips">
          {record.tags.map((t) => (
            <span key={t} className="tag-chip">
              @{t}
              <button
                type="button"
                onClick={() => update((r) => ({ ...r, tags: r.tags.filter((x) => x !== t) }))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="fields-2col" style={{ marginTop: 8 }}>
          <label className="field">
            Add tag
            <input
              type="text"
              placeholder="Type a name and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) {
                    update((r) => ({ ...r, tags: [...r.tags, v] }));
                    (e.target as HTMLInputElement).value = '';
                  }
                }
              }}
            />
          </label>
          <label className="field">
            Designer / Installer
            <select
              value={record.designerTag ?? ''}
              onChange={(e) => update((r) => ({ ...r, designerTag: e.target.value || undefined }))}
            >
              <option value="">none</option>
              {settings.designers.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <OutputColumn
        record={record}
        settings={settings}
        onMarkPosted={onMarkPosted}
        onNewPost={onNewPost}
        toast={toast}
      />
    </div>
  );
}
