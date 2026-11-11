/**
 * Unit tests for src/engine/normalizer.ts (task 13.4).
 *
 * Covers each noise keyword (case-insensitive), card-number removal,
 * reference-code removal at start/end, whitespace collapsing, uppercase
 * output, and combined noise in a single string.
 *
 * Idempotence (Property 1) is covered separately in normalizer.property.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { normalize, normalizeForDisplay } from '../src/engine/normalizer';

describe('normalize — noise keywords (case-insensitive, word-boundary)', () => {
  const keywords = ['POS', 'PURCHASE', 'COMPRA', 'PAGO', 'CARGO', 'DEBITO', 'DEBIT', 'PAYMENT'];

  for (const kw of keywords) {
    it(`strips leading "${kw}"`, () => {
      expect(normalize(`${kw} NETFLIX`)).toBe('NETFLIX');
    });
    it(`strips trailing "${kw}"`, () => {
      expect(normalize(`NETFLIX ${kw}`)).toBe('NETFLIX');
    });
    it(`strips lowercase "${kw.toLowerCase()}" (case-insensitive)`, () => {
      expect(normalize(`${kw.toLowerCase()} spotify`)).toBe('SPOTIFY');
    });
  }

  it('does not strip a keyword embedded inside a larger word (word boundary)', () => {
    // "POSADA" contains "POS" but is a whole word — must survive.
    expect(normalize('POSADA HOTEL')).toBe('POSADA HOTEL');
  });
});

describe('normalize — card-number removal (4+ consecutive digits)', () => {
  it('removes a 4-digit run', () => {
    expect(normalize('NETFLIX 1234')).toBe('NETFLIX');
  });

  it('removes a long digit run', () => {
    expect(normalize('NETFLIX 1234567890')).toBe('NETFLIX');
  });

  it('removes an interior card suffix but keeps the surrounding words', () => {
    expect(normalize('VISA 4321 NETFLIX')).toBe('VISA NETFLIX');
  });

  it('keeps runs of fewer than 4 digits', () => {
    expect(normalize('NETFLIX 123')).toBe('NETFLIX 123');
  });
});

describe('normalize — reference-code removal (alphanumeric 6+, needs a digit, at a boundary)', () => {
  it('removes a leading reference code', () => {
    expect(normalize('REF123456 NETFLIX')).toBe('NETFLIX');
  });

  it('removes a trailing reference code (whole token, before digit strip)', () => {
    expect(normalize('NETFLIX TXN20241101')).toBe('NETFLIX');
  });

  it('keeps a purely alphabetic 6+ token (not a ref code — likely a merchant word)', () => {
    expect(normalize('NETFLIX ABCDEF')).toBe('NETFLIX ABCDEF');
  });
});

describe('normalize — whitespace and casing', () => {
  it('collapses runs of whitespace to a single space', () => {
    expect(normalize('NETFLIX   STORE')).toBe('NETFLIX STORE');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalize('   NETFLIX   ')).toBe('NETFLIX');
  });

  it('uppercases all output', () => {
    expect(normalize('netflix store')).toBe('NETFLIX STORE');
  });
});

describe('normalize — combined noise in a single string', () => {
  it('strips multiple keywords, a card number, and a ref code together', () => {
    expect(normalize('POS COMPRA NETFLIX 123456 REF987654')).toBe('NETFLIX');
  });

  it('returns empty string when everything is noise', () => {
    expect(normalize('POS CARGO')).toBe('');
  });

  it('is a no-op on an already-clean single-word merchant', () => {
    expect(normalize('SPOTIFY')).toBe('SPOTIFY');
  });
});

describe('normalize: phone numbers, store numbers, 7-ELEVEN', () => {
  it('strips dashed phone numbers', () => {
    expect(normalize('NETFLIX 800-555-1234')).toBe('NETFLIX');
  });
  it('strips unformatted 10-digit phone numbers', () => {
    expect(normalize('SPOTIFY 8885551234')).toBe('SPOTIFY');
  });
  it('strips parenthesised and country-code phone numbers', () => {
    expect(normalize('HULU (800) 555-1234')).toBe('HULU');
    expect(normalize('HULU 1-800-555-1234')).toBe('HULU');
  });
  it('strips #-prefixed store numbers', () => {
    expect(normalize('TARGET #1234')).toBe('TARGET');
    expect(normalize('TARGET #12 MAIN')).toBe('TARGET MAIN');
  });
  it('treats 7ELEVEN / 7-ELEVEN / 7 ELEVEN consistently', () => {
    const variants = ['7ELEVEN', '7-ELEVEN', '7 ELEVEN', '7-Eleven #2345', '7ELEVEN 800-555-1234'];
    for (const v of variants) expect(normalize(v)).toBe('7-ELEVEN');
  });
});

describe('embedded dates and accents', () => {
  it('strips YYYY-MM-DD dates', () => {
    expect(normalize('SMART FIT COLOMBIA 2026-01-05')).toBe('SMART FIT COLOMBIA');
  });
  it('strips DD/MM/YYYY dates', () => {
    expect(normalize('SMART FIT COLOMBIA 05/01/2026')).toBe('SMART FIT COLOMBIA');
  });
  it('strips DD-MM-YYYY dates', () => {
    expect(normalize('SMART FIT COLOMBIA 05-01-2026')).toBe('SMART FIT COLOMBIA');
  });
  it('groups descriptions that differ only by accents', () => {
    expect(normalize('SUSCRIPCIÓN X')).toBe(normalize('SUSCRIPCION X'));
    expect(normalize('SUSCRIPCIÓN X')).toBe('SUSCRIPCION X');
  });
  it('normalizeForDisplay keeps accents', () => {
    expect(normalizeForDisplay('suscripción x 2026-01-05')).toBe('SUSCRIPCIÓN X');
  });
});
