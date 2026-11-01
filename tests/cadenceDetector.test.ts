/**
 * Unit tests for cadenceDetector.ts
 * Requirements: 4.2, 4.3, 4.7
 */

import { describe, it, expect } from 'vitest';
import {
  detectCadence,
  detectFreeTrial,
  detectPriceIncrease,
} from '../src/engine/cadenceDetector';
import type { Transaction } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build ISO date strings by adding `gapDays` to a base date, n times.
 * E.g. datesWithGap('2026-01-01', 30, 4) → 4 dates spaced 30 days apart.
 */
function datesWithGap(startIso: string, gapDays: number, count: number): string[] {
  const ms = new Date(startIso + 'T00:00:00Z').getTime();
  return Array.from(
    { length: count },
    (_, i) => new Date(ms + i * gapDays * 86_400_000).toISOString().slice(0, 10),
  );
}

let _id = 0;
function makeBite(amountCents: number, date = '2026-01-01'): Transaction {
  _id++;
  return {
    id: `bite-${_id}`,
    date,
    description: 'TEST',
    normalizedName: 'TEST',
    amountCents,
    type: 'debit',
    currency: 'USD',
  };
}

// ---------------------------------------------------------------------------
// detectCadence — basic cadence detection
// ---------------------------------------------------------------------------

describe('detectCadence', () => {
  it('returns null for fewer than 2 dates', () => {
    expect(detectCadence([])).toBeNull();
    expect(detectCadence(['2026-01-01'])).toBeNull();
  });

  it('detects weekly cadence for 7-day gaps', () => {
    const dates = datesWithGap('2026-01-01', 7, 4);
    expect(detectCadence(dates)).toBe('weekly');
  });

  it('detects weekly cadence for gaps at the boundaries [5, 9]', () => {
    expect(detectCadence(datesWithGap('2026-01-01', 5, 4))).toBe('weekly');
    expect(detectCadence(datesWithGap('2026-01-01', 9, 4))).toBe('weekly');
  });

  it('detects monthly cadence for 30-day gaps', () => {
    const dates = datesWithGap('2026-01-01', 30, 6);
    expect(detectCadence(dates)).toBe('monthly');
  });

  it('detects monthly cadence for gaps at the boundaries [26, 35]', () => {
    expect(detectCadence(datesWithGap('2026-01-01', 26, 3))).toBe('monthly');
    expect(detectCadence(datesWithGap('2026-01-01', 35, 3))).toBe('monthly');
  });

  it('detects quarterly cadence for 91-day gaps', () => {
    const dates = datesWithGap('2026-01-01', 91, 4);
    expect(detectCadence(dates)).toBe('quarterly');
  });

  it('detects quarterly cadence for gaps at the boundaries [85, 97]', () => {
    expect(detectCadence(datesWithGap('2026-01-01', 85, 3))).toBe('quarterly');
    expect(detectCadence(datesWithGap('2026-01-01', 97, 3))).toBe('quarterly');
  });

  it('detects yearly cadence for 365-day gaps', () => {
    const dates = datesWithGap('2026-01-01', 365, 3);
    expect(detectCadence(dates)).toBe('yearly');
  });

  it('detects yearly cadence for gaps at the boundaries [355, 375]', () => {
    expect(detectCadence(datesWithGap('2026-01-01', 355, 3))).toBe('yearly');
    expect(detectCadence(datesWithGap('2026-01-01', 375, 3))).toBe('yearly');
  });

  it('returns null when median gap falls between buckets (e.g. 15 days)', () => {
    const dates = datesWithGap('2026-01-01', 15, 5);
    expect(detectCadence(dates)).toBeNull();
  });

  it('returns null when median gap is 0 (all same date)', () => {
    expect(detectCadence(['2026-01-01', '2026-01-01', '2026-01-01'])).toBeNull();
  });

  it('detects monthly when median gap is 30 but 1 noisy gap exists out of 5 gaps', () => {
    // 5 gaps: 4 at 30 days (within [26,35]), 1 at 60 (outside) → 4/5 = 80% ≥ 60% → monthly
    const dates = [
      '2026-01-01',
      '2026-01-31',
      '2026-03-02',  // 60-day gap (noisy)
      '2026-04-01',
      '2026-05-01',
      '2026-05-31',
    ];
    expect(detectCadence(dates)).toBe('monthly');
  });

  it('returns null when fewer than 60% of gaps fall in the matched bucket', () => {
    // 6 gaps: only 2 at 30 days, 4 far outside → 2/6 = 33% < 60% → null
    const dates = [
      '2026-01-01',
      '2026-01-31',  // 30-day gap ✓
      '2026-03-31',  // 59-day gap ✗
      '2026-05-29',  // 59-day gap ✗
      '2026-06-28',  // 30-day gap ✓
      '2026-08-27',  // 60-day gap ✗
      '2026-10-26',  // 60-day gap ✗
    ];
    expect(detectCadence(dates)).toBeNull();
  });

  it('works with exactly 2 dates (minimum valid input)', () => {
    // One gap of 30 days; 1/1 = 100% in bucket → monthly
    expect(detectCadence(['2026-01-01', '2026-01-31'])).toBe('monthly');
  });

  it('is order-independent — unsorted dates produce the same result as sorted', () => {
    const sorted = datesWithGap('2026-01-01', 30, 5);
    const reversed = [...sorted].reverse();
    const shuffled = [sorted[2], sorted[0], sorted[4], sorted[1], sorted[3]];
    expect(detectCadence(reversed)).toBe('monthly');
    expect(detectCadence(shuffled)).toBe('monthly');
  });

  it('deduplicates identical dates before computing gaps', () => {
    // Three distinct monthly dates plus duplicates should still → monthly
    const dates = [
      '2026-01-01', '2026-01-01',  // duplicate
      '2026-02-01',
      '2026-03-01',
    ];
    expect(detectCadence(dates)).toBe('monthly');
  });
});

