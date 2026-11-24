import { describe, it, expect } from 'vitest';
import {
  type Activity,
  type Label,
  type Project,
  daysInStatus,
  findSimilar,
  linkFromRecords,
  resolveLabelName,
  reverseFromActivity,
  sectionOf,
  serializeRow,
} from './botBoard';

const labels: Label[] = [
  { id: 'status-working', columnKey: 'status', name: 'Working on it', isDefault: false, isDone: false },
  { id: 'status-done', columnKey: 'status', name: 'Done', isDone: true },
  { id: 'status-predesign', columnKey: 'status', name: 'Pre-Design' },
  { id: 'status-new', columnKey: 'status', name: 'New project', isDefault: true },
  { id: 'status-review', columnKey: 'status', name: 'Installation Review' },
  { id: 'status-hold', columnKey: 'status', name: 'Hold' },
  { id: 'status-cancelled', columnKey: 'status', name: 'Cancelled' },
  { id: 'predesign-working', columnKey: 'predesign', name: 'Working on it', isDefault: true },
  { id: 'predesign-done', columnKey: 'predesign', name: 'Done' },
];

describe('botBoard — labels & sections', () => {
  it('resolves a label by name within its column', () => {
    expect(resolveLabelName(labels, 'status', 'working on it')).toBe('status-working');
    expect(resolveLabelName(labels, 'predesign', 'Done')).toBe('predesign-done');
    expect(resolveLabelName(labels, 'status', 'nope')).toBeNull();
  });

  it('derives the section with the right precedence', () => {
    expect(sectionOf(labels, 'status-done')).toBe('completed');
    expect(sectionOf(labels, 'status-review')).toBe('review');
    expect(sectionOf(labels, 'status-predesign')).toBe('predesign');
    expect(sectionOf(labels, 'status-hold')).toBe('scope');
    expect(sectionOf(labels, 'status-cancelled')).toBe('scope');
    expect(sectionOf(labels, 'status-working')).toBe('active');
  });
});

describe('botBoard — daysInStatus', () => {
  const p: Project = { id: 'p1', name: 'X', createdAt: '2026-11-01T00:00:00.000Z' };
  const activity: Activity[] = [
    { id: 'a', projectId: 'p1', action: 'update', changes: { statusId: { old: 'A', new: 'B' } }, at: '2026-11-20T00:00:00.000Z' },
  ];
  it('reads the newest status change, with a created fallback', () => {
    expect(daysInStatus(activity, p, '2026-11-23')).toEqual({ days: 3, source: 'activity' });
    expect(daysInStatus([], p, '2026-11-23')).toEqual({ days: 22, source: 'created' });
  });
});

describe('botBoard — findSimilar (dedupe)', () => {
  const projects: Project[] = [{ id: 'p1', name: 'Anthony S Torres' }];
  it('flags the antony/Anthony pair, not a different name', () => {
    expect(findSimilar(projects, 'antony torres').map((d) => d.name)).toEqual(['Anthony S Torres']);
    expect(findSimilar(projects, 'John Smith')).toEqual([]);
  });
});

describe('botBoard — serializeRow & records join', () => {
  it('joins install date + address from records and resolves names', () => {
    const p: Project = { id: 'p1', name: 'Row', coordinator: 'Anas', statusId: 'status-working', rating: 4, updatedBy: 'Anas', updatedAt: '2026-11-22T00:00:00.000Z' };
    const records = [{ projectId: 'p1', status: 'draft', updatedAt: '2026-11-10', sf: { installScheduledDate: '2026-12-01', siteAddress: '1 Main St' } }];
    const link = linkFromRecords(records, 'p1');
    const row = serializeRow(p, labels, [], link, '2026-11-23');
    expect(row.status).toBe('Working on it');
    expect(row.installDate).toBe('2026-12-01');
    expect(row.address).toBe('1 Main St');
    expect(row.stars).toBe(4);
    expect(row.section).toBe('active');
  });
});

describe('botBoard — reverseFromActivity', () => {
  const entry: Activity = {
    id: 'e', projectId: 'p1', action: 'update',
    changes: { statusId: { old: 'New project', new: 'Done' } }, at: '2026-11-20T00:00:00.000Z',
  };
  it('reverses a status change back to its id when the row still shows it', () => {
    const p: Project = { id: 'p1', name: 'X', statusId: 'status-done' };
    expect(reverseFromActivity(entry, p, labels).patch).toEqual({ statusId: 'status-new' });
  });
  it('skips a field changed since (conflict)', () => {
    const p: Project = { id: 'p1', name: 'X', statusId: 'status-working' };
    const r = reverseFromActivity(entry, p, labels);
    expect(r.patch).toEqual({});
    expect(r.conflicts).toEqual(['statusId']);
  });
});
