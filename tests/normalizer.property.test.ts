/**
 * Property-based tests for src/engine/normalizer.ts
 *
 * Covers design property 1 (Normalization Idempotence).
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { normalize, stripAccents } from '../src/engine/normalizer';

/**
 * Bank-like token generator.
 *
 * A plain `fc.string()` almost never emits the mixed merchant / noise-keyword /
 * reference-code / card-number shape that real statement descriptions have, so
 * it failed to exercise the normalizer's boundary-anchored cleanup. This
 * generator builds arbitrary descriptions out of realistic token kinds joined
 * by single spaces:
 *   - merchant words (a small fixed pool),
 *   - noise keywords the normalizer strips,
 *   - digit runs of 4–8 digits (card-number shaped),
 *   - alphanumeric codes of 6–10 chars from [A-Z0-9], at least one containing a
 *     digit so they hit the reference-code regex (e.g. "0AA000", "0AAAA0").
 */
const merchantWord = fc.constantFrom(
  'NETFLIX',
  'SPOTIFY',
  'APPLE.COM',
  'AMAZON',
  'UBER',
  'STARBUCKS',
  'WALMART',
  'BILL',
);

const noiseKeyword = fc.constantFrom(
  'POS',
  'PURCHASE',
  'COMPRA',
  'PAGO',
  'CARGO',
  'DEBITO',
  'DEBIT',
  'PAYMENT',
);

const digitRun = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 4, maxLength: 8 })
  .map((ds) => ds.join(''));

// Alphanumeric code of 6–10 chars from [A-Z0-9], guaranteed to contain at least
// one digit so it can match the reference-code pattern.
const alnumCode = fc
  .array(
    fc.constantFrom(
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
      'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
      'U', 'V', 'W', 'X', 'Y', 'Z',
    ),
    { minLength: 5, maxLength: 9 },
  )
  .chain((chars) =>
    fc.integer({ min: 0, max: 9 }).map((d) => {
      // Insert a digit at the front to guarantee the ref-code regex (needs ≥1
      // digit) can match, keeping total length in [6, 10].
      return `${d}${chars.join('')}`;
    }),
  );

const bankToken = fc.oneof(merchantWord, noiseKeyword, digitRun, alnumCode);

const bankLikeString = fc
  .array(bankToken, { minLength: 1, maxLength: 8 })
  .map((tokens) => tokens.join(' '));

// Feature: vampire-hunter, Property 1: Normalization Idempotence
describe('Property 1: Normalization Idempotence', () => {
  it('normalize(normalize(s)) === normalize(s) for bank-like descriptions', () => {
    fc.assert(
      fc.property(bankLikeString, (s) => {
        expect(normalize(normalize(s))).toBe(normalize(s));
      }),
      { numRuns: 1000 },
    );
  });

  // Regression: the exact counterexample surfaced by the bank-like generator.
  // One cleanup pass is not a fixpoint — removing a leading ref code shifts a
  // later token to a boundary where it then matches. normalize must iterate to
  // a fixpoint so a second pass is a no-op.
  it('is idempotent on "NETFLIX 0AA000 0AAAA0" (regression)', () => {
    const s = 'NETFLIX 0AA000 0AAAA0';
    expect(normalize(normalize(s))).toBe(normalize(s));
  });
});

describe('Accent-insensitive normalization', () => {
  const accented = fc
    .array(
      fc.oneof(
        bankToken,
        fc.constantFrom('SUSCRIPCIÓN', 'Café', 'ñandú', 'Müller', 'Crédito', 'à la carte'),
      ),
      { minLength: 1, maxLength: 8 },
    )
    .map((t) => t.join(' '));

  it('normalize(stripAccents(s)) === normalize(s)', () => {
    fc.assert(
      fc.property(accented, (s) => {
        expect(normalize(stripAccents(s))).toBe(normalize(s));
      }),
      { numRuns: 1000 },
    );
  });

  it('normalize(stripAccents(s)) === normalize(s) for arbitrary unicode strings', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(normalize(stripAccents(s))).toBe(normalize(s));
      }),
      { numRuns: 500 },
    );
  });
});
