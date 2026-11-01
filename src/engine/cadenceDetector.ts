/**
 * Vampire Hunter — Cadence Detector
 * Pure TypeScript only. Zero React imports.
 *
 * Analyses a sorted sequence of transaction dates to determine the payment
 * frequency (weekly, monthly, quarterly, or yearly) for a recurring charge.
 * Also flags free-trial conversions and price-increase patterns.
 */

import type { Cadence, Transaction } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cadence bucket definitions.
 * Each entry is [minDays, maxDays, cadence].
 */
const CADENCE_BUCKETS: [number, number, Cadence][] = [
  [5,   9,   'weekly'],
  [26,  35,  'monthly'],
  [85,  97,  'quarterly'],
  [355, 375, 'yearly'],
];

/** Minimum fraction of gaps that must fall in the matched bucket (60%). */
const BUCKET_COVERAGE_THRESHOLD = 0.6;

/**
 * Parse an ISO date string ('YYYY-MM-DD') and return a Date at UTC midnight.
 * Using UTC avoids any DST-related offset that could shift a gap by a day.
 */
function parseIsoDate(iso: string): Date {
  // Split manually to guarantee UTC interpretation across all environments.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Number of whole calendar days between two ISO date strings.
 * Always returns a non-negative integer when a ≤ b.
 */
function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 86_400_000;
  return Math.round((parseIsoDate(isoB).getTime() - parseIsoDate(isoA).getTime()) / msPerDay);
}

/**
 * Compute the median of a numeric array (sorts a copy).
 * Returns the middle element for odd-length arrays, or the average (rounded
 * down) of the two middle elements for even-length arrays.
 */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

// ---------------------------------------------------------------------------
// detectCadence
// ---------------------------------------------------------------------------

/**
 * Determine the payment cadence from a list of ISO 8601 date strings.
 *
 * Algorithm:
 *   1. Deduplicate and sort dates ascending.
 *   2. Compute consecutive gaps in days.
 *   3. Compute the median gap.
 *   4. Find the cadence bucket that contains the median gap.
 *   5. Require ≥ 60% of gaps to fall within that bucket (noise tolerance).
 *   6. Return `null` if there are fewer than 2 dates or no bucket matches.
 *
 * Requirements: 4.2, 4.3
 */
export function detectCadence(dates: string[]): Cadence | null {
  if (dates.length < 2) return null;

  // Step 1: deduplicate and sort
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 2) return null;

  // Step 2: compute consecutive gaps
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(daysBetween(sorted[i - 1], sorted[i]));
  }

  // Step 3: median gap
  const medGap = medianOf(gaps);

  // Step 4: find the matching cadence bucket
  const matched = CADENCE_BUCKETS.find(
    ([min, max]) => medGap >= min && medGap <= max,
  );
  if (!matched) return null;

  const [min, max, cadence] = matched;

  // Step 5: require ≥ 60% of gaps within the bucket
  const inBucket = gaps.filter((g) => g >= min && g <= max).length;
  if (inBucket / gaps.length < BUCKET_COVERAGE_THRESHOLD) return null;

  return cadence;
}

// ---------------------------------------------------------------------------
// detectFreeTrial
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the first bite looks like a free-trial charge:
 *   - `bites[0].amountCents === 0`, OR
 *   - `bites[0].amountCents < 20% of medianCents`
 *
 * The bites array is assumed to be sorted by date ascending (as produced by
 * `buildCandidates`). When there are no bites the function returns `false`.
 *
 * Requirements: 4.7
 */
export function detectFreeTrial(
  bites: Transaction[],
  medianCents: number,
): boolean {
  if (bites.length === 0) return false;
  const firstAmount = bites[0].amountCents;
  if (firstAmount === 0) return true;
  if (medianCents > 0 && firstAmount < medianCents * 0.2) return true;
  return false;
}

// ---------------------------------------------------------------------------
// detectPriceIncrease
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the bite amounts are monotonically non-decreasing with
 * at least one increase of more than 5%.
 *
 * "Monotonically non-decreasing" means each amount is ≥ the previous amount.
 * If any amount decreases, the function returns `false` immediately.
 *
 * The bites array is assumed to be sorted by date ascending. When there are
 * fewer than 2 bites, no increase can be detected — returns `false`.
 *
 * Requirements: 4.7
 */
export function detectPriceIncrease(bites: Transaction[]): boolean {
  if (bites.length < 2) return false;

  let hasSignificantIncrease = false;

  for (let i = 1; i < bites.length; i++) {
    const prev = bites[i - 1].amountCents;
    const curr = bites[i].amountCents;

    // Any decrease breaks monotonicity
    if (curr < prev) return false;

    // Check for a > 5% increase (guard against division by zero)
    if (prev > 0 && (curr - prev) / prev > 0.05) {
      hasSignificantIncrease = true;
    }
  }

  return hasSignificantIncrease;
}
