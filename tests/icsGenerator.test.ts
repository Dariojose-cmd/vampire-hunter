/**
 * Unit tests for src/engine/icsGenerator.ts
 *
 * Covers `generateIcs(vampire, language, i18nStrings)`:
 *  - returns a successful Result containing VCALENDAR/VEVENT
 *  - DTSTART;VALUE=DATE equals nextBiteDate minus 3 days (YYYYMMDD)
 *  - SUMMARY contains the vampire displayName
 *  - DESCRIPTION differs between en and es i18n strings
 *  - never throws and returns a failed Result for a malformed nextBiteDate
 *
 * The IcsI18n templates come from the real `garlic` leaf of en.json / es.json
 * so the test validates against the actual shipped strings.
 */

import { describe, expect, it } from 'vitest';
import { generateIcs } from '../src/engine/icsGenerator';
import type { Vampire } from '../src/engine/types';
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';

const enGarlic = en.garlic;
const esGarlic = es.garlic;

/** Build a minimal but complete Vampire object for ICS generation. */
function makeVampire(overrides: Partial<Vampire> = {}): Vampire {
  return {
    id: 'NETFLIX_0',
    normalizedName: 'NETFLIX',
    displayName: 'Netflix',
    cadence: 'monthly',
    bites: [],
    medianAmountCents: 1549,
    annualBloodLossCents: 1549 * 12,
    threatLevel: 'Medium',
    firstBiteDate: '2026-04-15',
    lastBiteDate: '2026-05-15',
    nextBiteDate: '2026-06-15',
    confidenceScore: 85,
    isAmountStable: true,
    hasFreeTrial: false,
    hasPriceIncrease: false,
    amountHistory: [1549, 1549, 1549],
    avatarSvg: '<svg></svg>',
    currency: 'USD',
    ...overrides,
  };
}

describe('generateIcs', () => {
  it('returns a successful Result containing VCALENDAR and VEVENT', () => {
    const result = generateIcs(makeVampire(), 'en', enGarlic);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value).toContain('BEGIN:VCALENDAR');
    expect(result.value).toContain('BEGIN:VEVENT');
    expect(result.value).toContain('END:VEVENT');
    expect(result.value).toContain('END:VCALENDAR');
  });

  it('uses CRLF line endings', () => {
    const result = generateIcs(makeVampire(), 'en', enGarlic);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    // RFC 5545 requires CRLF; lines are joined with \r\n.
    expect(result.value).toContain('\r\n');
    expect(result.value).toContain('BEGIN:VCALENDAR\r\n');
  });

  it('DTSTART;VALUE=DATE equals nextBiteDate minus 3 days (YYYYMMDD)', () => {
    // nextBiteDate 2026-06-15 → event date 2026-06-12 → 20260612
    const result = generateIcs(makeVampire({ nextBiteDate: '2026-06-15' }), 'en', enGarlic);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value).toContain('DTSTART;VALUE=DATE:20260612');
  });

  it('DTSTART handles month boundaries when subtracting 3 days', () => {
    // nextBiteDate 2026-06-01 → 3 days earlier is 2026-05-29 → 20260529
    const result = generateIcs(makeVampire({ nextBiteDate: '2026-06-01' }), 'en', enGarlic);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value).toContain('DTSTART;VALUE=DATE:20260529');
  });

  it('SUMMARY contains the vampire displayName', () => {
    const result = generateIcs(makeVampire({ displayName: 'Netflix' }), 'en', enGarlic);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    const summaryLine = result.value
      .split('\r\n')
      .find((line) => line.startsWith('SUMMARY:'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain('Netflix');
  });

  it('DESCRIPTION differs between en and es i18n strings', () => {
    const vampire = makeVampire();
    const enResult = generateIcs(vampire, 'en', enGarlic);
    const esResult = generateIcs(vampire, 'es', esGarlic);
    expect(enResult.ok).toBe(true);
    expect(esResult.ok).toBe(true);
    if (!enResult.ok || !esResult.ok) throw new Error('unreachable');

    const enDesc = enResult.value
      .split('\r\n')
      .find((line) => line.startsWith('DESCRIPTION:'));
    const esDesc = esResult.value
      .split('\r\n')
      .find((line) => line.startsWith('DESCRIPTION:'));
    expect(enDesc).toBeDefined();
    expect(esDesc).toBeDefined();
    expect(enDesc).not.toEqual(esDesc);
  });

  it('never throws and returns a failed Result for a malformed nextBiteDate', () => {
    let result!: ReturnType<typeof generateIcs>;
    expect(() => {
      result = generateIcs(makeVampire({ nextBiteDate: 'not-a-date' }), 'en', enGarlic);
    }).not.toThrow();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('PARSE_FAILED');
  });
});
