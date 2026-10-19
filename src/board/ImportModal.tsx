// "Import from Salesforce" — paste a Scope of Work Assignments report, see
// exactly what it would do, then write the whole thing in one go.
//
// Nothing here decides anything: parseSfReport + planImport are pure and
// tested on their own, and this screen only renders the plan and collects the
// answers to the questions it raises. The Import button stays disabled while
// any question is unanswered — a near miss is never guessed at (Aboud,
// 2026-10-19).

import { useMemo, useState, type ReactNode } from 'react';
import { planImport, type ImportPlan, type MaybeAnswer } from '../lib/sfImport';
import { parseSfReport } from '../lib/sfReport';
import type { BoardLabel, BoardProject } from './types';

export interface ImportRequest {
  plan: ImportPlan;
  restoreArchived: boolean;
}

interface Props {
  projects: BoardProject[];
  labels: BoardLabel[];
  /** Roster display names, for the coordinator column. */
  roster: string[];
  onImport: (req: ImportRequest) => void;
  onClose: () => void;
}

/** One dense summary line, expandable to one line per project. */
function Line({ n, text, children }: { n: number; text: string; children?: ReactNode }) {
  if (n === 0) return null;
  if (!children) {
    return (
      <p className="board-import-line plain">
        <b>{n}</b> {text}
      </p>
    );
  }
  return (
    <details className="board-import-line">
      <summary>
        <b>{n}</b> {text}
      </summary>
      {children}
    </details>
  );
}

const names = (list: string[]) => (
  <ul className="board-import-names">
    {list.map((n) => (
      <li key={n}>{n}</li>
    ))}
  </ul>
);

export default function ImportModal({ projects, labels, roster, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState<Record<string, MaybeAnswer>>({});
  const [restoreArchived, setRestoreArchived] = useState(false);

  // Pure and offline, so it re-runs on every keystroke — no Parse button.
  const report = useMemo(() => parseSfReport(text, roster), [text, roster]);
  const plan = useMemo(() => planImport(report, projects, labels, answers), [report, projects, labels, answers]);

  const pasted = text.trim().length > 0;
  const { counts } = plan;
  const todo = counts.create + counts.phase + (restoreArchived ? counts.archived : 0);
  const blocked = !pasted || Boolean(report.error) || counts.maybe > 0 || todo === 0;

  const pick = (name: string, answer: MaybeAnswer) => setAnswers((a) => ({ ...a, [name]: answer }));

  const nameList = (match: string) => plan.rows.filter((r) => r.match === match).map((r) => r.name);
  const maybes = plan.rows.filter((r) => r.match === 'maybe');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal board-import" onClick={(e) => e.stopPropagation()}>
        <h3>Import from Salesforce</h3>
        <p className="muted">
          Copy the whole <b>Scope of Work Assignments</b> report — Scheduled or Design — and paste it below. Nothing is
          written to the board until you press Import.
        </p>

        <textarea
          className="board-import-paste"
          aria-label="Salesforce report"
          placeholder="Paste the report here"
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAnswers({}); // a new paste invalidates old answers
          }}
        />

        {pasted && report.error && <p className="board-import-error">{report.error}</p>}

        {pasted && !report.error && (
          <div className="board-import-report">
            <p className="board-import-head">
              <b>{report.kind === 'scheduled' ? 'Scheduled' : 'Design'} report</b>
              {' · '}
              found {report.rows.length}
              {report.totalRecords !== null ? ` of ${report.totalRecords}` : ''} record
              {report.rows.length === 1 ? '' : 's'}
            </p>

            <Line n={counts.create} text={`new project${counts.create === 1 ? '' : 's'} — will be added`}>
              {names(nameList('new'))}
            </Line>
            <Line n={counts.matched} text="already on the board — left as they are">
              {names(nameList('matched'))}
            </Line>
            <Line
              n={counts.phase}
              text={`existing row${counts.phase === 1 ? '' : 's'} move to ${
                report.kind === 'scheduled' ? 'Schedule' : 'Design'
              }`}
            />
            <Line n={plan.stickySchedule.length} text="already on Schedule — left on Schedule">
              {names(plan.stickySchedule)}
            </Line>
            <Line n={counts.archived} text="on the board but archived">
              <>
                {names(nameList('archived'))}
                <label className="board-import-restore">
                  <input
                    type="checkbox"
                    checked={restoreArchived}
                    onChange={(e) => setRestoreArchived(e.target.checked)}
                  />
                  Restore {counts.archived === 1 ? 'it' : 'them'} to the board as well
                </label>
              </>
            </Line>
            <Line n={plan.absent.length} text="on the board, not on this report — nothing will change">
              {names(plan.absent.map((p) => p.name))}
            </Line>
            <Line n={report.unreadable.length} text="could not be read — not imported">
              {names(report.unreadable)}
            </Line>

            {maybes.length > 0 && (
              <div className="board-import-questions">
                {maybes.map((r) => (
                  <div key={r.name} className="board-import-question">
                    <p>
                      Salesforce says <b>{r.name}</b>, the board says <b>{r.boardName}</b>.
                    </p>
                    <label>
                      <input
                        type="radio"
                        name={`maybe-${r.name}`}
                        checked={answers[r.name] === 'same'}
                        onChange={() => pick(r.name, 'same')}
                      />
                      Same project
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`maybe-${r.name}`}
                        checked={answers[r.name] === 'new'}
                        onChange={() => pick(r.name, 'new')}
                      />
                      Add as new
                    </label>
                  </div>
                ))}
              </div>
            )}

            {plan.warnings.map((w) => (
              <p key={w} className="board-import-warn">
                {w}
              </p>
            ))}

            {counts.maybe > 0 && (
              <p className="board-import-warn">
                Answer the question{counts.maybe === 1 ? '' : 's'} above before importing.
              </p>
            )}
            {counts.maybe === 0 && todo === 0 && (
              <p className="muted">Nothing to import — this report matches the board already.</p>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={blocked}
            onClick={() => onImport({ plan, restoreArchived })}
          >
            Import{todo > 0 ? ` ${todo}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
