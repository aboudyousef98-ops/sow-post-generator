import { describe, expect, it } from 'vitest';
import type { BoardProject, BoardState } from '../board/types';
import type { PostRecord } from '../types';
import { seedLabels } from './board';
import { designStamp } from './designStamp';

const TODAY = '2026-10-22';
const NOW = '2026-10-22T10:00:00.000Z';

function proj(over: Partial<BoardProject> = {}): BoardProject {
  return {
    id: 'proj-1',
    name: 'Mike Florez',
    coordinator: 'Aboud Yousef',
    statusId: null,
    phaseId: null,
    designedDate: null,
    rating: null,
    position: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'Aboud Yousef',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: 'Aboud Yousef',
    schemaVersion: 1,
    ...over,
  };
}

function board(projects: BoardProject[]): BoardState {
  return { projects, labels: seedLabels(), activity: [], updates: [] } as unknown as BoardState;
}

function draft(over: Partial<PostRecord> = {}): PostRecord {
  return {
    id: 'rec-1',
    status: 'draft',
    author: 'Aboud Yousef',
    projectId: 'proj-1',
    sf: { customerName: 'Mike Florez', source: 'text' },
    // Real work on the draft by default — the stamp requires content beyond
    // the board prefill (see the prefill test, which blanks this).
    notes: { layout: '', siteSurvey: 'Survey reviewed', design: '', homeowner: '' },
    ...over,
  } as unknown as PostRecord;
}

const EMPTY_NOTES = { layout: '', siteSurvey: '', design: '', homeowner: '' };

describe('designStamp', () => {
  it('fills a blank Designed date with the local day when a linked draft is saved', () => {
    const out = designStamp(board([proj()]), draft(), TODAY, NOW);
    expect(out).not.toBeNull();
    const p = out!.projects.find((x) => x.id === 'proj-1')!;
    expect(p.designedDate).toBe(TODAY);
    expect(p.updatedAt).toBe(NOW);
    expect(p.updatedBy).toBe('Aboud Yousef');
  });

  it('logs the stamp in the activity feed like any other edit', () => {
    const out = designStamp(board([proj()]), draft(), TODAY, NOW)!;
    expect(out.activity).toHaveLength(1);
    expect(out.activity[0].projectId).toBe('proj-1');
    expect(out.activity[0].actor).toBe('Aboud Yousef');
    expect(out.activity[0].changes?.designedDate).toEqual({ old: '—', new: TODAY });
  });

  it('NEVER overwrites a date that is already set — planned-ahead dates survive', () => {
    const planned = proj({ designedDate: '2026-10-23' }); // set tonight for tomorrow
    expect(designStamp(board([planned]), draft(), TODAY, NOW)).toBeNull();
  });

  it('does nothing for an unlinked draft', () => {
    expect(designStamp(board([proj()]), draft({ projectId: undefined }), TODAY, NOW)).toBeNull();
  });

  it('does nothing when the linked project is gone, archived or deleted', () => {
    expect(designStamp(board([]), draft(), TODAY, NOW)).toBeNull();
    expect(designStamp(board([proj({ archivedAt: NOW })]), draft(), TODAY, NOW)).toBeNull();
    expect(designStamp(board([proj({ deletedAt: NOW })]), draft(), TODAY, NOW)).toBeNull();
  });

  it('does nothing for a deleted record', () => {
    expect(designStamp(board([proj()]), draft({ deletedAt: NOW }), TODAY, NOW)).toBeNull();
  });

  it('ignores an untouched board prefill — customerName alone is not design work', () => {
    // openFromBoard commits { projectId, sf.customerName } and the 500 ms
    // autosave re-commits it; neither may write a Designed date.
    const prefill = draft({ notes: EMPTY_NOTES });
    expect(designStamp(board([proj()]), prefill, TODAY, NOW)).toBeNull();
  });

  it('stamps once the draft carries real work (a note, a date, install notes…)', () => {
    expect(designStamp(board([proj()]), draft(), TODAY, NOW)).not.toBeNull();
    const dated = draft({ notes: EMPTY_NOTES, sf: { customerName: 'Mike Florez', installScheduledDate: '2026-10-28', source: 'text' } as PostRecord['sf'] });
    expect(designStamp(board([proj()]), dated, TODAY, NOW)).not.toBeNull();
  });

  it('leaves every other project untouched', () => {
    const other = proj({ id: 'proj-2', name: 'Susan Stark' });
    const out = designStamp(board([proj(), other]), draft(), TODAY, NOW)!;
    expect(out.projects.find((x) => x.id === 'proj-2')).toBe(other);
  });

  it('is idempotent — the second save of the same draft changes nothing', () => {
    const once = designStamp(board([proj()]), draft(), TODAY, NOW)!;
    expect(designStamp(once, draft(), TODAY, NOW)).toBeNull();
  });

  it('respects a deliberate manual CLEAR — a project whose date was ever touched is never re-stamped', () => {
    const b = board([proj()]); // date blank…
    b.activity.push({
      id: 'act-1',
      projectId: 'proj-1',
      actor: 'Omar Rajab',
      action: 'update',
      // …because Omar explicitly cleared it.
      changes: { designedDate: { old: '2026-10-20', new: '—' } },
      at: '2026-10-21T10:00:00.000Z',
    });
    expect(designStamp(b, draft(), TODAY, NOW)).toBeNull();
  });

  it('prepends its activity entry — newest first, like every hand edit', () => {
    const b = board([proj({ id: 'proj-2' }), proj()]);
    b.activity.push({
      id: 'act-0',
      projectId: 'proj-2',
      actor: 'Omar Rajab',
      action: 'create',
      at: '2026-10-20T10:00:00.000Z',
    });
    const out = designStamp(b, draft(), TODAY, NOW)!;
    expect(out.activity[0].projectId).toBe('proj-1');
    expect(out.activity[1].id).toBe('act-0');
  });
});
