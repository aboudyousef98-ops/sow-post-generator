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

    const ta = screen.getByLabelText('Anything else') as HTMLTextAreaElement;
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

    fireEvent.change(screen.getByLabelText('Anything else'), { target: { value: 'Raw draft, edited' } });

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

  it('roof material: Metal and Clay tile flag the conduit rework; Shingle does not (Aboud 2026-10-27)', () => {
    render(<Harness />);
    const pick = (v: string) =>
      fireEvent.change(screen.getByLabelText(/^Roof material/i), { target: { value: v } });

    pick('metal');
    expect(screen.getByText(/Remove Solar junction box/i)).toBeTruthy();
    expect(screen.getByText(/Metal roof/i)).toBeTruthy();

    pick('clay-tile');
    expect(screen.getByText(/Remove Solar junction box/i)).toBeTruthy();

    pick('shingle');
    expect(screen.queryByText(/Remove Solar junction box/i)).toBeNull();
  });

  it('roof material "Others…" reveals a describe box and keeps its text when toggled away and back', () => {
    render(<Harness />);
    const pick = (v: string) =>
      fireEvent.change(screen.getByLabelText(/^Roof material/i), { target: { value: v } });

    pick('other');
    fireEvent.change(screen.getByLabelText(/Describe the roof material/i), {
      target: { value: 'Flat TPO membrane' },
    });
    // No flag for Others — only metal / clay tile trigger the rework warning.
    expect(screen.queryByText(/Remove Solar junction box/i)).toBeNull();

    pick('tile');
    expect(screen.queryByLabelText(/Describe the roof material/i)).toBeNull();

    pick('other');
    expect((screen.getByLabelText(/Describe the roof material/i) as HTMLInputElement).value).toBe(
      'Flat TPO membrane',
    );
  });

  it('a migrated pre-Phase-7 draft reopens with its old text in "Anything else"', () => {
    const legacy: PostRecord = {
      ...blankRecord('Aboud Yousef', defaultSettings()),
      installNotes: undefined,
      notes: { layout: 'Conduit through the attic to the garage.', siteSurvey: '', design: '', homeowner: '' },
    };
    const migrated = migrateRecord(legacy);
    render(<Harness initial={migrated} />);

    // Exact label — "Anything else (battery installation)" also starts with
    // "Anything else" since the 2026-11-03 battery group was added.
    expect((screen.getByLabelText('Anything else') as HTMLTextAreaElement).value).toBe(
      'Conduit through the attic to the garage.',
    );
  });
});

// ---- Battery installation analysis (Aboud 2026-11-03) ----------------------

describe('InstallNotesCard — battery installation analysis', () => {
  afterEach(cleanup);

  const pickBase = (v: string) =>
    fireEvent.change(screen.getByLabelText('Battery base'), { target: { value: v } });

  it('asks nothing extra until a base is chosen', () => {
    render(<Harness />);
    expect((screen.getByLabelText('Battery base') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByLabelText(/^Does the base need extra work\?/)).toBeNull();
    expect(screen.queryByLabelText('Battery elevation')).toBeNull();
    expect(screen.queryByLabelText('Existing ground')).toBeNull();
  });

  it('concrete pad asks only whether the base needs extra work', () => {
    render(<Harness />);
    pickBase('concrete-pad');
    expect(screen.getByLabelText(/^Does the base need extra work\?/)).toBeTruthy();
    expect(screen.queryByLabelText('Battery elevation')).toBeNull();
    expect(screen.queryByLabelText('Existing ground')).toBeNull();
    // The description only appears once the answer is Yes.
    expect(screen.queryByLabelText('Battery base extra work')).toBeNull();
  });

  it('extra work = Yes reveals the description box, No hides it again', () => {
    render(<Harness />);
    pickBase('concrete-pad');
    const work = () => screen.getByLabelText(/^Does the base need extra work\?/);

    fireEvent.change(work(), { target: { value: 'yes' } });
    expect(screen.getByLabelText('Battery base extra work')).toBeTruthy();

    fireEvent.change(work(), { target: { value: 'no' } });
    expect(screen.queryByLabelText('Battery base extra work')).toBeNull();
    // "No" is a real answer, not a reset back to unanswered.
    expect((work() as HTMLSelectElement).value).toBe('no');
  });

  it('wall mount asks only for the elevation', () => {
    render(<Harness />);
    pickBase('wall-mount');
    expect(screen.getByLabelText('Battery elevation')).toBeTruthy();
    expect(screen.queryByLabelText(/^Does the base need extra work\?/)).toBeNull();
    expect(screen.queryByLabelText('Existing ground')).toBeNull();
  });

  it('existing ground asks only for the ground description', () => {
    render(<Harness />);
    pickBase('existing-ground');
    expect(screen.getByLabelText('Existing ground')).toBeTruthy();
    expect(screen.queryByLabelText('Battery elevation')).toBeNull();
    expect(screen.queryByLabelText(/^Does the base need extra work\?/)).toBeNull();
  });

  it('a branch box keeps its text when the base is switched away and back', () => {
    render(<Harness />);
    pickBase('wall-mount');
    fireEvent.change(screen.getByLabelText('Battery elevation'), {
      target: { value: '48 in above the garage floor' },
    });

    pickBase('concrete-pad');
    expect(screen.queryByLabelText('Battery elevation')).toBeNull();

    pickBase('wall-mount');
    expect((screen.getByLabelText('Battery elevation') as HTMLTextAreaElement).value).toBe(
      '48 in above the garage floor',
    );
  });

  it('both wall-support questions are always asked, and start unanswered', () => {
    render(<Harness />);
    expect((screen.getByLabelText(/^Supporting wall even \(flat\)\?/) as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText(/^Push the batteries out from the wall\?/) as HTMLSelectElement).value).toBe('');
  });

  it('has its own "Anything else" box, separate from the main one', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Anything else (battery installation)')).toBeTruthy();
    expect(screen.getByLabelText('Anything else')).toBeTruthy();
  });

  it('the retired "Concrete pad installation" box is gone from the form', () => {
    render(<Harness />);
    expect(screen.queryByLabelText(/Concrete pad installation/i)).toBeNull();
  });

  // 41 live drafts had text in the retired box when this shipped. Removing the
  // box would have hidden it AND stopped printing it — silent content loss on
  // real work. It is shown read-only instead, so whoever opens the draft can
  // transfer it into the new questions.
  it('shows a legacy pad note read-only when an old draft still carries one', () => {
    const legacy: PostRecord = {
      ...blankRecord('Aboud Yousef', defaultSettings()),
      installNotes: { ...emptyInstallNotes(), concretePad: 'On soil ground - Concrete Pads are needed.' },
    };
    render(<Harness initial={legacy} />);

    expect(screen.getByText(/On soil ground - Concrete Pads are needed\./)).toBeTruthy();
    expect(screen.getByText(/no longer posted/i)).toBeTruthy();
    // Read-only: it is not an editable box.
    expect(screen.queryByLabelText(/Concrete pad installation/i)).toBeNull();
  });

  it('shows no legacy note when the old box was never used', () => {
    render(<Harness />);
    expect(screen.queryByText(/no longer posted/i)).toBeNull();
  });
});
