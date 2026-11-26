/**
 * Property-based test for junk-row invariance of the header locator pipeline.
 *
 * Feature: excel-statement-support, Property 8: Prepending Junk_Rows never
 * changes detection results
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.11**
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { locateHeader } from '../src/engine/headerLocator';
import { parseStatement, runDetection } from '../src/engine/index';

const HEADER = ['Date', 'Description', 'Amount'];

// Junk text pool: none of these words match date/description/amount keywords.
const JUNK_WORDS = [
  'Account Summary',
  'Holder Smith',
  'Branch 0042',
  'IBAN ES00 1234',
  'Printed report',
  'Overview',
  'Customer 77',
  'Bank of Nowhere',
];

const MERCHANTS = ['NETFLIX', 'SPOTIFY', 'GYM CITY', 'CLOUD STORAGE', 'NEWS DAILY'];

const junkWord = fc.constantFrom(...JUNK_WORDS);

const junkRow: fc.Arbitrary<string[]> = fc.oneof(
  fc.constant(['', '', '']), // blank
  fc.constant([] as string[]), // empty row
  junkWord.map((w) => [w]), // single cell
  fc.array(junkWord, { minLength: 2, maxLength: 4 }), // multi-cell
);

const pad = (n: number): string => String(n).padStart(2, '0');

/** 1-3 distinct merchants, each charged monthly 4-6 times at a fixed amount. */
const statementRows: fc.Arbitrary<string[][]> = fc
  .tuple(
    fc.shuffledSubarray(MERCHANTS, { minLength: 1, maxLength: 3 }),
    fc.array(fc.integer({ min: 199, max: 9999 }), { minLength: 3, maxLength: 3 }),
    fc.integer({ min: 4, max: 6 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([merchants, cents, count, day]) => {
    const rows: string[][] = [];
    merchants.forEach((m, mi) => {
      const c = cents[mi];
      const amount = `-${Math.floor(c / 100)}.${pad(c % 100)}`;
      for (let k = 0; k < count; k++) {
        rows.push([`2024-${pad(k + 1)}-${pad(day)}`, m, amount]);
      }
    });
    return rows;
  })
  .filter((rows) => rows.length > 0);

function run(grid: string[][]) {
  const loc = locateHeader(grid);
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

describe('Property 8: Prepending Junk_Rows never changes detection results', () => {
  it('same vampires, ids and cent amounts with 0-10 leading junk rows', () => {
    fc.assert(
      fc.property(
        statementRows,
        fc.array(junkRow, { minLength: 0, maxLength: 10 }),
        (rows, junk) => {
          const clean = [HEADER, ...rows];
          const dirty = [...junk, HEADER, ...rows];

          expect(locateHeader(dirty).headerRowIndex).toBe(junk.length);
          expect(run(dirty)).toEqual(run(clean));
        },
      ),
      { numRuns: 200 },
    );
  });
});
