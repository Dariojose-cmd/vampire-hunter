import { describe, it, expect } from 'vitest';
import { locateHeader } from '../src/engine/headerLocator';
import { parseCsvText } from '../src/components/csvUtils';

/** Parse CSV_Text into a full grid (header row included as row 0). */
function grid(text: string): string[][] {
  const { headers, rows } = parseCsvText(text);
  return [headers, ...rows];
}

describe('locateHeader', () => {
  it('finds the header below Junk_Rows in CSV_Text (Req 9.1)', () => {
    const g = grid(
      [
        'Account statement',
        'Holder: Jane Doe,Account: 1234',
        '',
        'Date,Description,Amount',
        '2024-01-05,Netflix,-15.99',
        '2024-02-05,Netflix,-15.99',
      ].join('\n'),
    );
    const loc = locateHeader(g);
    expect(loc.headerRowIndex).toBe(3);
    expect(loc.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(loc.rows).toEqual([
      ['2024-01-05', 'Netflix', '-15.99'],
      ['2024-02-05', 'Netflix', '-15.99'],
    ]);
  });

  it('finds the header in Excel-derived CSV_Text with padded empty cells (Req 9.3)', () => {
    const g = grid(
      [
        'Extracto de cuenta,,,',
        ',,,',
        'Titular,Jane Doe,,',
        ',,,',
        'Fecha,Descripción,Importe,Saldo',
        '05/01/2024,Spotify,-9.99,100.00',
      ].join('\n'),
    );
    const loc = locateHeader(g);
    expect(loc.headerRowIndex).toBe(4);
    expect(loc.headers).toEqual(['Fecha', 'Descripción', 'Importe', 'Saldo']);
    expect(loc.rows).toEqual([['05/01/2024', 'Spotify', '-9.99', '100.00']]);
  });

  it('returns index 0 when there are no Junk_Rows (Req 9.4)', () => {
    const g = grid('Date,Description,Amount\n2024-01-05,Netflix,-15.99');
    const loc = locateHeader(g);
    expect(loc.headerRowIndex).toBe(0);
    expect(loc.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(loc.rows).toEqual([['2024-01-05', 'Netflix', '-15.99']]);
  });

  it('falls back to the first non-empty row when no header is recognizable (Req 9.5)', () => {
    const g = grid(['foo,bar,baz', '1,2,3', '4,5,6'].join('\n'));
    const loc = locateHeader(g);
    expect(loc.headerRowIndex).toBe(0);
    expect(loc.headers).toEqual(['foo', 'bar', 'baz']);
    expect(loc.rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('falls back to the first non-empty row after leading blank rows (Req 9.5)', () => {
    const loc = locateHeader([[''], ['', '', ''], ['x', 'y', 'z'], ['1', '2', '3']]);
    expect(loc.headerRowIndex).toBe(2);
    expect(loc.headers).toEqual(['x', 'y', 'z']);
    expect(loc.rows).toEqual([['1', '2', '3']]);
  });

  it('handles an empty grid', () => {
    expect(locateHeader([])).toEqual({ headerRowIndex: 0, headers: [], rows: [] });
  });

  describe('Junk_Row shapes (Req 9.10)', () => {
    const header = ['Date', 'Description', 'Amount'];
    const data = ['2024-01-05', 'Netflix', '-15.99'];

    it('skips blank rows', () => {
      const loc = locateHeader([[], [''], ['', '', ''], header, data]);
      expect(loc.headerRowIndex).toBe(3);
      expect(loc.headers).toEqual(header);
      expect(loc.rows).toEqual([data]);
    });

    it('skips single-cell rows', () => {
      const loc = locateHeader([['Bank of Nowhere'], ['Statement'], header, data]);
      expect(loc.headerRowIndex).toBe(2);
      expect(loc.rows).toEqual([data]);
    });

    it('skips multi-cell rows with fewer than 3 non-empty cells', () => {
      const loc = locateHeader([['Date range', '2024-01'], ['Account', '', '1234'].slice(0, 2), header, data]);
      expect(loc.headerRowIndex).toBe(2);
    });

    it('skips multi-cell rows without a date keyword', () => {
      const loc = locateHeader([['Name', 'Account', 'Balance', 'Total'], header, data]);
      expect(loc.headerRowIndex).toBe(1);
    });
  });

  describe('accent-folded and case-insensitive headers (Req 9.10)', () => {
    it('recognizes accented Spanish headers', () => {
      const g = [
        ['Reporte'],
        ['FECHA', 'DESCRIPCIÓN', 'MÁS', 'Débito'],
        ['05/01/2024', 'Spotify', '', '9.99'],
      ];
      const loc = locateHeader(g);
      expect(loc.headerRowIndex).toBe(1);
      expect(loc.rows).toEqual([['05/01/2024', 'Spotify', '', '9.99']]);
    });

    it('recognizes split debit/credit layout with accents', () => {
      const g = [
        ['Título del reporte'],
        ['Fecha', 'Crédito', 'Débito'],
        ['05/01/2024', '', '9.99'],
      ];
      expect(locateHeader(g).headerRowIndex).toBe(1);
    });
  });

  it('only scans the first 30 rows, then falls back to first non-empty row', () => {
    const junk = Array.from({ length: 30 }, (_, i) => [`junk ${i}`]);
    const g = [...junk, ['Date', 'Description', 'Amount'], ['2024-01-05', 'X', '-1']];
    const loc = locateHeader(g);
    expect(loc.headerRowIndex).toBe(0);
    expect(loc.headers).toEqual(['junk 0']);
  });
});
