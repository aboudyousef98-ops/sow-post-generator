// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { newUpdate } from '../lib/updates';
import SowBotCard from './SowBotCard';

afterEach(() => cleanup());

// Structurally identical to SOW Bot's REAL posts (see sowBotNotes.ts's
// header comment) — colon outside the bold, bare https:// link lines with
// no <url|label> wrapping.
const FULL_NOTE = [
  '*SOW Bot notes* (updated Nov 26, 2026, 6:30 PM Amman)',
  '• *Status*: Working on it',
  '• *Install date*: 12/05/2026',
  '• *Blockers*: Waiting on AHJ to confirm the permit',
  '• *Survey / SVT*: Completed',
  '• *Pre-Design Analysis*: Done',
  '• *Solrite verification*: Passed',
  '• *AHJ / utility*: Harris County / CenterPoint',
  '• *Latest Slack activity*: Omar Rajab confirmed the trench depth.',
  'https://workspace.slack.com/archives/C1/p1',
].join('\n');

// The real stamped `by` — bot.mts always sets it from the token's
// displayName, never the raw username (the bug that kept this card from
// ever rendering against SOW Bot's first real posts).
const bot = (text: string, at = '2026-11-26T15:30:00.000Z') => newUpdate('p1', text, 'SOW Bot - Aboud', 'note', {}, at);

describe('SowBotCard — header', () => {
  it('shows the bot label, avatar, and the Amman-local timestamp', () => {
    render(<SowBotCard update={bot(FULL_NOTE)} duplicate={false} />);
    expect(screen.getByText('SOW Bot')).toBeTruthy();
    expect(screen.getByText('SB')).toBeTruthy();
    expect(screen.getByText(/Updated Nov 26, 2026, 6:30 PM Amman/)).toBeTruthy();
  });

  it('shows the duplicate warning badge only when told to', () => {
    render(<SowBotCard update={bot(FULL_NOTE)} duplicate={true} />);
    expect(screen.getByText('duplicate bot notes')).toBeTruthy();
  });

  it('omits the duplicate badge for a single note', () => {
    render(<SowBotCard update={bot(FULL_NOTE)} duplicate={false} />);
    expect(screen.queryByText('duplicate bot notes')).toBeNull();
  });
});

describe('SowBotCard — status strip', () => {
  it('renders one chip per field, colored by state', () => {
    render(<SowBotCard update={bot(FULL_NOTE)} duplicate={false} />);
    expect(document.querySelector('.sowbot-chip-pending')?.textContent).toContain('Status');
    expect(document.querySelector('.sowbot-chip-blocked')?.textContent).toContain('Blockers');
    expect(document.querySelectorAll('.sowbot-chip').length).toBe(8);
  });

  it('a missing field renders as the grey unknown chip', () => {
    const text = ['*SOW Bot notes*', '• *Status*: Done'].join('\n');
    render(<SowBotCard update={bot(text)} duplicate={false} />);
    const svtChip = Array.from(document.querySelectorAll('.sowbot-chip')).find((el) =>
      el.textContent?.includes('Survey / SVT'),
    );
    expect(svtChip?.className).toContain('sowbot-chip-unknown');
  });

  it('SOW Bot\'s "Not found" phrasing renders as the grey unknown chip, not green', () => {
    const text = ['*SOW Bot notes*', '• *Status*: Done', '• *Install date*: Not found'].join('\n');
    render(<SowBotCard update={bot(text)} duplicate={false} />);
    const installChip = Array.from(document.querySelectorAll('.sowbot-chip')).find((el) =>
      el.textContent?.includes('Install date'),
    );
    expect(installChip?.className).toContain('sowbot-chip-unknown');
  });
});

describe('SowBotCard — Blockers callout (rule 3)', () => {
  it('a real blocker renders the red callout with its text', () => {
    render(<SowBotCard update={bot(FULL_NOTE)} duplicate={false} />);
    const callout = document.querySelector('.sowbot-callout.danger');
    expect(callout?.textContent).toContain('Waiting on AHJ to confirm the permit');
  });

  it('"None" renders the green All clear callout instead', () => {
    const text = ['*SOW Bot notes*', '• *Status*: Done', '• *Blockers*: None'].join('\n');
    render(<SowBotCard update={bot(text)} duplicate={false} />);
    expect(document.querySelector('.sowbot-callout.ok')?.textContent).toContain('All clear');
    expect(document.querySelector('.sowbot-callout.danger')).toBeNull();
  });

  it('SOW Bot\'s real "None … but here is context" phrasing also renders All clear', () => {
    const text = [
      '*SOW Bot notes*',
      '• *Status*: Done',
      '• *Blockers*: None open in Slack. Fixes asked by Jad were marked "Updated".',
    ].join('\n');
    render(<SowBotCard update={bot(text)} duplicate={false} />);
    expect(document.querySelector('.sowbot-callout.ok')).toBeTruthy();
    expect(document.querySelector('.sowbot-callout.danger')).toBeNull();
  });
});

describe('SowBotCard — Latest Slack activity (rule 4)', () => {
  it('is collapsed by default, with a clickable link once expanded', () => {
    render(<SowBotCard update={bot(FULL_NOTE)} duplicate={false} />);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    const link = screen.getByRole('link') as HTMLAnchorElement;
    expect(link.href).toBe('https://workspace.slack.com/archives/C1/p1');
    fireEvent.click(screen.getByRole('button', { name: /Hide/ }));
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('SowBotCard — fallback (rule 6)', () => {
  it('renders the raw text when the body does not parse', () => {
    render(<SowBotCard update={bot('Just a freeform note, not the expected shape.')} duplicate={false} />);
    expect(screen.getByText(/Just a freeform note/)).toBeTruthy();
    expect(document.querySelector('.sowbot-strip')).toBeNull();
    expect(document.querySelector('.sowbot-callout')).toBeNull();
  });
});
