import type { Level, Region } from '../types';
import type { ListQuery, SearchBy, SortBy } from '../lib/listQuery';

const SEARCH_BY: { value: SearchBy; label: string }[] = [
  { value: 'all', label: 'Everything' },
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
  return (
    <div className="list-controls">
      <input
        type="text"
        className="search-input"
        placeholder="Search…"
        value={query.text}
        onChange={(e) => set({ text: e.target.value })}
      />
      <label>
        by
        <select value={query.searchBy} onChange={(e) => set({ searchBy: e.target.value as SearchBy })}>
          {SEARCH_BY.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Region
        <select
          value={query.region}
          onChange={(e) => set({ region: e.target.value as Region | 'ALL' })}
        >
          <option value="ALL">All</option>
          <option value="HOU">HOU</option>
          <option value="DFW">DFW</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label>
        Level
        <select value={query.level} onChange={(e) => set({ level: Number(e.target.value) as Level | 0 })}>
          <option value={0}>All</option>
          <option value={1}>L1</option>
          <option value={2}>L2</option>
          <option value={3}>L3</option>
          <option value={4}>L4</option>
        </select>
      </label>
      <label>
        Author
        <select value={query.author} onChange={(e) => set({ author: e.target.value })}>
          <option value="ALL">All</option>
          {authors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label>
        Sort
        <select value={query.sortBy} onChange={(e) => set({ sortBy: e.target.value as SortBy })}>
          {sortOptions.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn secondary small"
        title="Toggle sort direction"
        onClick={() => set({ sortDir: query.sortDir === 'asc' ? 'desc' : 'asc' })}
      >
        {query.sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
      </button>
      <span className="muted">
        {count} of {total}
      </span>
    </div>
  );
}
