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
 * 8-colour cape palette, indexed by `(hash >> 4) mod 8`.
 *
 * Every colour is mid-to-high luminance so the silhouette reads clearly even
 * against the dark crypt card. The avatar also sits on a luminous "moonlight"
 * disc (see `generateAvatar`), which guarantees contrast regardless of cape.
 */
const CAPE_COLORS = [
  '#b23b3b', // blood red
  '#8e5bbf', // violet
  '#3f7fc4', // steel blue
  '#3fae6e', // poison green
  '#9b59b6', // royal purple
  '#c2663a', // burnt amber
  '#5a6b8c', // slate blue-grey
  '#cf7a2e', // pumpkin
] as const;

/**
 * Cape lining colour (inner cape) — a darker partner for each cape colour so
 * the garment has depth. Indexed to match `CAPE_COLORS` 1:1.
 */
const CAPE_LININGS = [
  '#7b1f1f', '#5c3a85', '#28567f', '#277a4b',
  '#6c3a85', '#874321', '#3b4860', '#8f5016',
] as const;

/**
 * 5 skin tones for the vampire face, indexed by `(hash >> 8) mod 5`.
 * Pale-to-ashen undead complexions, all light enough to contrast the disc.
 */
const SKIN_TONES = [
  '#e4ece6', // pale grey-green
  '#efe7db', // ashen cream
  '#d7dedd', // cold grey
  '#e7d9d6', // dusty rose-grey
  '#cfc7cf', // violet-ash
] as const;

/**
 * 6 glowing eye colours, indexed by `(hash >> 11) mod 6`.
 */
const EYE_COLORS = [
  '#e74c3c', // red
  '#f1c40f', // amber
  '#2ecc71', // green
  '#5dade2', // ice blue
  '#e67e22', // orange
  '#bb8fce', // violet
] as const;

/**
 * 4 hair colours, indexed by `(hash >> 14) mod 4`.
 */
