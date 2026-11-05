/**
 * Property-based tests for src/engine/profileBuilder.ts
 *
 * Covers design property 7 (Threat Level Monotonicity).
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { threatLevelFromCents } from '../src/engine/profileBuilder';
import type { ExchangeRates, ThreatLevel } from '../src/engine/types';

const THREAT_ORDER: Record<ThreatLevel, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

const RATES: ExchangeRates = { USD: 1.0 };

// Feature: vampire-hunter, Property 7: Threat Level Monotonicity
describe('Property 7: Threat Level Monotonicity', () => {
  it('higher annual cents never yields a lower threat level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (centsA, centsB) => {
          const levelA = threatLevelFromCents(centsA, 'USD', RATES);
          const levelB = threatLevelFromCents(centsB, 'USD', RATES);
          if (centsA > centsB) {
            expect(THREAT_ORDER[levelA]).toBeGreaterThanOrEqual(THREAT_ORDER[levelB]);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
