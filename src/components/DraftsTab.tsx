import { isoToUs } from '../lib/dates';
import type { PostRecord } from '../types';

interface Props {
  drafts: PostRecord[];
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function DraftsTab({ drafts, onOpen, onDuplicate, onDelete }: Props) {
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
          {drafts.map((d) => (
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
