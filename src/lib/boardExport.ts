// Project board export (Aboud 2026-11-17) — the 522-row board as .csv/.xlsx.
//
// Built for the bot's two standing jobs: daily assignment ("who is on what,
// what is unassigned") and stuck-project checks ("no movement, install date
// passed"). So it exports the DERIVED answers alongside the raw fields —
// label ids are useless outside the app, and a reader should not have to join
// two sheets to learn a row's status.
//
// Deliberately NOT the same columns as the requirements export: that one
// round-trips through an importer, this one is read-only reporting. Pretending
// they share a format would imply this can be imported back, which it cannot.

import { labelById } from './board';
import type { BoardLabel, BoardProject, BoardState } from '../board/types';
import { CSV_BOM } from './requirementsExport';

export const BOARD_EXPORT_HEADER = [
  'Project name',
  'SOW coordinator',
  'Reviewer',
  'Status',
  'Design/Schedule',
  'Pre-Design status',
  'Designed date',
  'Install date',
  'Rating',
  'Days since update',
  'Archived',
  'Last updated',
  'Last updated by',
  'Created',
  'Created by',
] as const;

/** Whole days between an ISO stamp and `now`; '' when there is no stamp. */
function daysSince(iso: string | undefined, now: Date): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  return String(Math.max(0, Math.floor((now.getTime() - then) / 86_400_000)));
}

const labelName = (labels: BoardLabel[], id: string | null | undefined) =>
  id ? (labelById(labels, id)?.name ?? '') : '';

export interface BoardExportOptions {
  /** Install dates, keyed by project id — they live on records, not projects. */
  installByProject?: Map<string, string | null>;
  /** Include archived rows. Off by default, matching the board's own filter. */
  includeArchived?: boolean;
  now?: Date;
}

/**
 * The board as rows. Deleted rows are never exported — a tombstone is not a
 * project. Archived rows are excluded by default for the same reason the
 * board hides them, but can be asked for.
 */
export function toBoardRows(board: BoardState, opts: BoardExportOptions = {}): string[][] {
  const now = opts.now ?? new Date();
  const installs = opts.installByProject ?? new Map<string, string | null>();
  const rows: string[][] = [BOARD_EXPORT_HEADER.slice() as string[]];

  const projects = board.projects
    .filter((p: BoardProject) => !p.deletedAt)
    .filter((p: BoardProject) => (opts.includeArchived ? true : !p.archivedAt));

  for (const p of projects) {
    rows.push([
      p.name,
      // '' is "unassigned" in the data; say so in words, because an empty
      // cell in a spreadsheet reads as "nobody filled this in".
      p.coordinator || 'Unassigned',
      p.reviewer || '',
      labelName(board.labels, p.statusId),
      labelName(board.labels, p.phaseId),
      labelName(board.labels, p.preDesignStatusId),
      p.designedDate ?? '',
      installs.get(p.id) ?? '',
      p.rating === null || p.rating === undefined ? '' : String(p.rating),
      daysSince(p.updatedAt, now),
      p.archivedAt ? 'Yes' : '',
      p.updatedAt ?? '',
      p.updatedBy ?? '',
      p.createdAt ?? '',
      p.createdBy ?? '',
    ]);
  }

  return rows;
}

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function boardToCsv(rows: string[][]): string {
  return `${CSV_BOM}${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

export function boardExportFileName(now = new Date()): string {
  return `board-${now.toISOString().slice(0, 10)}`;
}

function handToBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBoardCsv(board: BoardState, opts: BoardExportOptions = {}): void {
  handToBrowser(
    new Blob([boardToCsv(toBoardRows(board, opts))], { type: 'text/csv;charset=utf-8' }),
    `${boardExportFileName(opts.now)}.csv`,
  );
}

/** exceljs is import()-ed so it never lands in the main bundle. */
export async function downloadBoardXlsx(board: BoardState, opts: BoardExportOptions = {}): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Board');
  for (const r of toBoardRows(board, opts)) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  // Freeze the header: 522 rows is a lot to scroll with the labels gone.
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns.forEach((c, i) => {
    c.width = i === 0 ? 34 : 18;
  });
  const buffer = await wb.xlsx.writeBuffer();
  handToBrowser(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${boardExportFileName(opts.now)}.xlsx`,
  );
}
