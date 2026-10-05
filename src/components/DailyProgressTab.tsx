// Admin › Daily Progress — the daily Slack report, rendered from the board +
// linked posts. The date picker drives BOTH sections (Aboud, 2026-10-06):
// Design rows designed that day, and Schedule rows designed that day shown
// with their install date.

import { useMemo, useState } from 'react';
import type { BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { designedOn, formatDailyReport, parseUpdates, scheduledOn, shortDate } from '../lib/dailyProgress';
import { isoToUs, todayIso, weekdayName } from '../lib/dates';

interface Props {
  board: BoardState;
  records: PostRecord[];
  toast: (text: string) => void;
}

export default function DailyProgressTab({ board, records, toast }: Props) {
  const [designDate, setDesignDate] = useState<string>(() => todayIso());
  // Daily throwaway note — deliberately not persisted anywhere.
  const [updatesText, setUpdatesText] = useState('');

  const designed = useMemo(() => designedOn(board, designDate), [board, designDate]);
  const { scheduled, noDate } = useMemo(
    () => scheduledOn(board, records, designDate),
    [board, records, designDate],
  );
  const updates = useMemo(() => parseUpdates(updatesText), [updatesText]);

  // The preview IS the clipboard payload — one string, two consumers.
  const reportText = useMemo(
    () => formatDailyReport(designDate, designed, scheduled, noDate, updates),
    [designDate, designed, scheduled, noDate, updates],
  );

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      toast('Report copied — ready to paste.');
    } catch {
      toast('Could not copy to the clipboard.');
    }
  };

  return (
    <div className="daily-progress">
      <div className="card">
        <h3>Daily SOW Projects Progress</h3>

        <label className="dp-date">
          Design date
          <input
            type="date"
            value={designDate}
            onChange={(e) => setDesignDate(e.target.value || todayIso())}
          />
        </label>

        <h4>Projects from Design:</h4>
        {designed.length === 0 ? (
          <p className="dp-empty">None designed on {weekdayName(designDate)}, {isoToUs(designDate)}.</p>
        ) : (
          <ul>
            {designed.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        )}

        <h4>Projects scheduled (installation date):</h4>
        {scheduled.length === 0 && noDate.length === 0 ? (
          <p className="dp-empty">Nothing scheduled.</p>
        ) : (
          <ul>
            {scheduled.map((s) => (
              <li key={s.project.id}>
                {s.project.name} - {shortDate(s.dateIso)}
              </li>
            ))}
            {noDate.map((p) => (
              <li key={p.id} className="dp-nodate">
                {p.name} - No installation date yet
              </li>
            ))}
          </ul>
        )}

        <h4>Updates:</h4>
        <textarea
          className="dp-updates"
          rows={4}
          placeholder="One update per line — added to the report as typed."
          value={updatesText}
          onChange={(e) => setUpdatesText(e.target.value)}
        />

        <button className="btn primary" onClick={() => void copyReport()}>
          Copy report
        </button>
      </div>

      {/* Live preview — exactly what Copy report puts on the clipboard. */}
      <div className="card dp-preview-card">
        <div className="dp-preview-title">How it reads in Slack</div>
        <pre className="dp-preview" data-testid="dp-preview">
          {reportText}
        </pre>
      </div>
    </div>
  );
}
