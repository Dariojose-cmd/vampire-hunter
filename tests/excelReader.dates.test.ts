import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../src/engine/excelReader';
import { parseStatement } from '../src/engine';
import { parseCsvText } from '../src/components/csvUtils';

type Cell = string | number | null;

function bytesOf(rows: Cell[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  // No cellDates and no number formats: numeric cells stay plain numbers.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

async function csvOf(rows: Cell[][]): Promise<string> {
  const res = await readWorkbook(bytesOf(rows));
  if (!res.ok) throw new Error(`expected ok, got ${res.error.code}`);
  return res.csvText;
}

function lines(csv: string): string[] {
  return csv.split('\n');
}

const HEADER: Cell[] = ['Fecha', 'Descripcion', 'Importe'];

describe('readWorkbook unformatted serials', () => {
  it('converts an unformatted Plausible_Serial in a date column (Req 3.12)', async () => {
    const csv = await csvOf([HEADER, [45292, 'NETFLIX', -15.49]]);
    expect(lines(csv)).toEqual(['Fecha,Descripcion,Importe', '2024-01-01,NETFLIX,-15.49']);
    const { headers, rows } = parseCsvText(csv);
    expect(() => parseStatement(headers, rows)).not.toThrow();
  });

  it('converts the serial below 2 Junk_Rows (Req 3.13)', async () => {
    const csv = await csvOf([
      ['Banco Ejemplo', null, null],
      ['Extracto de cuenta', null, null],
      HEADER,
      [45292, 'NETFLIX', -15.49],
    ]);
    const out = lines(csv);
    expect(out[3]).toBe('2024-01-01,NETFLIX,-15.49');
    const { headers, rows } = parseCsvText(csv);
    expect(() => parseStatement(headers, rows)).not.toThrow();
  });

  it('does not convert a numeric value in an amount column (Req 3.15)', async () => {
    const csv = await csvOf([HEADER, [45292, 'RENT', 45292]]);
    expect(lines(csv)[1]).toBe('2024-01-01,RENT,45292.00');
  });

  it('keeps non-plausible date-column numbers as numbers (Req 3.16)', async () => {
    const res = await readWorkbook(
      bytesOf([HEADER, [5, 'A', -1], [45292.5, 'B', -2]]),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const out = lines(res.csvText);
    expect(out[1]).toBe('5.00,A,-1.00');
    expect(out[2]).toBe('45292.50,B,-2.00');
    const { headers, rows } = parseCsvText(res.csvText);
    expect(() => parseStatement(headers, rows)).not.toThrow();
  });
});
