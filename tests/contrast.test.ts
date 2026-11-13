import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { contrastRatio, parseHexColor, type Rgb } from '../src/engine/contrast';

const byte = fc.integer({ min: 0, max: 255 });
const rgb: fc.Arbitrary<Rgb> = fc.record({ r: byte, g: byte, b: byte });
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

describe('contrast', () => {
  // Feature: privacy-you-can-verify, Property 15: Contrast function laws
  // **Validates: Requirements 11.7, 11.11, 14.10**
  describe('Property 15: Contrast function laws', () => {
    it('is symmetric, within 1..21, and 1 for identical colors', () => {
      fc.assert(
        fc.property(rgb, rgb, (a, b) => {
          const ab = contrastRatio(a, b);
          expect(ab).toBeCloseTo(contrastRatio(b, a), 10);
          expect(ab).toBeGreaterThanOrEqual(1);
          expect(ab).toBeLessThanOrEqual(21);
          expect(contrastRatio(a, a)).toBe(1);
        }),
        { numRuns: 100 },
      );
      expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 10);
    });

    it('parseHexColor round-trips #rrggbb (any case) and #rgb', () => {
      fc.assert(
        fc.property(rgb, fc.boolean(), (c, upper) => {
          const h = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
          expect(parseHexColor(upper ? h.toUpperCase() : h)).toEqual(c);
        }),
        { numRuns: 100 },
      );
      fc.assert(
        fc.property(fc.tuple(fc.integer({ min: 0, max: 15 }), fc.integer({ min: 0, max: 15 }), fc.integer({ min: 0, max: 15 })), ([r, g, b]) => {
          const h = `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`;
          expect(parseHexColor(h)).toEqual({ r: r * 17, g: g * 17, b: b * 17 });
        }),
        { numRuns: 100 },
      );
    });

    it('returns null for non-opaque or invalid hex', () => {
      const hexDigits = (n: number) =>
        fc.array(fc.constantFrom(...'0123456789abcdefABCDEF'.split('')), { minLength: n, maxLength: n }).map((a) => a.join(''));
      fc.assert(
        fc.property(
          fc.oneof(
            hexDigits(4).map((s) => `#${s}`), // #rgba
            hexDigits(8).map((s) => `#${s}`), // #rrggbbaa
            hexDigits(6), // missing '#'
            hexDigits(5).map((s) => `#${s}`),
            hexDigits(6).map((s) => `#${s.slice(0, 5)}g`),
          ),
          (s) => {
            expect(parseHexColor(s)).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

describe('contrast unit tests', () => {
  // **Validates: Requirements 14.10**
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('black on white is 21', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
  });

  it('identical colors give 1', () => {
    expect(contrastRatio(white, white)).toBe(1);
    expect(contrastRatio({ r: 13, g: 13, b: 26 }, { r: 13, g: 13, b: 26 })).toBe(1);
  });

  it('#767676 on #ffffff matches the published ~4.54', () => {
    const a = parseHexColor('#767676')!;
    const b = parseHexColor('#ffffff')!;
    expect(contrastRatio(a, b)).toBeCloseTo(4.54, 2);
  });

  it('parseHexColor expands shorthand and reads long form', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('#0D0D1A')).toEqual({ r: 13, g: 13, b: 26 });
    expect(parseHexColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('parseHexColor rejects invalid input', () => {
    expect(parseHexColor('fff')).toBeNull();
    expect(parseHexColor('#ffff')).toBeNull();
    expect(parseHexColor('#gggggg')).toBeNull();
    expect(parseHexColor('')).toBeNull();
  });
});
