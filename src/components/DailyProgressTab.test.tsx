// @vitest-environment jsdom
// Daily Progress preview window (Aboud 2026-10-07): the tab shows, live, the
// exact text "Copy report" puts on the clipboard — including typed Updates.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBoard, newProject } from '../lib/board';
import DailyProgressTab from './DailyProgressTab';

describe('DailyProgressTab preview', () => {
  afterEach(cleanup);

  it('renders the report text and live-updates with the Updates field', () => {
    const board = emptyBoard();
    render(<DailyProgressTab board={board} records={[]} toast={() => {}} />);
    const preview = screen.getByTestId('dp-preview');
    expect(preview.textContent).toContain('Daily SOW Projects Progress');
    expect(preview.textContent).toContain('Projects scheduled (installation date):');
    fireEvent.change(screen.getByPlaceholderText(/One update per line/), {
      target: { value: 'Lucille Rivas\nNathan Hart' },
    });
    expect(preview.textContent).toContain('• Lucille Rivas');
    expect(preview.textContent).toContain('• Nathan Hart');
  });

  it('shows designed projects for the picked date in the preview', () => {
    const board = emptyBoard();
    const p = {
      ...newProject('Patrick Lingwall', 'Aboud Yousef', board.labels, '2026-10-01T00:00:00.000Z'),
      id: 'p1',
      phaseId: 'phase-design',
      designedDate: '2026-10-05',
    };
    render(<DailyProgressTab board={{ ...board, projects: [p] }} records={[]} toast={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Design date/), { target: { value: '2026-10-05' } });
    expect(screen.getByTestId('dp-preview').textContent).toContain('• Patrick Lingwall');
  });
});
