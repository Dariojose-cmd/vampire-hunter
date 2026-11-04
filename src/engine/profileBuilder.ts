/**
 * Vampire Hunter — Profile Builder
 * Pure TypeScript only. Zero React imports.
 *
 * Provides the three helper functions needed to turn a ScoredCandidate into a
 * fully built Vampire profile:
 *  - annualBloodLossCents  — projects the yearly cost from bite cadence
 *  - threatLevelFromCents  — classifies annualised USD cost into a threat tier
 *  - predictNextBite       — predicts the next charge date from the last one
 */

import type { Cadence, ExchangeRates, ThreatLevel } from './types';

// ---------------------------------------------------------------------------
// Cadence multipliers (bites per year)
// ---------------------------------------------------------------------------

const CADENCE_MULTIPLIER: Record<Cadence, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

// ---------------------------------------------------------------------------
// Cadence interval in days (used for next-bite prediction)
// ---------------------------------------------------------------------------

const CADENCE_DAYS: Record<Cadence, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

// ---------------------------------------------------------------------------
// annualBloodLossCents
// ---------------------------------------------------------------------------

/**
 * Project the annualised cost of a recurring charge.
 *
 * Returns `medianCents * cadenceMultiplier` where multipliers are:
 *   weekly × 52 | monthly × 12 | quarterly × 4 | yearly × 1
 *
 * Result is always a non-negative integer (medianCents is assumed to be an
 * integer, and all multipliers are integers, so no rounding is needed).
 *
 * @param medianCents  - Median bite amount in integer cents (≥ 0)
 * @param cadence      - Detected payment cadence
 * @returns            Annual cost in integer cents
 *
 * _Validates: Requirement 6.2_
 */
export function annualBloodLossCents(medianCents: number, cadence: Cadence): number {
  return medianCents * CADENCE_MULTIPLIER[cadence];
}

// ---------------------------------------------------------------------------
// threatLevelFromCents
// ---------------------------------------------------------------------------

/**
 * Classify the annualised cost into a threat tier.
 *
 * Algorithm:
 *  1. Convert `annualCents` to USD: `(annualCents / 100) / (rates[currency] ?? 1.0)`
 *  2. Apply thresholds:
 *     - Low      < $50
 *     - Medium   $50 – $199.99
 *     - High     $200 – $499.99
 *     - Critical ≥ $500
 *
 * If `currency` is not found in `rates`, falls back to a 1 : 1 rate with USD
 * so the function never throws.
 *
 * @param annualCents  - Annualised cost in integer cents (in the statement currency)
 * @param currency     - ISO 4217 code of the statement currency (e.g. 'USD', 'MXN')
 * @param rates        - Static exchange-rate table (ISO code → units per 1 USD)
 * @returns            ThreatLevel classification
 *
 * _Validates: Requirement 6.3_
 */
export function threatLevelFromCents(
  annualCents: number,
  currency: string,
  rates: ExchangeRates,
): ThreatLevel {
  const rate = rates[currency] ?? 1.0;
  const annualUsd = (annualCents / 100) / rate;

  if (annualUsd < 50) return 'Low';
  if (annualUsd < 200) return 'Medium';
  if (annualUsd < 500) return 'High';
  return 'Critical';
}

// ---------------------------------------------------------------------------
// predictNextBite
// ---------------------------------------------------------------------------

/**
 * Predict the date of the next charge.
 *
 * Adds one cadence interval (in days) to `lastBiteDate`:
 *   weekly = 7 days | monthly = 30 days | quarterly = 91 days | yearly = 365 days
 *
 * Date arithmetic is performed in UTC to avoid DST shifts producing an
 * off-by-one-day error. The result is always a valid `YYYY-MM-DD` string.
 * This function never throws — invalid input yields a fallback result.
 *
 * @param lastBiteDate  - ISO 8601 date string of the most recent charge (YYYY-MM-DD)
 * @param cadence       - Detected payment cadence
 * @returns             ISO 8601 date string of the predicted next charge
 *
 * _Validates: Requirement 6.6_
 */
export function predictNextBite(lastBiteDate: string, cadence: Cadence): string {
  try {
    const [y, m, d] = lastBiteDate.split('-').map(Number);
    if (!y || !m || !d) return lastBiteDate;

    if (cadence === 'weekly') {
      const next = new Date(Date.UTC(y, m - 1, d) + CADENCE_DAYS.weekly * 86_400_000);
      return next.toISOString().slice(0, 10);
    }

    // Subscriptions bill on the same day of the month, so monthly, quarterly
    // and yearly add calendar months. If the target month is shorter
    // (e.g. Jan 31 -> Feb), use its last day.
    const monthsToAdd = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12;
    const targetMonthIndex = m - 1 + monthsToAdd;
    const lastDayOfTarget = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate();
    const next = new Date(Date.UTC(y, targetMonthIndex, Math.min(d, lastDayOfTarget)));
    return next.toISOString().slice(0, 10);
  } catch {
    // Safety net: return the input unchanged if something went wrong.
    return lastBiteDate;
  }
}
