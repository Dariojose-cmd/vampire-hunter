/**
 * Browser-side CSV helpers shared by the Uploader and ColumnMapper.
 *
 * These run entirely in the browser via Papa Parse. No transaction data is
 * ever sent over the network — this is the core privacy promise of the app.
 */

import Papa from 'papaparse';

/**
 * Decode raw file bytes to text, entirely in the browser. Tries strict UTF-8
 * first; if the bytes are not valid UTF-8 (typical of Latin-1 / Windows-1252
 * bank exports), falls back to windows-1252. A leading UTF-8 BOM is removed.
 */
export function decodeCsvBytes(buf: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

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

export type FileKind = 'csv' | 'excel' | 'pdf' | 'unknown';

/**
 * Classify a File by extension first (case-insensitive), then by MIME type.
 * `application/vnd.ms-excel` maps to csv only when the extension did not
 * decide the kind (browsers may report .csv files that way).
 */
export function classifyFile(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel';
  if (name.endsWith('.pdf')) return 'pdf';

  switch (file.type) {
    case 'application/pdf':
      return 'pdf';
    case 'text/csv':
      return 'csv';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'excel';
    case 'application/vnd.ms-excel':
      return 'csv';
    default:
      return 'unknown';
  }
}

/** True when a File looks like a CSV (by extension or MIME type). */
export function isCsvFile(file: File): boolean {
  return classifyFile(file) === 'csv';
}
