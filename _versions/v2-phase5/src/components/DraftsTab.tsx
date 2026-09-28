import { useMemo, useState } from 'react';
import { isoToUs } from '../lib/dates';
import { applyQuery, authorsIn, defaultQuery } from '../lib/listQuery';
import type { PostRecord } from '../types';
import ListControls from './ListControls';

interface Props {
  drafts: PostRecord[];
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function DraftsTab({ drafts, onOpen, onDuplicate, onDelete }: Props) {
  const [query, setQuery] = useState(() => defaultQuery('updated'));
  const shown = useMemo(() => applyQuery(drafts, query), [drafts, query]);

  if (drafts.length === 0) {
    return (
      <div className="card">
        <h3>Drafts</h3>
        <p className="muted">No drafts yet. A draft is created automatically as soon as a customer name exists in Compose.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>Drafts</h3>
      <ListControls
        query={query}
        onChange={setQuery}
        authors={authorsIn(drafts)}
        sortOptions={['updated', 'installDate', 'customer', 'level', 'region', 'author']}
        count={shown.length}
        total={drafts.length}
      />
      <table className="list">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Install date</th>
            <th>Level</th>
            <th>Author</th>
            <th>Last edited</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => (
            <tr key={d.id} className="row" onClick={() => onOpen(d.id)}>
              <td>{d.sf.customerName || '—'}</td>
              <td>{d.sf.installScheduledDate ? isoToUs(d.sf.installScheduledDate) : '—'}</td>
              <td>L{d.level}</td>
              <td>{d.author}</td>
              <td>{new Date(d.updatedAt).toLocaleString()}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className="row-actions">
                  <button type="button" className="btn small secondary" onClick={() => onOpen(d.id)}>
                    Open
                  </button>
                  <button type="button" className="btn small secondary" onClick={() => onDuplicate(d.id)}>
                    Duplicate
                  </button>
                  <button type="button" className="btn small danger" onClick={() => onDelete(d.id)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
