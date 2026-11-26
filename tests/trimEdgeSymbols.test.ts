import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { trimEdgeSymbols } from '../src/engine/index';

describe('trimEdgeSymbols', () => {
  it('strips edge symbol runs', () => {
    expect(trimEdgeSymbols('****X*')).toBe('X');
    expect(trimEdgeSymbols('*A B*')).toBe('A B');
    expect(trimEdgeSymbols('****RETENCION IVASD DLC* UBER')).toBe('RETENCION IVASD DLC* UBER');
    expect(trimEdgeSymbols('#ACME#')).toBe('ACME');
    expect(trimEdgeSymbols('--SHOP--')).toBe('SHOP');
  });

  it('keeps trailing dots and closing brackets', () => {
    expect(trimEdgeSymbols('ZIGGO B.V.')).toBe('ZIGGO B.V.');
    expect(trimEdgeSymbols('NETFLIX (US)')).toBe('NETFLIX (US)');
    expect(trimEdgeSymbols('INC.')).toBe('INC.');
    expect(trimEdgeSymbols('S.A.')).toBe('S.A.');
  });

  it('keeps inner symbols and already clean names', () => {
    expect(trimEdgeSymbols('A&T')).toBe('A&T');
    expect(trimEdgeSymbols('Netflix')).toBe('Netflix');
    expect(trimEdgeSymbols('Ñandú 24')).toBe('Ñandú 24');
  });

  it('returns empty for all-symbol or empty input', () => {
    expect(trimEdgeSymbols('***')).toBe('');
    expect(trimEdgeSymbols(' - ')).toBe('');
    expect(trimEdgeSymbols('')).toBe('');
  });

  it('is idempotent', () => {
    const once = trimEdgeSymbols('--*A*B*--');
    expect(trimEdgeSymbols(once)).toBe(once);
  });

  /** **Validates: Requirements 2.2, 3.6** */
  it('property: no leading/trailing junk, never adds characters, idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const out = trimEdgeSymbols(s);
        expect(/^[*#_~|\\/=+\-\s]|[*#_~|\\/=+\-\s]$/.test(out)).toBe(false);
        expect(out.length).toBeLessThanOrEqual(s.length);
        expect(s.includes(out)).toBe(true);
        expect(trimEdgeSymbols(out)).toBe(out);
      }),
    );
  });
});
