import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../src/engine/excelReader';

/**
 * Property 4: Excel date conversion is stable across process timezone and
 * matches Excel's displayed calendar date.
 *
 * **Validates: Requirements 3.3, 3.4, 3.5, 3.12, 8.12**
 */

const MS_PER_DAY = 86_400_000;
const EPOCH_MS = Date.UTC(1899, 11, 30);
// Serial 32874 = 1990-01-01, 73415 = 2100-01-01 (inside the Plausible_Serial range).
const MIN_SERIAL = 32_874;
const MAX_SERIAL = 73_050;

const ZONES = ['Etc/GMT+12', 'UTC', 'Etc/GMT-14'] as const; // UTC-12, UTC+0, UTC+14

type Kind = 'formatted' | 'dateCell' | 'plain';
type Fmt = 'xlsx' | 'biff8';
interface RowSpec {
  serial: number;
  kind: Kind;
  cents: number;
}

/** Days since 1899-12-30 -> civil date, pure integer arithmetic (Hinnant's algorithm). */
function civilFromDays(days: number): string {
  // 1899-12-30 is day -25569 relative to 1970-01-01.
  const z = days - 25_569 + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function amountText(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function expectedCsv(header: string, rows: RowSpec[]): string {
  const lines = [`${header},Description,Amount`];
  rows.forEach((r, i) => {
    lines.push(`${civilFromDays(r.serial)},SHOP ${i},${amountText(r.cents)}`);
  });
  return lines.join('\n');
}

function buildBytes(fmt: Fmt, header: string, rows: RowSpec[]): ArrayBuffer {
  const ws: XLSX.WorkSheet = {};
  const put = (r: number, c: number, cell: XLSX.CellObject) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
  };
  put(0, 0, { t: 's', v: header });
  put(0, 1, { t: 's', v: 'Description' });
  put(0, 2, { t: 's', v: 'Amount' });
  rows.forEach((row, i) => {
    const r = i + 1;
    if (row.kind === 'formatted') {
      put(r, 0, { t: 'n', v: row.serial, z: 'yyyy-mm-dd' });
    } else if (row.kind === 'dateCell') {
      put(r, 0, { t: 'd', v: new Date(EPOCH_MS + row.serial * MS_PER_DAY), z: 'yyyy-mm-dd' });
    } else {
      put(r, 0, { t: 'n', v: row.serial });
    }
    put(r, 1, { t: 's', v: `SHOP ${i}` });
    put(r, 2, { t: 'n', v: row.cents / 100 });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: 2 } });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S1');
  return XLSX.write(wb, { type: 'array', bookType: fmt, cellDates: true }) as ArrayBuffer;
}

async function withTz<T>(zone: string, fn: () => Promise<T> | T): Promise<T> {
  const original = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

async function readCsv(bytes: ArrayBuffer): Promise<string> {
  const res = await readWorkbook(bytes);
  if (!res.ok) throw new Error(`readWorkbook failed: ${res.error.message}`);
  return res.csvText;
}

const rowArb: fc.Arbitrary<RowSpec> = fc.record({
  serial: fc.integer({ min: MIN_SERIAL, max: MAX_SERIAL }),
  kind: fc.constantFrom<Kind>('formatted', 'dateCell', 'plain'),
  cents: fc.integer({ min: -500_000, max: 500_000 }),
});

describe('Property 4: Excel dates are timezone-stable and match the calendar date', () => {
  it('timezone switching really changes the local offset (non-vacuous)', async () => {
    const offsets: number[] = [];
    for (const zone of ZONES) {
      offsets.push(await withTz(zone, () => new Date(2024, 0, 1).getTimezoneOffset()));
    }
    expect(offsets).toEqual([720, 0, -840]);
  });

  it('reads identical, correct dates in .xlsx and .xls under UTC-12, UTC+0 and UTC+14', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Fmt>('xlsx', 'biff8'),
        fc.constantFrom('Date', 'Fecha'),
        fc.array(rowArb, { minLength: 1, maxLength: 8 }),
        async (fmt, header, rows) => {
          const expected = expectedCsv(header, rows);

          // Workbook built once in a neutral zone, read under every zone.
          const bytes = await withTz('UTC', () => buildBytes(fmt, header, rows));
          for (const zone of ZONES) {
            const csv = await withTz(zone, () => readCsv(bytes));
            expect(csv).toBe(expected);
          }

          // Workbook also built in each zone, then read in that same zone.
          for (const zone of ZONES) {
            const csv = await withTz(zone, () => readCsv(buildBytes(fmt, header, rows)));
            expect(csv).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
