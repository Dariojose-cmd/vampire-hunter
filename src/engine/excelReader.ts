/**
 * Vampire Hunter — Excel reader
 * No React imports. SheetJS is loaded lazily inside readWorkbook so it lands
 * in its own chunk. Runs entirely in the browser; no network calls.
 */

import type * as XLSXNamespace from 'xlsx';
import { DATE_HEADER_RE } from './headerKeywords';
import { locateHeader } from './headerLocator';
import type { ExcelReadResult } from './types';

type XLSXModule = typeof XLSXNamespace;

/** Rows scanned for the header row. */
const HEADER_SCAN_ROWS = 30;
const MS_PER_DAY = 86_400_000;
const MIN_PLAUSIBLE_YEAR = 1990;
const MAX_PLAUSIBLE_YEAR = 2100;

function fail(message: string): ExcelReadResult {
  return { ok: false, error: { code: 'PARSE_FAILED', message } };
}

function fold(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/** YYYY-MM-DD from UTC fields only (never local getters). */
function formatExcelDate(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Rounds to cents; always 2 decimals, dot separator, no thousands separator. */
function formatAmount(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const cents = Math.round(v * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Returns an ISO date when `v` is a Plausible_Serial, otherwise null. */
function plausibleSerialToIso(v: number, date1904: boolean): string | null {
  if (!Number.isInteger(v)) return null;
  const base = Date.UTC(1899, 11, 30) + (date1904 ? 1462 * MS_PER_DAY : 0);
  const d = new Date(base + v * MS_PER_DAY);
  const year = d.getUTCFullYear();
  if (Number.isNaN(year) || year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR) return null;
  return formatExcelDate(d);
}

/** RFC 4180 quoting. */
function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function hasNonEmptyCell(XLSX: XLSXModule, sheet: XLSXNamespace.WorkSheet): boolean {
  const ref = sheet['!ref'];
  if (!ref) return false;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSXNamespace.CellObject | undefined;
      if (cell && cell.t !== 'z' && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        return true;
      }
    }
  }
  return false;
}

function sheetToCsvText(
  XLSX: XLSXModule,
  sheet: XLSXNamespace.WorkSheet,
  date1904: boolean,
): string {
  const ref = sheet['!ref'];
  if (!ref) return '';
  const range = XLSX.utils.decode_range(ref);
  const getCell = (r: number, c: number): XLSXNamespace.CellObject | undefined =>
    sheet[XLSX.utils.encode_cell({ r, c })] as XLSXNamespace.CellObject | undefined;

  // Display-text grid of the first 30 rows, used to find the header row.
  const gridEnd = Math.min(range.e.r, range.s.r + HEADER_SCAN_ROWS - 1);
  const grid: string[][] = [];
  for (let r = range.s.r; r <= gridEnd; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(r, c);
      row.push(cell ? (XLSX.utils.format_cell(cell) ?? '') : '');
    }
    grid.push(row);
  }

  const located = locateHeader(grid);
  const headerRow = located.headerRowIndex; // relative to range.s.r
  const dateColumns = new Set<number>();
  located.headers.forEach((h, i) => {
    if (DATE_HEADER_RE.test(fold(h))) dateColumns.add(i);
  });

  const lines: string[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const fields: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(r, c);
      let text = '';
      if (cell && cell.v !== undefined && cell.v !== null) {
        if (cell.t === 'd' && cell.v instanceof Date) {
          text = formatExcelDate(cell.v);
        } else if (cell.t === 'n' && typeof cell.v === 'number') {
          let iso: string | null = null;
          if (r - range.s.r > headerRow && dateColumns.has(c - range.s.c)) {
            iso = plausibleSerialToIso(cell.v, date1904);
          }
          text = iso ?? formatAmount(cell.v);
        } else if (cell.t === 'z') {
          text = '';
        } else {
          text = XLSX.utils.format_cell(cell) ?? String(cell.v);
        }
      }
      fields.push(csvField(text));
    }
    lines.push(fields.join(','));
  }
  return lines.join('\n');
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** True for ZIP (.xlsx) or OLE2 (.xls) signatures. SheetJS would otherwise read junk as text. */
function hasWorkbookSignature(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  const starts = (magic: number[]) =>
    head.length >= magic.length && magic.every((b, i) => head[i] === b);
  return starts(ZIP_MAGIC) || starts(OLE2_MAGIC);
}

/**
 * Reads an Excel Workbook and returns CSV_Text for the first sheet that has a
 * non-empty cell. Returns a Result for every input and never throws.
 */
export async function readWorkbook(bytes: ArrayBuffer): Promise<ExcelReadResult> {
  try {
    const XLSX = await import('xlsx');
    if (!hasWorkbookSignature(bytes)) return fail('Not a valid Excel workbook.');
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      return sheet !== undefined && hasNonEmptyCell(XLSX, sheet);
    });
    if (sheetName === undefined) return fail('Every sheet is empty.');
    const date1904 = workbook.Workbook?.WBProps?.date1904 === true;
    return { ok: true, csvText: sheetToCsvText(XLSX, workbook.Sheets[sheetName], date1904) };
  } catch {
    return fail('Could not read the Excel file.');
  }
}
