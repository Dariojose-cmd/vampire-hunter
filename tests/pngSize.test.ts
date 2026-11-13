import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readPngSize } from '../src/engine/pngSize';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function be32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function buildPng(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...SIGNATURE,
    ...be32(13),
    0x49, 0x48, 0x44, 0x52,
    ...be32(width),
    ...be32(height),
    8, 6, 0, 0, 0,
    0, 0, 0, 0,
  ]);
}

describe('readPngSize', () => {
  // Feature: privacy-you-can-verify, Property 18: PNG size round trip
  // **Validates: Requirements 5.6**
  it('round-trips width and height from a minimal PNG header', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 65535 }), fc.integer({ min: 1, max: 65535 }), (w, h) => {
        expect(readPngSize(buildPng(w, h))).toEqual({ width: w, height: h });
      }),
      { numRuns: 100 },
    );
  });

  it('returns null for truncated PNG bytes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 65535 }),
        fc.integer({ min: 1, max: 65535 }),
        fc.integer({ min: 0, max: 23 }),
        (w, h, cut) => {
          expect(readPngSize(buildPng(w, h).slice(0, cut))).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when the signature is wrong', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 65535 }),
        fc.integer({ min: 1, max: 65535 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 1, max: 255 }),
        (w, h, idx, delta) => {
          const bytes = buildPng(w, h);
          bytes[idx] = (bytes[idx] + delta) & 0xff;
          expect(readPngSize(bytes)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
