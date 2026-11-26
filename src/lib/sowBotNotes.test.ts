import { describe, expect, it } from 'vitest';
import { newUpdate } from './updates';
import {
  formatAmmanTime,
  isSowBotAuthor,
  isSowBotNote,
  parseSowBotNotes,
  selectSowBotNote,
  SOW_BOT_USERNAME,
} from './sowBotNotes';

// Structurally identical to SOW Bot's REAL posts (read from production
// 2026-11-26, after the card never appeared live — see sowBotNotes.ts's
// header comment), with fabricated names/addresses in place of real
// customer data: colon OUTSIDE the bold, no ◦ sub-bullets, 0+ bare
// https:// lines trailing a field as its supporting links.
const FULL_NOTE = [
  '*SOW Bot notes* (updated Nov 26, 2026, 6:05 PM Amman)',
  '• *Status*: Working on it. Sara listed it as "Will be pushed in few" on Nov 23.',
  'https://workspace.slack.com/archives/C1/p1',
  '• *Install date*: Not found',
  '• *Blockers*: None open in Slack. Fixes asked by Jad were marked "Updated".',
  '• *Survey / SVT*: Completed — HO agreed with battery location',
  '• *Pre-Design Analysis*: Done',
  '• *Solrite verification*: Passed',
  '• *AHJ / utility*: Harris County / CenterPoint',
  '• *Latest Slack activity*: Omar Rajab confirmed the trench depth.',
  'https://workspace.slack.com/archives/C2/p2',
  'https://workspace.slack.com/archives/C3/p3',
].join('\n');

describe('isSowBotNote', () => {
  it('matches a body starting with the exact header, even with trailing text on that line', () => {
    expect(isSowBotNote(FULL_NOTE)).toBe(true);
    expect(isSowBotNote('*SOW Bot notes* (updated Nov 26, 2026, 6:05 PM Amman)')).toBe(true);
  });
  it('does not match ordinary human text, even if it mentions the bot', () => {
    expect(isSowBotNote('SOW Bot notes say the install is Friday')).toBe(false);
    expect(isSowBotNote('*Something else*\n*SOW Bot notes*')).toBe(false);
  });
});

describe('isSowBotAuthor', () => {
  it('matches the raw username and the real stamped display name', () => {
    expect(isSowBotAuthor('sow_bot')).toBe(true);
    // The REAL bug (2026-11-26): bot.mts stamps `by` as the token's
    // displayName, never the raw username — the first version of this
    // selector compared against SOW_BOT_USERNAME only and so never matched
    // a single real post. Matched by prefix so a future rename still works.
    expect(isSowBotAuthor('SOW Bot - Aboud')).toBe(true);
    expect(isSowBotAuthor('SOW Bot - Khaled')).toBe(true);
  });
  it('does not match a human, even one who happens to share initials', () => {
    expect(isSowBotAuthor('Aboud Yousef')).toBe(false);
    expect(isSowBotAuthor('Sara Alnajjar')).toBe(false);
  });
});

