// iOS-style bottom sheet (design handoff 2026-10-06) — scrim + rounded panel
// with a grab handle. Every Board cell editor and Admin list editor opens one.

import type { ReactNode } from 'react';

interface Props {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function BottomSheet({ title, sub, onClose, children }: Props) {
  return (
    <>
      <div className="m-scrim" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label={title}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-head">
          <span className="m-sheet-title">{title}</span>
          {sub && <span className="m-sheet-sub">{sub}</span>}
        </div>
        {children}
      </div>
    </>
  );
}
