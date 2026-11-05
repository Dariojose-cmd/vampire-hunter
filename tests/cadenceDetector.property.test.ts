/**
 * Property-based tests for src/engine/cadenceDetector.ts
 *
 * Covers design properties 2 (Monthly Cadence Detection) and
 * 10 (Cadence Tolerance Coverage).
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { detectCadence } from '../src/engine/cadenceDetector';
import type { Cadence } from '../src/engine/types';

const MS_PER_DAY = 86_400_000;

/**
 * Build `count` ISO date strings starting at 2023-01-01 with a uniform `gap`
 * of days between each consecutive pair.
 */
function uniformDates(count: number, gap: number): string[] {
  const startMs = new Date('2023-01-01').getTime();
  return Array.from({ length: count }, (_, i) =>
    new Date(startMs + i * gap * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

// Feature: vampire-hunter, Property 2: Monthly Cadence Detection
describe('Property 2: Monthly Cadence Detection', () => {
  it('returns "monthly" for 2..24 dates with a uniform gap in [26,35]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 24 }),
        fc.integer({ min: 26, max: 35 }),
        (count, gap) => {
          const dates = uniformDates(count, gap);
          expect(detectCadence(dates)).toBe('monthly');
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// Feature: vampire-hunter, Property 10: Cadence Tolerance Coverage
describe('Property 10: Cadence Tolerance Coverage', () => {
  const CADENCE_RANGES: [number, number, Cadence][] = [
    [5, 9, 'weekly'],
    [26, 35, 'monthly'],
    [85, 97, 'quarterly'],
    [355, 375, 'yearly'],
  ];

  for (const [min, max, expected] of CADENCE_RANGES) {
    it(`detects ${expected} for uniform gaps in [${min},${max}]`, () => {
      fc.assert(
        fc.property(
          fc.integer({ min, max }),
          fc.integer({ min: 2, max: 12 }),
          (gap, count) => {
            const dates = uniformDates(count, gap);
            expect(detectCadence(dates)).toBe(expected);
          },
        ),
        { numRuns: 1000 },
      );
    });
  }
});
