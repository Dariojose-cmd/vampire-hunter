/**
 * Property-based tests for src/engine/normalizer.ts
 *
 * Covers design property 1 (Normalization Idempotence).
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { normalize } from '../src/engine/normalizer';

// Feature: vampire-hunter, Property 1: Normalization Idempotence
describe('Property 1: Normalization Idempotence', () => {
  it('normalize(normalize(s)) === normalize(s) for any string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalize(normalize(s))).toBe(normalize(s));
      }),
      { numRuns: 1000 },
    );
  });
});
