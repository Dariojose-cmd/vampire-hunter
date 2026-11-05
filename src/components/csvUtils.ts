/**
 * Browser-side CSV helpers shared by the Uploader and ColumnMapper.
 *
 * These run entirely in the browser via Papa Parse. No transaction data is
 * ever sent over the network — this is the core privacy promise of the app.
 */

import Papa from 'papaparse';

export interface RawCsv {
  /** First non-ignored row — the header cells. */
  headers: string[];
  /** All remaining rows as string cells. */
  rows: string[][];
}

/**
 * Parse raw CSV text into a header row + data rows, as plain string arrays.
 *
 * We parse WITHOUT a header transform (array mode) so the engine's own column
 * auto-detection can inspect the real header cells and value columns. Blank
 * lines are preserved as empty rows and skipped later by the engine parser.
 */
export function parseCsvText(text: string): RawCsv {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: false,
  });
  const data = (result.data as string[][]).filter((r) => Array.isArray(r));
  const headers = data.length > 0 ? data[0] : [];
  const rows = data.slice(1);
  return { headers, rows };
}

/** True when a File looks like a CSV (by extension or MIME type). */
export function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return true;
  return file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
}
