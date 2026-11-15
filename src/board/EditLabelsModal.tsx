// "Edit labels" panel — same component for Status and Design/Schedule
// (spec §6.3). Rename inline, recolor from the 16-swatch palette, reorder with
// up/down, add, mark default / counts-as-done, archive (with reassignment when
// rows still use the label). System labels can be renamed/recolored only.

import { useMemo, useState } from 'react';
import { LABEL_PALETTE, isOutOfScopeLabel, isPredesignLabel, isReviewLabel, labelsFor } from '../lib/board';
import { labelRequiresNote } from '../lib/updates';
import type { BoardLabel, BoardProject, LabelColumnKey } from './types';
import Popover from './Popover';

interface Props {
  columnKey: LabelColumnKey;
  labels: BoardLabel[];
  projects: BoardProject[];
  /** Upsert the given labels (already edited; BoardTab stamps updatedAt). */
  onUpdate: (changed: BoardLabel[]) => void;
  /** Archive a label, moving any rows that use it to moveToId (or null). */
  onArchive: (labelId: string, moveToId: string | null) => void;
  onClose: () => void;
}

function SwatchPicker({ label, onPick }: { label: BoardLabel; onPick: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className="board-swatch"
          style={{ background: label.color }}
          aria-label={`Color for ${label.name}`}
          title="Change color"
        />
      }
    >
      <div className="board-swatch-grid">
        {LABEL_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`board-swatch ${c === label.color ? 'active' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => {
              setOpen(false);
              if (c !== label.color) onPick(c);
            }}
          />
        ))}
      </div>
    </Popover>
  );
}

export default function EditLabelsModal({ columnKey, labels, projects, onUpdate, onArchive, onClose }: Props) {
  const options = labelsFor(labels, columnKey);
  const [newName, setNewName] = useState('');
  /** Label pending archive while rows still use it → pick a replacement. */
  const [reassign, setReassign] = useState<{ label: BoardLabel; count: number; moveTo: string } | null>(null);

  const usage = useMemo(() => {
    const field =
      columnKey === 'status' ? 'statusId' : columnKey === 'phase' ? 'phaseId' : ('preDesignStatusId' as const);
    const counts = new Map<string, number>();
    for (const p of projects) {
      if (p.deletedAt) continue;
      const id = p[field];
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [projects, columnKey]);

  const rename = (label: BoardLabel, name: string) => {
    const clean = name.trim();
    if (!clean || clean === label.name) return;
    if (options.some((l) => l.id !== label.id && l.name.toLowerCase() === clean.toLowerCase())) return; // unique per column
    onUpdate([{ ...label, name: clean.slice(0, 40) }]);
  };

  const move = (index: number, dir: -1 | 1) => {
    const a = options[index];
    const b = options[index + dir];
    if (!a || !b) return;
    onUpdate([
      { ...a, sortOrder: b.sortOrder },
      { ...b, sortOrder: a.sortOrder },
    ]);
  };

  const setDefault = (label: BoardLabel) => {
    const changed: BoardLabel[] = [];
    for (const l of options) {
      if (l.id === label.id && !l.isDefault) changed.push({ ...l, isDefault: true });
      else if (l.id !== label.id && l.isDefault) changed.push({ ...l, isDefault: false });
    }
    if (changed.length) onUpdate(changed);
  };

  const add = () => {
    const clean = newName.trim();
    if (!clean) return;
    if (options.some((l) => l.name.toLowerCase() === clean.toLowerCase())) return;
    const used = new Set(options.map((l) => l.color));
    const color = LABEL_PALETTE.find((c) => !used.has(c)) ?? LABEL_PALETTE[options.length % LABEL_PALETTE.length];
    // After the working labels, before the parked and finished ones.
    const maxOrder = Math.max(
      0,
      ...options
        .filter((l) => !l.isDone && !isOutOfScopeLabel(l) && !isReviewLabel(l) && !isPredesignLabel(l))
        .map((l) => l.sortOrder),
    );
    onUpdate([
      {
        id: crypto.randomUUID(),
        columnKey,
        name: clean.slice(0, 40),
        color,
        // New labels land after the working ones but before "done" ones.
        sortOrder: maxOrder + 10,
        isDefault: false,
        isDone: false,
        isSystem: false,
        archived: false,
        updatedAt: '', // stamped by BoardTab
      },
    ]);
    setNewName('');
  };

  const requestArchive = (label: BoardLabel) => {
    const count = usage.get(label.id) ?? 0;
    if (count === 0) {
      onArchive(label.id, null);
      return;
    }
    const fallback = options.find((l) => l.id !== label.id);
    setReassign({ label, count, moveTo: fallback?.id ?? '' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          Edit {columnKey === 'status' ? 'Status' : columnKey === 'phase' ? 'Design/Schedule' : 'Pre-Design status'}{' '}
          labels
        </h3>

        {reassign ? (
          <>
            <p>
              <b>{reassign.count}</b> project{reassign.count === 1 ? '' : 's'} use{reassign.count === 1 ? 's' : ''}{' '}
              <b>{reassign.label.name}</b>. Move them to:
            </p>
            <select
              aria-label="Move projects to"
              value={reassign.moveTo}
              onChange={(e) => setReassign({ ...reassign, moveTo: e.target.value })}
            >
              {options
                .filter((l) => l.id !== reassign.label.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setReassign(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!reassign.moveTo}
                onClick={() => {
                  onArchive(reassign.label.id, reassign.moveTo || null);
                  setReassign(null);
                }}
              >
                Move & archive
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="board-label-editor">
              {options.map((l, i) => (
                <div key={l.id} className="board-label-row">
                  <SwatchPicker label={l} onPick={(color) => onUpdate([{ ...l, color }])} />
                  <input
                    aria-label={`Rename ${l.name}`}
                    defaultValue={l.name}
                    key={`${l.id}:${l.name}`}
                    onBlur={(e) => rename(l, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') (e.target as HTMLInputElement).value = l.name;
                    }}
                  />
                  <label className="board-label-flag" title="Applied to new projects">
                    <input type="radio" name={`default-${columnKey}`} checked={l.isDefault} onChange={() => setDefault(l)} />
                    default
                  </label>
                  {columnKey === 'status' && (
                    <>
                      <label className="board-label-flag" title="Counts as finished (used by filters/automations)">
                        <input
                          type="checkbox"
                          checked={l.isDone}
                          // Mutually exclusive with "installation review" and
                          // "out of scope": a row has exactly one section, so
                          // a label must not claim two.
                          onChange={(e) =>
                            onUpdate([
                              {
                                ...l,
                                isDone: e.target.checked,
                                review: e.target.checked ? false : l.review,
                                predesign: e.target.checked ? false : l.predesign,
                                outOfScope: e.target.checked ? false : l.outOfScope,
                              },
                            ])
                          }
                        />
                        done
                      </label>
                      <label
                        className="board-label-flag"
                        title="Waiting on an installation review — these rows move to the “Installation Review” section"
                      >
                        <input
                          type="checkbox"
                          checked={isReviewLabel(l)}
                          onChange={(e) =>
                            onUpdate([
                              {
                                ...l,
                                review: e.target.checked,
                                isDone: e.target.checked ? false : l.isDone,
                                predesign: e.target.checked ? false : l.predesign,
                                outOfScope: e.target.checked ? false : l.outOfScope,
                              },
                            ])
                          }
                        />
                        installation review
                      </label>
                      <label
                        className="board-label-flag"
                        title="Pre-design analysis in progress — these rows move to the “Pre-Design” section with its own sub-status column"
                      >
                        <input
                          type="checkbox"
                          checked={isPredesignLabel(l)}
                          onChange={(e) =>
                            onUpdate([
                              {
                                ...l,
                                predesign: e.target.checked,
                                isDone: e.target.checked ? false : l.isDone,
                                review: e.target.checked ? false : l.review,
                                outOfScope: e.target.checked ? false : l.outOfScope,
                              },
                            ])
                          }
                        />
                        pre-design
                      </label>
                      <label
                        className="board-label-flag"
                        title="Not in the SOW pipeline — these rows move to the “Out of SOW scope” section"
                      >
                        <input
                          type="checkbox"
                          checked={isOutOfScopeLabel(l)}
                          onChange={(e) =>
                            onUpdate([
                              {
                                ...l,
                                outOfScope: e.target.checked,
                                isDone: e.target.checked ? false : l.isDone,
                                review: e.target.checked ? false : l.review,
                                predesign: e.target.checked ? false : l.predesign,
                              },
                            ])
                          }
                        />
                        out of scope
                      </label>
                      {/* NOT mutually exclusive with the three above: a row can
                          be parked and still owe an explanation. Ticked by
                          default for the two "Pending …" statuses by name. */}
                      <label
                        className="board-label-flag"
                        title="Moving a project to this status is blocked until the person doing it writes an update saying why"
                      >
                        <input
                          type="checkbox"
                          checked={labelRequiresNote(l)}
                          onChange={(e) => onUpdate([{ ...l, requiresNote: e.target.checked }])}
                        />
                        needs a note
                      </label>
                    </>
                  )}
                  <span className="board-label-tools">
                    <button type="button" className="btn small secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${l.name} up`}>
                      ↑
                    </button>
                    <button type="button" className="btn small secondary" disabled={i === options.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${l.name} down`}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn small secondary"
                      disabled={l.isSystem}
                      title={l.isSystem ? 'Built-in labels can be renamed or recolored, not archived' : 'Archive this label'}
                      onClick={() => requestArchive(l)}
                    >
                      Archive
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <div className="board-label-add">
              <input
                placeholder="+ New label"
                aria-label="New label name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              <button type="button" className="btn small primary" disabled={!newName.trim()} onClick={add}>
                Add
              </button>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
