import { describe, expect, it } from 'vitest';
import { runDetection } from '../src/engine/index';
import { normalize } from '../src/engine/normalizer';
import type { Transaction } from '../src/engine/types';

function monthly(desc: string): Transaction[] {
  return [1, 2, 3, 4, 5, 6].map((m) => ({
    id: `${desc}-${m}`,
    date: `2025-0${m}-10`,
    description: desc,
    normalizedName: normalize(desc),
    amountCents: 1500,
    type: 'debit' as const,
    currency: 'USD',
  }));
}

const all = (d: string): number => {
  const r = runDetection({ transactions: monthly(d), currency: 'USD' });
  return r.vampires.length + r.possibleVampires.length;
};

describe('payment-received filter', () => {
  it('drops card payment rows', () => {
    expect(all('PAYMENT THANK YOU')).toBe(0);
    expect(all('Pagamento recebido')).toBe(0);
  });
  it('keeps merchants that merely contain "thank you"', () => {
    expect(all('THANK YOU MARKET')).toBeGreaterThan(0);
  });
});
