// @vitest-environment jsdom
// Regression: pressing Enter in the "one per line" roster textareas must keep
// the newline visible (the controlled value used to strip it on every keystroke).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../lib/storage';
import type { PostRecord, Settings } from '../types';
import SettingsTab from './SettingsTab';

function Harness({ onSettings }: { onSettings?: (s: Settings) => void }) {
  const [settings, setSettings] = useState(defaultSettings());
  const [records, setRecords] = useState<PostRecord[]>([]);
  return (
    <SettingsTab
      settings={settings}
      setSettings={(s) => {
        setSettings(s);
        onSettings?.(s);
      }}
      records={records}
      setRecords={setRecords}
      ahjs={[]}
      setAhjs={() => {}}
      toast={() => {}}
    />
  );
}

describe('SettingsTab roster editors', () => {
  afterEach(cleanup);

  it('keeps a trailing newline while typing (Enter → new row)', () => {
    render(<Harness />);
    const ta = screen.getByLabelText(/Authors \(Posting as\)/) as HTMLTextAreaElement;
    const before = ta.value;

    fireEvent.change(ta, { target: { value: before + '\n' } });
    expect(ta.value).toBe(before + '\n');

    fireEvent.change(ta, { target: { value: before + '\nNew Person' } });
    expect(ta.value).toBe(before + '\nNew Person');
  });

  it('reports the cleaned list (trimmed, no blank lines) to the parent', () => {
    let latest: Settings | undefined;
    render(<Harness onSettings={(s) => (latest = s)} />);
    const ta = screen.getByLabelText(/Authors \(Posting as\)/) as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: 'Aboud Yousef\n\n  Omar Rajab \nNew Person\n' } });
    expect(latest?.authors).toEqual(['Aboud Yousef', 'Omar Rajab', 'New Person']);
  });

  it('picks up external settings changes (Reset to defaults)', () => {
    render(<Harness />);
    const ta = screen.getByLabelText(/Authors \(Posting as\)/) as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: 'Somebody Else' } });
    expect(ta.value).toBe('Somebody Else');

    fireEvent.click(screen.getByText('Reset to defaults'));
    expect(ta.value).toBe(defaultSettings().authors.join('\n'));
  });
});
