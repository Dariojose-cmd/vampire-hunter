/**
 * Bug condition exploration: bank-format-parser-fixes.
 *
 * These properties are scoped to the failing cases and are EXPECTED TO FAIL on
 * the unfixed engine. Each failure is a counterexample proving the bug.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { detectColumns, inferDateFormat, parseDate } from '../src/engine/parser';
import { parseStatement, runDetection, VAMPIRE_THRESHOLD } from '../src/engine/index';
import type { Transaction } from '../src/engine/types';

const pad2 = (n: number): string => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Nonsense two-word names that cannot match the known-services catalog. */
const syllable = fc.constantFrom('zor', 'blax', 'quin', 'dle', 'vrum', 'plok', 'xyl', 'wump', 'jixt', 'krel');
const nonsenseWord = fc
  .array(syllable, { minLength: 2, maxLength: 3 })
  .map((parts) => parts.join(''));
const merchantName = fc
  .tuple(nonsenseWord, nonsenseWord)
  .map(([a, b]) => `${a.charAt(0).toUpperCase()}${a.slice(1)} ${b.charAt(0).toUpperCase()}${b.slice(1)}`);

/** A valid calendar date (years 2000-2099, days capped to 28 for simplicity). */
const validDate = fc.record({
  y: fc.integer({ min: 2000, max: 2099 }),
  m: fc.integer({ min: 1, max: 12 }),
  d: fc.integer({ min: 1, max: 28 }),
});

// ---------------------------------------------------------------------------
// 1. Income is never a vampire (ING-style statements)
// ---------------------------------------------------------------------------

describe('bug condition: income is never a vampire', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
   */
  it('recurring "Bij" rows never reach vampires or possibleVampires', () => {
    const headers = ['Datum', 'Naam / Omschrijving', 'Af Bij', 'Bedrag (EUR)'];
    fc.assert(
      fc.property(
        merchantName,
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 500, max: 500000 }),
        (merchant, months, day, cents) => {
          const amount = `${Math.floor(cents / 100)},${pad2(cents % 100)}`;
          const rows: string[][] = [];
          for (let i = 0; i < months; i++) {
            const month = (i % 12) + 1;
            rows.push([`2025${pad2(month)}${pad2(day)}`, merchant, 'Bij', amount]);
          }

          const parsed = parseStatement(headers, rows);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;

          const { transactions, currency } = parsed.value;
          const { vampires, possibleVampires } = runDetection({ transactions, currency });
          const key = merchant.toLowerCase().replace(/[^a-z]/g, '');
          const hits = [...vampires, ...possibleVampires].filter((v) =>
            [v.displayName, v.normalizedName, ...v.bites.map((b) => b.description)].some((h) =>
              h.toLowerCase().replace(/[^a-z]/g, '').includes(key),
            ),
          );
          expect(hits).toHaveLength(0);
        },
      ),
      { numRuns: 25 },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Header synonyms
// ---------------------------------------------------------------------------

describe('bug condition: header synonyms', () => {
  const descWords = ['lançamento', 'lancamento', 'histórico', 'historico', 'omschrijving', 'naam'];
  const amountWords = ['bedrag', 'valor'];

  /**
   * **Validates: Requirements 2.1, 2.2**
   */
  it('new description and amount words resolve to a layout', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...descWords),
        fc.constantFrom(...amountWords),
        fc.constantFrom('', ' (EUR)', ' (R$)'),
        (descWord, amountWord, suffix) => {
          const headers = ['data', descWord, `${amountWord}${suffix}`];
          const rows = [['2025-01-03', 'Alguma Coisa', '-12,50']];
          const result = detectColumns(headers, rows);
          expect('code' in result).toBe(false);
          if (!('code' in result)) {
            expect(result.descCol).toBe(1);
          }
        },
      ),
    );
  });

  it('"Naam / Omschrijving" and "Bedrag (EUR)" resolve (ING headers)', () => {
    const result = detectColumns(
      ['Datum', 'Naam / Omschrijving', 'Bedrag (EUR)'],
      [['2025-01-03', 'Netflix', '13,99']],
    );
    expect('code' in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Description fallback: widest text column
// ---------------------------------------------------------------------------

describe('bug condition: description fallback', () => {
  /**
   * **Validates: Requirements 2.3**
   */
  it('picks the widest text column when no description keyword matches', () => {
    fc.assert(
      fc.property(
        merchantName,
        fc.constantFrom('movimiento', 'operacion', 'referencia'),
        (merchant, wideHeader) => {
          // Date + short code + wide text + amount; no description keyword.
          const headers = ['fecha', 'ref', wideHeader, 'importe'];
          const rows = [
            ['2025-01-03', 'A1', `${merchant} compra tarjeta debito`, '-12.50'],
            ['2025-02-03', 'B2', `${merchant} compra tarjeta debito`, '-12.50'],
            ['2025-03-03', 'C3', `${merchant} compra tarjeta debito`, '-12.50'],
          ];
          const result = detectColumns(headers, rows);
          expect('code' in result).toBe(false);
          if (!('code' in result)) {
            expect(result.descCol).toBe(2);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Compact dates
// ---------------------------------------------------------------------------

describe('bug condition: compact YYYYMMDD dates', () => {
  /**
   * **Validates: Requirements 2.4**
   */
  it('inferDateFormat gives YYYY-MM-DD and parseDate returns the ISO string', () => {
    fc.assert(
      fc.property(fc.array(validDate, { minLength: 1, maxLength: 10 }), (dates) => {
        const compact = dates.map(({ y, m, d }) => `${y}${pad2(m)}${pad2(d)}`);
        expect(inferDateFormat(compact)).toBe('YYYY-MM-DD');
        dates.forEach(({ y, m, d }, i) => {
          const r = parseDate(compact[i], 'YYYY-MM-DD');
          expect(r).toEqual({ ok: true, value: `${y}-${pad2(m)}-${pad2(d)}` });
        });
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. 2-bite cap
// ---------------------------------------------------------------------------

describe('bug condition: 2-bite candidates without a catalog match', () => {
  const buckets: Array<[number, number]> = [
    [5, 9], // weekly
    [26, 35], // monthly
    [85, 97], // quarterly
    [355, 375], // yearly
  ];

  const addDays = (iso: string, days: number): string => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  /**
   * **Validates: Requirements 2.6, 2.7**
   */
  it('scores at most 59 and is never a vampire', () => {
    fc.assert(
      fc.property(
        merchantName,
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 100, max: 100000 }),
        fc.integer({ min: 0, max: 364 }),
        (merchant, bucketIdx, gapSeed, cents, startOffset) => {
          const [lo, hi] = buckets[bucketIdx];
          const gap = lo + (gapSeed % (hi - lo + 1));
          const first = addDays('2024-01-01', startOffset);
          const second = addDays(first, gap);
          const transactions: Transaction[] = [first, second].map((date, i) => ({
            id: `${i}-x`,
            date,
            description: merchant,
            normalizedName: '',
            amountCents: cents,
            type: 'debit',
            currency: 'USD',
          }));

          const { vampires, possibleVampires } = runDetection({ transactions, currency: 'USD' });
          const all = [...vampires, ...possibleVampires];
          for (const v of all) {
            expect(v.confidenceScore).toBeLessThanOrEqual(VAMPIRE_THRESHOLD - 1);
          }
          expect(vampires).toHaveLength(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});
