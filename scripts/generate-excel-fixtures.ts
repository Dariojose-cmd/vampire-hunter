/**
 * Fixture_Generator: writes synthetic bank statements as .xlsx, .xls and .csv
 * into tests/fixtures/excel/ (or into the directory given as the first CLI
 * argument). All data is hard-coded and fake; there is no randomness.
 *
 * Usage: npm run generate:excel-fixtures [outputDir]
 *
 * Runs under Node's native type stripping: erasable TypeScript syntax only and
 * explicit .ts extensions on relative imports.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';

export type FixtureCell = string | number | Date | null;

export interface FixtureLayout {
  /** File base name, without extension. */
  name: string;
  /** Rows exactly as written to the worksheet (Junk_Rows included). */
  aoa: FixtureCell[][];
  /** Equivalent CSV text (ISO dates, dot-decimal amounts). */
  csv: string;
  /** 0-based column index holding dates. */
  dateColumn: number;
  /** How the date column is stored in the workbook. */
  dateKind: 'serial' | 'date';
  /** Number of rows above the header row. */
  junkRows: number;
}

type Charge = { day: number; description: string; amount: number };

const MONTHS: ReadonlyArray<readonly [number, number]> = [
  [2024, 1],
  [2024, 2],
  [2024, 3],
  [2024, 4],
  [2024, 5],
  [2024, 6],
];

const SUBSCRIPTIONS: readonly Charge[] = [
  { day: 5, description: 'NETFLIX.COM', amount: 15.49 },
  { day: 12, description: 'SPOTIFY P1A2B3', amount: 10.99 },
  { day: 1, description: 'IRON TEMPLE GYM', amount: 29.99 },
];

const ONE_OFFS: ReadonlyArray<Charge & { month: number }> = [
  { month: 1, day: 9, description: 'GROCERY MART 114', amount: 54.12 },
  { month: 2, day: 17, description: 'SHELL STATION 22', amount: 38.4 },
  { month: 3, day: 21, description: 'PIZZA PALACE', amount: 22.75 },
  { month: 4, day: 3, description: 'HARDWARE DEPOT', amount: 87.6 },
  { month: 5, day: 25, description: 'BOOKSHOP CORNER', amount: 18.0 },
  { month: 6, day: 14, description: 'CINEMA CITY', amount: 24.5 },
];

const PAYCHECKS: ReadonlyArray<{ month: number; day: number; amount: number }> = [
  { month: 1, day: 28, amount: 2400 },
  { month: 3, day: 28, amount: 2400 },
  { month: 5, day: 28, amount: 2400 },
];

interface Entry {
  iso: string;
  description: string;
  /** Positive = money out (charge), negative = money in. */
  amount: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildEntries(): Entry[] {
  const entries: Entry[] = [];
  for (const [year, month] of MONTHS) {
    for (const s of SUBSCRIPTIONS) {
      entries.push({
        iso: `${year}-${pad(month)}-${pad(s.day)}`,
        description: s.description,
        amount: s.amount,
      });
    }
  }
  for (const o of ONE_OFFS) {
    entries.push({ iso: `2024-${pad(o.month)}-${pad(o.day)}`, description: o.description, amount: o.amount });
  }
  for (const p of PAYCHECKS) {
    entries.push({ iso: `2024-${pad(p.month)}-${pad(p.day)}`, description: 'ACME PAYROLL', amount: -p.amount });
  }
  // Stable chronological order (ISO strings sort lexicographically).
  return entries.sort((a, b) =>
    a.iso === b.iso ? (a.description < b.description ? -1 : 1) : a.iso < b.iso ? -1 : 1,
  );
}

function isoToUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Excel serial (1900 date system) for an ISO date. */
function isoToSerial(iso: string): number {
  return Math.round((isoToUtcDate(iso).getTime() - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function money(n: number): string {
  return n.toFixed(2);
}

function csvField(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}

function layoutA(entries: Entry[]): FixtureLayout {
  const junk: FixtureCell[][] = [
    ['Statement of Account - Example Bank'],
    [],
    ['Account number: 0000-1234-5678'],
  ];
  const header = ['Date', 'Description', 'Amount'];
  const body = entries.map((e) => [isoToSerial(e.iso), e.description, -e.amount] as FixtureCell[]);
  const csvRows: string[][] = [
    ['Statement of Account - Example Bank', '', ''],
    ['', '', ''],
    ['Account number: 0000-1234-5678', '', ''],
    header,
    ...entries.map((e) => [e.iso, e.description, money(-e.amount)]),
  ];
  return {
    name: 'layout-a-serial-dates',
    aoa: [...junk, header, ...body],
    csv: toCsv(csvRows),
    dateColumn: 0,
    dateKind: 'serial',
    junkRows: junk.length,
  };
}

function layoutB(entries: Entry[]): FixtureLayout {
  const header = ['Date', 'Description', 'Debit', 'Credit'];
  const body = entries.map(
    (e) =>
      [
        isoToUtcDate(e.iso),
        e.description,
        e.amount > 0 ? e.amount : null,
        e.amount < 0 ? -e.amount : null,
      ] as FixtureCell[],
  );
  const csvRows: string[][] = [
    header,
    ...entries.map((e) => [
      e.iso,
      e.description,
      e.amount > 0 ? money(e.amount) : '',
      e.amount < 0 ? money(-e.amount) : '',
    ]),
  ];
  return {
    name: 'layout-b-date-cells',
    aoa: [header, ...body],
    csv: toCsv(csvRows),
    dateColumn: 0,
    dateKind: 'date',
    junkRows: 0,
  };
}

/** Pure: returns the row data for every fixture layout. */
export function generateFixtures(): FixtureLayout[] {
  const entries = buildEntries();
  return [layoutA(entries), layoutB(entries)];
}

function buildSheet(layout: FixtureLayout): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(layout.aoa, { cellDates: true, UTC: true });
  const firstDataRow = layout.junkRows + 1;
  for (let r = firstDataRow; r < layout.aoa.length; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: layout.dateColumn })];
    if (!cell) continue;
    if (layout.dateKind === 'serial') {
      cell.t = 'n';
    } else {
      cell.t = 'd';
    }
    cell.z = 'yyyy-mm-dd';
  }
  return sheet;
}

function main(): void {
  const outDir = resolve(
    process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'excel'),
  );
  mkdirSync(outDir, { recursive: true });
  for (const layout of generateFixtures()) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, buildSheet(layout), 'Statement');
    for (const ext of ['xlsx', 'xls'] as const) {
      const bytes = XLSX.write(book, { type: 'buffer', bookType: ext, cellDates: true }) as Uint8Array;
      writeFileSync(resolve(outDir, `${layout.name}.${ext}`), bytes);
    }
    writeFileSync(resolve(outDir, `${layout.name}.csv`), layout.csv, 'utf8');
  }
  console.log(`Wrote fixtures to ${outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
