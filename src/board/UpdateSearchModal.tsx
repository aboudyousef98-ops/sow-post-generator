// "Ask the board" — one question, answered from two places.
//
// Aboud 2026-10-17 #3, the reason the rating reason has to be an update:
//   "if I am searching for a project that is trenching I just ask the AI and
//    the user had already posted the reason of 4 or 5 star"
// Aboud 2026-11-05, widening it:
//   "the 'Ask the updates' feature looks into updates, but can we also make it
//    look at activity log? for example I ask, what was the projects that I
//    interacted with yesterday?"
//
// Those two questions want opposite machinery, so there are two lanes and they
// run in parallel — same latency as one, and either can fail alone:
//
//   UPDATES   a question about MEANING. A keyword pass runs locally and
//             instantly, then the model ADDS matches that share no words with
//             the question. Unioned, never replaced, so an exact term match
//             cannot be lost to the model.
//   ACTIVITY  a question about WHO DID WHAT WHEN. The model only translates
//             the question into a filter; this client applies it exactly, so
//             nothing from the 2,589-entry log is uploaded and "yesterday"
//             means yesterday. A local parser handles the common phrasings
//             with no key at all.
//
// Results merge into ONE list of projects, each row saying why it is there.

import { useMemo, useState } from 'react';
import RichText from '../components/RichText';
import { activityQuery, updateSearch } from '../lib/api';
import {
  applyActivityFilter,
  describeFilter,
  hasActivityFilter,
  parseLocalFilter,
  queryContext,
  sanitizeFilter,
  type ActivityFilter,
  type ActivityHit,
} from '../lib/activityQuery';
import { relativeTime, todayIso } from '../lib/dates';
import { searchUpdates, updatesCorpus, updatesFor } from '../lib/updates';
import type { BoardActivity, BoardProject, ProjectUpdate } from './types';

type Status = 'idle' | 'thinking' | 'done' | 'offline';

export default function UpdateSearchModal({
  projects,
  updates,
  activity,
  me,
  roster,
  onOpenProject,
  onOpenActivity,
  onClose,
}: {
  projects: BoardProject[];
  updates: ProjectUpdate[];
  /** Field history — the second lane (Aboud 2026-11-05). */
  activity: BoardActivity[];
  /** Signed-in name, so "I" and "me" in a question resolve to someone. */
  me: string;
  roster: string[];
  onOpenProject: (p: BoardProject) => void;
  /** An activity answer opens the log, not the thread — that is where it came from. */
  onOpenActivity: (p: BoardProject) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [aiHits, setAiHits] = useState<{ projectId: string; why: string }[]>([]);
  const [filter, setFilter] = useState<ActivityFilter | null>(null);
  const [ran, setRan] = useState('');
  const today = todayIso();

  const nameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  /** Instant local matches — shown before and alongside anything the AI says. */
  const keywordHits = useMemo(
    () => (query.trim() ? searchUpdates(updates, nameById, query) : []),
    [updates, nameById, query],
  );

  /**
   * The activity lane's local guess, shown while the model is still thinking
   * and kept as the answer if it never arrives. The model's filter wins once
   * it lands, because it understands phrasings the parser does not.
   */
  const localFilter = useMemo(
    () => (query.trim() ? parseLocalFilter(query, me, roster, today) : null),
    [query, me, roster, today],
  );
  const activeFilter = filter ?? localFilter;

  const activityHits: ActivityHit[] = useMemo(
    () => applyActivityFilter(activity, projects, activeFilter),
    [activity, projects, activeFilter],
  );

  /**
   * One row per project: its matching updates, the AI's reason if it picked
   * that project, and what the activity log says it was. Keyword and activity
   * matches come first — they are certain.
   */
  const rows = useMemo(() => {
    const byProject = new Map<string, { why?: string; updates: ProjectUpdate[]; activity?: ActivityHit }>();
    for (const h of keywordHits) {
      const e = byProject.get(h.update.projectId) ?? { updates: [] };
      e.updates.push(h.update);
      byProject.set(h.update.projectId, e);
    }
    for (const h of activityHits) {
      const e = byProject.get(h.projectId) ?? { updates: [] };
      e.activity = h;
      byProject.set(h.projectId, e);
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
  }, [keywordHits, activityHits, aiHits, updates, nameById]);

  const ask = async () => {
    const q = query.trim();
    if (!q) return;
    setRan(q);
    setStatus('thinking');
    setAiHits([]);
    setFilter(null);

    const corpus = updatesCorpus(updates, nameById);
    // Both lanes at once: same wall clock as one, and a lane that fails leaves
    // the other's answer standing.
    const [updateLane, activityLane] = await Promise.allSettled([
      corpus.length ? updateSearch(q, corpus) : Promise.resolve({ hits: [] }),
      activityQuery(q, queryContext(me, roster, today)),
    ]);

    if (updateLane.status === 'fulfilled') setAiHits(updateLane.value.hits);
    if (activityLane.status === 'fulfilled' && activityLane.value.understood) {
      setFilter(sanitizeFilter(activityLane.value.filter, roster, queryContext(me, roster, today)));
    }
    // "Offline" only when BOTH lanes failed — one working lane is an answer,
    // and the local keyword and date passes stand regardless.
    setStatus(updateLane.status === 'rejected' && activityLane.status === 'rejected' ? 'offline' : 'done');
  };

  const note = () => {
    if (status === 'thinking') return 'Reading the updates and the activity log…';
    if (status === 'offline') return 'AI is unavailable — showing word and date matches only.';
    if (status === 'done' && ran) {
      // When the question WAS about the log, lead with that count: it is an
      // exact answer, where the updates lane is a judgement.
      if (hasActivityFilter(activeFilter)) {
        return `${describeFilter(activeFilter as ActivityFilter, me, activityHits.length)}${
          rows.length > activityHits.length ? ` ${rows.length - activityHits.length} more from updates.` : ''
        }`;
      }
      return `${rows.length} project${rows.length === 1 ? '' : 's'} for “${ran}”.`;
    }
    if (status === 'idle' && query.trim()) {
      return `${rows.length} match${rows.length === 1 ? '' : 'es'} so far — press Ask to search by meaning.`;
    }
    return '';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Ask the board</h3>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Everything the team has posted, and everything they have done — e.g.{' '}
          <em>which projects have trenching?</em> or <em>what did I interact with yesterday?</em>
        </p>

        <div className="upd-search-bar">
          <input
            type="search"
            aria-label="Ask the board"
            value={query}
            placeholder="what did I interact with yesterday?"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask();
            }}
          />
          <button type="button" className="btn primary" disabled={!query.trim() || status === 'thinking'} onClick={ask}>
            {status === 'thinking' ? 'Asking…' : 'Ask'}
          </button>
        </div>

        <div className="upd-search-note muted" aria-live="polite">
          {note()}
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
                    if (!p) return;
                    // Open where the answer came from: the log for an activity
                    // hit, the thread for an update one.
                    if (r.activity && r.updates.length === 0) onOpenActivity(p);
                    else onOpenProject(p);
                  }}
                >
                  {r.name}
                </button>
                {r.why && <span className="upd-badge upd-badge-rating">{r.why}</span>}
              </div>
              {r.activity && (
                <div className="upd-search-quote">
                  <span>{r.activity.summary}</span>
                  <span className="muted"> · {relativeTime(r.activity.lastAt)}</span>
                </div>
              )}
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
