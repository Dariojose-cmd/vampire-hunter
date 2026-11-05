/**
 * Property-based tests for the full detection pipeline (src/engine/index.ts).
 *
 * Home for the numbered design Properties:
 *  - Property 8: Avatar Determinism
 *  - Property 3: Order Independence
 *  - Property 4: No-Singleton Rule
 *  - Property 5: Credit Exclusion
 *
 * `runDetection` is called directly so these exercise the real end-to-end
 * pipeline (credit filter → normalize → group/cluster → cadence → score →
 * split). All properties run with { numRuns: 1000 }.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { runDetection } from '../src/engine/index';
import { generateAvatar } from '../src/engine/profileBuilder';
import type { Transaction, Vampire } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Bank-like transaction generator
// ---------------------------------------------------------------------------

/** A pool of realistic merchant descriptions to drive grouping. */
const MERCHANTS = [
  'NETFLIX.COM',
  'SPOTIFY USA',
  'DISNEY PLUS',
  'AMAZON PRIME',
  'APPLE.COM/BILL',
  'HULU',
  'DROPBOX',
  'GITHUB.COM',
  'YOUTUBE PREMIUM',
  'ADOBE CREATIVE CLOUD',
  'WALMART GROCERY',
  'STARBUCKS #1234',
];

/** Build a valid ISO 8601 YYYY-MM-DD date from bounded components. */
function toIsoDate(year: number, month: number, day: number): string {
  // Clamp the day to the last valid day of the month so the string is always
  // a real calendar date (handles Feb and 30-day months).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  const yyyy = year.toString().padStart(4, '0');
  const mm = month.toString().padStart(2, '0');
  const dd = d.toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Arbitrary producing a single bank-like Transaction matching types.ts. */
const arbitraryTransaction: fc.Arbitrary<Transaction> = fc
  .record({
    id: fc.string({
      unit: fc.constantFrom(...'0123456789abcdef'.split('')),
      minLength: 4,
      maxLength: 12,
    }),
    year: fc.integer({ min: 2020, max: 2026 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    description: fc.constantFrom(...MERCHANTS),
    amountCents: fc.integer({ min: 1, max: 5_000_00 }),
    type: fc.constantFrom<Transaction['type']>('debit', 'credit'),
  })
  .map((r) => {
    const date = toIsoDate(r.year, r.month, r.day);
    return {
      id: r.id,
      date,
      description: r.description,
      // runDetection re-normalizes this from `description`, so the value here
      // is irrelevant — we mirror the description for clarity.
      normalizedName: r.description,
      amountCents: r.amountCents,
      type: r.type,
      currency: 'USD',
    } satisfies Transaction;
  });

/** Collect ids from both result lists, sorted for order-independent comparison. */
function allVampireIds(result: {
  vampires: Vampire[];
  possibleVampires: Vampire[];
}): string[] {
  return [...result.vampires, ...result.possibleVampires]
    .map((v) => v.id)
    .sort();
}

// ---------------------------------------------------------------------------
// Property 8: Avatar Determinism
// ---------------------------------------------------------------------------

// Property 8: Avatar Determinism — Validates: Requirements 6.5
describe('Property 8: Avatar Determinism', () => {
  it('generateAvatar returns identical output for identical input', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (name) => {
        expect(generateAvatar(name)).toBe(generateAvatar(name));
      }),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Order Independence
// ---------------------------------------------------------------------------

// Property 3: Order Independence — Validates: Requirements 4.8
describe('Property 3: Order Independence', () => {
  it('runDetection yields the same vampire ids regardless of input order', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryTransaction, { minLength: 0, maxLength: 40 }),
        (transactions) => {
          const original = runDetection({ transactions, currency: 'USD' });
          // A second, independent ordering of the SAME multiset.
          const shuffled = [...transactions].reverse();
          const reordered = runDetection({ transactions: shuffled, currency: 'USD' });
          expect(allVampireIds(reordered)).toEqual(allVampireIds(original));
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: No-Singleton Rule
// ---------------------------------------------------------------------------

// Property 4: No-Singleton Rule — Validates: Requirements 4.3, 4.9
describe('Property 4: No-Singleton Rule', () => {
  it('a lone debit transaction is never detected as recurring', () => {
    fc.assert(
      fc.property(arbitraryTransaction, (tx) => {
        const debit: Transaction = { ...tx, type: 'debit' };
        const result = runDetection({ transactions: [debit], currency: 'USD' });
        expect(result.vampires.length).toBe(0);
        expect(result.possibleVampires.length).toBe(0);
      }),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Credit Exclusion
// ---------------------------------------------------------------------------

// Property 5: Credit Exclusion — Validates: Requirements 1.17, 4.10
describe('Property 5: Credit Exclusion', () => {
  it('no detected bite is ever a credit transaction', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryTransaction, { minLength: 1, maxLength: 40 }),
        (transactions) => {
          const withCredit: Transaction[] = [
            { ...transactions[0], type: 'credit' },
            ...transactions.slice(1),
          ];
          const result = runDetection({ transactions: withCredit, currency: 'USD' });
          for (const vampire of [...result.vampires, ...result.possibleVampires]) {
            for (const bite of vampire.bites) {
              expect(bite.type).not.toBe('credit');
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
