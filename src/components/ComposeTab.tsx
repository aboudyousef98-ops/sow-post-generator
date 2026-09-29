import { useCallback, useEffect, useRef, useState } from 'react';
import { extract, regionLookup, rewrite } from '../lib/api';
import { LEVEL_INFO } from '../lib/classify';
import { todayIso } from '../lib/dates';
import { metroCityName, nearestMetro, type Metro } from '../lib/geo';
import { fileToDataUrl, ImageTooLargeError } from '../lib/image';
import { livePosts, matchAhj } from '../lib/ahj';
import { extractedToFields, installWeekday, mergeSfFields, parseSfText } from '../lib/parser';
import { autoTags } from '../lib/record';
import { bulletCountChange, droppedTokens } from '../lib/tokenGuard';
import type { Ahj, Level, NoteKey, PostRecord, Region, Settings, SfFields } from '../types';
import OutputColumn from './OutputColumn';

interface Props {
  record: PostRecord;
  settings: Settings;
  setSettings: (s: Settings) => void;
  update: (updater: (r: PostRecord) => PostRecord) => void;
  onMarkPosted: () => void;
  onNewPost: () => void;
  onSaveDraft: () => void;
  toast: (text: string) => void;
  aiAvailable: boolean;
  ahjs: Ahj[];
  onOpenAhjBoard: (id: string) => void;
}

