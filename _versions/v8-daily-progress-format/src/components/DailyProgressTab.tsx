// Admin › Daily Progress — the daily Slack report, rendered from the board +
// linked posts. The date picker drives BOTH sections (Aboud, 2026-10-06):
// Design rows designed that day, and Schedule rows designed that day shown
// with their install date.

import { useMemo, useState } from 'react';
import type { BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { designedOn, formatDailyReport, scheduledOn } from '../lib/dailyProgress';
import { isoToUs, todayIso, weekdayName } from '../lib/dates';

interface Props {
  board: BoardState;
  records: PostRecord[];
  toast: (text: string) => void;
}

export default function DailyProgressTab({ board, records, toast }: Props) {
  const [designDate, setDesignDate] = useState<string>(() => todayIso());

  const designed = useMemo(() => designedOn(board, designDate), [board, designDate]);
  const { scheduled, noDate } = useMemo(
    () => scheduledOn(board, records, designDate),
    [board, records, designDate],
  );

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formatDailyReport(designDate, designed, scheduled, noDate));
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

        <h4>Projects scheduled:</h4>
        {scheduled.length === 0 && noDate.length === 0 ? (
          <p className="dp-empty">Nothing scheduled.</p>
        ) : (
          <ul>
            {scheduled.map((s) => (
              <li key={s.project.id}>
                {s.project.name} - Scheduled {weekdayName(s.dateIso)}, {isoToUs(s.dateIso)}
              </li>
            ))}
            {noDate.map((p) => (
              <li key={p.id} className="dp-nodate">
                {p.name} - No installation date yet
              </li>
            ))}
          </ul>
        )}

        <button className="btn primary" onClick={() => void copyReport()}>
          Copy report
        </button>
      </div>
    </div>
  );
}
