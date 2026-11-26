import { describe, expect, it } from 'vitest';
import { classifyFile } from '../src/components/csvUtils';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const make = (name: string, type = ''): File => new File([''], name, { type });

describe('classifyFile', () => {
  it('classifies by extension', () => {
    expect(classifyFile(make('statement.csv'))).toBe('csv');
    expect(classifyFile(make('statement.xlsx'))).toBe('excel');
    expect(classifyFile(make('statement.xls'))).toBe('excel');
    expect(classifyFile(make('statement.pdf'))).toBe('pdf');
  });

  it('is case-insensitive on extensions', () => {
    expect(classifyFile(make('STATEMENT.CSV'))).toBe('csv');
    expect(classifyFile(make('STATEMENT.XLSX'))).toBe('excel');
    expect(classifyFile(make('STATEMENT.XLS'))).toBe('excel');
    expect(classifyFile(make('STATEMENT.PDF'))).toBe('pdf');
  });

  it('falls back to MIME type when the extension is not recognized', () => {
    expect(classifyFile(make('statement', 'text/csv'))).toBe('csv');
    expect(classifyFile(make('statement', 'application/vnd.ms-excel'))).toBe('csv');
    expect(classifyFile(make('statement', XLSX_MIME))).toBe('excel');
    expect(classifyFile(make('statement', 'application/pdf'))).toBe('pdf');
  });

  it('lets the extension win over the MIME type', () => {
    expect(classifyFile(make('statement.xls', 'application/vnd.ms-excel'))).toBe('excel');
    expect(classifyFile(make('statement.csv', 'application/vnd.ms-excel'))).toBe('csv');
  });

  it('returns unknown for unrecognized extension and MIME type', () => {
    expect(classifyFile(make('notes.txt'))).toBe('unknown');
    expect(classifyFile(make('notes.txt', 'text/plain'))).toBe('unknown');
    expect(classifyFile(make('noextension'))).toBe('unknown');
  });
});