const NOTE_FIELDS: { key: 'siteSurvey' | 'design' | 'homeowner'; label: string }[] = [
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
  onSaveDraft,
  toast,
  aiAvailable,
  ahjs,
  onOpenAhjBoard,
}: Props) {
  const [manualFields, setManualFields] = useState<Set<string>>(new Set());
  const [rawPairs, setRawPairs] = useState<Record<string, string> | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [polishState, setPolishState] = useState<{ busy: boolean; ms?: number; error?: string }>({ busy: false });
  const [extractState, setExtractState] = useState<{ busy: boolean; error?: string; thumb?: string }>({ busy: false });
  const [dropped, setDropped] = useState<Partial<Record<NoteKey, string[]>>>({});
  // Set when the AI returned a different number of bullets than we sent it.
  const [bulletDrift, setBulletDrift] = useState<Partial<Record<NoteKey, { from: number; to: number }>>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  // ---- nearest-metro resolution for OTHER regions ------------------------

  /** Offline city table first; AI fallback only for unknown places. */
  const resolveNear = useCallback(
    async (sf: SfFields) => {
      const location = [sf.installRegionRaw, sf.jurisdiction, sf.siteAddress].filter(Boolean).join(', ');
      if (!location) return;
      let metro: Metro | null = nearestMetro(location)?.metro ?? null;
      if (!metro && aiAvailable) {
        try {
          metro = (await regionLookup(location)).metro;
        } catch {
          return; // leave the "please select" warning in place
        }
      }
      if (!metro) return;
      const m = metro;
      update((r) => {
        if (r.sf.region !== 'OTHER' || r.sf.nearMetro) return r;
        const warnings = [
          ...r.warnings.filter((w) => !w.startsWith('Region not recognized')),
          `Region "${r.sf.installRegionRaw ?? location}" resolved as Near ${metroCityName(m)} — please confirm the tag.`,
        ];
        return { ...r, sf: { ...r.sf, nearMetro: m }, warnings, tags: autoTags(m, settings, r.tags) };
      });
    },
    [aiAvailable, update, settings],
  );

  // ---- paste / extract ---------------------------------------------------

  const applyParsed = useCallback(
    (fields: Partial<PostRecord['sf']>, warnings: string[], pairs: Record<string, string>) => {
      setRawPairs(Object.keys(pairs).length ? pairs : null);
      const merged = mergeSfFields(record.sf, fields);
      update((r) => {
        const sf = mergeSfFields(r.sf, fields);
        sf.source = fields.source ?? r.sf.source;
        if (sf.region !== 'OTHER') sf.nearMetro = undefined;
        const lead: Region = sf.region === 'OTHER' ? (sf.nearMetro ?? 'OTHER') : sf.region;
        return { ...r, sf, warnings, tags: autoTags(lead, settings, r.tags) };
      });
      setManualFields(new Set());
      if (merged.region === 'OTHER' && !merged.nearMetro) void resolveNear(merged);
    },
    [update, settings, record.sf, resolveNear],
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
      if (patch.region && patch.region !== 'OTHER') sf.nearMetro = undefined;
      const regionish = patch.region !== undefined || 'nearMetro' in patch;
      const lead: Region = sf.region === 'OTHER' ? (sf.nearMetro ?? 'OTHER') : sf.region;
      const tags = regionish ? autoTags(lead, settings, r.tags) : r.tags;
      return { ...r, sf, tags };
    });
    if (patch.region === 'OTHER') void resolveNear({ ...record.sf, ...patch });
  };

  // ---- AHJ requirements banner (Phase 5) ---------------------------------
  // Approval is stored as the approved AHJ's id (record.ahjApprovedId), so it
  // is inherently per-AHJ: a different match shows unticked, a typo that
  // briefly breaks the match doesn't destroy the approval, and reopening a
  // draft keeps whatever the designer decided.

  const ahjMatch = matchAhj(record.sf.jurisdiction, ahjs);
  const ahjPosts = ahjMatch ? livePosts(ahjMatch.ahj) : [];
  const ahjApproved = !!ahjMatch && record.ahjApprovedId === ahjMatch.ahj.id;

  const badge = (fieldName: string) => {
    if (record.sf.source === 'manual') return null;
    const src = manualFields.has(fieldName) ? 'manual' : record.sf.source;
    return <span className="badge">source: {src}</span>;
  };

  // ---- notes / polish ----------------------------------------------------

  const setNote = (key: NoteKey, value: string) => {
    setDropped((d) => ({ ...d, [key]: undefined }));
    setBulletDrift((d) => ({ ...d, [key]: undefined }));
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
      const nextDrift: Partial<Record<NoteKey, { from: number; to: number }>> = {};
      for (const { key } of NOTE_FIELDS) {
        if (record.notes[key].trim() && res.polished[key]) {
          nextDropped[key] = droppedTokens(record.notes[key], res.polished[key]);
          // The prompt forbids merging bullets, but the model can still do it.
          nextDrift[key] = bulletCountChange(record.notes[key], res.polished[key]) ?? undefined;
        }
      }
      setDropped(nextDropped);
      setBulletDrift(nextDrift);
      update((r) => ({
        ...r,
        polished: res.polished,
        usePolished: {}, // absent means ON for every box
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

        <div className="paste-split">
          <div className="paste-zone" tabIndex={0} onPaste={onPaste}>
            <span>
              📋 <b>Paste text</b>
              <br />
              Click here, then <b>Ctrl+V</b> the Salesforce page text.
            </span>
          </div>
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
                🖼 <b>Attach a screenshot</b>
                <br />
                Click to choose an image, or <b>Ctrl+V</b> / drag-drop it here.
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
            Jurisdiction *{badge('jurisdiction')}
            <input
              type="text"
              value={record.sf.jurisdiction ?? ''}
              onChange={(e) => setSf({ jurisdiction: e.target.value }, 'jurisdiction')}
            />
          </label>
          {ahjMatch && (
            <div className="ahj-banner">
              <div className="ahj-banner-head">
                <strong style={{ color: 'var(--dyn-ink)', fontSize: 14.5 }}>
                  ⚠ AHJ requirements on file — {ahjMatch.ahj.name}
                </strong>
                <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 12, flexWrap: 'wrap' }}>
                  <span>
                    {ahjMatch.via === 'name' ? 'Matched by name' : `Matched alias “${ahjMatch.via}”`} ·{' '}
                    {ahjPosts.length} requirement{ahjPosts.length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenAhjBoard(ahjMatch.ahj.id)}
                    style={{ background: 'none', border: 0, padding: 0, color: 'var(--dyn-navy)', fontWeight: 700, cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                  >
                    Open board
                  </button>
                </span>
              </div>
              <div className="ahj-banner-posts">
                {ahjPosts.map((p) => (
                  <div key={p.id} className="ahj-banner-post">
                    <span className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--dyn-ink)' }}>{p.by}</strong>
                      {new Date(p.editedAt ?? p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {p.editedAt && ' · edited'}
                      {p.pinned && <span className="pin-chip" style={{ fontSize: 11, padding: '1px 8px' }}>Pinned</span>}
                    </span>
                    <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, color: 'var(--dyn-ink)', fontSize: 13.5 }}>
                      {p.text}
                    </span>
                  </div>
                ))}
                {ahjPosts.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No requirement posts yet.</div>}
              </div>
              <label className="ahj-banner-include">
                <input
                  type="checkbox"
                  checked={ahjApproved}
                  disabled={ahjPosts.length === 0}
                  onChange={(e) => {
                    const approvedId = e.target.checked ? ahjMatch.ahj.id : undefined;
                    update((r) => ({ ...r, ahjApprovedId: approvedId }));
                  }}
                />
                Include AHJ requirements in the post
              </label>
            </div>
          )}
          {record.sf.region === 'OTHER' && (
            <>
              <label className="field">
                Region text (printed in the post)
                <input
                  type="text"
                  value={record.sf.installRegionRaw ?? ''}
                  onChange={(e) => setSf({ installRegionRaw: e.target.value }, 'installRegionRaw')}
                />
              </label>
              <label className="field">
                Nearest metro (sets the lead tag + "– Near …")
                <select
                  value={record.sf.nearMetro ?? ''}
                  onChange={(e) =>
                    setSf({ nearMetro: (e.target.value || undefined) as Metro | undefined }, 'nearMetro')
                  }
                >
                  <option value="">— detecting / choose —</option>
                  <option value="HOU">Near Houston</option>
                  <option value="DFW">Near Dallas</option>
                </select>
              </label>
            </>
          )}
          <label className="field">
            Site address *{badge('siteAddress')}
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
                    onClick={() => revertNote(key, !(record.usePolished[key] !== false))}
                  >
                    {record.usePolished[key] !== false ? 'Revert to my draft' : 'Use polished'}
                  </button>
                )}
              </div>
              <textarea
                value={record.notes[key]}
                onChange={(e) => setNote(key, e.target.value)}
                onKeyDown={noteKeyDown}
                placeholder={
                  key === 'siteSurvey' || key === 'design'
                    ? 'One bullet per line. Empty → "All good."'
                    : key === 'homeowner'
                      ? 'One bullet per line. Empty → "No feedback."'
                      : 'One bullet per line — Arabic/English ok, AI will polish each line separately'
                }
              />
              {hasPolished && record.usePolished[key] !== false && (
                <div className="muted" style={{ marginTop: 3, whiteSpace: 'pre-wrap' }}>
                  ✨ {polished}
                </div>
              )}
              {dropped[key] && dropped[key]!.length > 0 && (
                <div className="dropped-tokens">
                  AI output dropped: {dropped[key]!.map((t) => `\`${t}\``).join(', ')} — check before posting
                </div>
              )}
              {bulletDrift[key] && (
                <div className="dropped-tokens">
                  AI returned {bulletDrift[key]!.to} bullet{bulletDrift[key]!.to === 1 ? '' : 's'} instead of{' '}
                  {bulletDrift[key]!.from} — check it before posting, or “Revert to my draft”.
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
        ahjs={ahjs}
        onMarkPosted={onMarkPosted}
        onNewPost={onNewPost}
        onSaveDraft={onSaveDraft}
        toast={toast}
      />
    </div>
  );
}
