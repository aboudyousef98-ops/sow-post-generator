// @vitest-environment jsdom
// The SVT pre-design output mode (Aboud 2026-11-15): when the Compose form is
// on the "SVT — Pre-design" tab, the output column shows the SVT post preview
// with one copy button. The SF panel, the Slack-post toggle, the note check
// and Mark as posted are full-SOW concerns and must not appear — and the
// default ('sow') mode must render exactly as it always did.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeRecord } from '../lib/__fixtures__/makeRecord';
import { defaultSettings } from '../lib/storage';
import type { PostRecord } from '../types';
import OutputColumn from './OutputColumn';

vi.mock('../lib/api', () => ({ noteCheck: vi.fn().mockResolvedValue({ hits: [] }) }));

function renderColumn(mode: 'sow' | 'svt' | undefined, record: PostRecord = makeRecord()) {
  render(
    <OutputColumn
      record={record}
      settings={defaultSettings()}
      boardProjects={[]}
      update={() => {}}
      onMarkPosted={() => {}}
      onNewPost={() => {}}
      onSaveDraft={() => {}}
      toast={() => {}}
      mode={mode}
    />,
  );
}

describe('OutputColumn — SVT pre-design mode', () => {
  afterEach(cleanup);

  it('shows the SVT preview and one copy button; the SOW controls stay away', () => {
    renderColumn('svt');
    expect(screen.getByText('SVT post preview')).toBeTruthy();
    expect(screen.getByText(/Pre-Design Analysis — Norca Garcia/)).toBeTruthy();
    const copy = screen.getByRole('button', { name: /Copy SVT post/i }) as HTMLButtonElement;
    expect(copy.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /Copy for Slack/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark as posted/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Salesforce fields/i })).toBeNull();
  });

  it('the same four required fields gate the SVT copy', () => {
    const record = makeRecord();
    record.sf = { ...record.sf, siteAddress: '' };
    renderColumn('svt', record);
    expect((screen.getByRole('button', { name: /Copy SVT post/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('omitting the mode renders the full SOW column exactly as before', () => {
    renderColumn(undefined);
    expect(screen.getByRole('button', { name: /Copy for Slack/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mark as posted/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Salesforce fields/i })).toBeTruthy();
    expect(screen.queryByText('SVT post preview')).toBeNull();
    expect(screen.queryByRole('button', { name: /Copy SVT post/i })).toBeNull();
  });
});
