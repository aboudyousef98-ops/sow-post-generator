// "Ask the updates" — natural-language search across every project's thread.
//
// Aboud 2026-10-17 #3, the reason the rating reason has to be an update:
//   "if I am searching for a project that is trenching I just ask the AI and
//    the user had already posted the reason of 4 or 5 star"
//
// Two passes, always. The keyword pass runs locally and instantly, so the box
// is useful with no key, offline, and while the model is still thinking. The
// AI pass then ADDS the matches that share no words with the question. Results
// are unioned, never replaced — an exact term match can't be lost to the model.

import { useMemo, useState } from 'react';
import RichText from '../components/RichText';
import { updateSearch } from '../lib/api';
import { relativeTime } from '../lib/dates';
import { searchUpdates, updatesCorpus, updatesFor } from '../lib/updates';
import type { BoardProject, ProjectUpdate } from './types';

type Status = 'idle' | 'thinking' | 'done' | 'offline';

export default function UpdateSearchModal({
  projects,
  updates,
  onOpenProject,
  onClose,
}: {
  projects: BoardProject[];
  updates: ProjectUpdate[];
  onOpenProject: (p: BoardProject) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [aiHits, setAiHits] = useState<{ projectId: string; why: string }[]>([]);
  const [ran, setRan] = useState('');

  const nameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  /** Instant local matches — shown before and alongside anything the AI says. */
  const keywordHits = useMemo(
    () => (query.trim() ? searchUpdates(updates, nameById, query) : []),
    [updates, nameById, query],
  );

  /**
   * One row per project: its matching updates, plus the AI's reason if it also
   * picked that project. Keyword projects come first — they are certain.
   */
  const rows = useMemo(() => {
    const byProject = new Map<string, { why?: string; updates: ProjectUpdate[] }>();
    for (const h of keywordHits) {
      const e = byProject.get(h.update.projectId) ?? { updates: [] };
      e.updates.push(h.update);
      byProject.set(h.update.projectId, e);
    }
    for (const h of aiHits) {
      const e = byProject.get(h.projectId) ?? { updates: updatesFor(updates, h.projectId).slice(0, 2) };
      e.why = h.why;
      byProject.set(h.projectId, e);
    }
    return [...byProject.entries()].map(([projectId, v]) => ({
      projectId,
      name: nameById.get(projectId) ?? '(deleted project)',
      ...v,
    }));
  }, [keywordHits, aiHits, updates, nameById]);

  const ask = async () => {
    const q = query.trim();
    if (!q) return;
    setRan(q);
    const corpus = updatesCorpus(updates, nameById);
    if (corpus.length === 0) {
      setStatus('done');
      return;
    }
    setStatus('thinking');
    setAiHits([]);
    try {
      const res = await updateSearch(q, corpus);
      setAiHits(res.hits);
      setStatus('done');
    } catch {
      // No key, or the model misbehaved. The keyword results still stand.
      setStatus('offline');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Ask the updates</h3>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Search everything the team has posted on every project — e.g. <em>which projects have trenching?</em>
        </p>

        <div className="upd-search-bar">
          <input
            type="search"
            aria-label="Ask the updates"
            value={query}
            placeholder="which projects have trenching?"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask();
            }}
          />
          <button type="button" className="btn primary" disabled={!query.trim() || status === 'thinking'} onClick={ask}>
            {status === 'thinking' ? 'Asking…' : 'Ask'}
          </button>
        </div>

        <div className="upd-search-note muted">
          {status === 'thinking' && 'Matching on meaning…'}
          {status === 'offline' && 'AI is unavailable — showing word matches only.'}
          {status === 'done' && ran && `${rows.length} project${rows.length === 1 ? '' : 's'} for “${ran}”.`}
          {status === 'idle' && query.trim() && `${rows.length} word match${rows.length === 1 ? '' : 'es'} so far — press Ask to search by meaning.`}
        </div>

        <div className="upd-thread">
          {rows.length === 0 && ran && status !== 'thinking' && (
            <p className="muted">Nothing matched. Try different words, or ask more plainly.</p>
          )}

          {rows.map((r) => (
            <article key={r.projectId} className="upd-item">
              <div className="upd-item-head">
                <button
                  type="button"
                  className="upd-search-name"
                  onClick={() => {
                    const p = projectById.get(r.projectId);
                    if (p) onOpenProject(p);
                  }}
                >
                  {r.name}
                </button>
                {r.why && <span className="upd-badge upd-badge-rating">{r.why}</span>}
              </div>
              {r.updates.map((u) => (
                <div key={u.id} className="upd-search-quote">
                  <RichText text={u.text} />
                  <span className="muted">
                    {u.by} · {relativeTime(u.at)}
                  </span>
                </div>
              ))}
            </article>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
