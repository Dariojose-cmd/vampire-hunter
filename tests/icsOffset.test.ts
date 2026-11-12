/**
 * Property test for the ICS reminder offset.
 *
 * Feature: ux-burn-garlic-sound-fixes, Property 1: ICS offset equals the shared constant
 *
 * **Validates: Requirements 4.1, 4.2, 4.2b, 12.8a**
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { GARLIC_REMINDER_DAYS, generateIcs } from '../src/engine/icsGenerator';
import type { Vampire } from '../src/engine/types';
import en from '../src/i18n/en.json';

const MS_PER_DAY = 86_400_000;

/** Valid ISO dates between 1971-01-01 and ~2100, built from a UTC day number. */
const isoDateArb = fc
  .integer({ min: 365, max: 47_000 })
  .map((days) => new Date(days * MS_PER_DAY).toISOString().slice(0, 10));

function makeVampire(nextBiteDate: string): Vampire {
  return {
    id: 'NETFLIX_0',
    normalizedName: 'NETFLIX',
    displayName: 'Netflix',
    cadence: 'monthly',
    bites: [],
    medianAmountCents: 1549,
    annualBloodLossCents: 1549 * 12,
    threatLevel: 'Medium',
    firstBiteDate: '2026-04-15',
    lastBiteDate: '2026-05-15',
    nextBiteDate,
    confidenceScore: 85,
    isAmountStable: true,
    hasFreeTrial: false,
    hasPriceIncrease: false,
    amountHistory: [1549, 1549, 1549],
    avatarSvg: '<svg></svg>',
    currency: 'USD',
  };
}

describe('Feature: ux-burn-garlic-sound-fixes, Property 1: ICS offset equals the shared constant', () => {
  it('DTSTART;VALUE=DATE equals nextBiteDate minus GARLIC_REMINDER_DAYS days (UTC)', () => {
    fc.assert(
      fc.property(isoDateArb, (nextBiteDate) => {
        const result = generateIcs(makeVampire(nextBiteDate), 'en', en.garlic);
        if (!result.ok) return false;

        // Independent computation: parse via Date.parse (UTC for date-only ISO).
        const expectedMs = Date.parse(nextBiteDate) - GARLIC_REMINDER_DAYS * MS_PER_DAY;
        const expected = new Date(expectedMs).toISOString().slice(0, 10).replace(/-/g, '');

        const match = /^DTSTART;VALUE=DATE:(\d{8})$/m.exec(result.value);
        return match !== null && match[1] === expected;
      }),
      { numRuns: 100 },
    );
  });
});
