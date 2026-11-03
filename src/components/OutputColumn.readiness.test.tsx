// @vitest-environment jsdom
// The readiness card as a gate (Aboud 2026-11-03). The battery installation
// analysis joined missingRequired(), so the card has to name WHICH battery
// question is unanswered — "3 things before posting" with no detail would send
// the coordinator hunting through the form.

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

describe('readiness card — battery installation analysis', () => {
  afterEach(cleanup);

  it('blocks copying and posting while the battery questions are unanswered', () => {
    renderColumn(emptyInstallNotes());
    expect(copyButton().disabled).toBe(true);
    expect(markPosted().disabled).toBe(true);
  });

  it('names each unanswered battery question in the tick-list', () => {
    renderColumn(emptyInstallNotes());
    expect(screen.getByText('Battery base')).toBeTruthy();
    expect(screen.getByText('Supporting wall evenness')).toBeTruthy();
    expect(screen.getByText('Push batteries from wall')).toBeTruthy();
  });

  it('asks for the branch follow-up once a base is chosen', () => {
    renderColumn(answeredInstallNotes({ batteryElevation: '' }));
    expect(screen.getByText('Battery elevation')).toBeTruthy();
    expect(screen.queryByText('Battery base')).toBeNull();
  });

  it('collapses to one done row once every battery question is answered', () => {
    renderColumn(answeredInstallNotes());
    // Exact text — the Slack preview beside the card also prints the
    // "Battery Installation Analysis" post heading.
    expect(screen.getByText('Battery installation analysis answered')).toBeTruthy();
    expect(screen.queryByText('Battery base')).toBeNull();
    expect(screen.queryByText('Supporting wall evenness')).toBeNull();
  });

  it('a fully answered record is ready to post', () => {
    renderColumn(answeredInstallNotes());
    expect(screen.getByText(/Ready to post/i)).toBeTruthy();
    expect(copyButton().disabled).toBe(false);
    expect(markPosted().disabled).toBe(false);
  });

  it('a record with no installNotes at all still renders the card rather than crashing', () => {
    renderColumn(undefined);
    expect(screen.getByText('Battery base')).toBeTruthy();
    expect(copyButton().disabled).toBe(true);
  });
});
