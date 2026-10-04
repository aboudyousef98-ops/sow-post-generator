// @vitest-environment jsdom
// Task 8 review follow-up: InstallNotesCard is 165 lines of stateful UI that
// only had end-to-end coverage. Covers the behaviours the review flagged as
// undertested: chip line-joining, wall-count truncate/append (+ preserving
// orientations when Walls returns to "—"), storiesOther surviving a toggle
// away from Other… and back, stale-polished invalidation on edit, and a
// migrated pre-Phase-7 draft's legacy text reaching "Anything else".

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyInstallNotes } from '../lib/installNotes';
import { blankRecord } from '../lib/record';
import { defaultSettings, migrateRecord } from '../lib/storage';
import type { PolishKey, PostRecord, Settings } from '../types';
import InstallNotesCard from './InstallNotesCard';

function Harness({ initial }: { initial?: PostRecord }) {
  const [record, setRecord] = useState<PostRecord>(initial ?? blankRecord('Aboud Yousef', defaultSettings()));
  const [dropped, setDropped] = useState<Partial<Record<PolishKey, string[]>>>({});
  const [drift, setDrift] = useState<Partial<Record<PolishKey, { from: number; to: number }>>>({});
  // No 'install.*' chips ship in defaultSettings() yet — add one so the chip
  // test has something to click.
  const settings: Settings = {
    ...defaultSettings(),
    chips: { ...defaultSettings().chips, 'install.other': ['Quick chip phrase'] },
  };
  return (
    <InstallNotesCard
      record={record}
      settings={settings}
      update={(updater) => setRecord((r) => updater(r))}
      onKeyDown={() => {}}
      dropped={dropped}
      drift={drift}
      onToggle={(key, usePolished) =>
        setRecord((r) => ({ ...r, usePolished: { ...r.usePolished, [key]: usePolished } }))
      }
      onClearDropped={(key) => setDropped((d) => ({ ...d, [key]: undefined }))}
      onClearDrift={(key) => setDrift((d) => ({ ...d, [key]: undefined }))}
    />
  );
}

