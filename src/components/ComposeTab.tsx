import { useCallback, useEffect, useRef, useState } from 'react';
import { extract, MAX_NOTE_CHARS, regionLookup, rewrite } from '../lib/api';
import { LEVEL_INFO, LEVEL_NAMES } from '../lib/classify';
import { todayIso } from '../lib/dates';
import { metroCityName, nearestMetro, type Metro } from '../lib/geo';
import { fileToDataUrl, ImageTooLargeError } from '../lib/image';
import { titleCaseName } from '../lib/nameCase';
import { livePosts, matchAhj } from '../lib/ahj';
import { extractedToFields, installWeekday, mergeSfFields, parseSfText } from '../lib/parser';
import { autoTags } from '../lib/record';
import { bulletCountChange, droppedTokens } from '../lib/tokenGuard';
import { POLISH_KEYS, rawTextFor } from '../lib/installNotes';
import { labelById, labelTextColor, matchProjectByCustomer } from '../lib/board';
import type { BoardLabel, BoardProject } from '../board/types';
import type { Ahj, Level, PolishKey, PostRecord, Region, RewriteMode, Settings, SfFields } from '../types';
import InstallNotesCard from './InstallNotesCard';
import NoteBox from './NoteBox';
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
  /** Project Board rows/labels — READ ONLY (the board controls Compose, never the opposite). */
  boardProjects: BoardProject[];
  boardLabels: BoardLabel[];
  /** Jump to the board with this row highlighted. */
  onOpenBoard: (projectId: string) => void;
}