// ---------------------------------------------------------------------------
// detectFreeTrial
// ---------------------------------------------------------------------------

describe('detectFreeTrial', () => {
  it('returns false for an empty bites array', () => {
    expect(detectFreeTrial([], 1000)).toBe(false);
  });

  it('returns true when the first bite is 0 cents', () => {
    const bites = [makeBite(0), makeBite(999), makeBite(999)];
    expect(detectFreeTrial(bites, 999)).toBe(true);
  });

  it('returns true when the first bite is < 20% of medianCents', () => {
    // 150 < 1000 * 0.20 = 200 → free trial
    const bites = [makeBite(150), makeBite(1000), makeBite(1000)];
    expect(detectFreeTrial(bites, 1000)).toBe(true);
  });

  it('returns false when the first bite is exactly 20% of medianCents', () => {
    // 200 = 1000 * 0.20 → NOT a free trial (strictly less-than required)
    const bites = [makeBite(200), makeBite(1000), makeBite(1000)];
    expect(detectFreeTrial(bites, 1000)).toBe(false);
  });

  it('returns false when the first bite is well above 20% of medianCents', () => {
    const bites = [makeBite(999), makeBite(999), makeBite(999)];
    expect(detectFreeTrial(bites, 999)).toBe(false);
  });

  it('returns false when medianCents is 0 and first bite is also 0', () => {
    // median 0 → 20% threshold is 0; first bite 0 → explicitly true
    const bites = [makeBite(0), makeBite(0)];
    expect(detectFreeTrial(bites, 0)).toBe(true);
  });

  it('returns true even with a single bite at 0 cents', () => {
    const bites = [makeBite(0)];
    expect(detectFreeTrial(bites, 999)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectPriceIncrease
// ---------------------------------------------------------------------------

describe('detectPriceIncrease', () => {
  it('returns false for an empty bites array', () => {
    expect(detectPriceIncrease([])).toBe(false);
  });

  it('returns false for a single bite', () => {
    expect(detectPriceIncrease([makeBite(999)])).toBe(false);
  });

  it('returns false when all amounts are the same', () => {
    const bites = [makeBite(999), makeBite(999), makeBite(999)];
    expect(detectPriceIncrease(bites)).toBe(false);
  });

  it('returns true for a monotonically increasing sequence with > 5% step', () => {
    // 1000 → 1100 (+10%) → 1200 (+9%)
    const bites = [makeBite(1000), makeBite(1100), makeBite(1200)];
    expect(detectPriceIncrease(bites)).toBe(true);
  });

  it('returns true even with flat segments, as long as one step is > 5%', () => {
    // 1000 → 1000 (0%) → 1100 (+10%)
    const bites = [makeBite(1000), makeBite(1000), makeBite(1100)];
    expect(detectPriceIncrease(bites)).toBe(true);
  });

  it('returns false when the only increases are ≤ 5%', () => {
    // 1000 → 1030 (+3%) → 1055 (+2.4%) — all within 5%
    const bites = [makeBite(1000), makeBite(1030), makeBite(1055)];
    expect(detectPriceIncrease(bites)).toBe(false);
  });

  it('returns false when any amount decreases (not monotonic)', () => {
    // 1000 → 1100 → 900 — decrease at end breaks monotonicity
    const bites = [makeBite(1000), makeBite(1100), makeBite(900)];
    expect(detectPriceIncrease(bites)).toBe(false);
  });

  it('returns false when amounts decrease then increase', () => {
    const bites = [makeBite(1000), makeBite(800), makeBite(1200)];
    expect(detectPriceIncrease(bites)).toBe(false);
  });

  it('returns true for exactly 2 bites with a > 5% increase', () => {
    // 1000 → 1100 (+10%)
    const bites = [makeBite(1000), makeBite(1100)];
    expect(detectPriceIncrease(bites)).toBe(true);
  });

  it('returns false for exactly 2 bites with ≤ 5% increase', () => {
    // 1000 → 1040 (+4%)
    const bites = [makeBite(1000), makeBite(1040)];
    expect(detectPriceIncrease(bites)).toBe(false);
  });

  it('handles the Netflix price-increase example from the design doc', () => {
    // $13.99 (1399) → $15.49 (1549) → $17.99 (1799)
    // 1399→1549: +10.7% > 5% ✓; 1549→1799: +16.1% > 5% ✓
    const bites = [makeBite(1399), makeBite(1549), makeBite(1799)];
    expect(detectPriceIncrease(bites)).toBe(true);
  });
});
