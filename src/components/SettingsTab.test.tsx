// @vitest-environment jsdom
// Settings v2 (design handoff 2026-10-06): roster avatar chips with inline
// "+ Add" (Enter adds, × removes with Undo), region-lead pill pickers drawn
// from fixedTags ∪ authors ∪ designers, live Slack phrase preview, and a
// two-step inline "Clear all" confirm. Settings shape unchanged.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../lib/storage';
import { makeRecord } from '../lib/__fixtures__/makeRecord';
import type { PostRecord, Settings } from '../types';
import SettingsTab from './SettingsTab';

const toasts: { text: string; action?: { label: string; fn: () => void } }[] = [];
let latestSettings: Settings | undefined;
let latestRecords: PostRecord[] | undefined;

function Harness({ records = [] as PostRecord[] }) {
  const [settings, setSettings] = useState(defaultSettings());
  const [recs, setRecs] = useState<PostRecord[]>(records);
  return (
    <SettingsTab
      settings={settings}
      setSettings={(s) => {
        latestSettings = s;
        setSettings(s);
      }}
      records={recs}
      setRecords={(r) => {
        latestRecords = r;
        setRecs(r);
      }}
      ahjs={[]}
      setAhjs={() => {}}
      toast={(text, action) => toasts.push({ text, action })}
    />
  );
}

function rosterRow(label: RegExp | string) {
  return screen.getByText(label).closest('.sv2-roster-row') as HTMLElement;
}

describe('SettingsTab v2', () => {
  beforeEach(() => {
    toasts.length = 0;
    latestSettings = undefined;
    latestRecords = undefined;
  });
  afterEach(cleanup);

  it('renders roster chips and adds a name via + Add (Enter commits)', () => {
    render(<Harness />);
    const row = rosterRow('Authors (Posting as)');
    expect(within(row).getByText('Aboud Yousef')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: '+ Add' }));
    const input = within(row).getByPlaceholderText(/Enter to add/);
    fireEvent.change(input, { target: { value: 'New Person' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(latestSettings?.authors).toContain('New Person');
  });

  it('blocks case-insensitive duplicates with a toast', () => {
    render(<Harness />);
    const row = rosterRow('Authors (Posting as)');
    fireEvent.click(within(row).getByRole('button', { name: '+ Add' }));
    const input = within(row).getByPlaceholderText(/Enter to add/);
    fireEvent.change(input, { target: { value: 'aboud yousef' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(latestSettings).toBeUndefined();
    expect(toasts[0].text).toMatch(/already on the list/);
  });

  it('removes a chip with Undo restoring it', () => {
    render(<Harness />);
    const row = rosterRow('Fixed tags');
    const chip = within(row).getByText('Tarek Abu Hseini').closest('.sv2-chip') as HTMLElement;
    fireEvent.click(within(chip).getByRole('button', { name: 'Remove' }));
    expect(latestSettings?.fixedTags).not.toContain('Tarek Abu Hseini');
    const undo = toasts.find((t) => t.action)!;
    undo.action!.fn();
    expect(latestSettings?.fixedTags).toContain('Tarek Abu Hseini');
  });

  it('region lead pills: pick a lead, clear with No lead', () => {
    render(<Harness />);
    const hou = screen.getByText('HOU').closest('.sv2-lead') as HTMLElement;
    fireEvent.click(within(hou).getByRole('button', { name: 'Omar Rajab' }));
    expect(latestSettings?.regionLead.HOU).toBe('Omar Rajab');
    fireEvent.click(within(hou).getByRole('button', { name: 'No lead' }));
    expect(latestSettings?.regionLead.HOU).toBeNull();
  });

  it('phrase edits show in the live Slack preview', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Site Survey Feedback/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Roof is fine.' } });
    const preview = screen.getByText('How it reads in Slack').parentElement as HTMLElement;
    expect(within(preview).getByText(/Roof is fine\./)).toBeTruthy();
  });

  it('Clear all is a two-step inline confirm that tombstones every record', () => {
    const records = [makeRecord({ id: 'r1' }), makeRecord({ id: 'r2' })];
    render(<Harness records={records} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all…' }));
    const warning = screen.getByText(/Really clear/).closest('.sv2-armed') as HTMLElement;
    expect(within(warning).getByText('2')).toBeTruthy(); // record count in the warning
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear' }));
    expect(latestRecords?.every((r) => r.deletedAt)).toBe(true);
  });

  it('Reset settings keeps lastAuthor and offers Undo', () => {
    render(<Harness />);
    const row = rosterRow('Authors (Posting as)');
    fireEvent.click(within(row).getByRole('button', { name: '+ Add' }));
    const input = within(row).getByPlaceholderText(/Enter to add/);
    fireEvent.change(input, { target: { value: 'Temp Person' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(latestSettings?.authors).toEqual(defaultSettings().authors);
    const undo = toasts.filter((t) => t.action).pop()!;
    undo.action!.fn();
    expect(latestSettings?.authors).toContain('Temp Person');
  });
});
