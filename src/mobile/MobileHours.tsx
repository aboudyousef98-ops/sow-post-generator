// Mobile Extra Work / Hours (iPhone design handoff 2026-10-06, trimmed rev):
// month switcher, My hours / Team segment, navy summary card, day cards with
// instant delete + Undo, and a full-screen "Log extra hours" flow — 14-day
// strip starting at TODAY (weekends tinted, dot = already logged), day-type
// pills auto-set from the date (override stored only when it differs), ±1
// stepper with 1/2/4/6/8 quick picks, description + reuse chips from the
// user's own past entries. Submit is disabled until a description exists.
// Whole hours only (Aboud 2026-10-06). Same lib as the desktop tab.

import { useMemo, useState } from 'react';
import type { DayType, ExtraWorkEntry, ExtraWorkState } from '../extrawork/types';
import { loadCachedUsers } from '../lib/auth';
import { isStaleChunkError, STALE_CHUNK_MESSAGE } from '../lib/staleChunk';
import { isoToUs, parseIsoLocal, todayIso, weekdayName } from '../lib/dates';
import {
  canEditEntry,
  dayTypeFor,
  dayTypeLabel,
  entriesForMonth,
  isValidHours,
  liveEntries,
  monthKey,
  monthLabel,
  monthLabelLong,
  newEntry,
  overtimePay,
  patchEntry,
  personStats,
  shiftMonth,
} from '../lib/extraWork';
import { buildMonthReport, personFileName, personReport, summaryRows } from '../lib/extraWorkReport';

interface Props {
  state: ExtraWorkState;
  setState: (s: ExtraWorkState) => void;
  me: string;
  myUsername: string;
  isAdmin: boolean;
  roster: string[];
  toast: (text: string, action?: { label: string; fn: () => void }) => void;
}

const TYPE_COLORS: Record<DayType, { bg: string; fg: string }> = {
  weekday: { bg: '#0086C0', fg: '#fff' },
  weekend: { bg: '#FDAB3D', fg: '#323338' },
  holiday: { bg: '#A25DDC', fg: '#fff' },
};

