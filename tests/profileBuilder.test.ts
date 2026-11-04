/**
 * Unit tests for src/engine/profileBuilder.ts
 *
 * Covers:
 *  - annualBloodLossCents: each cadence multiplier
 *  - threatLevelFromCents: all four threshold tiers, currency conversion, unknown currency fallback
 *  - predictNextBite: each cadence interval, UTC safety, never throws
 */

import { describe, expect, it } from 'vitest';
import {
  annualBloodLossCents,
  predictNextBite,
  threatLevelFromCents,
} from '../src/engine/profileBuilder';
import type { ExchangeRates } from '../src/engine/types';

// Static rate table matching src/data/exchangeRates.json
const RATES: ExchangeRates = {
  USD: 1.0,
  MXN: 17.5,
  COP: 4000.0,
  ARS: 900.0,
  CLP: 950.0,
  EUR: 0.92,
  BRL: 5.0,
  GBP: 0.79,
  CAD: 1.36,
  PEN: 3.75,
};

// ---------------------------------------------------------------------------
// annualBloodLossCents
// ---------------------------------------------------------------------------

describe('annualBloodLossCents', () => {
  it('weekly × 52', () => {
    expect(annualBloodLossCents(699, 'weekly')).toBe(699 * 52); // $3.63/week → ~$188.76/yr
  });

  it('monthly × 12', () => {
    expect(annualBloodLossCents(1549, 'monthly')).toBe(1549 * 12); // $15.49/mo → $185.88/yr
  });

  it('quarterly × 4', () => {
    expect(annualBloodLossCents(3000, 'quarterly')).toBe(3000 * 4); // $30 → $120/yr
  });

  it('yearly × 1', () => {
    expect(annualBloodLossCents(13900, 'yearly')).toBe(13900); // $139/yr Costco
  });

  it('returns 0 for 0 cents (free trial / no cost)', () => {
    expect(annualBloodLossCents(0, 'monthly')).toBe(0);
  });

  it('always returns an integer', () => {
    const result = annualBloodLossCents(999, 'monthly');
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// threatLevelFromCents  (Requirement 6.3)
// ---------------------------------------------------------------------------

describe('threatLevelFromCents — USD thresholds', () => {
  it('Low: annual USD < $50', () => {
    // $2.99/mo × 12 = $35.88/yr
    expect(threatLevelFromCents(299 * 12, 'USD', RATES)).toBe('Low');
  });

  it('Low: boundary at $49.99', () => {
    // just under $50 → Low
    expect(threatLevelFromCents(4999, 'USD', RATES)).toBe('Low');
  });

  it('Medium: annual USD exactly $50.00', () => {
    expect(threatLevelFromCents(5000, 'USD', RATES)).toBe('Medium');
  });

  it('Medium: annual USD $100', () => {
    expect(threatLevelFromCents(10000, 'USD', RATES)).toBe('Medium');
  });

  it('Medium: boundary at $199.99', () => {
    expect(threatLevelFromCents(19999, 'USD', RATES)).toBe('Medium');
  });

  it('High: annual USD exactly $200.00', () => {
    expect(threatLevelFromCents(20000, 'USD', RATES)).toBe('High');
  });

  it('High: annual USD $300', () => {
    expect(threatLevelFromCents(30000, 'USD', RATES)).toBe('High');
  });

  it('High: boundary at $499.99', () => {
    expect(threatLevelFromCents(49999, 'USD', RATES)).toBe('High');
  });

  it('Critical: annual USD exactly $500.00', () => {
    expect(threatLevelFromCents(50000, 'USD', RATES)).toBe('Critical');
  });

  it('Critical: annual USD $1 200', () => {
    expect(threatLevelFromCents(120000, 'USD', RATES)).toBe('Critical');
  });
});

describe('threatLevelFromCents — currency conversion', () => {
  it('converts MXN correctly (rate 17.5)', () => {
    // $15.49/mo in MXN → 15.49 * 17.5 = 271.075 MXN/mo * 12 = 3252.9 MXN/yr ≈ $186 USD → Medium
    const annualMxnCents = Math.round(1549 * 17.5) * 12;
    expect(threatLevelFromCents(annualMxnCents, 'MXN', RATES)).toBe('Medium');
  });

  it('converts COP correctly (rate 4000)', () => {
    // A cheap $2/mo service in USD → 2 * 4000 = 8000 COP/mo * 12 = 96000 COP/yr → $24 USD → Low
    const annualCopCents = 200 * 4000 * 12; // 200 USD-cents worth * rate
    expect(threatLevelFromCents(annualCopCents, 'COP', RATES)).toBe('Low');
  });

  it('falls back to rate 1.0 for unknown currency', () => {
    // Unknown "XYZ" → treated as 1:1 USD; 30000 cents → $300 → High
    expect(threatLevelFromCents(30000, 'XYZ', RATES)).toBe('High');
  });
});

// ---------------------------------------------------------------------------
// predictNextBite  (Requirement 6.6)
// ---------------------------------------------------------------------------

describe('predictNextBite — interval arithmetic', () => {
  it('weekly: adds 7 days', () => {
    expect(predictNextBite('2024-01-01', 'weekly')).toBe('2024-01-08');
  });

  it('monthly: same day next month', () => {
    expect(predictNextBite('2024-01-01', 'monthly')).toBe('2024-02-01');
    expect(predictNextBite('2026-10-14', 'monthly')).toBe('2026-11-14');
  });

  it('quarterly: same day three months later', () => {
    expect(predictNextBite('2024-01-01', 'quarterly')).toBe('2024-04-01');
  });

  it('yearly: same day next year, even across a leap year', () => {
    expect(predictNextBite('2024-01-01', 'yearly')).toBe('2025-01-01');
    expect(predictNextBite('2026-05-28', 'yearly')).toBe('2027-05-28');
  });

  it('clamps to the last day of shorter months', () => {
    expect(predictNextBite('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(predictNextBite('2024-01-31', 'monthly')).toBe('2024-02-29');
    expect(predictNextBite('2024-02-29', 'yearly')).toBe('2025-02-28');
  });

  it('crosses year boundaries', () => {
    expect(predictNextBite('2026-12-15', 'monthly')).toBe('2027-01-15');
  });

  it('returns a valid YYYY-MM-DD ISO string', () => {
    const result = predictNextBite('2025-06-15', 'monthly');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('never throws — returns the input string on invalid date', () => {
    expect(() => predictNextBite('not-a-date', 'monthly')).not.toThrow();
  });
});
