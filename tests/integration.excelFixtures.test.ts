/**
 * Integration test: committed Excel fixtures (tests/fixtures/excel/).
 *
 * - Each .xlsx/.xls fixture, run through
 *   readWorkbook -> parseCsvText -> locateHeader -> parseStatement -> runDetection,
 *   gives the same result as its sibling .csv fixture run through the stages
 *   after parseCsvText.
 * - generateFixtures() is deterministic.
 * - The workbooks really contain date-formatted serial cells (layout A) and
 *   date cells (layout B), as decoded by SheetJS.
 *
 * generateFixtures is imported with an explicit .ts extension (the script is
 * written for Node's native type stripping).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

import { readWorkbook } from '../src/engine/excelReader';
import { locateHeader } from '../src/engine/headerLocator';
import { parseStatement, runDetection } from '../src/engine/index';
import { parseCsvText } from '../src/components/csvUtils';
import { generateFixtures } from '../scripts/generate-excel-fixtures.ts';

const DIR = resolve(process.cwd(), 'tests/fixtures/excel');
const LAYOUTS = ['layout-a-serial-dates', 'layout-b-date-cells'] as const;
const EXTS = ['xlsx', 'xls'] as const;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  // Copy into a fresh ArrayBuffer of the test realm (Buffer's pooled, cross-realm
  // ArrayBuffer is not recognised by SheetJS' type:'array' reader under jsdom).
  return new Uint8Array(buf).buffer as ArrayBuffer;
}

function run(csvText: string) {
  const { headers, rows } = parseCsvText(csvText);
  const loc = locateHeader([headers, ...rows]);
  const parsed = parseStatement(loc.headers, loc.rows);
  if (!parsed.ok) throw new Error(`parseStatement failed: ${parsed.error.code}`);
  const result = runDetection({
    transactions: parsed.value.transactions,
    currency: parsed.value.currency,
  });
  return { currency: parsed.value.currency, transactions: parsed.value.transactions, result };
}

describe('Excel fixtures match their CSV twins', () => {
  const cases = LAYOUTS.flatMap((layout) => EXTS.map((ext) => [layout, ext] as const));

  it.each(cases)('%s.%s equals its CSV twin after the same pipeline', async (layout, ext) => {
    const bytes = toArrayBuffer(readFileSync(resolve(DIR, `${layout}.${ext}`)));
    const wb = await readWorkbook(bytes);
    expect(wb.ok).toBe(true);
    if (!wb.ok) return;

    const csvText = readFileSync(resolve(DIR, `${layout}.csv`), 'utf-8').replace(/^\uFEFF/, '');

    const fromExcel = run(wb.csvText);
    const fromCsv = run(csvText);

    expect(fromExcel).toEqual(fromCsv);

    // Non-trivial comparison: Netflix, Spotify and the gym are detected.
    const names = fromExcel.result.vampires.map((v) => v.displayName.toLowerCase());
    expect(fromExcel.result.vampires.length).toBeGreaterThanOrEqual(3);
    for (const needle of ['netflix', 'spotify', 'gym']) {
      expect(
        names.some((n) => n.includes(needle)),
        `expected a vampire matching "${needle}" in ${JSON.stringify(names)}`,
      ).toBe(true);
    }
  });
});

describe('generateFixtures determinism', () => {
  it('returns deeply equal data on two calls', () => {
    const a = generateFixtures();
    const b = generateFixtures();
    expect(a).toEqual(b);
    expect(a.map((l: { name: string }) => l.name)).toEqual([...LAYOUTS]);
  });
});

describe('fixture date cells as decoded by SheetJS', () => {
  const firstSheet = (wb: XLSX.WorkBook): XLSX.WorkSheet => wb.Sheets[wb.SheetNames[0]];

  /** Date-column cells below the header row (header row is at junkRows). */
  function dateCells(ws: XLSX.WorkSheet, junkRows: number): XLSX.CellObject[] {
    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    const cells: XLSX.CellObject[] = [];
    for (let r = junkRows + 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })] as XLSX.CellObject | undefined;
      if (cell) cells.push(cell);
    }
    return cells;
  }

  const read = (layout: string, ext: string, cellDates: boolean) =>
    XLSX.read(readFileSync(resolve(DIR, `${layout}.${ext}`)), {
      type: 'buffer',
      cellDates,
      cellNF: true,
    });

  const layouts = generateFixtures() as { name: string; junkRows: number; aoa: unknown[][] }[];
  const junkOf = (name: string) => layouts.find((l) => l.name === name)!.junkRows;
  const bodyRows = (name: string) => layouts.find((l) => l.name === name)!.aoa.length - 1 - junkOf(name);

  it.each(EXTS)('layout A (.%s): raw cells are numbers with a date format', (ext) => {
    const name = 'layout-a-serial-dates';
    const cells = dateCells(firstSheet(read(name, ext, false)), junkOf(name));
    expect(cells.length).toBe(bodyRows(name));
    for (const c of cells) {
      expect(c.t).toBe('n');
      expect(typeof c.v).toBe('number');
      expect(c.z, 'cell should carry a number format').toBeTruthy();
      expect(XLSX.SSF.is_date(String(c.z))).toBe(true);
    }
  });

  it.each(EXTS)('layout A (.%s): cellDates:true decodes them as Date objects', (ext) => {
    const name = 'layout-a-serial-dates';
    const cells = dateCells(firstSheet(read(name, ext, true)), junkOf(name));
    expect(cells.length).toBe(bodyRows(name));
    for (const c of cells) {
      expect(c.t).toBe('d');
      expect(c.v).toBeInstanceOf(Date);
    }
  });

  it.each(EXTS)('layout B (.%s): cellDates:true decodes Date cells', (ext) => {
    const name = 'layout-b-date-cells';
    const cells = dateCells(firstSheet(read(name, ext, true)), junkOf(name));
    expect(cells.length).toBe(bodyRows(name));
    for (const c of cells) {
      expect(c.t).toBe('d');
      expect(c.v).toBeInstanceOf(Date);
    }
  });

  it.each(EXTS)('layout B (.%s): raw cells are date-formatted', (ext) => {
    // With cellDates:false SheetJS reports an Excel_Date_Cell as a number
    // with a date number format (t:'n' + date z), which is how both file
    // formats store it on disk.
    const name = 'layout-b-date-cells';
    const cells = dateCells(firstSheet(read(name, ext, false)), junkOf(name));
    expect(cells.length).toBe(bodyRows(name));
    for (const c of cells) {
      expect(['n', 'd']).toContain(c.t);
      expect(XLSX.SSF.is_date(String(c.z))).toBe(true);
    }
  });
});
