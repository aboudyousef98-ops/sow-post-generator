// Extra Work tab — desktop design from the Claude Design handoff
// ("Extra Work - Desktop.dc.html", 2026-10-06). Replaces the team's
// "Extra Work Tracker.xlsx". Left: Team summary + per-person rows with
// stacked weekday/weekend/holiday bars. Right: stat tiles, then either the
// payroll summary table (Team summary) or the person's log with an inline
// add row. Delete is instant with an Undo toast (tombstone + revive).
// Members open only their own log; admins open anyone's.

import { useMemo, useState } from 'react';
import type { DayType, ExtraWorkEntry, ExtraWorkState } from '../extrawork/types';
import { loadCachedUsers } from '../lib/auth';
import { isoToUs, todayIso } from '../lib/dates';
import {
  dayShort,
  dayTypeFor,
  dayTypeLabel,
  entriesForMonth,
  isValidHours,
  liveEntries,
  monthKey,
  monthLabelLong,
  newEntry,
  overtimePay,
  patchEntry,
  personStats,
  shiftMonth,
} from '../lib/extraWork';
import { buildMonthReport, personFileName, personReport, reportFileName, summaryRows } from '../lib/extraWorkReport';

interface Props {
  state: ExtraWorkState;
  setState: (s: ExtraWorkState) => void;
  /** Signed-in display name — what entries and reports print. */
  me: string;
  /** Signed-in username — ownership key for edit/delete. */
  myUsername: string;
  isAdmin: boolean;
  /** Roster display names (settings.authors) — people shown even with no hours. */
  roster: string[];
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
  /** Tests only — pin the starting month. */
  initialMonth?: string;
}

/** Day-type pill colors (monday-style labels from the design). */
const TYPE_COLORS: Record<DayType, { bg: string; fg: string }> = {
  weekday: { bg: '#0086C0', fg: '#fff' },
  weekend: { bg: '#FDAB3D', fg: '#323338' },
  holiday: { bg: '#A25DDC', fg: '#fff' },
};

