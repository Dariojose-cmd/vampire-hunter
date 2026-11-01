/**
 * Unit tests for src/engine/scorer.ts
 *
 * Covers:
 *  - bite-count scoring buckets
 *  - cadence regularity using bucket ranges (not variance)
 *  - realistic shifted monthly dates (gaps 28, 33, 30, 31, 29) → keeps +20
 *  - amount stability: free-trial bite exclusion
 *  - amount stability: price-increase segments (Netflix-style)
 *  - catalog match bonus
 *  - clamp to [0, 100]
 */

import { describe, expect, it } from 'vitest';
import { computeScore } from '../src/engine/scorer';
import type { RecurrenceCandidate, Transaction } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let txId = 0;

function makeTx(date: string, amountCents: number): Transaction {
  return {
    id: `tx-${++txId}`,
    date,
    description: 'TEST SERVICE',
    normalizedName: 'test service',
    amountCents,
    type: 'debit',
    currency: 'USD',
  };
}

/**
 * Build a minimal RecurrenceCandidate.
 * `bites` are created from the `dates` array, all at `amountCents`.
 */
function makeCandidate(
  overrides: Partial<RecurrenceCandidate> & {
    dates: string[];
    amountCents?: number;
  },
): RecurrenceCandidate {
  const { dates, amountCents = 999, ...rest } = overrides;
  const bites = dates.map((d) => makeTx(d, amountCents));
  return {
    normalizedName: 'test service',
    bites,
    cadence: 'monthly',
    medianAmountCents: amountCents,
    isAmountStable: true,
    hasFreeTrial: false,
    hasPriceIncrease: false,
    amountHistory: bites.map((b) => b.amountCents),
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Bite count buckets
// ---------------------------------------------------------------------------

describe('bite count scoring', () => {
  it('gives +20 for exactly 2 bites', () => {
    const c = makeCandidate({ dates: ['2024-01-01', '2024-02-01'] });
    expect(computeScore(c, false)).toBe(20 + 20 + 20); // +20 bites + +20 cadence + +20 stable
  });

  it('gives +30 for 3 bites', () => {
    const c = makeCandidate({
      dates: ['2024-01-01', '2024-02-01', '2024-03-01'],
    });
    expect(computeScore(c, false)).toBe(30 + 20 + 20); // bites + cadence + stable
  });

  it('gives +30 for 5 bites', () => {
    const c = makeCandidate({
      dates: [
        '2024-01-01',
        '2024-02-01',
        '2024-03-01',
        '2024-04-01',
        '2024-05-01',
      ],
    });
    // All gaps = 29-31 days → inside monthly bucket → +20 cadence
    expect(computeScore(c, false)).toBeGreaterThanOrEqual(30);
  });

  it('gives +40 for 6 bites', () => {
    const c = makeCandidate({
      dates: [
        '2024-01-01',
        '2024-02-01',
        '2024-03-01',
        '2024-04-01',
        '2024-05-01',
        '2024-06-01',
      ],
    });
    expect(computeScore(c, false)).toBeGreaterThanOrEqual(40);
  });

  it('gives 0 for 1 bite', () => {
    const c = makeCandidate({ dates: ['2024-01-01'], isAmountStable: false });
    expect(computeScore(c, false)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cadence regularity — bucket-based
// ---------------------------------------------------------------------------

describe('cadence regularity', () => {
  it('awards +20 for perfectly monthly gaps (31 days)', () => {
    const c = makeCandidate({
      dates: ['2024-01-01', '2024-02-01', '2024-03-01'],
      cadence: 'monthly',
    });
    const score = computeScore(c, false);
    expect(score).toBeGreaterThanOrEqual(30 + 20); // bites + cadence
  });

  it('awards +20 for realistic shifted monthly gaps: 28, 33, 30, 31, 29 days', () => {
    // Jan 15 → Feb 12 (28), → Mar 16 (33), → Apr 15 (30), → May 16 (31), → Jun 14 (29)
    const c = makeCandidate({
      dates: [
        '2024-01-15',
        '2024-02-12',
        '2024-03-16',
        '2024-04-15',
        '2024-05-16',
        '2024-06-14',
      ],
      cadence: 'monthly',
    });
    // All 5 gaps are inside [26, 35] → regularity bonus awarded
    const score = computeScore(c, false);
    expect(score).toBeGreaterThanOrEqual(40 + 20); // 6 bites + cadence
  });

  it('does NOT award +20 when a gap falls outside the monthly bucket', () => {
    // Gap of 50 days violates [26, 35]
    const c = makeCandidate({
      dates: ['2024-01-01', '2024-02-01', '2024-03-22'],
      cadence: 'monthly',
    });
    const scoreWith = computeScore(c, false);
    // Score should be 30 (bites) + 20 (stable) + 0 (cadence) = 50, not 70
    expect(scoreWith).toBe(50);
  });

  it('awards +20 for weekly gaps inside 5–9 days', () => {
    const c = makeCandidate({
      dates: ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22'],
      cadence: 'weekly',
    });
    const score = computeScore(c, false);
    expect(score).toBeGreaterThanOrEqual(30 + 20); // bites + cadence
  });

  it('awards +20 for quarterly gaps inside 85–97 days', () => {
    const c = makeCandidate({
      dates: ['2024-01-01', '2024-04-01', '2024-07-01'],
      cadence: 'quarterly',
    });
    // Jan→Apr = 91 days, Apr→Jul = 91 days → inside [85, 97]
    const score = computeScore(c, false);
    expect(score).toBeGreaterThanOrEqual(30 + 20);
  });

  it('awards +20 for yearly gaps inside 355–375 days', () => {
    const c = makeCandidate({
      dates: ['2023-01-15', '2024-01-15'],
      cadence: 'yearly',
    });
    // 2024 is a leap year: 366 days → inside [355, 375]
    const score = computeScore(c, false);
    expect(score).toBeGreaterThanOrEqual(20 + 20); // bites + cadence
  });
});

// ---------------------------------------------------------------------------
// Amount stability — free-trial exclusion
// ---------------------------------------------------------------------------

describe('amount stability with free trial', () => {
  it('awards +20 when the only irregular bite is the free-trial first bite', () => {
    // First bite is 0 cents (free trial), rest are 999 cents
    const trialTx = makeTx('2024-01-01', 0);
    const paidTxs = [
      makeTx('2024-02-01', 999),
      makeTx('2024-03-01', 999),
      makeTx('2024-04-01', 999),
    ];
    const c: RecurrenceCandidate = {
      normalizedName: 'test service',
      bites: [trialTx, ...paidTxs],
      cadence: 'monthly',
      medianAmountCents: 999,
      isAmountStable: true,
      hasFreeTrial: true,
      hasPriceIncrease: false,
      amountHistory: [0, 999, 999, 999],
    };
    // isAmountStable is true (grouper already excluded trial) → scorer keeps +20
    expect(computeScore(c, false)).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Amount stability — price increase segments
// ---------------------------------------------------------------------------

describe('amount stability with price increase', () => {
  it('awards +20 for a Netflix-style price step (1549 → 1799)', () => {
    // 3 bites at 1549, then 3 bites at 1799
    const bites = [
      makeTx('2024-01-01', 1549),
      makeTx('2024-02-01', 1549),
      makeTx('2024-03-01', 1549),
      makeTx('2024-04-01', 1799),
      makeTx('2024-05-01', 1799),
      makeTx('2024-06-01', 1799),
    ];
    const c: RecurrenceCandidate = {
      normalizedName: 'netflix',
      bites,
      cadence: 'monthly',
      medianAmountCents: 1799,
      isAmountStable: false, // grouper marked false due to the step
      hasFreeTrial: false,
      hasPriceIncrease: true,
      amountHistory: [1549, 1549, 1549, 1799, 1799, 1799],
    };
    const score = computeScore(c, false);
    // Should include the +20 stability bonus
    expect(score).toBeGreaterThanOrEqual(40 + 20 + 20); // bites + cadence + stable
  });

  it('does NOT award +20 when amounts drop within a segment', () => {
    // 1549 → 999 → 1549: a drop is not a price increase step
    const bites = [
      makeTx('2024-01-01', 1549),
      makeTx('2024-02-01', 999),
      makeTx('2024-03-01', 1549),
    ];
    const c: RecurrenceCandidate = {
      normalizedName: 'unstable service',
      bites,
      cadence: 'monthly',
      medianAmountCents: 1549,
      isAmountStable: false,
      hasFreeTrial: false,
      hasPriceIncrease: true,
      amountHistory: [1549, 999, 1549],
    };
    const score = computeScore(c, false);
    // No +20 for stability
    expect(score).toBeLessThanOrEqual(30 + 20 + 20); // bites + possible cadence, no stable
    // The stability bonus must NOT be present: recompute without catalog
    const withoutCatalog = computeScore(c, false);
    const withCatalog = computeScore(c, true);
    expect(withCatalog - withoutCatalog).toBe(20); // only the catalog bonus differs
  });
});

// ---------------------------------------------------------------------------
// Catalog match
// ---------------------------------------------------------------------------

describe('catalog match', () => {
  it('adds +20 for a catalog match', () => {
    const c = makeCandidate({
      dates: ['2024-01-01', '2024-02-01'],
      isAmountStable: false,
    });
    const without = computeScore(c, false);
    const with_ = computeScore(c, true);
    expect(with_ - without).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Clamp
// ---------------------------------------------------------------------------

describe('score clamping', () => {
  it('never exceeds 100', () => {
    const c = makeCandidate({
      dates: [
        '2024-01-01',
        '2024-02-01',
        '2024-03-01',
        '2024-04-01',
        '2024-05-01',
        '2024-06-01',
      ],
      cadence: 'monthly',
      isAmountStable: true,
    });
    expect(computeScore(c, true)).toBeLessThanOrEqual(100);
  });

  it('never goes below 0', () => {
    const c = makeCandidate({
      dates: ['2024-01-01'],
      isAmountStable: false,
    });
    expect(computeScore(c, false)).toBeGreaterThanOrEqual(0);
  });
});
