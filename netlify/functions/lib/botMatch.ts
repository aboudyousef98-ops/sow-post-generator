// Server port of the Requirements match report (Aboud 2026-11-23, item 15).
//
// Mirrors src/lib/requirementsExport.matchReport + the three ahj helpers it
// needs (normName / boardsOfKind / matchAhj). Same server/client duplication
// pattern as boardMerge.ts and botBoard.ts — the function bundle stays
// self-contained. Operates on the loose `ahjs` and `records` blob shapes.
//
// The report answers what the boards cannot: which jurisdictions/utilities in
// the Compose drafts match NO board, i.e. where a job is silently getting no
// requirements. Grouped by VALUE ("Montgomery County → 7 jobs"), worst first.

export interface AhjLike {
  id?: string;
  name: string;
  aliases?: string[];
  kind?: string; // absent ⇒ 'ahj' (pre-2026-10-08 boards)
  deleted?: boolean;
}

export interface RecordLike {
  sf?: { customerName?: string; jurisdiction?: string; utility?: string };
}

export function normName(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function kindOf(a: AhjLike): string {
  return a.kind ?? 'ahj';
}

function boardsOfKind(ahjs: AhjLike[], kind: string): AhjLike[] {
  return ahjs.filter((a) => kindOf(a) === kind);
}

/** True when a free-text key matches a live board's name or an alias (same kind). */
function matchesAnyBoard(value: string, boards: AhjLike[]): boolean {
  const n = normName(value);
  if (!n) return false;
  for (const a of boards) {
    if (a.deleted) continue;
    if (normName(a.name) === n) return true;
    if ((a.aliases ?? []).some((x) => normName(x) === n)) return true;
  }
  return false;
}

export interface MatchGap {
  value: string;
  kind: 'ahj' | 'utility';
  customers: string[];
  count: number;
}

export interface MatchReport {
  gaps: MatchGap[];
  blank: { kind: 'ahj' | 'utility'; count: number }[];
  checked: number;
}

export function matchReport(records: RecordLike[], boards: AhjLike[]): MatchReport {
  const ahjBoards = boardsOfKind(boards, 'ahj');
  const utilBoards = boardsOfKind(boards, 'utility');

  const gaps = new Map<string, MatchGap>();
  let blankAhj = 0;
  let blankUtil = 0;

  const note = (kind: 'ahj' | 'utility', value: string, customer: string) => {
    const key = `${kind}|${normName(value)}`;
    const g = gaps.get(key);
    if (g) {
      g.count++;
      if (customer && !g.customers.includes(customer)) g.customers.push(customer);
    } else {
      gaps.set(key, { value: value.trim(), kind, customers: customer ? [customer] : [], count: 1 });
    }
  };

  for (const r of records) {
    const customer = (r.sf?.customerName ?? '').trim();
    const j = (r.sf?.jurisdiction ?? '').trim();
    const u = (r.sf?.utility ?? '').trim();
    if (!j) blankAhj++;
    else if (!matchesAnyBoard(j, ahjBoards)) note('ahj', j, customer);
    if (!u) blankUtil++;
    else if (!matchesAnyBoard(u, utilBoards)) note('utility', u, customer);
  }

  const blank: MatchReport['blank'] = [];
  if (blankAhj) blank.push({ kind: 'ahj', count: blankAhj });
  if (blankUtil) blank.push({ kind: 'utility', count: blankUtil });

  return {
    gaps: [...gaps.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    blank,
    checked: records.length,
  };
}
