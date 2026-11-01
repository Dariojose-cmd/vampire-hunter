/**
 * Vampire Hunter — Confidence Scorer
 * Pure TypeScript only. Zero React imports.
 *
 * Computes an integer confidence score [0, 100] for a RecurrenceCandidate
 * based on bite count, cadence regularity, amount stability, and catalog match.
 */

import type { Cadence, RecurrenceCandidate } from './types';

// ---------------------------------------------------------------------------
// Cadence bucket ranges (inclusive, in days)
// Ranges are wide enough to absorb weekend/holiday shifts.
// ---------------------------------------------------------------------------

const CADENCE_RANGES: Record<Cadence, [number, number]> = {
  weekly:    [5,   9],
  monthly:   [26, 35],
  quarterly: [85, 97],
  yearly:    [355, 375],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string ('YYYY-MM-DD') and return a Date at UTC midnight.
 * Using UTC avoids any DST-related offset that could shift a gap by a day.
 */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Number of whole calendar days between two ISO date strings (a ≤ b).
 */
function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 86_400_000;
  return Math.round(
    (parseIsoDate(isoB).getTime() - parseIsoDate(isoA).getTime()) / msPerDay,
  );
}

/**
 * Returns true when every consecutive date-gap falls inside the expected
 * bucket range for the detected cadence.
 *
 * Weekend and holiday shifts are naturally absorbed by the range width:
 *   monthly 26–35 days, weekly 5–9 days, etc.
 *
 * Requires at least 2 bites; returns false for fewer.
 */
function isCadenceRegular(
  bites: { date: string }[],
  cadence: Cadence,
): boolean {
  if (bites.length < 2) return false;

  const [lo, hi] = CADENCE_RANGES[cadence];

  for (let i = 1; i < bites.length; i++) {
    const gap = daysBetween(bites[i - 1].date, bites[i].date);
    if (gap < lo || gap > hi) return false;
  }

  return true;
}

/**
 * Returns true when the bites are stable in amount, applying these rules:
 *
 * 1. Skip the free-trial bite (first bite when `hasFreeTrial` is true — it
 *    has amountCents === 0 or is below the paid-tier threshold).
 * 2. If `hasPriceIncrease` is false, delegate to the pre-computed
 *    `isAmountStable` flag (which was already computed without the trial bite).
 * 3. If `hasPriceIncrease` is true, split the paid bites into monotonically
 *    increasing price segments. Each segment is stable when all its amounts
 *    are within 10% of the segment's first amount (same threshold the grouper
 *    uses). A price step between segments is accepted.
 *
 * A Netflix rise from 1549 → 1799 cents produces two segments [1549,1549,…]
 * and [1799,1799,…], both individually stable → returns true.
 */
function isAmountStableForScoring(candidate: RecurrenceCandidate): boolean {
  // No bites → not stable.
  if (candidate.bites.length === 0) return false;

  // Collect paid bites (skip the free-trial first bite).
  const paidBites = candidate.hasFreeTrial
    ? candidate.bites.slice(1)
    : candidate.bites;

  if (paidBites.length === 0) return false;

  // No price increase: rely on the pre-computed flag (already excludes trial).
  if (!candidate.hasPriceIncrease) {
    return candidate.isAmountStable;
  }

  // Price increase path: check stability within each price segment.
  // A new segment starts whenever a bite's amount is more than 10% above the
  // current segment's anchor.
  const TOLERANCE = 0.10;

  let segmentAnchor = paidBites[0].amountCents;

  for (const bite of paidBites) {
    const ratio = bite.amountCents / segmentAnchor;

    if (ratio > 1 + TOLERANCE) {
      // This bite is significantly higher — start a new segment.
      segmentAnchor = bite.amountCents;
    } else if (ratio < 1 - TOLERANCE) {
      // This bite is lower than the current segment anchor → not stable.
      return false;
    }
    // Within ±10%: stays in current segment.
  }

  return true;
}

// ---------------------------------------------------------------------------
// computeScore
// ---------------------------------------------------------------------------

/**
 * Compute a confidence score (integer, 0–100) for a `RecurrenceCandidate`.
 *
 * Scoring rules (accumulate points):
 *   - bites count = 2         → +20
 *   - bites count 3–5         → +30
 *   - bites count ≥ 6         → +40
 *   - cadence regularity      → +20  (every gap inside bucket range for cadence)
 *   - amount stable           → +20  (stable within price periods; trial excluded)
 *   - catalog match           → +20  (hasCatalogMatch === true)
 *
 * The result is clamped to [0, 100].
 */
export function computeScore(
  candidate: RecurrenceCandidate,
  hasCatalogMatch: boolean,
): number {
  let score = 0;

  // Bite count points (mutually exclusive buckets)
  const biteCount = candidate.bites.length;
  if (biteCount >= 6) {
    score += 40;
  } else if (biteCount >= 3) {
    score += 30;
  } else if (biteCount === 2) {
    score += 20;
  }

  // Cadence regularity — bucket-based, tolerant of weekend/holiday shifts
  if (isCadenceRegular(candidate.bites, candidate.cadence)) {
    score += 20;
  }

  // Amount stability — free-trial excluded; price-increase segments accepted
  if (isAmountStableForScoring(candidate)) {
    score += 20;
  }

  // Catalog match
  if (hasCatalogMatch) {
    score += 20;
  }

  return Math.max(0, Math.min(100, score));
}
