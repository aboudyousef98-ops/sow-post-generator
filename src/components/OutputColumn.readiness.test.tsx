// @vitest-environment jsdom
// The battery installation analysis is deliberately NOT required (Aboud
// 2026-11-03: "just skip the require thing"). It was built as a required group
// first; making it required would have flipped ~255 open drafts to "not ready
// to post" the moment it shipped, so he dropped the gate instead.
//
// These tests pin that: an untouched battery block must never block posting,
// and must never appear in the readiness tick-list.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answeredInstallNotes, makeRecord } from '../lib/__fixtures__/makeRecord';
import { emptyInstallNotes } from '../lib/installNotes';
import { defaultSettings } from '../lib/storage';
import type { InstallNotes, PostRecord } from '../types';
import OutputColumn from './OutputColumn';

vi.mock('../lib/api', () => ({ noteCheck: vi.fn().mockResolvedValue({ hits: [] }) }));

function renderColumn(installNotes: InstallNotes | undefined) {
  const record: PostRecord = makeRecord({ installNotes });
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
    />,
  );
}

const copyButton = () => screen.getByRole('button', { name: /Copy for Slack/i }) as HTMLButtonElement;
const markPosted = () => screen.getByRole('button', { name: /Mark as posted/i }) as HTMLButtonElement;

describe('readiness card — the battery analysis never gates posting', () => {
  afterEach(cleanup);

  it('an untouched battery block still leaves the record ready to post', () => {
    renderColumn(emptyInstallNotes());
    expect(screen.getByText(/Ready to post/i)).toBeTruthy();
    expect(copyButton().disabled).toBe(false);
    expect(markPosted().disabled).toBe(false);
  });

  it('does not add battery questions to the tick-list', () => {
    renderColumn(emptyInstallNotes());
    expect(screen.queryByText('Battery base')).toBeNull();
    expect(screen.queryByText('Supporting wall evenness')).toBeNull();
    expect(screen.queryByText('Push batteries from wall')).toBeNull();
    expect(screen.queryByText('Battery elevation')).toBeNull();
  });

  it('a half-answered block does not gate either — a base with no elevation is fine', () => {
    renderColumn(answeredInstallNotes({ batteryElevation: '' }));
    expect(copyButton().disabled).toBe(false);
    expect(screen.queryByText('Battery elevation')).toBeNull();
  });

  it('a record with no installNotes at all still renders and still posts', () => {
    renderColumn(undefined);
    expect(copyButton().disabled).toBe(false);
  });

  it('the Salesforce fields are still what gate posting', () => {
    const record = makeRecord({ installNotes: emptyInstallNotes() });
    record.sf = { ...record.sf, siteAddress: '' };
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
      />,
    );
    expect(copyButton().disabled).toBe(true);
    expect(screen.getByText('Site address')).toBeTruthy();
  });
});