const TEAM_CHIPS = [
  'Completing daily tasks',
  'Completing tasks and meetings',
  'Pushing projects & development process',
];

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function addDays(iso: string, days: number): string {
  const d = parseIsoLocal(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MobileHours({ state, setState, me, myUsername, isAdmin, roster, toast }: Props) {
  const [month, setMonth] = useState<string>(() => monthKey(todayIso()));
  const [view, setView] = useState<'mine' | 'team'>('mine');
  const [who, setWho] = useState<string>(me);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), type: '' as '' | DayType, hours: 2, desc: '' });
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
  const stats = view === 'mine' ? personStats(monthEntries.filter((e) => e.person === who)) : personStats(monthEntries);

  const people = useMemo(() => {
    const extra = [...new Set(monthEntries.map((e) => e.person))]
      .filter((p) => !roster.includes(p))
      .sort((a, b) => a.localeCompare(b));
    return [...roster, ...extra];
  }, [roster, monthEntries]);
  const maxTotal = Math.max(1, ...people.map((p) => personStats(monthEntries.filter((e) => e.person === p)).total));

  const myEntries = monthEntries
    .filter((e) => e.person === who)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const upsert = (entry: ExtraWorkEntry) =>
    setState({ entries: [...state.entries.filter((e) => e.id !== entry.id), entry] });

  const remove = (e: ExtraWorkEntry) => {
    const dead = patchEntry(e, { deletedAt: new Date().toISOString() });
    upsert(dead);
    toast(`Deleted ${isoToUs(e.dateIso)} · ${e.hours} h.`, {
      label: 'Undo',
      fn: () => upsert(patchEntry(dead, { deletedAt: undefined })),
    });
  };

  // Each member exports their own hours (Aboud 2026-10-07).
  const exportPerson = async () => {
    const mine = personReport(buildMonthReport(state.entries, month), who);
    if (!mine.persons.length) {
      toast('Nothing logged this month yet.');
      return;
    }
    try {
      const { downloadExtraWorkXlsx } = await import('../lib/extraWorkXlsx');
      await downloadExtraWorkXlsx(mine, personFileName(who, month));
      toast(`Excel downloaded — ${who}.`);
    } catch (e) {
      toast(isStaleChunkError(e) ? STALE_CHUNK_MESSAGE : 'Could not build the Excel file.');
    }
  };

  const copySummary = async () => {
    const rows = summaryRows(buildMonthReport(state.entries, month));
    const lines = [
      `Extra hours — ${monthLabelLong(month)}`,
      ...rows.map(
        (r) =>
          `${r.person}: ${r.total} h (${r.weekday} weekday / ${r.weekend} weekend / ${r.holiday} holiday) · ${r.days} day${r.days === 1 ? '' : 's'}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast(`Summary copied — ${rows.length - 1} rows + total.`);
    } catch {
      toast('Could not copy to the clipboard.');
    }
  };

  // ---- full-screen log form ------------------------------------------------

  if (formOpen) {
    const today = todayIso();
    const auto = dayTypeFor(form.date, null);
    const effective: DayType = form.type || auto;
    const overridden = form.type !== '' && form.type !== auto;
    /**
     * WHO the entry belongs to. An admin who has drilled into a teammate's log
     * is logging FOR that teammate — this used to be hardcoded to the signed-in
     * user, so an admin's entries silently landed on their own log instead
     * (found by review, 2026-10-08). Members can only ever log for themselves,
     * the same rule the desktop tab applies.
     */
    const target = isAdmin ? (who || me) : me;
    const targetUsername =
      target === me ? myUsername : (loadCachedUsers().find((u) => u.displayName === target)?.username ?? '');
    const logged = new Set(liveEntries(state.entries).filter((e) => e.person === target).map((e) => e.dateIso));
    // 14-day strip, today first (Aboud: "order the strip today → oldest").
    const strip = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
    const valid = !!form.desc.trim() && isValidHours(form.hours);

    const chips = (() => {
      const past = liveEntries(state.entries)
        .filter((e) => e.person === target)
        .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
      const seen: string[] = [];
      for (const e of past) {
        const d = e.description.trim();
        if (d && !seen.includes(d)) seen.push(d);
        if (seen.length === 4) break;
      }
      for (const t of TEAM_CHIPS) {
        if (seen.length >= 4) break;
        if (!seen.includes(t)) seen.push(t);
      }
      return seen;
    })();

    const submit = () => {
      if (!valid) {
        toast('Add a description first.');
        return;
      }
      const entry = newEntry(
        { username: targetUsername, person: target },
        {
          dateIso: form.date,
          hours: form.hours,
          description: form.desc,
          dayTypeOverride: overridden ? (form.type as DayType) : null,
        },
      );
      setState({ entries: [...state.entries, entry] });
      setFormOpen(false);
      setForm({ date: today, type: '', hours: 2, desc: '' });
      setMonth(monthKey(entry.dateIso));
      setWho(target);
      setView('mine');
      // Undo tombstones rather than filters, so the removal survives sync.
      toast(`Logged ${entry.hours} h on ${isoToUs(entry.dateIso)}.`, {
        label: 'Undo',
        fn: () => upsert(patchEntry(entry, { deletedAt: new Date().toISOString() })),
      });
    };

    return (
      <div className="m-screen">
        <header className="m-head m-head-nav">
          <button className="m-back" onClick={() => setFormOpen(false)}>
            <span>‹</span>Hours
          </button>
          <span className="m-head-title">Log extra hours</span>
          <span className="m-head-pad" />
        </header>

        <div className="m-list-scroll m-form-scroll">
          <div>
            <div className="m-section-label">When</div>
            <div className="m-day-strip">
              {strip.map((iso) => {
                const t = dayTypeFor(iso, null);
                const on = iso === form.date;
                const d = parseIsoLocal(iso)!;
                return (
                  <button
                    key={iso}
                    className={`m-day ${on ? 'on' : ''} ${t === 'weekend' ? 'weekend' : ''} ${iso === today ? 'today' : ''}`}
                    onClick={() => setForm({ ...form, date: iso, type: '' })}
                  >
                    <span className="m-day-wd">{weekdayName(iso).slice(0, 3)}</span>
                    <span className="m-day-dom">{d.getDate()}</span>
                    <span className={`m-day-dot ${logged.has(iso) ? 'logged' : ''}`} />
                  </button>
                );
              })}
            </div>
            <div className="m-when-row">
              <input
                type="date"
                aria-label="Date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value || form.date, type: '' })}
              />
              <div className="m-type-pills">
                {(['weekday', 'weekend', 'holiday'] as DayType[]).map((t) => (
                  <button
                    key={t}
                    className={effective === t ? 'on' : ''}
                    style={effective === t ? { background: TYPE_COLORS[t].bg, color: TYPE_COLORS[t].fg } : undefined}
                    onClick={() => setForm({ ...form, type: t === auto ? '' : t })}
                  >
                    {dayTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>
            {overridden && (
              <div className="m-override-note">Overridden — the date is a {dayTypeLabel(auto).toLowerCase()}.</div>
            )}
          </div>

          <div>
            <div className="m-section-label">How many extra hours</div>
            <div className="m-card m-pad">
              <div className="m-stepper">
                <button aria-label="Minus one hour" onClick={() => setForm({ ...form, hours: Math.max(1, form.hours - 1) })}>
                  −
                </button>
                <div className="m-stepper-value">
                  <span>{form.hours}</span>h
                </div>
                <button aria-label="Plus one hour" onClick={() => setForm({ ...form, hours: Math.min(16, form.hours + 1) })}>
                  +
                </button>
              </div>
              <div className="m-quick-row">
                {[1, 2, 4, 6, 8].map((n) => (
                  <button
                    key={n}
                    className={form.hours === n ? 'on' : ''}
                    onClick={() => setForm({ ...form, hours: n })}
                  >
                    {n}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="m-section-label">What you worked on</div>
            <textarea
              className="m-desc"
              rows={3}
              aria-label="What you worked on"
              placeholder="e.g. BOS tool & elevation drawing sheet"
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
            />
            <div className="m-reuse-chips">
              {chips.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, desc: c })}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="m-pinned-bar single">
          <button className="m-btn-orange" disabled={!valid} onClick={submit}>
            {valid ? `Log ${form.hours} hours` : 'Add a description to log'}
          </button>
        </div>
      </div>
    );
  }

  // ---- list view -------------------------------------------------------------

  return (
    <div className="m-screen">
      <header className="m-head">
        <div className="m-head-row">
          <h1>Extra Work</h1>
          <span className="m-spacer" />
          <div className="m-month-switch">
            <button aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </button>
            <span>{monthLabel(month)}</span>
            <button aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
              ›
            </button>
          </div>
        </div>
        <div className="m-segment">
          <button
            className={view === 'mine' ? 'on' : ''}
            onClick={() => {
              setView('mine');
              setWho(me);
            }}
          >
            My hours
          </button>
          <button className={view === 'team' ? 'on' : ''} onClick={() => setView('team')}>
            Team
          </button>
        </div>
      </header>

      <div className="m-list-scroll m-hours-scroll">
        <div className="m-hours-summary">
          <div className="m-hours-total">
            <span>{stats.total}</span> extra hours · {monthLabelLong(month)}
          </div>
          <div>
            <div className="m-hours-stat-label">Weekday</div>
            <div className="m-hours-stat">{stats.weekday} h</div>
          </div>
          <div>
            <div className="m-hours-stat-label">Weekend</div>
            <div className="m-hours-stat">{stats.weekend} h</div>
          </div>
          <div>
            <div className="m-hours-stat-label">Days</div>
            <div className="m-hours-stat">{stats.days}</div>
          </div>
        </div>

        {view === 'mine' ? (
          <>
            <div className="m-card m-pad m-calc">
              <label>
                Monthly salary (JOD)
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={salaryFor(who)}
                  onChange={(e) => setSalaryFor(who, e.target.value)}
                />
              </label>
              {Number(salaryFor(who)) > 0 ? (
                <div className="m-calc-out">
                  <span className="m-calc-rates">
                    {overtimePay(Number(salaryFor(who)), 1).hourly.toFixed(2)} JOD/h · 1.5× on {stats.total} h
                  </span>
                  <span className="m-calc-pay">{overtimePay(Number(salaryFor(who)), stats.total).pay.toFixed(2)} JOD</span>
                </div>
              ) : (
                <span className="m-calc-hint">Enter the salary — overtime pay shows instantly. Stays on this phone.</span>
              )}
            </div>
            <div className="m-section-row">
              <span className="m-section-label">{who === me ? 'My hours' : who}</span>
              <button className="m-link" onClick={() => void exportPerson()}>
                Export .xlsx
              </button>
            </div>
            {myEntries.map((e) => {
              const t = dayTypeFor(e.dateIso, e.dayTypeOverride);
              const d = parseIsoLocal(e.dateIso)!;
              return (
                <div key={e.id} className="m-card m-hours-entry">
                  <div className="m-date-tile" style={{ background: TYPE_COLORS[t].bg, color: TYPE_COLORS[t].fg }}>
                    <span>{weekdayName(e.dateIso).slice(0, 3)}</span>
                    <strong>{d.getDate()}</strong>
                  </div>
                  <div className="m-hours-desc">{e.description}</div>
                  <div className="m-hours-right">
                    <div className="m-hours-val">
                      {e.hours}
                      <span> h</span>
                    </div>
                    {canEditEntry(e, myUsername, isAdmin) && (
                      <button className="m-hours-del" onClick={() => remove(e)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {myEntries.length === 0 && (
              <div className="m-empty-box">
                Nothing logged in {monthLabelLong(month)} yet. Tap <b>Log hours</b> below.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="m-section-row">
              <span className="m-section-label">By employee</span>
              <button className="m-link" onClick={() => void copySummary()}>
                Copy summary
              </button>
            </div>
            <div className="m-card">
              {people.map((name) => {
                const s = personStats(monthEntries.filter((e) => e.person === name));
                return (
                  <button
                    key={name}
                    className="m-person-row"
                    onClick={() => {
                      setWho(name);
                      setView('mine');
                    }}
                  >
                    <span className="m-avatar">{initials(name)}</span>
                    <span className="m-person-main">
                      <span className="m-person-top">
                        <span className="m-person-name">{name}</span>
                        <span className="m-person-hours">{s.total} h</span>
                      </span>
                      <span className="m-bar">
                        <span style={{ width: `${(s.weekday / maxTotal) * 100}%`, background: '#0086C0' }} />
                        <span style={{ width: `${(s.weekend / maxTotal) * 100}%`, background: '#FDAB3D' }} />
                        <span style={{ width: `${(s.holiday / maxTotal) * 100}%`, background: '#A25DDC' }} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="m-pinned-bar single">
        <button className="m-btn-orange" onClick={() => setFormOpen(true)}>
          + Log hours
        </button>
      </div>
    </div>
  );
}
