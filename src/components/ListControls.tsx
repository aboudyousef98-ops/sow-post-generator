// Search + filter row for Drafts and History.
//
// Phase 8 (Option A): a rounded search field followed by pill selects. The
// design shows four pills; this keeps all of them — dropping a working filter
// is not part of a re-layout — and moves each one's label into its own default
// option ("All regions" rather than "Region: All"), which is what lets the
// labels disappear without the control becoming a mystery.

import type { Level, Region } from '../types';
import type { ListQuery, SearchBy, SortBy } from '../lib/listQuery';

const SEARCH_BY: { value: SearchBy; label: string }[] = [
  { value: 'all', label: 'Search everything' },
  { value: 'customer', label: 'Customer name' },
  { value: 'region', label: 'Region' },
  { value: 'jurisdiction', label: 'Jurisdiction' },
  { value: 'address', label: 'Address' },
  { value: 'author', label: 'Author' },
  { value: 'designer', label: 'Designer' },
];

const SORT_LABELS: Record<SortBy, string> = {
  updated: 'Last edited',
  posted: 'Posted at',
  installDate: 'Install date',
  customer: 'Customer',
  level: 'Level',
  region: 'Region',
  author: 'Author',
};

interface Props {
  query: ListQuery;
  onChange: (q: ListQuery) => void;
  authors: string[];
  sortOptions: SortBy[];
  count: number;
  total: number;
}

export default function ListControls({ query, onChange, authors, sortOptions, count, total }: Props) {
  const set = (patch: Partial<ListQuery>) => onChange({ ...query, ...patch });
  const arrow = query.sortDir === 'asc' ? '↑' : '↓';
  return (
    <div className="list-controls">
      <input
        type="text"
        className="search-input"
        placeholder="Search customer, address, AHJ…"
        aria-label="Search"
        value={query.text}
        onChange={(e) => set({ text: e.target.value })}
      />
      <select
        className="pill-select"
        aria-label="Search in"
        value={query.searchBy}
        onChange={(e) => set({ searchBy: e.target.value as SearchBy })}
      >
        {SEARCH_BY.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className="pill-select"
        aria-label="Region"
        value={query.region}
        onChange={(e) => set({ region: e.target.value as Region | 'ALL' })}
      >
        <option value="ALL">All regions</option>
        <option value="HOU">HOU</option>
        <option value="DFW">DFW</option>
        <option value="OTHER">Other</option>
      </select>
      <select
        className="pill-select"
        aria-label="Level"
        value={query.level}
        onChange={(e) => set({ level: Number(e.target.value) as Level | 0 })}
      >
        <option value={0}>All levels</option>
        <option value={1}>L1</option>
        <option value={2}>L2</option>
        <option value={3}>L3</option>
        <option value={4}>L4</option>
      </select>
      <select
        className="pill-select"
        aria-label="Author"
        value={query.author}
        onChange={(e) => set({ author: e.target.value })}
      >
        <option value="ALL">Everyone</option>
        {authors.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
      {/* Sort and its direction are one control in the design ("Last edited ↓").
          Kept as two so the direction stays a single click. */}
      <select
        className="pill-select"
        aria-label="Sort by"
        value={query.sortBy}
        onChange={(e) => set({ sortBy: e.target.value as SortBy })}
      >
        {sortOptions.map((s) => (
          <option key={s} value={s}>
            {SORT_LABELS[s]} {arrow}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="pill-select pill-button"
        title="Toggle sort direction"
        aria-label={`Sort direction: ${query.sortDir === 'asc' ? 'ascending' : 'descending'}`}
        onClick={() => set({ sortDir: query.sortDir === 'asc' ? 'desc' : 'asc' })}
      >
        {arrow}
      </button>
      <span className="muted list-count">
        {count} of {total}
      </span>
    </div>
  );
}
