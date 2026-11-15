import { describe, expect, it } from 'vitest';
import type { BoardProject } from '../board/types';
import { emptyBoard, mergeBoard, newProject, seedLabels } from './board';
import {
  isReadyOrDoneLabel,
  isWorkingLabel,
  liveRequests,
  newRequest,
  openRequestsFor,
  parseSlackPaste,
  resolveRequest,
  suggestProject,
} from './requests';

const T0 = '2026-11-15T10:00:00.000Z';
const T1 = '2026-11-15T11:00:00.000Z';

function proj(name: string, id: string): BoardProject {
  return { ...newProject(name, 'Aboud Yousef', seedLabels(), T0), id };
}

const ROWS = [proj('Rebecca Post', 'p-rebecca'), proj('Maria M Acevedo', 'p-maria'), proj('John Bray', 'p-john')];

// ---- parsing ----------------------------------------------------------------

describe('parseSlackPaste', () => {
  it('one pasted message is one request', () => {
    expect(parseSlackPaste('for rebecca post we will need to special order cu ser wires')).toEqual([
      'for rebecca post we will need to special order cu ser wires',
    ]);
  });

  it('a batch paste splits on blank lines, one request per message', () => {
    const chunks = parseSlackPaste(
      'for rebecca post we will need to special order cu ser wires\nmake sure that is in the bos\n\nplease call me before starting John Bray',
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('cu ser wires');
    expect(chunks[0]).toContain('in the bos');
    expect(chunks[1]).toContain('John Bray');
  });

  it('drops noise: blank chunks and fragments too short to be a request', () => {
    expect(parseSlackPaste('\n\n  \n\nok\n\nfor rebecca post order the wires')).toEqual([
      'for rebecca post order the wires',
    ]);
  });
});

// ---- fuzzy matching ---------------------------------------------------------

describe('suggestProject', () => {
  it('finds the project whose name appears in the message, case-insensitively', () => {
    expect(suggestProject('for rebecca post we will need cu ser wires', ROWS)?.id).toBe('p-rebecca');
    expect(suggestProject('Call me before starting JOHN BRAY tomorrow', ROWS)?.id).toBe('p-john');
  });

  it('matches when every word of the name appears, even out of order', () => {
    expect(suggestProject('Acevedo, Maria M — needs a call first', ROWS)?.id).toBe('p-maria');
  });

  it('returns null rather than guessing on no match', () => {
    expect(suggestProject('general reminder: upload the NTP before scheduling', ROWS)).toBeNull();
  });
});

// ---- lifecycle --------------------------------------------------------------

describe('request lifecycle', () => {
  it('newRequest stamps author and time; open until resolved', () => {
    const r = newRequest('order cu ser wires', 'p-rebecca', 'Aboud Yousef', T0);
    expect(r.projectId).toBe('p-rebecca');
    expect(r.addedBy).toBe('Aboud Yousef');
    expect(openRequestsFor([r], 'p-rebecca')).toHaveLength(1);
    const done = resolveRequest(r, 'Omar Rajab', T1);
    expect(openRequestsFor([done], 'p-rebecca')).toHaveLength(0);
    expect(done.resolvedBy).toBe('Omar Rajab');
    expect(done.updatedAt).toBe(T1); // merge key moves so the resolution syncs
  });

  it('a parked request (no row yet) is live but open for no project', () => {
    const r = newRequest('needs a call — Maria M Acevedo', null, 'Aboud Yousef', T0);
    expect(liveRequests([r])).toHaveLength(1);
    expect(openRequestsFor([r], 'p-maria')).toHaveLength(0);
  });

  it('a deleted tombstone drops from live but still merges', () => {
    const r = { ...newRequest('x — rebecca post', 'p-rebecca', 'A', T0), deleted: { at: T1, by: 'A' }, updatedAt: T1 };
    expect(liveRequests([r])).toHaveLength(0);
  });
});

// ---- the gate names ---------------------------------------------------------

describe('gate label predicates', () => {
  const labels = seedLabels();
  const working = labels.find((l) => l.id === 'status-working')!;
  const done = labels.find((l) => l.id === 'status-done')!;
  const ready = { ...working, id: 'ready', name: 'Ready to submit' };

  it('soft popup fires on Working on it; hard gate on Ready to submit and done labels', () => {
    expect(isWorkingLabel(working)).toBe(true);
    expect(isWorkingLabel(done)).toBe(false);
    expect(isReadyOrDoneLabel(ready)).toBe(true);
    expect(isReadyOrDoneLabel(done)).toBe(true);
    expect(isReadyOrDoneLabel(working)).toBe(false);
    expect(isReadyOrDoneLabel(undefined)).toBe(false);
  });
});

// ---- merge ------------------------------------------------------------------

describe('mergeBoard carries requests', () => {
  it('merged by id with newer updatedAt winning, tombstones included', () => {
    const a = newRequest('order the wires — rebecca post', 'p-rebecca', 'A', T0);
    const resolved = resolveRequest(a, 'B', T1);
    const left = { ...emptyBoard(), requests: [a] };
    const right = { ...emptyBoard(), requests: [resolved] };
    expect(mergeBoard(left, right).requests).toEqual([resolved]);
    expect(mergeBoard(right, left).requests).toEqual([resolved]);
    // Boards written before the feature have no key at all.
    expect(mergeBoard(emptyBoard(), { requests: [a] }).requests).toEqual([a]);
    expect(mergeBoard(emptyBoard(), {}).requests).toEqual([]);
  });
});
