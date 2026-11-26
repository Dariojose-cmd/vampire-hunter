/**
 * Flag gating and exclusion filter in runDetection.
 * Spec: .kiro/specs/non-merchant-false-positives-fix (task 3.3).
 * All data is synthetic.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runDetection, MIN_CHARGES_FOR_FLAGS, LONG_CADENCES } from '@engine/index';
import { buildCandidates } from '@engine/grouper';
import { detectCadence, detectFreeTrial } from '@engine/cadenceDetector';
import { computeScore } from '@engine/scorer';
import { matchCatalog } from '@engine/catalogMatcher';
import { normalize } from '@engine/normalizer';
import { isNonMerchant } from '@engine/nonMerchant';
import type { Cadence, CatalogEntry, Transaction, Vampire } from '@engine/types';
import catalogJson from '../src/data/catalog.json';

const GAP: Record<Cadence, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 };

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function series(description: string, amounts: number[], gapDays: number, start = '2025-01-10'): Transaction[] {
  return amounts.map((amountCents, i) => ({
    id: `${description}-${i}`,
    date: addDays(start, i * gapDays),
    description,
    normalizedName: '',
    amountCents,
    type: 'debit' as const,
    currency: 'USD',
  }));
}

function listed(txs: Transaction[]): Vampire[] {
  const r = runDetection({ transactions: txs, currency: 'USD' });
  return [...r.vampires, ...r.possibleVampires];
}

/** Pre-fix oracle: raw flags and score for the same transactions. */
function rawOracle(txs: Transaction[]) {
  const normalized = txs.map((t) => ({ ...t, normalizedName: normalize(t.description) }));
  const out = new Map<string, { hasFreeTrial: boolean; hasPriceIncrease: boolean; cadence: Cadence; bites: number }>();
  for (const { id, candidate } of buildCandidates(normalized)) {
    const cadence = detectCadence(candidate.bites.map((b) => b.date));
    if (cadence === null) continue;
    out.set(id, {
      hasFreeTrial: detectFreeTrial(candidate.bites, candidate.medianAmountCents),
      hasPriceIncrease: candidate.hasPriceIncrease,
      cadence,
      bites: candidate.bites.length,
    });
  }
  return out;
}

describe('constants', () => {
  it('exposes the gate thresholds', () => {
    expect(MIN_CHARGES_FOR_FLAGS).toBe(3);
    expect([...LONG_CADENCES].sort()).toEqual(['quarterly', 'yearly']);
  });
});

describe('badge gating by cadence and charge count', () => {
  const short: Cadence[] = ['weekly', 'monthly'];
  it.each(short)('2 charges, %s: price step badge is off', (cadence) => {
    const items = listed(series('ACME STREAMING', [1000, 1200], GAP[cadence]));
    expect(items).toHaveLength(1);
    expect(items[0].bites).toHaveLength(2);
    expect(items[0].hasPriceIncrease).toBe(false);
    expect(items[0].hasFreeTrial).toBe(false);
  });

  it.each(short)('2 charges, %s: trial-sized first charge badge is off', (cadence) => {
    const items = listed(series('ACME STREAMING', [100, 1900], GAP[cadence]));
    expect(items).toHaveLength(1);
    expect(items[0].hasFreeTrial).toBe(false);
  });

  it.each([
    ['quarterly', 91],
    ['yearly', 365],
  ] as const)('2 charges, %s: price step badge is kept', (cadence, gap) => {
    const items = listed(series('ACME CLUB', [1000, 1200], gap));
    expect(items).toHaveLength(1);
    expect(items[0].cadence).toBe(cadence);
    expect(items[0].hasPriceIncrease).toBe(true);
  });

  it.each(['weekly', 'monthly', 'quarterly', 'yearly'] as Cadence[])(
    '3 charges, %s: raw flags are kept',
    (cadence) => {
      const txs = series('ACME STREAMING', [1000, 1000, 1200, 1200], GAP[cadence]);
      const raw = [...rawOracle(txs).entries()];
      const items = listed(txs);
      for (const v of items) {
        const o = raw.find(([id]) => id === v.id)![1];
        expect(v.hasPriceIncrease).toBe(o.hasPriceIncrease);
        expect(v.hasFreeTrial).toBe(o.hasFreeTrial);
      }
    },
  );

  it('3 charges with a free first charge keep hasFreeTrial', () => {
    const items = listed(series('ACME STREAMING', [0, 1500, 1500, 1500], 30));
    expect(items.some((v) => v.hasFreeTrial)).toBe(true);
  });
});