describe('InstallNotesCard', () => {
  afterEach(cleanup);

  it('a chip appends on its own new line (not space-joined) and clears stale polished text', () => {
    const initial: PostRecord = {
      ...blankRecord('Aboud Yousef', defaultSettings()),
      installNotes: { ...emptyInstallNotes(), other: 'First line' },
      polished: { 'install.other': 'Old AI text' },
    };
    render(<Harness initial={initial} />);

    // Polished preview from the old (now stale-to-be) AI pass is visible first.
    expect(screen.getByText(/Old AI text/)).toBeTruthy();

    fireEvent.click(screen.getByText('Quick chip phrase'));

    const ta = screen.getByLabelText(/^Anything else/i) as HTMLTextAreaElement;
    expect(ta.value).toBe('First line\nQuick chip phrase');
    // The chip click changed the raw text, so the stale polished preview is gone.
    expect(screen.queryByText(/Old AI text/)).toBeNull();
  });

  it('reducing the wall count truncates orientations; increasing appends blank slots', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/^Wall 1 orientation/i), { target: { value: 'North' } });
    fireEvent.change(screen.getByLabelText(/^Wall 2 orientation/i), { target: { value: 'East' } });
    fireEvent.change(screen.getByLabelText(/^Wall 3 orientation/i), { target: { value: 'South' } });

    // 3 -> 1 keeps only the first orientation; walls 2 and 3 disappear.
    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '1' } });
    expect((screen.getByLabelText(/^Wall 1 orientation/i) as HTMLSelectElement).value).toBe('North');
    expect(screen.queryByLabelText(/^Wall 2 orientation/i)).toBeNull();
    expect(screen.queryByLabelText(/^Wall 3 orientation/i)).toBeNull();

    // 1 -> 3 keeps wall 1 and appends blank slots for 2 and 3.
    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '3' } });
    expect((screen.getByLabelText(/^Wall 1 orientation/i) as HTMLSelectElement).value).toBe('North');
    expect((screen.getByLabelText(/^Wall 2 orientation/i) as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText(/^Wall 3 orientation/i) as HTMLSelectElement).value).toBe('');
  });

  it('returning Walls to "—" preserves previously chosen orientations', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^Wall 1 orientation/i), { target: { value: 'North' } });
    fireEvent.change(screen.getByLabelText(/^Wall 2 orientation/i), { target: { value: 'West' } });

    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '' } });
    expect(screen.queryByLabelText(/^Wall 1 orientation/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '2' } });
    expect((screen.getByLabelText(/^Wall 1 orientation/i) as HTMLSelectElement).value).toBe('North');
    expect((screen.getByLabelText(/^Wall 2 orientation/i) as HTMLSelectElement).value).toBe('West');
  });

  it('storiesOther survives toggling Stories away from Other… and back', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/^Stories/i), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText(/^Describe the house/i), {
      target: { value: 'Split level, garage below' },
    });

    fireEvent.change(screen.getByLabelText(/^Stories/i), { target: { value: '2' } });
    expect(screen.queryByLabelText(/^Describe the house/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Stories/i), { target: { value: 'other' } });
    expect((screen.getByLabelText(/^Describe the house/i) as HTMLInputElement).value).toBe(
      'Split level, garage below',
    );
  });

  it("editing a box invalidates that box's stale polished text", () => {
    const initial: PostRecord = {
      ...blankRecord('Aboud Yousef', defaultSettings()),
      installNotes: { ...emptyInstallNotes(), other: 'Raw draft' },
      polished: { 'install.other': 'Polished preview text' },
    };
    render(<Harness initial={initial} />);

    expect(screen.getByText(/Polished preview text/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Anything else/i), { target: { value: 'Raw draft, edited' } });

    expect(screen.queryByText(/Polished preview text/)).toBeNull();
  });

  it('service equipment allows multiple ticks (meeting 2026-10-04)', () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText(/^MPU/));
    fireEvent.click(screen.getByLabelText(/^FSU/));

    expect((screen.getByLabelText(/^MPU/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/^FSU/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/^FTP/) as HTMLInputElement).checked).toBe(false);
  });

  it('a legacy single `service` shows as a tick, and unticking everything clears it for good', () => {
    const initial: PostRecord = {
      ...blankRecord('Aboud Yousef', defaultSettings()),
      installNotes: { ...emptyInstallNotes(), service: 'MPU' },
    };
    render(<Harness initial={initial} />);

    const mpu = screen.getByLabelText(/^MPU/) as HTMLInputElement;
    expect(mpu.checked).toBe(true);
    fireEvent.click(mpu);
    expect(mpu.checked).toBe(false);
  });

  it('walls go up to 5 and stories up to 3 (meeting 2026-10-04)', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText(/^Walls/i), { target: { value: '5' } });
    expect(screen.getByLabelText(/^Wall 5 orientation/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Stories/i), { target: { value: '3' } });
    expect((screen.getByLabelText(/^Stories/i) as HTMLSelectElement).value).toBe('3');
  });

  it('the Main disconnect location box is gone (meeting 2026-10-04)', () => {
    render(<Harness />);
    expect(screen.queryByLabelText(/Main disconnect location/i)).toBeNull();
  });

  it('duration dropdown defaults to Automatic, follows the ticks, and can be overridden', () => {
    render(<Harness />);
    const sel = screen.getByLabelText(/^Power disconnect duration/i) as HTMLSelectElement;

    expect(sel.value).toBe(''); // Automatic
    expect(screen.getByRole('option', { name: /Automatic — 1–2 hours/ })).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/^MPU/));
    expect(screen.getByRole('option', { name: /Automatic — 4–6 hours/ })).toBeTruthy();

    fireEvent.change(sel, { target: { value: '1-2' } });
    expect(sel.value).toBe('1-2'); // pinned by hand
  });

  it('roof rating is a 1–10 dropdown (Roof Rating System)', () => {
    render(<Harness />);
    const sel = screen.getByLabelText(/^Roof rating/i) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '8' } });
    expect(sel.value).toBe('8');
  });

  it('a Poor-rated roof (3–4) on a project with an install date shows the alert banner', () => {
    const base = blankRecord('Aboud Yousef', defaultSettings());
    const initial: PostRecord = {
      ...base,
      sf: { ...base.sf, installScheduledDate: '2026-10-07' },
      installNotes: { ...emptyInstallNotes(), roofRating: 3 },
    };
    render(<Harness initial={initial} />);
    expect(screen.getByText(/alert the team/i)).toBeTruthy();
  });

  it('an Unviable roof (1–2) warns "do not install" even with no install date', () => {
    const initial: PostRecord = {
      ...blankRecord('Aboud Yousef', defaultSettings()),
      installNotes: { ...emptyInstallNotes(), roofRating: 2 },
    };
    render(<Harness initial={initial} />);
    expect(screen.getByText(/do not install/i)).toBeTruthy();
  });

  it('a migrated pre-Phase-7 draft reopens with its old text in "Anything else"', () => {
    const legacy: PostRecord = {
      ...blankRecord('Aboud Yousef', defaultSettings()),
      installNotes: undefined,
      notes: { layout: 'Conduit through the attic to the garage.', siteSurvey: '', design: '', homeowner: '' },
    };
    const migrated = migrateRecord(legacy);
    render(<Harness initial={migrated} />);

    expect((screen.getByLabelText(/^Anything else/i) as HTMLTextAreaElement).value).toBe(
      'Conduit through the attic to the garage.',
    );
  });
});
