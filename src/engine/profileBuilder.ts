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

// ---------------------------------------------------------------------------
// generateAvatar
// ---------------------------------------------------------------------------

/**
 * 8-colour cape palette. Indexed by `(hash >> 4) mod 8`.
 * Spooky-but-readable hues that contrast against the dark crypt background.
 */
const CAPE_COLORS = [
  '#7b1113', // deep blood red
  '#4a235a', // dark violet
  '#1b4f72', // midnight blue
  '#145a32', // forest green
  '#633974', // royal purple
  '#78281f', // dried blood
  '#1c2833', // charcoal
  '#5b2c06', // dark amber
] as const;

/**
 * 4 skin tones for the vampire face. Indexed by `(hash >> 8) mod 4`.
 * Pale undead complexions ranging from grey-green to ashen.
 */
const SKIN_TONES = [
  '#d9e4dd', // pale grey-green
  '#e8e0d5', // ashen cream
  '#cdd6d0', // cold grey
  '#ddd0cf', // dusty rose-grey
] as const;

/**
 * Compute a 32-bit FNV-1a hash of a string.
 *
 * FNV-1a: start from the offset basis, then for each byte XOR it into the hash
 * and multiply by the FNV prime. `>>> 0` keeps the result an unsigned 32-bit
 * integer after every step (JS bitwise ops operate on signed 32-bit values).
 *
 * @param input - The string to hash
 * @returns      Unsigned 32-bit hash
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis (2166136261)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i) & 0xff;
    // Multiply by FNV prime 16777619 using shifts to stay in 32-bit range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Build the SVG `<path>`/`<element>` markup for a pair of vampire eyes.
 * Four distinct styles so different hashes produce visibly different faces.
 */
function eyeShape(style: number, color: string): string {
  switch (style % 4) {
    case 0: // round glowing eyes
      return (
        `<circle cx="40" cy="52" r="5" fill="${color}"/>` +
        `<circle cx="60" cy="52" r="5" fill="${color}"/>`
      );
    case 1: // narrow slits
      return (
        `<rect x="35" y="50" width="12" height="3" rx="1.5" fill="${color}"/>` +
        `<rect x="53" y="50" width="12" height="3" rx="1.5" fill="${color}"/>`
      );
    case 2: // angry slanted eyes
      return (
        `<path d="M35 55 L47 49 L47 53 Z" fill="${color}"/>` +
        `<path d="M65 55 L53 49 L53 53 Z" fill="${color}"/>`
      );
    default: // wide oval eyes
      return (
        `<ellipse cx="40" cy="52" rx="6" ry="4" fill="${color}"/>` +
        `<ellipse cx="60" cy="52" rx="6" ry="4" fill="${color}"/>`
      );
  }
}

/**
 * Build the SVG markup for the vampire fangs.
 * Three distinct styles.
 */
function fangShape(style: number, color: string): string {
  switch (style % 3) {
    case 0: // two short fangs
      return (
        `<path d="M44 66 L47 74 L50 66 Z" fill="${color}"/>` +
        `<path d="M50 66 L53 74 L56 66 Z" fill="${color}"/>`
      );
    case 1: // two long dripping fangs
      return (
        `<path d="M43 66 L46 80 L49 66 Z" fill="${color}"/>` +
        `<path d="M51 66 L54 80 L57 66 Z" fill="${color}"/>`
      );
    default: // wide-set fangs with a grin line
      return (
        `<path d="M40 66 L43 76 L46 66 Z" fill="${color}"/>` +
        `<path d="M54 66 L57 76 L60 66 Z" fill="${color}"/>` +
        `<rect x="40" y="64" width="20" height="2" rx="1" fill="${color}"/>`
      );
  }
}

/**
 * Generate a unique, deterministic SVG avatar for a Vampire from its
 * normalized name.
 *
 * The avatar is seeded with a 32-bit FNV-1a hash of `normalizedName`, from
 * which four visual traits are derived:
 *   - eye style  = hash mod 4
 *   - fang style = hash mod 3
 *   - cape color = CAPE_COLORS[(hash >> 4) mod 8]
 *   - skin tone  = SKIN_TONES[(hash >> 8) mod 4]
 *
 * The result is a fully self-contained `<svg>` string with no external
 * references, suitable for inlining directly into the DOM.
 *
 * The same input ALWAYS produces identical output (pure, deterministic) and
 * the function never throws — an empty string still yields a valid avatar.
 *
 * @param normalizedName - The Vampire's normalized merchant name
 * @returns              A complete, self-contained SVG string
 *
 * _Validates: Requirement 6.5_
 */
export function generateAvatar(normalizedName: string): string {
  const hash = fnv1a32(normalizedName);

  const eyeStyle = hash % 4;
  const fangStyle = hash % 3;
  const capeColor = CAPE_COLORS[(hash >> 4) % CAPE_COLORS.length];
  const skinTone = SKIN_TONES[(hash >> 8) % SKIN_TONES.length];

  const eyes = eyeShape(eyeStyle, '#c0392b');
  const fangs = fangShape(fangStyle, '#ffffff');

  // Composed from static templates + derived values. viewBox is fixed at
  // 100x100 so the avatar scales cleanly wherever it is rendered.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="vampire avatar">` +
    // cape behind the head
    `<path d="M20 100 Q50 70 80 100 L80 100 Q50 85 20 100 Z" fill="${capeColor}"/>` +
    `<path d="M22 95 Q50 55 78 95 L78 100 L22 100 Z" fill="${capeColor}"/>` +
    // high collar
    `<path d="M30 70 L50 60 L70 70 L62 82 L50 74 L38 82 Z" fill="${capeColor}"/>` +
    // head
    `<ellipse cx="50" cy="48" rx="24" ry="28" fill="${skinTone}"/>` +
    // widow's-peak hairline
    `<path d="M26 40 Q50 18 74 40 Q68 30 50 34 Q32 30 26 40 Z" fill="#1c1c1c"/>` +
    `<path d="M50 30 L46 40 L54 40 Z" fill="#1c1c1c"/>` +
    eyes +
    // nose
    `<path d="M50 56 L47 62 L53 62 Z" fill="rgba(0,0,0,0.15)"/>` +
    fangs +
    `</svg>`
  );
}
