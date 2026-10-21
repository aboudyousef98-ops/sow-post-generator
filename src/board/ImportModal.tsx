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
import { parseSfReport, type SfReport } from '../lib/sfReport';
import { parseSfGrid, sheetToGrid } from '../lib/sfWorkbook';
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
  /**
   * A report read from an exported .xlsx. It wins over the paste box when set,
   * because a file always holds every record — the browser copy only ever
   * contains the rows Salesforce has rendered (Aboud, 2026-10-19).
   */
  const [fromFile, setFromFile] = useState<SfReport | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);

  const readWorkbook = async (file: File) => {
    setReading(true);
    setFileName(file.name);
    setAnswers({});
    try {
      // import()-ed so exceljs never lands in the main bundle — the same rule
      // lib/extraWorkXlsx.ts follows.
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const sheet = wb.worksheets[0];
      if (!sheet) throw new Error('empty workbook');
      setFromFile(parseSfGrid(sheetToGrid(sheet), roster));
    } catch {
      setFromFile({
        kind: 'unknown',
        rows: [],
        totalRecords: null,
        complete: false,
        unreadable: [],
        warnings: [],
        error: `Could not read "${file.name}". Export the report again with Export → Details Only (.xlsx).`,
      });
    } finally {
      setReading(false);
    }
  };

  // Pure and offline, so it re-runs on every keystroke — no Parse button.
  const pasted_ = useMemo(() => parseSfReport(text, roster), [text, roster]);
  const report = fromFile ?? pasted_;
  const plan = useMemo(() => planImport(report, projects, labels, answers), [report, projects, labels, answers]);

  const haveInput = Boolean(fromFile) || text.trim().length > 0;
  const { counts } = plan;
  // counts.notes keeps a notes-only refresh importable — once the board has
  // every project, re-importing a fresh export is USUALLY notes-only.
  const todo = counts.create + counts.phase + counts.notes + (restoreArchived ? counts.archived : 0);
  const blocked = !haveInput || Boolean(report.error) || counts.maybe > 0 || todo === 0;

  const pick = (name: string, answer: MaybeAnswer) => setAnswers((a) => ({ ...a, [name]: answer }));

  const nameList = (match: string) => plan.rows.filter((r) => r.match === match).map((r) => r.name);
  const maybes = plan.rows.filter((r) => r.match === 'maybe');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal board-import" onClick={(e) => e.stopPropagation()}>
        <h3>Import from Salesforce</h3>
        <p className="muted">
          Best way: in Salesforce use <b>Export → Details Only (.xlsx)</b> and choose the file below — an export always
          holds every record. Pasting works too, but the browser only copies the rows it has drawn. Nothing is written
          to the board until you press Import.
        </p>

        <label className="board-import-file">
          <span>Choose the exported .xlsx</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readWorkbook(file);
            }}
          />
          {fileName && <span className="board-import-filename">{reading ? 'reading…' : fileName}</span>}
        </label>

        <textarea
          className="board-import-paste"
          aria-label="Salesforce report"
          placeholder={fromFile ? 'Using the file above — clear it to paste instead' : '…or paste the report here'}
          rows={5}
          value={text}
          disabled={Boolean(fromFile)}
          onChange={(e) => {
            setText(e.target.value);
            setAnswers({}); // a new paste invalidates old answers
          }}
        />
        {fromFile && (
          <button
            type="button"
            className="btn small secondary"
            onClick={() => {
              setFromFile(null);
              setFileName('');
              setAnswers({});
            }}
          >
            Clear the file
          </button>
        )}

        {haveInput && report.error && <p className="board-import-error">{report.error}</p>}

        {haveInput && !report.error && (
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
            {/* Aboud 2026-10-21: the export's alerts + AHJ/utility notes ride
                along and surface on Compose. */}
            <Line
              n={counts.notes}
              text={`existing row${counts.notes === 1 ? ' gets' : 's get'} updated Salesforce notes — shown on Compose`}
            >
              {names(plan.rows.filter((r) => r.match !== 'new' && r.notes !== undefined).map((r) => r.name))}
            </Line>
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
            {/* Aboud's call (2026-10-19): cancelled rows ARE imported, but the
                count is never buried, and a board row that has since been
                cancelled is surfaced so it can be archived by hand. */}
            <Line n={counts.cancelled} text="cancelled in Salesforce — imported anyway">
              {names(plan.rows.filter((r) => r.cancelled).map((r) => r.name))}
            </Line>
            <Line
              n={plan.cancelledOnBoard.length}
              text="already on the board, now cancelled in Salesforce — archive by hand"
            >
              {names(plan.cancelledOnBoard.map((p) => p.name))}
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
