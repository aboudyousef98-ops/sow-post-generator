// The .xlsx writer must reproduce the company file layout exactly:
// one sheet per person, name in A1, stats rows 5–6, table header row 7,
// data from row 8; cols A–D width 30, E width 95; dates yyyy-mm-dd, hours 0.0.
// Verified by writing a workbook and reading it back with exceljs.

import { describe, expect, it } from 'vitest';
import type { ExtraWorkEntry } from '../extrawork/types';
import { newEntry } from './extraWork';
import { buildMonthReport } from './extraWorkReport';
import { buildExtraWorkWorkbook } from './extraWorkXlsx';

const T0 = '2026-10-02T10:00:00.000Z';

function e(
  person: string,
  dateIso: string,
  hours: number,
  description: string,
  dayTypeOverride: ExtraWorkEntry['dayTypeOverride'] = null,
): ExtraWorkEntry {
  return newEntry(
    { username: person.toLowerCase().replace(/\s+/g, ''), person },
    { dateIso, hours, description, dayTypeOverride },
    T0,
  );
}

describe('buildExtraWorkWorkbook', () => {
  // Generous timeout: the first exceljs import on a cold disk cache can take
  // >5 s on Windows (observed 21 s once); warm runs take ~200 ms.
  it('writes one sheet per person in the company layout', { timeout: 60000 }, async () => {
    const report = buildMonthReport(
      [
        e('Aboud Yousef', '2026-10-04', 8, 'Template Modification'), // Sunday
        e('Aboud Yousef', '2026-10-05', 3, 'Meetings'), // Monday
        e('Aboud Yousef', '2026-10-06', 2, 'Eid coverage', 'holiday'),
        e('Omar Rajab', '2026-10-03', 6, 'BOS Tool'), // Saturday
      ],
      '2026-10',
    );
    const wb = await buildExtraWorkWorkbook(report);
    const { default: ExcelJS } = await import('exceljs');
    const read = new ExcelJS.Workbook();
    await read.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);

    expect(read.worksheets.map((w) => w.name)).toEqual(['Aboud Yousef', 'Omar Rajab']);

    const ws = read.getWorksheet('Aboud Yousef')!;
    expect(ws.getCell('A1').value).toBe('Aboud Yousef');
    expect(ws.getCell('A5').value).toBe('Total extra hours');
    expect(ws.getCell('B5').value).toBe('Weekday hours');
    expect(ws.getCell('C5').value).toBe('Weekend hours');
    expect(ws.getCell('D5').value).toBe('Days logged');
    // The company file has only Weekday/Weekend stat columns — holiday hours
    // fold into Weekend there (the Day type cell still says Holiday).
    expect(ws.getCell('A6').value).toBe(13);
    expect(ws.getCell('B6').value).toBe(3);
    expect(ws.getCell('C6').value).toBe(10);
    expect(ws.getCell('D6').value).toBe(3);
    expect(ws.getCell('A7').value).toBe('Date');
    expect(ws.getCell('E7').value).toBe('Description of work');
    // First data row: date cell formatted yyyy-mm-dd on the right calendar day.
    const dateCell = ws.getCell('A8');
    expect(dateCell.numFmt).toBe('yyyy-mm-dd');
    expect((dateCell.value as Date).toISOString().slice(0, 10)).toBe('2026-10-04');
    expect(ws.getCell('B8').value).toBe('Sun');
    expect(ws.getCell('C8').value).toBe('Weekend');
    expect(ws.getCell('D8').value).toBe(8);
    expect(ws.getCell('D8').numFmt).toBe('0.0');
    expect(ws.getCell('E8').value).toBe('Template Modification');
    expect(ws.getCell('C10').value).toBe('Holiday'); // override survives into the sheet
    // Column widths match the company file (A–D 30, E 95).
    expect(Math.round(ws.getColumn(1).width ?? 0)).toBe(30);
    expect(Math.round(ws.getColumn(5).width ?? 0)).toBe(95);
    // "Nice format" (Aboud 2026-10-07): navy header band, colored day-type
    // cells matching the app's labels, frozen header rows.
    const headFill = ws.getCell('A7').fill as { fgColor?: { argb?: string } };
    expect(headFill?.fgColor?.argb).toBe('FF043D4F');
    expect(ws.getCell('A7').font?.color?.argb).toBe('FFFFFFFF');
    const typeFill = ws.getCell('C8').fill as { fgColor?: { argb?: string } }; // Weekend row
    expect(typeFill?.fgColor?.argb).toBe('FFFDAB3D');
    expect((ws.views?.[0] as { ySplit?: number })?.ySplit).toBe(7);
  });
});
