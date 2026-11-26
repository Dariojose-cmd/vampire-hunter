/**
 * Feature: excel-statement-support
 * Property 2: Excel and CSV built from the same rows produce identical
 * detection results
 *
 * **Validates: Requirements 3.1, 3.2, 8.11**
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../src/engine/excelReader';
import { locateHeader } from '../src/engine/headerLocator';
import { parseCsvText } from '../src/components/csvUtils';
import { parseStatement, runDetection } from '../src/engine/index';

const HEADER = ['Date', 'Description', 'Amount'];
const MERCHANTS = ['NETFLIX', 'SPOTIFY', 'GYM CITY', 'CLOUD STORAGE', 'NEWS DAILY'];
const ONE_OFFS = ['GROCERY MART', 'PHARMACY 24', 'TAXI RIDE', 'BOOKSHOP'];

interface Row {
  iso: string;
  description: string;
  cents: number; // positive magnitude; charges are negative
}

const pad = (n: number): string => String(n).padStart(2, '0');

function serialOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000 + 25_569;
}

function amountText(cents: number): string {
  return `-${Math.floor(cents / 100)}.${pad(cents % 100)}`;
}

const statementRows: fc.Arbitrary<Row[]> = fc
  .tuple(
    fc.shuffledSubarray(MERCHANTS, { minLength: 1, maxLength: 3 }),
    fc.array(fc.integer({ min: 199, max: 9999 }), { minLength: 3, maxLength: 3 }),
    fc.integer({ min: 4, max: 6 }),
    fc.integer({ min: 1, max: 28 }),
    fc.array(
      fc.record({
        name: fc.constantFrom(...ONE_OFFS),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
        cents: fc.integer({ min: 100, max: 50_000 }),
      }),
      { minLength: 0, maxLength: 4 },
    ),
  )
  .map(([merchants, cents, count, day, oneOffs]) => {
    const rows: Row[] = [];
    merchants.forEach((m, mi) => {
      for (let k = 0; k < count; k++) {
        rows.push({ iso: `2024-${pad(k + 1)}-${pad(day)}`, description: m, cents: cents[mi] });
      }
    });
    for (const o of oneOffs) {
      rows.push({
        iso: `2024-${pad(o.month)}-${pad(o.day)}`,
        description: o.name,
        cents: o.cents,
      });
    }
    return rows;
  });

function buildCsv(rows: Row[]): string {
  const lines = [HEADER.join(',')];
  for (const r of rows) lines.push([r.iso, r.description, amountText(r.cents)].join(','));
  return lines.join('\n') + '\n';
}

function buildXlsx(rows: Row[], dateStyle: 'formatted' | 'unformatted'): ArrayBuffer {
  const ws: XLSX.WorkSheet = {};
  HEADER.forEach((h, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: h };
  });
  rows.forEach((r, i) => {
    const R = i + 1;
    ws[XLSX.utils.encode_cell({ r: R, c: 0 })] =
      dateStyle === 'formatted'
        ? { t: 'n', v: serialOf(r.iso), z: 'yyyy-mm-dd' }
        : { t: 'n', v: serialOf(r.iso) };
    ws[XLSX.utils.encode_cell({ r: R, c: 1 })] = { t: 's', v: r.description };
    ws[XLSX.utils.encode_cell({ r: R, c: 2 })] = { t: 'n', v: -r.cents / 100 };
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: 2 } });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function run(csvText: string) {
  const { headers, rows } = parseCsvText(csvText);
  const loc = locateHeader([headers, ...rows]);
  const parsed = parseStatement(loc.headers, loc.rows);
  if (!parsed.ok) return { ok: false as const, code: parsed.error.code };
  const result = runDetection({
    transactions: parsed.value.transactions,
    currency: parsed.value.currency,
  });
  const summarize = (list: typeof result.vampires) =>
    list.map((v) => ({
      id: v.id,
      median: v.medianAmountCents,
      annual: v.annualBloodLossCents,
      bites: v.bites.map((b) => b.amountCents),
    }));
  return {
    ok: true as const,
    vampires: summarize(result.vampires),
    possible: summarize(result.possibleVampires),
  };
}

describe('Property 2: Excel and CSV built from the same rows produce identical detection results', () => {
  it('sanity: the generated statements yield vampires', () => {
    const rows: Row[] = [];
    for (let k = 1; k <= 5; k++) rows.push({ iso: `2024-${pad(k)}-05`, description: 'NETFLIX', cents: 1599 });
    const r = run(buildCsv(rows));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vampires.length).toBeGreaterThan(0);
  });

  it('same vampires, ids, cent amounts and annual blood loss', async () => {
    let withVampires = 0;
    await fc.assert(
      fc.asyncProperty(
        statementRows,
        fc.constantFrom<'formatted' | 'unformatted'>('formatted', 'unformatted'),
        async (rows, dateStyle) => {
          const fromCsv = run(buildCsv(rows));

          const wb = await readWorkbook(buildXlsx(rows, dateStyle));
          expect(wb.ok).toBe(true);
          if (!wb.ok) return;
          const fromXlsx = run(wb.csvText);

          expect(fromXlsx).toEqual(fromCsv);
          if (fromCsv.ok && fromCsv.vampires.length > 0) withVampires++;
        },
      ),
      { numRuns: 100 },
    );
    expect(withVampires).toBeGreaterThan(0);
  });
});
