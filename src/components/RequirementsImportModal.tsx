// "Bulk import rules" — load a sheet of requirements, see exactly what it
// would do, then write it in one go.
//
// Nothing here decides anything: parseRequirementsGrid and
// planRequirementsImport are pure and tested on their own, and this screen
// only renders the plan and collects the confirmation. Same split as
// board/ImportModal, which is the precedent this follows throughout.
//
// The import spans EVERY board kind, because one sheet carries AHJ, Utility,
// Funding and General rows together — so it is handed the full board list,
// not the one kind whose tab it was opened from.

import { useMemo, useState } from 'react';
import {
  parseCsv,
  parsePasted,
  parseRequirementsGrid,
  planRequirementsImport,
  type RequirementsPlan,
} from '../lib/requirementsImport';
import { isStaleChunkError, STALE_CHUNK_MESSAGE } from '../lib/staleChunk';
import type { Ahj, RequirementKind } from '../types';

const KIND_LABEL: Record<RequirementKind, string> = {
  ahj: 'AHJ',
  utility: 'Utility',
  funding: 'Funding',
  general: 'General',
};

export interface ImportRequest {
  plan: RequirementsPlan;
  includeToConfirm: boolean;
}

interface Props {
  boards: Ahj[];
  onImport: (req: ImportRequest) => void;
  onClose: () => void;
}

export default function RequirementsImportModal({ boards, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [includeToConfirm, setIncludeToConfirm] = useState(false);

  const readFile = async (file: File) => {
    setReading(true);
    setFileError('');
    setFileName(file.name);
    try {
      if (/\.csv$/i.test(file.name)) {
        setGrid(parseCsv(await file.text()));
      } else {
        // import()-ed so exceljs never lands in the main bundle — same rule
        // the board importer follows.
        const { default: ExcelJS } = await import('exceljs');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const sheet = wb.worksheets[0];
        if (!sheet) throw new Error('no sheet');
        const { sheetToGrid } = await import('../lib/sfWorkbook');
        setGrid(sheetToGrid(sheet));
      }
    } catch (err) {
      setGrid(null);
      setFileError(isStaleChunkError(err) ? STALE_CHUNK_MESSAGE : `Could not read "${file.name}". Save it as .xlsx or .csv and try again.`);
    } finally {
      setReading(false);
    }
  };

  const parsed = useMemo(() => {
    if (grid) return parseRequirementsGrid(grid);
    if (text.trim()) return parseRequirementsGrid(parsePasted(text));
    return null;
  }, [grid, text]);

  const plan = useMemo(
    () => (parsed && !parsed.error ? planRequirementsImport(parsed, boards, { includeToConfirm }) : null),
    [parsed, boards, includeToConfirm],
  );

  const c = plan?.counts;
  const blocked = !plan || !c || c.newRules === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal board-import" onClick={(e) => e.stopPropagation()}>
        <h3>Bulk import rules</h3>
        <p className="muted">
          One row per rule, with <b>Name</b>, <b>Type</b> and <b>Requirement</b> at minimum. Rows are grouped by Name
          and Type into one board entry — an entry is created if it is missing and <b>appended to</b> if it exists.
          Nothing is written until you press Import.
        </p>

        <label className="board-import-file">
          <span>Choose a .xlsx or .csv</span>
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {fileName && <span className="board-import-filename">{reading ? 'reading…' : fileName}</span>}
        </label>

        <textarea
          className="board-import-paste"
          aria-label="Requirement rows"
          placeholder={grid ? 'Using the file above — clear it to paste instead' : '…or paste rows here, with the header line'}
          rows={5}
          value={text}
          disabled={Boolean(grid)}
          onChange={(e) => setText(e.target.value)}
        />
        {grid && (
          <button type="button" className="btn link small" onClick={() => { setGrid(null); setFileName(''); setFileError(''); }}>
            Clear the file
          </button>
        )}

        {fileError && <p className="board-import-error">{fileError}</p>}
        {parsed?.error && <p className="board-import-error">{parsed.error}</p>}

        {plan && c && (
          <div className="board-import-plan">
            <p className="board-import-line plain">
              <b>{c.rows}</b> row{c.rows === 1 ? '' : 's'} read · <b>{c.newRules}</b> rule
              {c.newRules === 1 ? '' : 's'} to add
            </p>

            {plan.entries.length > 0 && (
              <details open>
                <summary>
                  <b>{c.newEntries}</b> new entr{c.newEntries === 1 ? 'y' : 'ies'} · <b>{c.existingEntries}</b> existing
                </summary>
                <ul className="sf-submit-list">
                  {plan.entries.map((e) => (
                    <li key={`${e.kind}:${e.name}`}>
                      {e.existingId ? 'Append to' : 'Create'} <b>{e.name}</b> ({KIND_LABEL[e.kind]}) — {e.rules.length}{' '}
                      rule{e.rules.length === 1 ? '' : 's'}
                      {e.aliasesToAdd.length > 0 && <> · + {e.aliasesToAdd.length} alias</>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {plan.categories.length > 0 && (
              <details>
                <summary>
                  <b>{plan.categories.length}</b> categor{plan.categories.length === 1 ? 'y' : 'ies'} found
                  {plan.categories.some((x) => x.nearMatch) && ' · possible typos'}
                </summary>
                <ul className="sf-submit-list">
                  {plan.categories.map((cat) => (
                    <li key={cat.label}>
                      {cat.label} — {cat.count}
                      {cat.nearMatch && (
                        <span className="rule-badge to-confirm" style={{ marginInlineStart: 8 }}>
                          looks like “{cat.nearMatch}”
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {c.duplicates > 0 && (
              <details>
                <summary>
                  <b>{c.duplicates}</b> duplicate{c.duplicates === 1 ? '' : 's'} skipped
                </summary>
                <ul className="sf-submit-list">
                  {plan.duplicates.map((d) => (
                    <li key={`${d.rowNumber}`}>
                      Row {d.rowNumber} · {d.label} — already {d.against === 'board' ? 'on the board' : 'in this file'}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {c.skippedByStatus > 0 && (
              <details>
                <summary>
                  <b>{c.skippedByStatus}</b> skipped by status
                </summary>
                <ul className="sf-submit-list">
                  {plan.skippedByStatus.map((s) => (
                    <li key={s.rowNumber}>
                      Row {s.rowNumber} · {s.label} — {s.status}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {c.errors > 0 && (
              <details open>
                <summary className="board-import-error">
                  <b>{c.errors}</b> row{c.errors === 1 ? '' : 's'} cannot be imported
                </summary>
                <ul className="sf-submit-list">
                  {plan.errors.map((e, i) => (
                    <li key={`${e.rowNumber}-${i}`}>
                      Row {e.rowNumber} · {e.label} — {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <label className="service-tick" style={{ marginBlockStart: 10 }}>
              <input type="checkbox" checked={includeToConfirm} onChange={(e) => setIncludeToConfirm(e.target.checked)} />
              Also import “To confirm” rules
            </label>
            {includeToConfirm && (
              <p className="muted" style={{ fontSize: 12 }}>
                They import badged “To confirm” and still reach a handoff. Superseded rows are never imported.
              </p>
            )}

            {c.newRules === 0 && !parsed?.error && (
              <p className="muted">Nothing to import — every rule in this file is already on a board.</p>
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
            onClick={() => plan && onImport({ plan, includeToConfirm })}
          >
            Import{c && c.newRules > 0 ? ` ${c.newRules}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
