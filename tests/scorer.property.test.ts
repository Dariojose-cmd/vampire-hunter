/**
 * Property-based tests for src/engine/scorer.ts
 *
 * Covers design property 6 (Confidence Score Range).
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeScore } from '../src/engine/scorer';
import type { Cadence, RecurrenceCandidate, Transaction } from '../src/engine/types';

const MS_PER_DAY = 86_400_000;

const CADENCES: Cadence[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

/**
 * Arbitrary for a single Transaction (a "bite").
 * `index` and `gapDays` drive the date so bites are chronologically ordered.
 */
function makeTx(index: number, gapDays: number, amountCents: number): Transaction {
  const startMs = new Date('2023-01-01').getTime();
  const date = new Date(startMs + index * gapDays * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  return {
    id: `tx-${index}`,
    date,
    description: 'TEST SERVICE',
    normalizedName: 'TEST SERVICE',
    amountCents,
    type: 'debit',
    currency: 'USD',
  };
}

/**
 * Arbitrary that produces a valid RecurrenceCandidate with varied bite counts,
 * dates, amounts, cadence and boolean flags.
 */
const arbitraryCandidate: fc.Arbitrary<RecurrenceCandidate> = fc
  .record({
    biteCount: fc.integer({ min: 0, max: 10 }),
    gapDays: fc.integer({ min: 1, max: 400 }),
    amounts: fc.array(fc.integer({ min: 0, max: 500_000 }), { minLength: 0, maxLength: 10 }),
    cadence: fc.constantFrom(...CADENCES),
    isAmountStable: fc.boolean(),
    hasFreeTrial: fc.boolean(),
    hasPriceIncrease: fc.boolean(),
    medianAmountCents: fc.integer({ min: 0, max: 500_000 }),
  })
  .map((r) => {
    const bites: Transaction[] = Array.from({ length: r.biteCount }, (_, i) =>
      makeTx(i, r.gapDays, r.amounts[i] ?? 999),
    );
    return {
      normalizedName: 'TEST SERVICE',
      bites,
      cadence: r.cadence,
      medianAmountCents: r.medianAmountCents,
      isAmountStable: r.isAmountStable,
      hasFreeTrial: r.hasFreeTrial,
      hasPriceIncrease: r.hasPriceIncrease,
      amountHistory: bites.map((b) => b.amountCents),
    } satisfies RecurrenceCandidate;
  });

// Feature: vampire-hunter, Property 6: Confidence Score Range
describe('Property 6: Confidence Score Range', () => {
  it('computeScore returns an integer in [0, 100] for any candidate', () => {
    fc.assert(
      fc.property(arbitraryCandidate, fc.boolean(), (candidate, hasCatalogMatch) => {
        const score = computeScore(candidate, hasCatalogMatch);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 1000 },
    );
  });
});
