// Builds the monthly company .xlsx — the same layout as the hand-made
// "Extra Work Summary - SOW Team - Sep 2026.xlsx": one sheet per person,
// name in A1, stats rows 5–6, table header row 7, data from row 8,
// cols A–D width 30 / E width 95, dates yyyy-mm-dd, hours 0.0.
// exceljs is import()-ed so it never lands in the main bundle.

import type { Workbook } from 'exceljs';
import type { MonthReport } from './extraWorkReport';
import { reportFileName } from './extraWorkReport';

/** Excel forbids []:*?/\ in sheet names and caps them at 31 chars. */
function sheetName(person: string): string {
  return person.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
}

// Brand styling (Aboud 2026-10-07: "nice format") — the app's own colors.
const NAVY = 'FF043D4F';
const LIGHT = 'FFEEF1F2';
const LINE = 'FFE3E8EA';
const TYPE_FILL: Record<string, { bg: string; fg: string }> = {
  Weekday: { bg: 'FF0086C0', fg: 'FFFFFFFF' },
  Weekend: { bg: 'FFFDAB3D', fg: 'FF323338' },
  Holiday: { bg: 'FFA25DDC', fg: 'FFFFFFFF' },
};

const solid = (argb: string) =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } }) as import('exceljs').Fill;

const thinBorder: Partial<import('exceljs').Borders> = {
  top: { style: 'thin', color: { argb: LINE } },
  left: { style: 'thin', color: { argb: LINE } },
  bottom: { style: 'thin', color: { argb: LINE } },
  right: { style: 'thin', color: { argb: LINE } },
};

/** ISO date → Date at UTC midnight, so the serial lands on the right calendar day. */
function utcDate(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(0);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export async function buildExtraWorkWorkbook(report: MonthReport): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  for (const p of report.persons) {
    const ws = wb.addWorksheet(sheetName(p.person));
    ws.columns = [{ width: 30 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 95 }];
    // Keep the stats + table header on screen while scrolling the log.
    ws.views = [{ state: 'frozen', ySplit: 7 }];

    const name = ws.getCell('A1');
    name.value = p.person;
    name.font = { bold: true, size: 16, color: { argb: NAVY } };

    const statHeads = ['Total extra hours', 'Weekday hours', 'Weekend hours', 'Days logged'];
    statHeads.forEach((h, i) => {
      const c = ws.getRow(5).getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: NAVY } };
      c.fill = solid(LIGHT);
      c.border = thinBorder;
    });
    // Company format has only two stat columns — holiday folds into Weekend.
    const statVals = [p.stats.total, p.stats.weekday, p.stats.weekend + p.stats.holiday, p.stats.days];
    statVals.forEach((v, i) => {
      const c = ws.getRow(6).getCell(i + 1);
      c.value = v;
      c.font = { bold: true };
      c.border = thinBorder;
    });

    const tableHeads = ['Date', 'Day', 'Day type', 'Extra hours', 'Description of work'];
    tableHeads.forEach((h, i) => {
      const c = ws.getRow(7).getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = solid(NAVY);
      c.border = thinBorder;
    });

    p.rows.forEach((r, i) => {
      const row = ws.getRow(8 + i);
      const dateCell = row.getCell(1);
      dateCell.value = utcDate(r.dateIso);
      dateCell.numFmt = 'yyyy-mm-dd';
      row.getCell(2).value = r.day;
      const typeCell = row.getCell(3);
      typeCell.value = r.dayType;
      const tc = TYPE_FILL[r.dayType];
      if (tc) {
        typeCell.fill = solid(tc.bg);
        typeCell.font = { bold: true, color: { argb: tc.fg } };
        typeCell.alignment = { horizontal: 'center' };
      }
      const hoursCell = row.getCell(4);
      hoursCell.value = r.hours;
      hoursCell.numFmt = '0.0';
      hoursCell.font = { bold: true };
      row.getCell(5).value = r.description;
      for (let col = 1; col <= 5; col++) row.getCell(col).border = thinBorder;
    });
  }

  return wb;
}

/** Build and hand the .xlsx to the browser as a download. */
export async function downloadExtraWorkXlsx(report: MonthReport, fileName?: string): Promise<void> {
  const wb = await buildExtraWorkWorkbook(report);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName ?? reportFileName(report.monthKey)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
