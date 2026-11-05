/**
 * Property-based tests for src/engine/parser.ts
 *
 * Covers design properties 9 (Amount Cents Integrity) and
 * 11 (Thousands-Separator Detection).
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { inferNumberFormat, parseCents } from '../src/engine/parser';
import type { NumberFormat } from '../src/engine/types';

// Feature: vampire-hunter, Property 9: Amount Cents Integrity
describe('Property 9: Amount Cents Integrity', () => {
  const dotDecimal = fc
    .tuple(fc.integer({ min: 0, max: 999999 }), fc.integer({ min: 0, max: 99 }))
    .map(([i, d]): [string, NumberFormat] => [`${i}.${String(d).padStart(2, '0')}`, 'dotDecimal']);

  const commaDecimal = fc
    .tuple(fc.integer({ min: 0, max: 999999 }), fc.integer({ min: 0, max: 99 }))
    .map(([i, d]): [string, NumberFormat] => [`${i},${String(d).padStart(2, '0')}`, 'commaDecimal']);

  it('parseCents returns an integer for dot/comma decimal amounts', () => {
    fc.assert(
      fc.property(fc.oneof(dotDecimal, commaDecimal), ([s, format]) => {
        expect(Number.isInteger(parseCents(s, format))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

// Feature: vampire-hunter, Property 11: Thousands-Separator Detection
describe('Property 11: Thousands-Separator Detection', () => {
  // Dot-as-thousands, no decimal part, e.g. "45.900" or "1.200.000".
  const arbitraryThousandsDotAmount = fc
    .integer({ min: 1000, max: 99_999_999 })
    .map((n) => n.toLocaleString('de-DE').replace(/,/g, ''));

  it('infers noDecimal and parses dot-thousands amounts as whole cents', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryThousandsDotAmount, { minLength: 2, maxLength: 20 }),
        (column) => {
          const format = inferNumberFormat(column);
          expect(format).toBe('noDecimal');
          for (const val of column) {
            const numeric = parseInt(val.replace(/\./g, ''), 10);
            expect(parseCents(val, format)).toBe(numeric * 100);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