const FALLBACK_CHIPS = [
  'Completing daily tasks',
  'Completing tasks and meetings',
  'Pushing projects & development process',
  'BOS tool & elevation drawing sheet',
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function ExtraWorkTab({
  state,
  setState,
  me,
  myUsername,
  isAdmin,
  roster,
  toast,
  initialMonth,
}: Props) {
  const [month, setMonth] = useState<string>(() => initialMonth ?? monthKey(todayIso()));
  const [sel, setSel] = useState<string | null>(me || null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), type: '' as '' | DayType, hours: '2', desc: '' });
  const [busyExport, setBusyExport] = useState(false);
  // Salaries stay on THIS device only (never synced) — one per employee, so
  // the calculator works on every log (Aboud 2026-10-07).
  const [salaries, setSalaries] = useState<Record<string, string>>({});
  const salaryFor = (person: string) =>
    salaries[person] ?? localStorage.getItem(`sowpost.ewSalary.${person}`) ?? '';
  const setSalaryFor = (person: string, v: string) => {
    setSalaries((s) => ({ ...s, [person]: v }));
    localStorage.setItem(`sowpost.ewSalary.${person}`, v);
  };

  const monthEntries = useMemo(() => entriesForMonth(state.entries, month), [state.entries, month]);
  const report = useMemo(() => buildMonthReport(state.entries, month), [state.entries, month]);
  const summary = useMemo(() => summaryRows(report), [report]);
  const team = summary[summary.length - 1]; // TOTAL row

  // Roster order first, then anyone who appears in this month but left the roster.
  const people = useMemo(() => {
    const extra = [...new Set(monthEntries.map((e) => e.person))]
      .filter((p) => !roster.includes(p))
      .sort((a, b) => a.localeCompare(b));
    return [...roster, ...extra];
  }, [roster, monthEntries]);

  const statsFor = (person: string) => personStats(monthEntries.filter((e) => e.person === person));
  const maxTotal = Math.max(1, ...people.map((p) => statsFor(p).total));

  const isSummary = sel === null;
  const curStats = isSummary
    ? { total: team.total, weekday: team.weekday, weekend: team.weekend, holiday: team.holiday, days: team.days }
    : statsFor(sel);

  const selEntries = useMemo(
    () => monthEntries.filter((e) => e.person === sel).sort((a, b) => b.dateIso.localeCompare(a.dateIso)),
    [monthEntries, sel],
  );

  // "Recent — tap to reuse": the selected person's own past descriptions.
  const chips = useMemo(() => {
    const person = sel ?? me;
    const past = liveEntries(state.entries)
      .filter((e) => e.person === person)
      .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    const seen: string[] = [];
    for (const e of past) {
      const d = e.description.trim();
      if (d && !seen.includes(d)) seen.push(d);
      if (seen.length === 4) break;
    }
    return seen.length ? seen : FALLBACK_CHIPS;
  }, [state.entries, sel, me]);

  const upsert = (entry: ExtraWorkEntry) => {
    setState({ entries: [...state.entries.filter((e) => e.id !== entry.id), entry] });
  };

  const selectPerson = (name: string) => {
    if (!isAdmin && name !== me) return; // members read others only via the summary
    setSel(name);
    setAddOpen(false);
  };

  const usernameFor = (person: string): string => {
    if (person === me) return myUsername;
    return loadCachedUsers().find((u) => u.displayName === person)?.username ?? '';
  };

  const autoType = form.date ? dayTypeFor(form.date, null) : 'weekday';
  const effectiveType: DayType = form.type || autoType;
  const overridden = form.type !== '' && form.type !== autoType;

  const submit = () => {
    const hours = Number(form.hours);
    if (!form.date || !isValidHours(hours) || !form.desc.trim()) {
      toast('Date, whole hours (1–24) and a description are all required.');
      return;
    }
    const person = isAdmin ? (sel ?? me) : me;
    const entry = newEntry(
      { username: usernameFor(person), person },
      {
        dateIso: form.date,
        hours,
        description: form.desc,
        dayTypeOverride: overridden ? (form.type as DayType) : null,
      },
    );
    setState({ entries: [...state.entries, entry] });
    setAddOpen(false);
    setForm({ ...form, desc: '', type: '' });
    setMonth(monthKey(form.date));
    setSel(person);
    toast(`Logged ${hours} h on ${isoToUs(form.date)} for ${person}.`);
  };

  const remove = (e: ExtraWorkEntry) => {
    const dead = patchEntry(e, { deletedAt: new Date().toISOString() });
    upsert(dead);
    toast(`Deleted ${isoToUs(e.dateIso)} · ${e.hours} h.`, {
      label: 'Undo',
      fn: () => upsert(patchEntry(dead, { deletedAt: undefined })),
    });
  };

  const startAdd = () => {
    if (!isAdmin || sel === null) setSel(isAdmin && sel ? sel : me);
    setAddOpen(true);
  };

  const copySummary = async () => {
    const lines = [
      `Extra hours — ${monthLabelLong(month)}`,
      ...summary.map(
        (r) =>
          `${r.person}: ${r.total} h (${r.weekday} weekday / ${r.weekend} weekend / ${r.holiday} holiday) · ${r.days} day${r.days === 1 ? '' : 's'}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast(`Summary copied — ${monthLabelLong(month)}, ${people.length} rows + total.`);
    } catch {
      toast('Could not copy to the clipboard.');
    }
  };

  const downloadXlsx = async () => {
    if (!report.persons.length) {
      toast('Nothing logged this month yet.');
      return;
    }
    setBusyExport(true);
    try {
      const { downloadExtraWorkXlsx } = await import('../lib/extraWorkXlsx');
      await downloadExtraWorkXlsx(report);
      toast('Excel report downloaded.');
    } catch {
      toast('Could not build the Excel file.');
    } finally {
      setBusyExport(false);
    }
  };

  // Each member exports their own hours (Aboud 2026-10-07); admins can export
  // whichever log they have open.
  const downloadPersonXlsx = async () => {
    if (!sel) return;
    const mine = personReport(report, sel);
    if (!mine.persons.length) {
      toast('Nothing logged this month yet.');
      return;
    }
    setBusyExport(true);
    try {
      const { downloadExtraWorkXlsx } = await import('../lib/extraWorkXlsx');
      await downloadExtraWorkXlsx(mine, personFileName(sel, month));
      toast(`Excel downloaded — ${sel}, ${monthLabelLong(month)}.`);
    } catch {
      toast('Could not build the Excel file.');
    } finally {
      setBusyExport(false);
    }
  };

  const printPdf = () => {
    if (!report.persons.length) {
      toast('Nothing logged this month yet.');
      return;
    }
    document.body.classList.add('ew-printing');
    const done = () => document.body.classList.remove('ew-printing');
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    done();
  };

  const tiles = [
    { label: 'Total extra hours', value: curStats.total, unit: 'h', color: '#f98f30' },
    { label: 'Weekday', value: curStats.weekday, unit: 'h', color: '#0086C0' },
    { label: 'Weekend', value: curStats.weekend, unit: 'h', color: '#FDAB3D' },
    { label: 'Days logged', value: curStats.days, unit: 'days', color: '#05bec0' },
  ];

  return (
    <div className="extra-work">
      <div className="ew-head">
        <h1>Extra Work</h1>
        <span className="ew-headline">
          {monthLabelLong(month)} · {team.total} extra hours across {people.length} people
        </span>
        <span className="ew-spacer" />
        <div className="ew-month-switch">
          <button aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setAddOpen(false); }}>
            ‹
          </button>
          <span>{monthLabelLong(month)}</span>
          <button aria-label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setAddOpen(false); }}>
            ›
          </button>
        </div>
        <button className="ew-btn-ghost" onClick={() => void copySummary()}>
          Copy summary
        </button>
        <button className="ew-btn-orange" onClick={startAdd}>
          + Log hours
        </button>
      </div>

      <div className="ew-grid">
        <aside className="ew-side">
          <button
            className={`ew-side-row ew-side-all ${isSummary ? 'selected' : ''}`}
            onClick={() => {
              setSel(null);
              setAddOpen(false);
            }}
          >
            <span className="ew-avatar ew-avatar-sum">Σ</span>
            <span className="ew-side-main">
              <span className="ew-side-name">Team summary</span>
              <span className="ew-side-sub">
                {people.length} people · {team.days} days logged
              </span>
            </span>
            <span className="ew-side-total">{team.total} h</span>
          </button>
          {people.map((name) => {
            const s = statsFor(name);
            const selected = sel === name;
            return (
              <button
                key={name}
                className={`ew-side-row ${selected ? 'selected' : ''} ${!isAdmin && name !== me ? 'readonly' : ''}`}
                onClick={() => selectPerson(name)}
              >
                <span className="ew-avatar">{initials(name)}</span>
                <span className="ew-side-main">
                  <span className="ew-side-top">
                    <span className="ew-side-name">{name}</span>
                    <span className="ew-side-hours">{s.total} h</span>
                  </span>
                  <span className="ew-bar">
                    <span style={{ width: `${(s.weekday / maxTotal) * 100}%`, background: '#0086C0' }} />
                    <span style={{ width: `${(s.weekend / maxTotal) * 100}%`, background: '#FDAB3D' }} />
                    <span style={{ width: `${(s.holiday / maxTotal) * 100}%`, background: '#A25DDC' }} />
                  </span>
                  <span className="ew-side-sub">
                    {s.days
                      ? `${s.days} day${s.days === 1 ? '' : 's'} · ${s.weekday} wkday · ${s.weekend} wkend${s.holiday ? ` · ${s.holiday} hol` : ''}`
                      : 'Nothing logged'}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="ew-legend">
            <span>
              <i style={{ background: '#0086C0' }} />
              Weekday
            </span>
            <span>
              <i style={{ background: '#FDAB3D' }} />
              Weekend
            </span>
            <span>
              <i style={{ background: '#A25DDC' }} />
              Holiday
            </span>
          </div>
        </aside>

        <div className="ew-main">
          <div className="ew-tiles">
            {tiles.map((t) => (
              <div key={t.label} className="ew-tile" style={{ borderTopColor: t.color }}>
                <div className="ew-tile-label">{t.label}</div>
                <div className="ew-tile-value">
                  {t.value}
                  <span>{t.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {sel && (
            <div className="ew-calc">
              <label>
                Monthly salary (JOD)
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={salaryFor(sel)}
                  onChange={(e) => setSalaryFor(sel, e.target.value)}
                />
              </label>
              {Number(salaryFor(sel)) > 0 ? (
                <div className="ew-calc-out">
                  <span className="ew-calc-rates">
                    {overtimePay(Number(salaryFor(sel)), 1).hourly.toFixed(2)} JOD/h · 1.5× on {curStats.total} extra h
                  </span>
                  <span className="ew-calc-pay">
                    {overtimePay(Number(salaryFor(sel)), curStats.total).pay.toFixed(2)} JOD
                  </span>
                </div>
              ) : (
                <span className="ew-calc-hint">
                  Enter {sel === me ? 'your' : `${sel}'s`} salary — the overtime pay shows instantly. Stays on this device only.
                </span>
              )}
            </div>
          )}

          {isSummary ? (
            <div className="ew-card">
              <div className="ew-card-head">
                <h3>Extra hours — summary</h3>
                <span className="ew-card-sub">{monthLabelLong(month)} · what payroll gets</span>
                <span className="ew-spacer" />
                <button className="ew-btn-ghost small" disabled={busyExport} onClick={() => void downloadXlsx()}>
                  {busyExport ? 'Building…' : 'Download .xlsx'}
                </button>
                <button className="ew-btn-ghost small" onClick={printPdf}>
                  PDF
                </button>
              </div>
              <table className="ew-table" aria-label="Payroll summary">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="num">Total extra hours</th>
                    <th className="num">Weekday</th>
                    <th className="num">Weekend</th>
                    <th className="num">Holiday</th>
                    <th className="num">Days logged</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.slice(0, -1).map((r) => (
                    <tr key={r.person} className="ew-row-click" onClick={() => selectPerson(r.person)}>
                      <td className="ew-cell-name">{r.person}</td>
                      <td className="num strong">{r.total}</td>
                      <td className="num">{r.weekday}</td>
                      <td className="num">{r.weekend}</td>
                      <td className="num">{r.holiday}</td>
                      <td className="num">{r.days}</td>
                    </tr>
                  ))}
                  <tr className="ew-total-row">
                    <td>TOTAL</td>
                    <td className="num">{team.total}</td>
                    <td className="num">{team.weekday}</td>
                    <td className="num">{team.weekend}</td>
                    <td className="num">{team.holiday}</td>
                    <td className="num">{team.days}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ew-card">
              <div className="ew-card-head">
                <h3>{sel} — log</h3>
                <span className="ew-card-sub">Newest first · weekends and holidays are picked up from the date</span>
                <span className="ew-spacer" />
                <button className="ew-btn-ghost small" disabled={busyExport} onClick={() => void downloadPersonXlsx()}>
                  {busyExport ? 'Building…' : 'Download .xlsx'}
                </button>
                {!addOpen && (
                  <button className="ew-btn-ghost small" onClick={startAdd}>
                    + Add a day
                  </button>
                )}
              </div>

              {addOpen && (
                <div className="ew-addrow">
                  <label>
                    Date
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value, type: '' })}
                    />
                  </label>
                  <label>
                    Day type <span className="ew-autonote">{overridden ? '(overridden)' : '· auto from date'}</span>
                    <select
                      value={dayTypeLabel(effectiveType)}
                      onChange={(e) => setForm({ ...form, type: e.target.value.toLowerCase() as DayType })}
                    >
                      <option>Weekday</option>
                      <option>Weekend</option>
                      <option>Holiday</option>
                    </select>
                  </label>
                  <label>
                    Extra hours
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={24}
                      step={1}
                      value={form.hours}
                      onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    />
                  </label>
                  <label>
                    Description of work
                    <input
                      type="text"
                      placeholder="e.g. BOS tool & elevation drawing sheet"
                      value={form.desc}
                      onChange={(e) => setForm({ ...form, desc: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submit();
                        if (e.key === 'Escape') setAddOpen(false);
                      }}
                    />
                  </label>
                  <div className="ew-addrow-actions">
                    <button className="ew-btn-ghost" onClick={() => setAddOpen(false)}>
                      Cancel
                    </button>
                    {/* Disabled only until a description exists (design rule);
                        hours/date problems explain themselves via a toast. */}
                    <button className="ew-btn-orange" disabled={!form.desc.trim()} onClick={submit}>
                      Add
                    </button>
                  </div>
                  <div className="ew-chips">
                    <span>Quick fill:</span>
                    {chips.map((c) => (
                      <button key={c} onClick={() => setForm({ ...form, desc: c })}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selEntries.length === 0 ? (
                <p className="ew-empty">
                  No extra hours logged for {sel} in {monthLabelLong(month)}.
                </p>
              ) : (
                <table className="ew-table" aria-label="Hours log">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Day type</th>
                      <th className="num">Extra hours</th>
                      <th>Description of work</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selEntries.map((e) => {
                      const t = dayTypeFor(e.dateIso, e.dayTypeOverride);
                      const canDelete = isAdmin || e.username === myUsername;
                      return (
                        <tr key={e.id}>
                          <td className="ew-cell-name">
                            {isoToUs(e.dateIso)} <span className="ew-dayname">{dayShort(e.dateIso)}</span>
                          </td>
                          <td>
                            <span
                              className="ew-type-pill"
                              style={{ background: TYPE_COLORS[t].bg, color: TYPE_COLORS[t].fg }}
                            >
                              {dayTypeLabel(t)}
                            </span>
                          </td>
                          <td className="num strong">{e.hours}</td>
                          <td>{e.description}</td>
                          <td className="ew-cell-del">
                            {canDelete && (
                              <button className="ew-del" title="Delete" onClick={() => remove(e)}>
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Print-only company report — what "PDF" renders via the browser's print-to-PDF. */}
      <div className="ew-print">
        <h1>{reportFileName(month)}</h1>
        {report.persons.map((p) => (
          <section key={p.person} className="ew-print-person">
            <h2>{p.person}</h2>
            <table>
              <thead>
                <tr>
                  <th>Total extra hours</th>
                  <th>Weekday hours</th>
                  <th>Weekend hours</th>
                  <th>Days logged</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{p.stats.total}</td>
                  <td>{p.stats.weekday}</td>
                  <td>{p.stats.weekend + p.stats.holiday}</td>
                  <td>{p.stats.days}</td>
                </tr>
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Day type</th>
                  <th>Extra hours</th>
                  <th>Description of work</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.dateIso}</td>
                    <td>{r.day}</td>
                    <td>{r.dayType}</td>
                    <td>{r.hours}</td>
                    <td>{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
