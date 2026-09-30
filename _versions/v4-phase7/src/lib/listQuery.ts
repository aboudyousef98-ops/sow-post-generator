// Search / filter / sort for the Drafts and History tabs (Aboud, 2026-09-26).
// Pure functions so the behavior is unit-testable.

import type { Level, PostRecord, Region } from '../types';

export type SearchBy = 'all' | 'customer' | 'region' | 'jurisdiction' | 'address' | 'author' | 'designer';
export type SortBy = 'updated' | 'posted' | 'installDate' | 'customer' | 'level' | 'region' | 'author';

export interface ListQuery {
  text: string;
  searchBy: SearchBy;
  region: Region | 'ALL';
  level: Level | 0; // 0 = all levels
  author: string; // 'ALL' = all authors
  sortBy: SortBy;
  sortDir: 'asc' | 'desc';
}

export function defaultQuery(sortBy: SortBy): ListQuery {
  return { text: '', searchBy: 'all', region: 'ALL', level: 0, author: 'ALL', sortBy, sortDir: 'desc' };
}

function regionText(r: PostRecord): string {
  return [r.sf.region, r.sf.installRegionRaw, r.sf.nearMetro].filter(Boolean).join(' ');
}

function searchableText(r: PostRecord, by: SearchBy): string {
  switch (by) {
    case 'customer':
      return r.sf.customerName;
    case 'region':
      return regionText(r);
    case 'jurisdiction':
      return r.sf.jurisdiction ?? '';
    case 'address':
      return r.sf.siteAddress ?? '';
    case 'author':
      return r.author;
    case 'designer':
      return r.designerTag ?? '';
    case 'all':
      return [
        r.sf.customerName,
        regionText(r),
        r.sf.jurisdiction,
        r.sf.siteAddress,
        r.author,
        r.designerTag,
        ...Object.values(r.notes),
        // Installation Notes too — before Phase 7 this text lived in
        // notes.layout and was searchable; moving it must not lose that.
        ...Object.values(r.installNotes ?? {}).map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''))),
        r.finalText,
      ]
        .filter(Boolean)
        .join(' ');
  }
}

function sortValue(r: PostRecord, by: SortBy): string | number {
  switch (by) {
    case 'updated':
      return r.updatedAt;
    case 'posted':
      return r.postedAt ?? '';
    case 'installDate':
      return r.sf.installScheduledDate;
    case 'customer':
      return r.sf.customerName.toLowerCase();
    case 'level':
      return r.level;
    case 'region':
      return regionText(r).toLowerCase();
    case 'author':
      return r.author.toLowerCase();
  }
}

export function applyQuery(records: PostRecord[], q: ListQuery): PostRecord[] {
  const needle = q.text.trim().toLowerCase();
  const filtered = records.filter((r) => {
    if (q.region !== 'ALL' && r.sf.region !== q.region) return false;
    if (q.level !== 0 && r.level !== q.level) return false;
    if (q.author !== 'ALL' && r.author !== q.author) return false;
    if (needle && !searchableText(r, q.searchBy).toLowerCase().includes(needle)) return false;
    return true;
  });
  const dir = q.sortDir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const va = sortValue(a, q.sortBy);
    const vb = sortValue(b, q.sortBy);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

/** Unique authors present in the records, for the filter dropdown. */
export function authorsIn(records: PostRecord[]): string[] {
  return [...new Set(records.map((r) => r.author).filter(Boolean))].sort();
}