describe('parseSowBotNotes — field extraction', () => {
  it('extracts every field value up to end of line', () => {
    const parsed = parseSowBotNotes(FULL_NOTE)!;
    expect(parsed).not.toBeNull();
    const byKey = Object.fromEntries(parsed.fields.map((f) => [f.key, f]));
    expect(byKey.installDate.value).toBe('Not found');
    expect(byKey.ahjUtility.value).toBe('Harris County / CenterPoint');
    expect(byKey.ahjUtility.present).toBe(true);
  });

  it('appends 0+ trailing bare-URL lines to the field they follow, not a separate field', () => {
    const parsed = parseSowBotNotes(FULL_NOTE)!;
    const status = parsed.fields.find((f) => f.key === 'status')!;
    expect(status.value).toBe(
      'Working on it. Sara listed it as "Will be pushed in few" on Nov 23.\nhttps://workspace.slack.com/archives/C1/p1',
    );
    const activity = parsed.fields.find((f) => f.key === 'latestSlackActivity')!;
    expect(activity.value).toBe(
      'Omar Rajab confirmed the trench depth.\n' +
        'https://workspace.slack.com/archives/C2/p2\n' +
        'https://workspace.slack.com/archives/C3/p3',
    );
  });

  it('a field with no trailing link is just its own line', () => {
    const parsed = parseSowBotNotes(FULL_NOTE)!;
    expect(parsed.fields.find((f) => f.key === 'installDate')!.value).toBe('Not found');
  });

  it('a field missing from the text is present:false with an unknown state', () => {
    const text = ['*SOW Bot notes*', '• *Status*: Working on it'].join('\n');
    const parsed = parseSowBotNotes(text)!;
    // Not Blockers — that field's missing-case is "ok" by design (rule 3),
    // pinned separately below.
    const svt = parsed.fields.find((f) => f.key === 'surveySvt')!;
    expect(svt.present).toBe(false);
    expect(svt.state).toBe('unknown');
  });

  it('field order always matches the spec order, regardless of line order in the text', () => {
    const text = ['*SOW Bot notes*', '• *AHJ / utility*: Harris County', '• *Status*: Done'].join('\n');
    const parsed = parseSowBotNotes(text)!;
    expect(parsed.fields.map((f) => f.key)).toEqual([
      'status',
      'installDate',
      'blockers',
      'surveySvt',
      'preDesignAnalysis',
      'solriteVerification',
      'ahjUtility',
      'latestSlackActivity',
    ]);
  });

  it('an ad-hoc extra bullet SOW Bot sometimes adds ("Design / install notes", "Layout decision") is not captured — no slot for it — but does not break the 8 known fields around it', () => {
    const text = [
      '*SOW Bot notes*',
      '• *Solrite verification*: Passed',
      'https://workspace.slack.com/archives/C1/p1',
      '• *Design / install notes*: Batteries on a new concrete pad.',
      'https://workspace.slack.com/archives/C2/p2',
      '• *AHJ / utility*: Travis County',
    ].join('\n');
    const parsed = parseSowBotNotes(text)!;
    const byKey = Object.fromEntries(parsed.fields.map((f) => [f.key, f]));
    expect(byKey.solriteVerification.value).toBe('Passed\nhttps://workspace.slack.com/archives/C1/p1');
    expect(byKey.ahjUtility.value).toBe('Travis County');
    expect(parsed.fields.some((f) => (f.label as string) === 'Design / install notes')).toBe(false);
  });
});

describe('parseSowBotNotes — classification', () => {
  const note = (line: string) => parseSowBotNotes(`*SOW Bot notes*\n• *Status*: ${line}`)!.fields[0];

  it('ok keywords', () => {
    expect(note('Done').state).toBe('ok');
    expect(note('Approved and confirmed').state).toBe('ok');
  });
  it('pending keywords', () => {
    expect(note('Working on it').state).toBe('pending');
    expect(note('Pending AHJ review').state).toBe('pending');
  });
  it('blocked keywords', () => {
    expect(note('Blocked — missing permit').state).toBe('blocked');
    expect(note('Inspection failed').state).toBe('blocked');
  });
  it('a concrete value with no keyword still reads ok, not unknown', () => {
    expect(note('Harris County').state).toBe('ok');
  });
  it('an explicitly blank value reads unknown', () => {
    expect(note('—').state).toBe('unknown');
    expect(note('N/A').state).toBe('unknown');
    expect(note('').state).toBe('unknown');
  });
  it('SOW Bot\'s own "no data" phrasing ("Not found", "Not posted yet", "Not set") reads unknown, not ok', () => {
    expect(note('Not found').state).toBe('unknown');
    expect(note('Not posted yet').state).toBe('unknown');
    expect(note('Not set (handoff field blank)').state).toBe('unknown');
    expect(note('Not found in Slack').state).toBe('unknown');
  });

  it('Blockers is the one binary field: empty/None is ok, anything else is blocked', () => {
    const blockers = (line: string) => parseSowBotNotes(`*SOW Bot notes*\n• *Blockers*: ${line}`)!.fields[2];
    expect(blockers('None').state).toBe('ok');
    expect(blockers('-').state).toBe('ok');
    expect(blockers('').state).toBe('ok');
    // Even upbeat-sounding text in Blockers still means "there is a blocker."
    expect(blockers('Waiting on customer to confirm a date').state).toBe('blocked');
  });

  it('Blockers\' real-world "None … but here is context" phrasing still reads ok', () => {
    const blockers = (line: string) => parseSowBotNotes(`*SOW Bot notes*\n• *Blockers*: ${line}`)!.fields[2];
    expect(blockers('None open in Slack. Fixes asked by Jad were marked "Updated" by Sara.').state).toBe('ok');
    expect(blockers('None found in Slack.').state).toBe('ok');
  });

  it('Blockers absent from the text entirely still reads ok, not unknown', () => {
    const parsed = parseSowBotNotes('*SOW Bot notes*\n• *Status*: Done')!;
    const b = parsed.fields.find((f) => f.key === 'blockers')!;
    expect(b.present).toBe(false);
    expect(b.state).toBe('ok');
  });
});