describe('score invariance', () => {
  it('2-bite yearly catalog series with a price step keeps score 80 and the flag (Costco shape)', () => {
    const items = listed(series('COSTCO ANNUAL MEMBERSHIP', [6000, 7200], 365));
    expect(items).toHaveLength(1);
    expect(items[0].confidenceScore).toBe(80);
    expect(items[0].hasPriceIncrease).toBe(true);
  });

  it('2-bite monthly series with a price step scores from the raw flag while the badge is off', () => {
    const txs = series('ACME STREAMING', [1000, 1200], 30);
    const normalized = txs.map((t) => ({ ...t, normalizedName: normalize(t.description) }));
    const [{ candidate }] = buildCandidates(normalized);
    const cadence = detectCadence(candidate.bites.map((b) => b.date))!;
    const match = matchCatalog(candidate.normalizedName, catalogJson as CatalogEntry[]);
    let expected = computeScore(
      {
        normalizedName: candidate.normalizedName,
        bites: candidate.bites,
        cadence,
        medianAmountCents: candidate.medianAmountCents,
        isAmountStable: candidate.isAmountStable,
        hasFreeTrial: detectFreeTrial(candidate.bites, candidate.medianAmountCents),
        hasPriceIncrease: candidate.hasPriceIncrease,
        amountHistory: candidate.amountHistory,
      },
      match !== undefined,
    );
    if (match === undefined) expected = Math.min(expected, 59);
    const items = listed(txs);
    expect(items).toHaveLength(1);
    expect(items[0].confidenceScore).toBe(expected);
    expect(items[0].hasPriceIncrease).toBe(false);
  });
});

describe('properties', () => {
  const cadenceArb = fc.constantFrom<Cadence>('weekly', 'monthly', 'quarterly', 'yearly');
  const seriesArb = fc.record({
    cadence: cadenceArb,
    count: fc.integer({ min: 2, max: 12 }),
    base: fc.integer({ min: 300, max: 5000 }),
    first: fc.constantFrom(1, 0.1, 0),
    stepAt: fc.integer({ min: 1, max: 11 }),
    step: fc.constantFrom(1, 1.2, 1.5),
  });

  function build(s: fc.GetType<typeof seriesArb>): Transaction[] {
    const amounts = Array.from({ length: s.count }, (_, i) => {
      const a = Math.round(s.base * (i >= s.stepAt ? s.step : 1));
      return i === 0 ? Math.round(a * s.first) : a;
    });
    return series('ACME STREAMING', amounts, GAP[s.cadence]);
  }

  it('fewer than 3 bites with weekly or monthly cadence never carry badges', () => {
    fc.assert(
      fc.property(seriesArb, (s) => {
        for (const v of listed(build(s))) {
          if (v.bites.length < 3 && (v.cadence === 'weekly' || v.cadence === 'monthly')) {
            expect(v.hasFreeTrial).toBe(false);
            expect(v.hasPriceIncrease).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('quarterly/yearly series and series with 3+ bites keep the raw flags', () => {
    fc.assert(
      fc.property(seriesArb, (s) => {
        const txs = build(s);
        const raw = rawOracle(txs);
        for (const v of listed(txs)) {
          const o = raw.get(v.id)!;
          if (v.bites.length >= 3 || v.cadence === 'quarterly' || v.cadence === 'yearly') {
            expect(v.hasFreeTrial).toBe(o.hasFreeTrial);
            expect(v.hasPriceIncrease).toBe(o.hasPriceIncrease);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('confidenceScore does not depend on whether badges are gated', () => {
    fc.assert(
      fc.property(seriesArb, (s) => {
        const txs = build(s);
        const normalized = txs.map((t) => ({ ...t, normalizedName: normalize(t.description) }));
        const cands = new Map(buildCandidates(normalized).map((c) => [c.id, c.candidate]));
        for (const v of listed(txs)) {
          const c = cands.get(v.id)!;
          const match = matchCatalog(c.normalizedName, catalogJson as CatalogEntry[]);
          let expected = computeScore(
            {
              normalizedName: c.normalizedName,
              bites: c.bites,
              cadence: v.cadence,
              medianAmountCents: c.medianAmountCents,
              isAmountStable: c.isAmountStable,
              hasFreeTrial: detectFreeTrial(c.bites, c.medianAmountCents),
              hasPriceIncrease: c.hasPriceIncrease,
              amountHistory: c.amountHistory,
            },
            match !== undefined,
          );
          if (c.bites.length === 2 && match === undefined) expected = Math.min(expected, 59);
          // creeping-split cap can only lower the score further
          expect(v.confidenceScore).toBeLessThanOrEqual(expected);
          if (v.confidenceScore < expected) expect(v.confidenceScore).toBeLessThanOrEqual(59);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no returned item has a bite description matching isNonMerchant', () => {
    const descArb = fc.constantFrom(
      'TRANSFERENCIA INTERNET',
      'RETIRO CAJERO AUTOMATICO',
      'PAGO TARJETA DE CREDITO',
      'ATM WITHDRAWAL',
      'NETFLIX',
      'COMISION MANTENIMIENTO CUENTA',
      'ACME SHOP',
      'SPOTIFY',
    );
    fc.assert(
      fc.property(fc.array(fc.tuple(descArb, cadenceArb, fc.integer({ min: 2, max: 6 })), { minLength: 1, maxLength: 4 }), (parts) => {
        const txs = parts.flatMap(([d, c, n], i) =>
          series(d, Array(n).fill(999 + i * 100), GAP[c]).map((t) => ({ ...t, id: `${t.id}-${i}` })),
        );
        for (const v of listed(txs)) {
          for (const b of v.bites) expect(isNonMerchant(b.description)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