const HAIR_COLORS = [
  '#15151c', // near-black
  '#2c1810', // dark brown
  '#3a2a3a', // aubergine
  '#5a5560', // iron grey
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

/** A pair of glowing eyes. Four distinct shapes. */
function eyeShape(style: number, color: string): string {
  const glow = `<circle cx="40" cy="52" r="7" fill="${color}" opacity="0.28"/>` +
               `<circle cx="60" cy="52" r="7" fill="${color}" opacity="0.28"/>`;
  switch (style % 4) {
    case 0: // round glowing eyes
      return glow +
        `<circle cx="40" cy="52" r="4.5" fill="${color}"/>` +
        `<circle cx="60" cy="52" r="4.5" fill="${color}"/>`;
    case 1: // narrow slits
      return glow +
        `<rect x="35" y="50" width="12" height="3.5" rx="1.75" fill="${color}"/>` +
        `<rect x="53" y="50" width="12" height="3.5" rx="1.75" fill="${color}"/>`;
    case 2: // angry slanted eyes
      return glow +
        `<path d="M35 55 L47 49 L47 53 Z" fill="${color}"/>` +
        `<path d="M65 55 L53 49 L53 53 Z" fill="${color}"/>`;
    default: // wide oval eyes
      return glow +
        `<ellipse cx="40" cy="52" rx="5.5" ry="4" fill="${color}"/>` +
        `<ellipse cx="60" cy="52" rx="5.5" ry="4" fill="${color}"/>`;
  }
}

/** Fangs. Three distinct shapes. */
function fangShape(style: number): string {
  const c = '#ffffff';
  switch (style % 3) {
    case 0: // two short fangs
      return `<path d="M44 66 L47 74 L50 66 Z" fill="${c}"/>` +
             `<path d="M50 66 L53 74 L56 66 Z" fill="${c}"/>`;
    case 1: // two long dripping fangs
      return `<path d="M43 66 L46 80 L49 66 Z" fill="${c}"/>` +
             `<path d="M51 66 L54 80 L57 66 Z" fill="${c}"/>` +
             `<circle cx="46" cy="81" r="1.4" fill="#e74c3c"/>`;
    default: // wide-set fangs with a grin line
      return `<rect x="40" y="64" width="20" height="2" rx="1" fill="${c}"/>` +
             `<path d="M40 66 L43 76 L46 66 Z" fill="${c}"/>` +
             `<path d="M54 66 L57 76 L60 66 Z" fill="${c}"/>`;
  }
}

/** Hair / headwear. Four distinct styles drawn over the hairline. */
function hairShape(style: number, color: string): string {
  switch (style % 4) {
    case 0: // slicked widow's peak
      return `<path d="M26 42 Q50 16 74 42 Q68 28 50 32 Q32 28 26 42 Z" fill="${color}"/>` +
             `<path d="M50 28 L45 40 L55 40 Z" fill="${color}"/>`;
    case 1: // swept-back with side volume
      return `<path d="M24 44 Q30 20 50 22 Q70 20 76 44 Q70 30 50 30 Q30 30 24 44 Z" fill="${color}"/>`;
    case 2: // bald with just side tufts
      return `<path d="M26 46 Q24 34 30 30 Q30 38 34 42 Z" fill="${color}"/>` +
             `<path d="M74 46 Q76 34 70 30 Q70 38 66 42 Z" fill="${color}"/>`;
    default: // tall widow's peak + sideburns
      return `<path d="M27 40 Q50 14 73 40 Q66 26 50 30 Q34 26 27 40 Z" fill="${color}"/>` +
             `<path d="M50 24 L44 40 L56 40 Z" fill="${color}"/>` +
             `<rect x="27" y="40" width="4" height="14" rx="2" fill="${color}"/>` +
             `<rect x="69" y="40" width="4" height="14" rx="2" fill="${color}"/>`;
  }
}

/** Pointed vs. rounded ears. */
function earShape(style: number, skin: string): string {
  if (style % 2 === 0) {
    // pointed (classic vampire)
    return `<path d="M27 46 L22 38 L31 44 Z" fill="${skin}"/>` +
           `<path d="M73 46 L78 38 L69 44 Z" fill="${skin}"/>`;
  }
  // rounded
  return `<circle cx="27" cy="48" r="4.5" fill="${skin}"/>` +
         `<circle cx="73" cy="48" r="4.5" fill="${skin}"/>`;
}

/**
 * Generate a unique, deterministic SVG avatar for a Vampire from its
 * normalized name.
 *
 * Traits derived from a 32-bit FNV-1a hash:
 *   - eye style  = hash mod 4          - fang style = hash mod 3
 *   - cape color = (hash >> 4) mod 8   - skin tone  = (hash >> 8) mod 5
 *   - eye color  = (hash >> 11) mod 6  - hair color = (hash >> 14) mod 4
 *   - hair style = (hash >> 17) mod 4  - ear style  = (hash >> 20) mod 2
 *
 * The figure sits on a luminous radial "moonlight" disc so it always contrasts
 * the dark crypt card, regardless of cape colour. Same input ALWAYS yields
 * identical output; the function never throws.
 *
 * _Validates: Requirement 6.5_
 */
export function generateAvatar(normalizedName: string): string {
  const hash = fnv1a32(normalizedName);

  const eyeStyle = hash % 4;
  const fangStyle = hash % 3;
  const capeIdx = (hash >> 4) % CAPE_COLORS.length;
  const capeColor = CAPE_COLORS[capeIdx];
  const capeLining = CAPE_LININGS[capeIdx];
  const skinTone = SKIN_TONES[(hash >> 8) % SKIN_TONES.length];
  const eyeColor = EYE_COLORS[(hash >> 11) % EYE_COLORS.length];
  const hairColor = HAIR_COLORS[(hash >> 14) % HAIR_COLORS.length];
  const hairStyle = (hash >> 17) % 4;
  const earStyle = (hash >> 20) % 2;

  // Unique gradient id per avatar so multiple inlined SVGs don't collide.
  const gid = `vhm${hash.toString(36)}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="vampire avatar">` +
    `<defs>` +
      `<radialGradient id="${gid}" cx="50%" cy="42%" r="60%">` +
        `<stop offset="0%" stop-color="#565074"/>` +
        `<stop offset="55%" stop-color="#363150"/>` +
        `<stop offset="100%" stop-color="#201d30"/>` +
      `</radialGradient>` +
    `</defs>` +
    // luminous moonlight disc — guarantees contrast behind the figure
    `<circle cx="50" cy="50" r="50" fill="url(#${gid})"/>` +
    `<circle cx="50" cy="44" r="32" fill="#ffffff" opacity="0.10"/>` +
    // cape (outer + lining) behind the head
    `<path d="M16 100 Q50 64 84 100 Z" fill="${capeColor}"/>` +
    `<path d="M26 100 Q50 72 74 100 Z" fill="${capeLining}"/>` +
    // high collar
    `<path d="M30 72 L50 62 L70 72 L62 84 L50 76 L38 84 Z" fill="${capeColor}"/>` +
    // ears (behind head)
    earShape(earStyle, skinTone) +
    // head
    `<ellipse cx="50" cy="48" rx="23" ry="27" fill="${skinTone}"/>` +
    // hair
    hairShape(hairStyle, hairColor) +
    // brows for a touch of menace
    `<rect x="35" y="45" width="11" height="2" rx="1" fill="${hairColor}" opacity="0.7"/>` +
    `<rect x="54" y="45" width="11" height="2" rx="1" fill="${hairColor}" opacity="0.7"/>` +
    eyeShape(eyeStyle, eyeColor) +
    // nose
    `<path d="M50 56 L47 62 L53 62 Z" fill="rgba(0,0,0,0.15)"/>` +
    fangShape(fangStyle) +
    `</svg>`
  );
}
