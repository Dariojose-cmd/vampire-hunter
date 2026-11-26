/**
 * VampireCard badge render checks for gated flags.
 * Spec: .kiro/specs/non-merchant-false-positives-fix (task 3.3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VampireCard } from '@components/VampireCard';
import { translate, type Language } from '@i18n/index';
import type { Vampire } from '@engine/types';

function makeVampire(overrides: Partial<Vampire>): Vampire {
  return {
    id: 'acme_0',
    normalizedName: 'ACME',
    displayName: 'Acme',
    cadence: 'monthly',
    bites: [],
    medianAmountCents: 1499,
    annualBloodLossCents: 17988,
    threatLevel: 'Medium',
    firstBiteDate: '2024-01-15',
    lastBiteDate: '2024-02-15',
    nextBiteDate: '2024-03-15',
    confidenceScore: 55,
    isAmountStable: true,
    hasFreeTrial: false,
    hasPriceIncrease: false,
    amountHistory: [1499, 1499],
    avatarSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
    currency: 'USD',
    ...overrides,
  };
}

const LANGS: Language[] = ['en', 'es'];

describe('VampireCard badges with gated flags', () => {
  afterEach(cleanup);

  it.each(LANGS)('2-charge monthly vampire shows neither badge (%s)', (lang) => {
    render(<VampireCard vampire={makeVampire({})} language={lang} currency="USD" />);
    expect(screen.queryByText(translate(lang, 'vampireCard.freeTrial'), { exact: false })).toBeNull();
    expect(screen.queryByText(translate(lang, 'vampireCard.priceIncreaseLabel'), { exact: false })).toBeNull();
  });

  it.each(LANGS)('2-charge yearly vampire with flags set still shows price history (%s)', (lang) => {
    const v = makeVampire({ cadence: 'yearly', hasPriceIncrease: true, amountHistory: [6000, 7200] });
    render(<VampireCard vampire={v} language={lang} currency="USD" />);
    expect(screen.getByText(translate(lang, 'vampireCard.priceIncreaseLabel'), { exact: false })).toBeTruthy();
  });
});
