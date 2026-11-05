/**
 * Property-based tests for src/engine/grouper.ts
 *
 * Covers design property 12:
 *   12a — Interleaved series → two vampires
 *   12b — Sequential price step → one vampire with hasPriceIncrease
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildCandidates } from '../src/engine/grouper';
import type { Transaction } from '../src/engine/types';

const MS_PER_DAY = 86_400_000;

let seq = 0;

/**
 * Build a debit transaction for a merchant. Grouping keys off `normalizedName`,
 * so the merchant name is set there. `ms` is converted to an ISO date.
 */
function makeDebit(merchant: string, amountCents: number, ms: number): Transaction {
  const date = new Date(ms).toISOString().slice(0, 10);
  return {
    id: `tx-${seq++}`,
    date,
    description: merchant,
    normalizedName: merchant,
    amountCents,
    type: 'debit',
    currency: 'USD',
  };
}

/** Count how many candidate clusters belong to a given merchant. */
function clustersForMerchant(
  entries: Array<{ id: string; candidate: { normalizedName: string } }>,
  merchant: string,
) {
  return entries.filter((e) => e.candidate.normalizedName === merchant);
}

// Feature: vampire-hunter, Property 12a: Interleaved series → two vampires
describe('Property 12a: Interleaved series → two vampires', () => {
  it('interleaved different-amount charges from one merchant yield exactly 2 candidates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 50_000 }),
        fc.integer({ min: 2, max: 6 }),
        (amountA, n) => {
          const amountB = Math.round(amountA * 2.5); // clearly different (>10%)
          const merchant = 'APPLE.COM BILL';
          const startMs = new Date('2023-01-01').getTime();
          const transactions: Transaction[] = [];
          for (let i = 0; i < n; i++) {
            transactions.push(makeDebit(merchant, amountA, startMs + i * 30 * MS_PER_DAY));
            transactions.push(
              makeDebit(merchant, amountB, startMs + i * 30 * MS_PER_DAY + 4 * MS_PER_DAY),
            );
          }
          const entries = buildCandidates(transactions);
          const merchantClusters = clustersForMerchant(entries, merchant);
          expect(merchantClusters.length).toBe(2);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// Feature: vampire-hunter, Property 12b: Sequential price step → one vampire w/ hasPriceIncrease
describe('Property 12b: Sequential price step → one vampire with hasPriceIncrease', () => {
  it('a price step series from one merchant yields exactly 1 candidate with hasPriceIncrease', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 50_000 }),
        fc.float({ min: Math.fround(0.02), max: Math.fround(0.5), noNaN: true }),
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 2, max: 6 }),
        (amountA, stepFraction, n, m) => {
          // amountB is at least a 2% step above amountA (the product threshold
          // for a sustained price increase) and no more than 50% above it.
          // Compute the ≥2% floor and the ≤50% ceiling in integer cents.
          const lowerB = Math.max(Math.ceil(amountA * 1.02), amountA + 1);
          const upperB = Math.floor(amountA * 1.5);

          // For very tiny amounts the ≥2% floor can exceed the ≤50% ceiling;
          // there is no valid step in range, so skip that degenerate case.
          fc.pre(lowerB <= upperB);

          const amountB = Math.min(
            Math.max(lowerB, amountA + Math.round(amountA * stepFraction)),
            upperB,
          );

          // Step must be a real ≥2% rise within the ≤50% window.
          fc.pre(amountB >= lowerB && amountB <= upperB);

          const merchant = 'NETFLIX';
          const startMs = new Date('2023-01-01').getTime();
          const transactions: Transaction[] = [
            ...Array.from({ length: n }, (_, i) =>
              makeDebit(merchant, amountA, startMs + i * 30 * MS_PER_DAY),
            ),
            ...Array.from({ length: m }, (_, j) =>
              makeDebit(merchant, amountB, startMs + (n + j) * 30 * MS_PER_DAY),
            ),
          ];

          const entries = buildCandidates(transactions);
          const merchantClusters = clustersForMerchant(entries, merchant);
          expect(merchantClusters.length).toBe(1);
          expect(merchantClusters[0].candidate.hasPriceIncrease).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
