// @vitest-environment jsdom
// The SVT pre-design output mode (Aboud 2026-11-15): when the Compose form is
// on the "SVT — Pre-design" tab, the output column shows the SVT post preview
// with one copy button. The SF panel, the Slack-post toggle, the note check
// and Mark as posted are full-SOW concerns and must not appear — and the
// default ('sow') mode must render exactly as it always did.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('the readiness list describes the SVT post, not the SOW handoff (audit 2026-11-15)', () => {
    renderColumn('svt');
    // The three pre-design advisories…
    expect(screen.getByText('Battery location filled')).toBeTruthy();
    expect(screen.getByText('Homeowner agreement answered')).toBeTruthy();
    expect(screen.getByText('Conduit path ticked')).toBeTruthy();
    // …and none of the SOW-stage rows (the wire advisory had no control to
    // answer it in this mode, and nothing is ever "appended" to an SVT post).
    expect(screen.queryByText(/Wire material/)).toBeNull();
    expect(screen.queryByText(/Level 1 chosen/)).toBeNull();
    expect(screen.queryByText(/requirements appended|requirements reviewed/)).toBeNull();
  });

  it('the SVT advisories never gate the copy (no Required fields — house rule)', () => {
    renderColumn('svt'); // makeRecord has no battery location, no svt answers
    expect((screen.getByRole('button', { name: /Copy SVT post/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Ready to post/i)).toBeTruthy();
  });

  it('the same four required fields gate the SVT copy', () => {
    const record = makeRecord();
    record.sf = { ...record.sf, siteAddress: '' };
    renderColumn('svt', record);
    expect((screen.getByRole('button', { name: /Copy SVT post/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers a Salesforce view — our own plain-text structure (Aboud 2026-11-15)', () => {
    renderColumn('svt');
    fireEvent.click(screen.getByRole('tab', { name: 'Salesforce' }));
    const pre = document.querySelector('.svt-sf-pre')!;
    expect(pre.textContent).toContain('Pre-Design Analysis — Norca Garcia');
    // The characters ARE the formatting: dashed underline under the section.
    expect(pre.textContent).toContain('Installation Notes\n------------------');
    // The main button follows the view.
    expect(screen.getByRole('button', { name: 'Copy for Salesforce' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Slack post' }));
    expect(screen.getByRole('button', { name: 'Copy SVT post' })).toBeTruthy();
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
