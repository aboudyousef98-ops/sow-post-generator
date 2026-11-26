import { describe, expect, it } from 'vitest';
import { newUpdate } from './updates';
import {
  formatAmmanTime,
  isSowBotNote,
  parseSowBotNotes,
  selectSowBotNote,
  SOW_BOT_USERNAME,
} from './sowBotNotes';

const FULL_NOTE = [
  '*SOW Bot notes*',
  '• *Status:* Working on it',
  '• *Install date:* 12/05/2026',
  '• *Blockers:* None',
  '• *Survey / SVT:* Completed — HO agreed with battery location',
  '• *Pre-Design Analysis:* Done',
  '• *Solrite verification:* Passed',
  '• *AHJ / utility:* Harris County / CenterPoint',
  '• *Latest Slack activity:*',
  '    ◦ <https://workspace.slack.com/archives/C1|Omar Rajab> — confirmed trench depth',
  '    ◦ <https://workspace.slack.com/archives/C2|Anas Yaghmour> — design sent for review',
].join('\n');

describe('isSowBotNote', () => {
  it('matches a body starting with the exact header', () => {
    expect(isSowBotNote(FULL_NOTE)).toBe(true);
    expect(isSowBotNote('  *SOW Bot notes*\nmore')).toBe(true);
  });
  it('does not match ordinary human text, even if it mentions the bot', () => {
    expect(isSowBotNote('SOW Bot notes say the install is Friday')).toBe(false);
    expect(isSowBotNote('*Something else*\n*SOW Bot notes*')).toBe(false);
  });
});

describe('parseSowBotNotes — field extraction', () => {
  it('extracts every single-line field', () => {
    const parsed = parseSowBotNotes(FULL_NOTE)!;
    expect(parsed).not.toBeNull();
    const byKey = Object.fromEntries(parsed.fields.map((f) => [f.key, f]));
    expect(byKey.status.value).toBe('Working on it');
    expect(byKey.installDate.value).toBe('12/05/2026');
    expect(byKey.ahjUtility.value).toBe('Harris County / CenterPoint');
    expect(byKey.ahjUtility.present).toBe(true);
  });

  it('collects indented ◦ sub-bullets into the multi-line field, preserving links', () => {
    const parsed = parseSowBotNotes(FULL_NOTE)!;
    const activity = parsed.fields.find((f) => f.key === 'latestSlackActivity')!;
    expect(activity.value).toBe(
      '<https://workspace.slack.com/archives/C1|Omar Rajab> — confirmed trench depth\n' +
        '<https://workspace.slack.com/archives/C2|Anas Yaghmour> — design sent for review',
    );
  });

  it('a field missing from the text is present:false with an unknown state', () => {
    const text = ['*SOW Bot notes*', '• *Status:* Working on it'].join('\n');
    const parsed = parseSowBotNotes(text)!;
    // Not Blockers — that field's missing-case is "ok" by design (rule 3),
    // pinned separately below.
    const svt = parsed.fields.find((f) => f.key === 'surveySvt')!;
    expect(svt.present).toBe(false);
    expect(svt.state).toBe('unknown');
  });

  it('field order always matches the spec order, regardless of line order in the text', () => {
    const text = ['*SOW Bot notes*', '• *AHJ / utility:* Harris County', '• *Status:* Done'].join('\n');
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
});

describe('parseSowBotNotes — classification', () => {
  const note = (line: string) => parseSowBotNotes(`*SOW Bot notes*\n• *Status:* ${line}`)!.fields[0];

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

  it('Blockers is the one binary field: empty/None is ok, anything else is blocked', () => {
    const blockers = (line: string) => parseSowBotNotes(`*SOW Bot notes*\n• *Blockers:* ${line}`)!.fields[2];
    expect(blockers('None').state).toBe('ok');
    expect(blockers('-').state).toBe('ok');
    expect(blockers('').state).toBe('ok');
    // Even upbeat-sounding text in Blockers still means "there is a blocker."
    expect(blockers('Waiting on customer to confirm a date').state).toBe('blocked');
  });

  it('Blockers absent from the text entirely still reads ok, not unknown', () => {
    const parsed = parseSowBotNotes('*SOW Bot notes*\n• *Status:* Done')!;
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
    expect(parseSowBotNotes('*SOW Bot notes*\n• *Status:* Done\nsome trailing prose')).not.toBeNull();
  });
});

describe('selectSowBotNote', () => {
  const bot = (text: string, at: string, id?: string) => newUpdate('p1', text, SOW_BOT_USERNAME, 'note', {}, at, id);

  it('picks nothing when there is no sow_bot note', () => {
    const updates = [newUpdate('p1', 'hello', 'Aboud Yousef')];
    expect(selectSowBotNote(updates, 'p1')).toBeNull();
  });

  it('ignores a human typing the same header — by must be sow_bot', () => {
    const updates = [newUpdate('p1', FULL_NOTE, 'Aboud Yousef')];
    expect(selectSowBotNote(updates, 'p1')).toBeNull();
  });

  it('ignores updates for other projects and deleted notes', () => {
    const deleted = { ...bot(FULL_NOTE, '2026-11-20T00:00:00.000Z'), deleted: { at: '2026-11-21T00:00:00.000Z', by: 'Aboud Yousef' } };
    const otherProject = newUpdate('p2', FULL_NOTE, SOW_BOT_USERNAME);
    expect(selectSowBotNote([deleted, otherProject], 'p1')).toBeNull();
  });

  it('a single live note is not flagged duplicate', () => {
    const updates = [bot(FULL_NOTE, '2026-11-20T00:00:00.000Z')];
    const hit = selectSowBotNote(updates, 'p1')!;
    expect(hit.duplicate).toBe(false);
  });

  it('more than one live note: newest wins, duplicate flag is set', () => {
    const older = bot('*SOW Bot notes*\n• *Status:* Old', '2026-11-20T00:00:00.000Z', 'u1');
    const newer = bot('*SOW Bot notes*\n• *Status:* New', '2026-11-22T00:00:00.000Z', 'u2');
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