describe('parseSowBotNotes — fallback (rule 6)', () => {
  it('returns null for text that is not a SOW Bot note at all', () => {
    expect(parseSowBotNotes('Just a normal update from a human.')).toBeNull();
  });

  it('returns null when the header is present but nothing recognizable follows', () => {
    expect(parseSowBotNotes('*SOW Bot notes*\nsomething unparseable, no bullets here')).toBeNull();
  });

  it('still parses when only some fields are recognizable', () => {
    expect(parseSowBotNotes('*SOW Bot notes*\n• *Status*: Done\nsome trailing prose')).not.toBeNull();
  });
});

describe('selectSowBotNote', () => {
  const DISPLAY_NAME = 'SOW Bot - Aboud';
  const bot = (text: string, at: string, id?: string, by = DISPLAY_NAME) => newUpdate('p1', text, by, 'note', {}, at, id);

  it('picks nothing when there is no sow_bot note', () => {
    const updates = [newUpdate('p1', 'hello', 'Aboud Yousef')];
    expect(selectSowBotNote(updates, 'p1')).toBeNull();
  });

  it('picks it up by the REAL stamped `by` (the display name, not the raw username)', () => {
    const updates = [bot(FULL_NOTE, '2026-11-20T00:00:00.000Z')];
    const hit = selectSowBotNote(updates, 'p1');
    expect(hit).not.toBeNull();
    expect(hit!.update.by).toBe(DISPLAY_NAME);
  });

  it('also matches the raw username, for any direct/API-shaped caller', () => {
    const updates = [bot(FULL_NOTE, '2026-11-20T00:00:00.000Z', undefined, SOW_BOT_USERNAME)];
    expect(selectSowBotNote(updates, 'p1')).not.toBeNull();
  });

  it('ignores a human typing the same header — by must read as the bot', () => {
    const updates = [newUpdate('p1', FULL_NOTE, 'Aboud Yousef')];
    expect(selectSowBotNote(updates, 'p1')).toBeNull();
  });

  it('ignores updates for other projects and deleted notes', () => {
    const deleted = { ...bot(FULL_NOTE, '2026-11-20T00:00:00.000Z'), deleted: { at: '2026-11-21T00:00:00.000Z', by: 'Aboud Yousef' } };
    const otherProject = { ...bot(FULL_NOTE, '2026-11-20T00:00:00.000Z'), projectId: 'p2' };
    expect(selectSowBotNote([deleted, otherProject], 'p1')).toBeNull();
  });

  it('a single live note is not flagged duplicate', () => {
    const updates = [bot(FULL_NOTE, '2026-11-20T00:00:00.000Z')];
    const hit = selectSowBotNote(updates, 'p1')!;
    expect(hit.duplicate).toBe(false);
  });

  it('more than one live note: newest wins, duplicate flag is set', () => {
    const older = bot('*SOW Bot notes*\n• *Status*: Old', '2026-11-20T00:00:00.000Z', 'u1');
    const newer = bot('*SOW Bot notes*\n• *Status*: New', '2026-11-22T00:00:00.000Z', 'u2');
    const hit = selectSowBotNote([older, newer], 'p1')!;
    expect(hit.update.id).toBe('u2');
    expect(hit.duplicate).toBe(true);
  });
});

describe('formatAmmanTime', () => {
  it('converts a UTC timestamp to Asia/Amman wall-clock time', () => {
    // 2026-11-26T15:30:00Z → Amman is UTC+3 → 18:30 local.
    expect(formatAmmanTime('2026-11-26T15:30:00.000Z')).toBe('Nov 26, 2026, 6:30 PM');
  });
});
