import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as mod from '../src/engine/excelReader';
import { readWorkbook } from '../src/engine/excelReader';
import { parseCsvText } from '../src/components/csvUtils';

type Cell = string | number | Date | null;

function toBytes(wb: XLSX.WorkBook): ArrayBuffer {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

function sheetFromRows(rows: Cell[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
}

function workbook(sheets: Array<[string, XLSX.WorkSheet]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, name);
  return toBytes(wb);
}

async function csvOf(bytes: ArrayBuffer): Promise<string> {
  const res = await readWorkbook(bytes);
  if (!res.ok) throw new Error(`expected ok, got ${res.error.code}`);
  return res.csvText;
}

describe('readWorkbook', () => {
  it('reads a single sheet into CSV text', async () => {
    const bytes = workbook([
      ['S1', sheetFromRows([['Date', 'Description', 'Amount'], ['2024-01-05', 'Netflix', 'x']])],
    ]);
    const csv = await csvOf(bytes);
    expect(parseCsvText(csv)).toEqual({
      headers: ['Date', 'Description', 'Amount'],
      rows: [['2024-01-05', 'Netflix', 'x']],
    });
  });

  it('skips leading empty sheets', async () => {
    const empty = XLSX.utils.aoa_to_sheet([]);
    const bytes = workbook([
      ['Empty1', empty],
      ['Empty2', XLSX.utils.aoa_to_sheet([])],
      ['Data', sheetFromRows([['Description', 'Amount'], ['Spotify', 'a']])],
    ]);
    const csv = await csvOf(bytes);
    expect(parseCsvText(csv).headers).toEqual(['Description', 'Amount']);
    expect(csv).toContain('Spotify');
  });

  it('ignores sheets after the first non-empty one', async () => {
    const bytes = workbook([
      ['First', sheetFromRows([['Description', 'Amount'], ['First', 'a']])],
      ['Second', sheetFromRows([['Description', 'Amount'], ['SecondSheetRow', 'b']])],
    ]);
    const csv = await csvOf(bytes);
    expect(csv).toContain('First');
    expect(csv).not.toContain('SecondSheetRow');
  });

  it('returns a failure Result when every sheet is empty', async () => {
    const bytes = workbook([
      ['A', XLSX.utils.aoa_to_sheet([])],
      ['B', XLSX.utils.aoa_to_sheet([])],
    ]);
    const res = await readWorkbook(bytes);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('PARSE_FAILED');
  });

  it('quotes cells containing comma, quote and newline (RFC 4180)', async () => {
    const tricky = 'Foo, "Bar"\nBaz';
    const bytes = workbook([['S', sheetFromRows([['Description', 'Amount'], [tricky, 'x']])]]);
    const csv = await csvOf(bytes);
    expect(csv).toContain('"Foo, ""Bar""\nBaz"');
    expect(parseCsvText(csv).rows[0]).toEqual([tricky, 'x']);
  });

  it('writes empty cells as empty fields', async () => {
    const bytes = workbook([
      ['S', sheetFromRows([['Description', 'Note', 'Amount'], ['Hulu', null, 'x']])],
    ]);
    const csv = await csvOf(bytes);
    expect(parseCsvText(csv).rows[0]).toEqual(['Hulu', '', 'x']);
  });

  it('leaves comma-decimal text amounts unchanged', async () => {
    const bytes = workbook([
      ['S', sheetFromRows([['Description', 'Amount'], ['Rent', '1.299,00']])],
    ]);
    const csv = await csvOf(bytes);
    expect(parseCsvText(csv).rows[0]).toEqual(['Rent', '1.299,00']);
  });

  it('writes date-formatted serials and Date cells as ISO dates', async () => {
    const ws = sheetFromRows([
      ['Date', 'Description', 'Amount'],
      [new Date(Date.UTC(2024, 0, 1)), 'Serial', 'x'],
      [new Date(Date.UTC(2024, 1, 29)), 'DateCell', 'y'],
    ]);
    // Row 1: numeric serial with a date number format.
    ws['A2'] = { t: 'n', v: 45292, z: 'yyyy-mm-dd' }; // 2024-01-01
    // Row 2: native Excel date cell.
    ws['A3'] = { t: 'd', v: new Date(Date.UTC(2024, 1, 29)), z: 'yyyy-mm-dd' };
    const csv = await csvOf(workbook([['S', ws]]));
    const { rows } = parseCsvText(csv);
    expect(rows[0][0]).toBe('2024-01-01');
    expect(rows[1][0]).toBe('2024-02-29');
  });

  it('writes numeric amounts with two decimals and a dot', async () => {
    const bytes = workbook([
      [
        'S',
        sheetFromRows([
          ['Description', 'Amount'],
          ['a', 19.99],
          ['b', 19.9],
          ['c', 1500],
        ]),
      ],
    ]);
    const { rows } = parseCsvText(await csvOf(bytes));
    expect(rows.map((r) => r[1])).toEqual(['19.99', '19.90', '1500.00']);
  });

  it('exposes only the named export (no default)', () => {
    expect(Object.keys(mod)).toEqual(['readWorkbook']);
    expect('default' in mod).toBe(false);
  });
});
