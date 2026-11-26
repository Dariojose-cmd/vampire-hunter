/**
 * Vampire Hunter — header row locator
 * Pure TypeScript only. Zero React imports.
 *
 * Finds the real header row in a statement grid that may start with Junk_Rows
 * (blank rows, titles, account details).
 */

import type { HeaderLocation } from './types';
import {
  AMOUNT_HEADER_RE,
  DATE_HEADER_RE,
  DESCRIPTION_HEADER_RE,
} from './headerKeywords';

/** Number of leading rows scanned for the header. */
const MAX_SCAN_ROWS = 30;

/** Minimum non-empty cells for a row to qualify as a header. */
const MIN_HEADER_CELLS = 3;

/**
 * Split debit/credit vocabulary, same words detectColumns uses (accent-folded),
 * so split-layout headers count as an amount keyword.
 */
const SPLIT_AMOUNT_RE = /debit|charge|cargo|egreso|retiro|credit|deposit|abono|ingreso/;

/** Lowercases, trims and strips accents. */
function fold(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isEmptyRow(row: string[] | undefined): boolean {
  return !row || row.every((c) => (c ?? '').trim() === '');
}

function isHeaderRow(row: string[] | undefined): boolean {
  if (!row) return false;
  const cells = row.map(fold).filter((c) => c !== '');
  if (cells.length < MIN_HEADER_CELLS) return false;
  const hasDate = cells.some((c) => DATE_HEADER_RE.test(c));
  if (!hasDate) return false;
  return cells.some(
    (c) =>
      AMOUNT_HEADER_RE.test(c) ||
      DESCRIPTION_HEADER_RE.test(c) ||
      SPLIT_AMOUNT_RE.test(c),
  );
}

/**
 * Scans the first 30 rows for the first row with at least 3 non-empty cells
 * that has a date keyword and an amount or description keyword. Falls back to
 * the first non-empty row, or index 0 for an empty grid. Rows above the header
 * are dropped; `rows` holds everything below it.
 */
export function locateHeader(grid: string[][]): HeaderLocation {
  const limit = Math.min(grid.length, MAX_SCAN_ROWS);

  let index = -1;
  for (let i = 0; i < limit; i++) {
    if (isHeaderRow(grid[i])) {
      index = i;
      break;
    }
  }

  if (index === -1) {
    index = grid.findIndex((r) => !isEmptyRow(r));
  }

  if (index === -1) {
    return { headerRowIndex: 0, headers: [], rows: [] };
  }

  return {
    headerRowIndex: index,
    headers: grid[index] ?? [],
    rows: grid.slice(index + 1),
  };
}
