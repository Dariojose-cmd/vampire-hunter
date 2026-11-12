import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { buildCandidates, isStepLikeIncrease, MAX_PRICE_STEPS } from '../src/engine/grouper';
import type { Transaction } from '../src/engine/types';

describe('isStepLikeIncrease', () => {
  it('accepts a single 20% step', () => {
    expect(isStepLikeIncrease([1000, 1000, 1000, 1200, 1200])).toBe(true);
  });
  it('accepts two steps, rejects three', () => {
    expect(isStepLikeIncrease([1000, 1200, 1200, 1400])).toBe(true);
    expect(isStepLikeIncrease([1000, 1200, 1400, 1600])).toBe(false);
  });
  it('rejects a step larger than 40%', () => {
    expect(isStepLikeIncrease([1000, 1000, 1500])).toBe(false);
  });
  it('rejects the Whole Foods style steady climb', () => {
    expect(isStepLikeIncrease([4715, 5425, 6135, 6845, 7555, 8265])).toBe(false);
  });

  it('property: steady climb of >2 steps is never step-like', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 100000 }),
        fc.integer({ min: 5, max: 40 }),
        fc.integer({ min: 3, max: 12 }),
        (start, pct, n) => {
          const amounts: number[] = [start];
          for (let i = 1; i <= n; i++) {
            amounts.push(Math.ceil((amounts[i - 1] * (100 + pct)) / 100));
          }
          expect(isStepLikeIncrease(amounts)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('property: at most 2 steps, each <= 40%, is step-like', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 100000 }),
        fc.array(fc.integer({ min: 5, max: 40 }), { minLength: 0, maxLength: MAX_PRICE_STEPS }),
        fc.integer({ min: 1, max: 5 }),
        (start, pcts, hold) => {
          const amounts: number[] = Array(hold).fill(start);
          let cur = start;
          for (const pct of pcts) {
            cur = Math.floor((cur * (100 + pct)) / 100);
            if (cur === amounts[amounts.length - 1]) continue;
            for (let i = 0; i < hold; i++) amounts.push(cur);
          }
          expect(isStepLikeIncrease(amounts)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('runDetection: price-increase merge', () => {
  const tx = (date: string, cents: number, i: number): Transaction => ({
    id: `t${i}`,
    date,
    description: 'WHOLE FOODS MARKET',
    normalizedName: 'WHOLE FOODS MARKET',
    amountCents: cents,
    type: 'debit',
    currency: 'USD',
  });

  it('never price-increase-merges a monthly steadily-rising merchant', () => {
    const amounts = [4715, 5425, 6135, 6845, 7555, 8265];
    const transactions = amounts.map((c, i) => tx(`2026-0${i + 1}-20`, c, i));
    const entries = buildCandidates(transactions);
    expect(entries.length).toBeGreaterThan(1);
    // No candidate may span the whole climb (the old behaviour merged all six).
    for (const e of entries) {
      expect(e.candidate.bites.length).toBeLessThanOrEqual(2);
    }
  });

  it('still merges a single genuine price step', () => {
    const amounts = [1000, 1000, 1000, 1200, 1200, 1200];
    const transactions = amounts.map((c, i) => tx(`2026-0${i + 1}-20`, c, i));
    const entries = buildCandidates(transactions);
    expect(entries).toHaveLength(1);
    expect(entries[0].candidate.hasPriceIncrease).toBe(true);
  });

  it('property: a monthly climb of >2 steps never yields hasPriceIncrease', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 50000 }),
        fc.integer({ min: 25, max: 40 }),
        fc.integer({ min: 4, max: 11 }),
        (start, pct, n) => {
          const amounts = [start];
          for (let i = 1; i < n; i++) amounts.push(Math.ceil((amounts[i - 1] * (100 + pct)) / 100));
          const transactions = amounts.map((c, i) =>
            tx(`2026-${String(i + 1).padStart(2, '0')}-20`, c, i),
          );
          const entries = buildCandidates(transactions);
          expect(entries.some((e) => e.candidate.hasPriceIncrease)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