const FEEDBACK_FIELDS: { key: PolishKey; label: string; placeholder: string }[] = [
  { key: 'siteSurvey', label: 'Site Survey Feedback', placeholder: 'One bullet per line. Empty → "All good."' },
  { key: 'design', label: 'Design Feedback', placeholder: 'One bullet per line. Empty → "All good."' },
  { key: 'homeowner', label: 'Homeowner Feedback', placeholder: 'One bullet per line. Empty → "No feedback."' },
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
  boardProjects,
  boardLabels,
  onOpenBoard,
}: Props) {
  const [manualFields, setManualFields] = useState<Set<string>>(new Set());
  const [rawPairs, setRawPairs] = useState<Record<string, string> | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [polishState, setPolishState] = useState<{
    busy: false | RewriteMode;
    ms?: number;
    error?: string;
  }>({ busy: false });
  const [extractState, setExtractState] = useState<{ busy: boolean; error?: string; thumb?: string }>({ busy: false });
  const [dropped, setDropped] = useState<Partial<Record<PolishKey, string[]>>>({});
  // Set when the AI returned a different number of bullets than we sent it.
  const [bulletDrift, setBulletDrift] = useState<Partial<Record<PolishKey, { from: number; to: number }>>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  // The record as it is RIGHT NOW, for code that resumes after an await and
  // must not act on the version it closed over (see runAi).
  const recordRef = useRef(record);
  recordRef.current = record;

  // Everything below is per-project scratch state, not part of the record.
  // Switching project — opening a draft, or New post — must leave none of it
  // behind: AI guard hints under boxes that no longer hold that text, the
  // previous paste's raw panel, or a stale "manually edited" set.
  useEffect(() => {
    setDropped({});
    setBulletDrift({});
    setRawPairs(null);
    setShowRaw(false);
    setManualFields(new Set());
    setPolishState({ busy: false });
    setExtractState({ busy: false });
  }, [record.id]);

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

  const setNote = (key: 'siteSurvey' | 'design' | 'homeowner', value: string) => {
    setDropped((d) => ({ ...d, [key]: undefined }));
    setBulletDrift((d) => ({ ...d, [key]: undefined }));
    update((r) => {
      // Editing the raw draft invalidates that field's stale polished version.
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return { ...r, notes: { ...r.notes, [key]: value }, polished };
    });
  };

  const appendChip = (key: 'siteSurvey' | 'design' | 'homeowner', phrase: string) => {
    update((r) => {
      // A chip click also invalidates that field's stale polished version —
      // it changes the raw text just like typing does.
      const polished = r.polished ? { ...r.polished, [key]: undefined } : undefined;
      return {
        ...r,
        notes: { ...r.notes, [key]: r.notes[key] ? `${r.notes[key].replace(/\s+$/, '')}\n${phrase}` : phrase },
        polished,
      };
    });
  };

  /** Passed to InstallNotesCard so editing a box there clears its stale AI-guard hints too. */
  const clearDropped = (key: PolishKey) => setDropped((d) => ({ ...d, [key]: undefined }));
  const clearDrift = (key: PolishKey) => setBulletDrift((d) => ({ ...d, [key]: undefined }));

  const runAi = useCallback(
    async (mode: RewriteMode) => {
      if (polishState.busy) return;
      // Only non-empty free text is sent. Dropdown-derived sentences (walls,
      // orientation, stories, service) are never transmitted, so the model cannot
      // alter them (spec/10 §5).
      const items = POLISH_KEYS.map((id) => ({ id, text: rawTextFor(record, id) })).filter((i) => i.text.trim());
      if (!items.length) {
        toast('Nothing to polish yet — write a note first.');
        return;
      }
      // The server rejects anything over 3000 characters per box with a bare
      // "bad payload"; say which box, in words, before spending the request.
      const tooLong = items.find((i) => i.text.length > MAX_NOTE_CHARS);
      if (tooLong) {
        toast(`That note is too long for the AI (${tooLong.text.length} of ${MAX_NOTE_CHARS} characters) — shorten it first.`);
        return;
      }
      setPolishState({ busy: mode });
      try {
        const res = await rewrite(items, mode);
        const byId = new Map(res.items.map((i) => [i.id, i.text]));
        const polished: Partial<Record<PolishKey, string>> = {};
        const use: Partial<Record<PolishKey, boolean>> = {};
        const modes: Partial<Record<PolishKey, RewriteMode>> = {};
        const nextDropped: Partial<Record<PolishKey, string[]>> = {};
        const nextDrift: Partial<Record<PolishKey, { from: number; to: number }>> = {};
        for (const sent of items) {
          const out = byId.get(sent.id);
          if (out === undefined) continue; // model skipped it — that box keeps its raw draft
          // An empty answer is not an edit. Both guards ignore a blank polished
          // string, so storing it would silently erase the engineer's note from
          // the post while the textarea still showed it.
          if (!out.trim()) continue;
          // The user can type while the request is in flight. The reply is keyed
          // by id alone, so without this it would land on text they replaced.
          if (rawTextFor(recordRef.current, sent.id) !== sent.text) continue;
          polished[sent.id] = out;
          use[sent.id] = true;
          modes[sent.id] = mode;
          nextDropped[sent.id] = droppedTokens(sent.text, out);
          nextDrift[sent.id] = bulletCountChange(sent.text, out) ?? undefined;
        }
        setDropped(nextDropped);
        setBulletDrift(nextDrift);
        update((r) => ({
          ...r,
          polished: { ...r.polished, ...polished },
          usePolished: { ...r.usePolished, ...use },
          polishMode: { ...r.polishMode, ...modes },
        }));
        setPolishState({ busy: false, ms: res.ms });
      } catch (err) {
        setPolishState({ busy: false, error: (err as { message?: string })?.message || 'Request failed.' });
      }
    },
    [record, polishState.busy, update, toast],
  );

  const togglePolished = (key: PolishKey, usePolished: boolean) => {
    update((r) => ({ ...r, usePolished: { ...r.usePolished, [key]: usePolished } }));
  };

  // Keyboard: Ctrl+Enter in a note field = Polish (bound on the textareas);
  // Ctrl+Shift+C = Copy for Slack (bound globally in OutputColumn).
  const noteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void runAi('polish');
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
    <>
      <div className="compose-head">
        <h1>{record.sf.customerName.trim() || 'New post'}</h1>
        {/* The design replaces the Save button with this line. Aboud kept both
            (2026-09-30): the line explains the autosave, the button is the
            reassurance he asked for after two projects were lost. */}
        <span className="saved-line">Draft · saved automatically</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button type="button" className="btn secondary" onClick={onSaveDraft} title="Save this project to Drafts right now">
          💾 Save
        </button>
        <button type="button" className="btn secondary" onClick={onNewPost}>
          + New post
        </button>
      </div>

      {/* Board link — the board controls Compose, never the opposite: this bar
          only sets/clears the draft's projectId or navigates. The linked row
          may vanish (deleted on the board) — then the suggestion returns. */}
      {(() => {
        const linked = record.projectId
          ? boardProjects.find((p) => p.id === record.projectId && !p.deletedAt)
          : undefined;
        if (linked) {
          const status = labelById(boardLabels, linked.statusId);
          return (
            <div className="board-link-bar linked">
              <button
                type="button"
                className="board-link-chip"
                title="Show this project on the board"
                onClick={() => onOpenBoard(linked.id)}
              >
                📋 {linked.name}
                {status && (
                  <span
                    className="board-link-status"
                    style={{ background: status.color, color: labelTextColor(status.color) }}
                  >
                    {status.name}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="board-link-x"
                title="Unlink from the board"
                aria-label="Unlink from the board"
                onClick={() => update((r) => ({ ...r, projectId: undefined }))}
              >
                ✕
              </button>
            </div>
          );
        }
        if (record.status !== 'draft') return null;
        const match = matchProjectByCustomer(boardProjects, record.sf.customerName);
        if (!match) return null;
        const statusName = labelById(boardLabels, match.statusId)?.name;
        return (
          <div className="board-link-bar">
            <span>
              This customer is on the board — link this post to <b>{match.name}</b>
              {statusName ? ` · ${statusName}` : ''}
              {match.coordinator ? ` · ${match.coordinator}` : ''}?
            </span>
            <button
              type="button"
              className="btn small primary"
              onClick={() => update((r) => ({ ...r, projectId: match.id }))}
            >
              Link
            </button>
          </div>
        );
      })()}

      <div className="compose-grid">
        <div className="compose-form">
      <div className="card">
        <h3>Source</h3>

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
              onChange={(e) => setSf({ customerName: titleCaseName(e.target.value) }, 'customerName')}
            />
          </label>
          <label className="field">
            {/* No asterisk: the date stopped being required in Phase 7 (spec/10 §1).
                The marker was left behind and still read as "you must fill this in". */}
            Install Scheduled Date {weekday && <span className="badge">→ {weekday}</span>}
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
          {/* Classification — four colour-coded cards instead of a <select>
              (Phase 8, Option A). The dot colours are the 2026 standard's own
              grading. Still chosen by hand; nothing infers a level. */}
          <div className="classification" role="group" aria-label="Project Level">
            <div className="section-label">Classification</div>
            <div className="level-cards">
              {([1, 2, 3, 4] as Level[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`level-card ${record.level === n ? 'chosen' : ''}`}
                  aria-pressed={record.level === n}
                  onClick={() => update((r) => ({ ...r, level: n, suggestedLevel: n }))}
                >
                  <span className="level-card-top">
                    <span className={`level-dot l${n}`} />
                    <span className="level-n">Level {n}</span>
                  </span>
                  <span className="level-name">{LEVEL_NAMES[n]}</span>
                </button>
              ))}
            </div>
            <div className="level-info">
              <b>Scope:</b> {LEVEL_INFO[record.level].scope} <span className="level-sep">·</span>{' '}
              <b>Planning window:</b> {LEVEL_INFO[record.level].window}
            </div>
          </div>
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

      <InstallNotesCard
        record={record}
        settings={settings}
        update={update}
        onKeyDown={noteKeyDown}
        dropped={dropped}
        drift={bulletDrift}
        onToggle={togglePolished}
        onClearDropped={clearDropped}
        onClearDrift={clearDrift}
      />

      <div className="card">
        <h3>Feedback</h3>
        {FEEDBACK_FIELDS.map(({ key, label, placeholder }) => (
          <NoteBox
            key={key}
            label={label}
            polishKey={key}
            value={record.notes[key as 'siteSurvey' | 'design' | 'homeowner']}
            placeholder={placeholder}
            onChange={(v) => setNote(key as 'siteSurvey' | 'design' | 'homeowner', v)}
            onKeyDown={noteKeyDown}
            chips={settings.chips[key]}
            onChip={(phrase) => appendChip(key as 'siteSurvey' | 'design' | 'homeowner', phrase)}
            polished={record.polished?.[key]}
            usePolished={record.usePolished[key] !== false}
            onToggle={(use) => togglePolished(key, use)}
            dropped={dropped[key]}
            drift={bulletDrift[key]}
            mode={record.polishMode?.[key]}
          />
        ))}

        <div className="ai-actions">
          <button
            type="button"
            className="btn primary"
            disabled={polishState.busy !== false || !aiAvailable}
            onClick={() => void runAi('polish')}
            title={aiAvailable ? 'Ctrl+Enter in any note field' : 'AI offline — manual flow still works'}
          >
            {polishState.busy === 'polish' ? (
              <span>
                <span className="spin">✨</span> Polishing…
              </span>
            ) : (
              '✨ Polish with AI'
            )}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={polishState.busy !== false || !aiAvailable}
            onClick={() => void runAi('rewrite')}
            title="Full rewrite — for rough notes. Keeps one bullet per line and every number, but rewrites the wording completely."
          >
            {polishState.busy === 'rewrite' ? (
              <span>
                <span className="spin">🦜</span> Rewriting…
              </span>
            ) : (
              '🦜 هري ابو روي'
            )}
          </button>
          {polishState.ms !== undefined && polishState.busy === false && (
            <span className="muted">Polished ✓ {(polishState.ms / 1000).toFixed(1)}s</span>
          )}
        </div>
        {polishState.error && (
          <div className="error-inline">
            {polishState.error}{' '}
            <button type="button" className="btn link small" onClick={() => void runAi('polish')}>
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

        </div>

        <OutputColumn
          record={record}
          settings={settings}
          ahjs={ahjs}
          update={update}
          onMarkPosted={onMarkPosted}
          onNewPost={onNewPost}
          onSaveDraft={onSaveDraft}
          toast={toast}
        />
      </div>
    </>
  );
}
