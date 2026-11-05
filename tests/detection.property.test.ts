/**
 * Property-based tests for the full detection pipeline (src/engine/index.ts).
 *
 * Home for the numbered design Properties:
 *  - Property 8: Avatar Determinism
 *  - Property 3: Order Independence
 *  - Property 4: No-Singleton Rule
 *  - Property 5: Credit Exclusion
 *
 * `runDetection` is called directly so these exercise the real end-to-end
 * pipeline (credit filter → normalize → group/cluster → cadence → score →
 * split). All properties run with { numRuns: 1000 }.
 *
 * The transaction generator deliberately builds *recurring series* (not just
 * independent random rows) so that detection actually fires. A purely random
 * generator almost never forms a recurring series, which makes the detection
 * properties pass vacuously. Properties 3 and 5 therefore carry an explicit
 * coverage guard: at least 80% of the 1000 generated inputs must produce at
 * least one vampire, or the assertion fails.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { runDetection } from '../src/engine/index';
import { generateAvatar } from '../src/engine/profileBuilder';
import type { Transaction, Vampire } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Recurring-series transaction generator
// ---------------------------------------------------------------------------

/** A pool of realistic merchant descriptions to drive grouping. */
const MERCHANTS = [
  'NETFLIX.COM',
  'SPOTIFY USA',
  'DISNEY PLUS',
  'AMAZON PRIME',
  'APPLE.COM/BILL',
  'HULU',
  'DROPBOX',
  'GITHUB.COM',
  'YOUTUBE PREMIUM',
  'ADOBE CREATIVE CLOUD',
  'WALMART GROCERY',
  'STARBUCKS COFFEE',
];

/** Hex-digit unit for id generation (fast-check v4 removed `fc.hexaString`). */
const HEX_DIGITS = '0123456789abcdef'.split('');

/** Arbitrary producing a short hex-like id string. */
const arbitraryId: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...HEX_DIGITS),
  minLength: 4,
  maxLength: 12,
});

/** Build a valid ISO 8601 YYYY-MM-DD date at UTC from a day offset. */
function isoFromEpochDay(epochDay: number): string {
  const ms = epochDay * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Convert a YYYY-MM-DD-ish base into an epoch-day integer. */
function epochDayOf(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Per-cadence base gap in days. Weekly ↦ 7, monthly ↦ 30. */
const CADENCE_GAP: Record<'weekly' | 'monthly', number> = {
  weekly: 7,
  monthly: 30,
};

/**
 * A single recurring series specification. `runDetection` re-normalizes the
 * description into `normalizedName`, so every bite shares one merchant string
 * and lands in the same group.
 */
interface SeriesSpec {
  merchant: string;
  cadence: 'weekly' | 'monthly';
  baseAmountCents: number;
  /** Small per-bite amount jitter in cents (kept well within ±10%). */
  jitter: number[];
  /** Realistic ±3 day shift applied to each bite date. */
  shifts: number[];
  startEpochDay: number;
  biteCount: number;
  /** Whole-series credit flag (e.g. a monthly salary deposit). */
  isCredit: boolean;
}

/** Arbitrary producing one recurring-series specification. */
const arbitrarySeries: fc.Arbitrary<SeriesSpec> = fc
  .record({
    cadence: fc.constantFrom<'weekly' | 'monthly'>('weekly', 'monthly'),
    // Base amount comfortably above zero so ±small jitter never goes negative
    // and the ±10% cluster tolerance is easy to respect.
    baseAmountCents: fc.integer({ min: 5_00, max: 500_00 }),
    biteCount: fc.integer({ min: 3, max: 8 }),
    year: fc.integer({ min: 2020, max: 2025 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    // ~20% of series are credits (monthly salary style).
    isCredit: fc.oneof(
      { arbitrary: fc.constant(false), weight: 4 },
      { arbitrary: fc.constant(true), weight: 1 },
    ),
    // Up to 8 per-bite date shifts (sliced to biteCount when materialised).
    // Realistic ±3 day drift, weighted toward smaller shifts the way real
    // billing dates behave (a charge rarely moves a full three days), so most
    // consecutive gaps stay inside the cadence bucket.
    shifts: fc.array(
      fc.oneof(
        { arbitrary: fc.integer({ min: -1, max: 1 }), weight: 3 },
        { arbitrary: fc.constantFrom(-2, 2), weight: 1 },
        { arbitrary: fc.constantFrom(-3, 3), weight: 1 },
      ),
      { minLength: 8, maxLength: 8 },
    ),
    jitterUnits: fc.array(fc.integer({ min: -2, max: 2 }), {
      minLength: 8,
      maxLength: 8,
    }),
  })
  .map((r) => {
    // Jitter is a tiny fraction of the base amount (≤ ~1%), so every bite stays
    // inside the grouper's ±10% cluster tolerance and never splits the series.
    const jitterStep = Math.max(1, Math.floor(r.baseAmountCents * 0.01));
    const jitter = r.jitterUnits.map((u) => u * jitterStep);
    return {
      // merchant is assigned at the statement level (distinct per series).
      merchant: '',
      cadence: r.cadence,
      baseAmountCents: r.baseAmountCents,
      jitter,
      shifts: r.shifts,
      startEpochDay: epochDayOf(r.year, r.month, r.day),
      biteCount: r.biteCount,
      isCredit: r.isCredit,
    } satisfies SeriesSpec;
  });

/** Materialise a SeriesSpec into concrete Transactions. */
function buildSeries(spec: SeriesSpec, seriesIndex: number): Transaction[] {
  const gap = CADENCE_GAP[spec.cadence];
  const txns: Transaction[] = [];
  for (let i = 0; i < spec.biteCount; i++) {
    const shift = spec.shifts[i] ?? 0;
    const epochDay = spec.startEpochDay + i * gap + shift;
    const amount = Math.max(1, spec.baseAmountCents + (spec.jitter[i] ?? 0));
    txns.push({
      id: `s${seriesIndex}-b${i}`,
      date: isoFromEpochDay(epochDay),
      description: spec.merchant,
      // runDetection re-normalizes this from `description`; mirror for clarity.
      normalizedName: spec.merchant,
      amountCents: amount,
      type: spec.isCredit ? 'credit' : 'debit',
      currency: 'USD',
    });
  }
  return txns;
}

/** Arbitrary producing a single random one-off noise Transaction. */
const arbitraryNoise: fc.Arbitrary<Transaction> = fc
  .record({
    id: arbitraryId,
    merchant: fc.constantFrom(...MERCHANTS),
    year: fc.integer({ min: 2020, max: 2026 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    amountCents: fc.integer({ min: 1, max: 5_000_00 }),
    type: fc.constantFrom<Transaction['type']>('debit', 'credit'),
  })
  .map((r) => ({
    id: `noise-${r.id}`,
    date: isoFromEpochDay(epochDayOf(r.year, r.month, r.day)),
    description: r.merchant,
    normalizedName: r.merchant,
    amountCents: r.amountCents,
    type: r.type,
    currency: 'USD',
  }));

/**
 * Arbitrary producing a full statement: 1–4 recurring series plus 0–10 one-off
 * noise transactions, flattened into a single transaction array.
 *
 * Each series is assigned a DISTINCT merchant from the pool. Two independent
 * recurring series for the same merchant with near-boundary amounts (within
 * ~10% of each other) are an inherently ambiguous clustering input — exactly
 * the case a realistic statement does not present, since separate
 * subscriptions are separate merchants. Keeping series merchants distinct lets
 * each series form its own stable cluster so detection is deterministic.
 */
const arbitraryStatement: fc.Arbitrary<Transaction[]> = fc
  .record({
    series: fc.array(arbitrarySeries, { minLength: 1, maxLength: 4 }),
    // A permutation of the merchant pool used to hand each series a distinct
    // merchant (the first `series.length` entries are consumed).
    merchantOrder: fc.shuffledSubarray(MERCHANTS, {
      minLength: MERCHANTS.length,
      maxLength: MERCHANTS.length,
    }),
    noise: fc.array(arbitraryNoise, { minLength: 0, maxLength: 10 }),
  })
  .map(({ series, merchantOrder, noise }) => {
    const out: Transaction[] = [];
    series.forEach((spec, i) => {
      const withMerchant: SeriesSpec = {
        ...spec,
        merchant: merchantOrder[i % merchantOrder.length],
      };
      out.push(...buildSeries(withMerchant, i));
    });
    out.push(...noise);
    return out;
  });

/**
 * Arbitrary producing a same-merchant statement: 2–3 INDEPENDENT recurring
 * series that all share ONE merchant, with per-series base amounts clustered
 * mutually within 10% of each other (max/min <= 1.1 — right at the grouper's
 * ±10% cluster-tolerance boundary). This is the inherently ambiguous input that
 * `arbitraryStatement` deliberately avoids: when several same-merchant series
 * sit near the clustering boundary, which bites land in which cluster can flip
 * with input order. Property 3b asserts detection is nonetheless
 * order-independent in both vampire ids AND bite memberships.
 */
const arbitrarySameMerchantStatement: fc.Arbitrary<Transaction[]> = fc
  .record({
    series: fc.array(arbitrarySeries, { minLength: 2, maxLength: 3 }),
    merchant: fc.constantFrom(...MERCHANTS),
    // A single shared base amount; each series' own base is nudged within
    // ±10% of it, so every series base is mutually within ~10% (max/min <=
    // 1.1) — the near-boundary cluster-tolerance case.
    sharedBaseCents: fc.integer({ min: 20_00, max: 500_00 }),
    // Per-series offset in [0, 1]; mapped to a factor in [1.0, 1.1] below so
    // the min base is `sharedBaseCents` and the max is <= sharedBaseCents*1.1.
    baseOffsets: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: 3,
      maxLength: 3,
    }),
    noise: fc.array(arbitraryNoise, { minLength: 0, maxLength: 10 }),
  })
  .map(({ series, merchant, sharedBaseCents, baseOffsets, noise }) => {
    const out: Transaction[] = [];
    series.forEach((spec, i) => {
      const factor = 1 + 0.1 * (baseOffsets[i] ?? 0); // in [1.0, 1.1]
      const baseAmountCents = Math.round(sharedBaseCents * factor);
      // Recompute jitter against the new base so every bite stays well inside
      // the ±10% tolerance of its own series (mirrors arbitrarySeries.map).
      const jitterStep = Math.max(1, Math.floor(baseAmountCents * 0.01));
      const jitterUnits = spec.jitter.map((j) =>
        Math.round(j / Math.max(1, Math.floor(spec.baseAmountCents * 0.01))),
      );
      const withShared: SeriesSpec = {
        ...spec,
        merchant,
        baseAmountCents,
        jitter: jitterUnits.map((u) => u * jitterStep),
      };
      out.push(...buildSeries(withShared, i));
    });
    out.push(...noise);
    return out;
  });

/** Collect ids from both result lists, sorted for order-independent comparison. */
function allVampireIds(result: {
  vampires: Vampire[];
  possibleVampires: Vampire[];
}): string[] {
  return [...result.vampires, ...result.possibleVampires]
    .map((v) => v.id)
    .sort();
}

/** True when a detection result produced at least one (possible) vampire. */
function hasAnyVampire(result: {
  vampires: Vampire[];
  possibleVampires: Vampire[];
}): boolean {
  return result.vampires.length + result.possibleVampires.length > 0;
}

/**
 * Build a Map from vampire id to the sorted list of its bite keys. Each bite
 * key is a stable (date, amountCents, type) composite so memberships can be
 * compared independent of input order.
 */
function biteMembershipMap(result: {
  vampires: Vampire[];
  possibleVampires: Vampire[];
}): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const vampire of [...result.vampires, ...result.possibleVampires]) {
    const keys = vampire.bites
      .map((b) => `${b.date}|${b.amountCents}|${b.type}`)
      .sort();
    map.set(vampire.id, keys);
  }
  return map;
}

/** Number of runs each generator-driven property executes. */
const RUNS = 1000;
/** Minimum fraction of runs that must produce at least one vampire. */
const COVERAGE_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Property 8: Avatar Determinism
// ---------------------------------------------------------------------------

// Property 8: Avatar Determinism — Validates: Requirements 6.5
describe('Property 8: Avatar Determinism', () => {
  it('generateAvatar returns identical output for identical input', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (name) => {
        expect(generateAvatar(name)).toBe(generateAvatar(name));
      }),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Order Independence
// ---------------------------------------------------------------------------

// Property 3: Order Independence — Validates: Requirements 4.8
describe('Property 3: Order Independence', () => {
  it('runDetection yields the same vampire ids regardless of input order', () => {
    let coverageHits = 0;

    fc.assert(
      fc.property(
        arbitraryStatement,
        // A genuinely random permutation of the SAME multiset of transactions.
        fc.integer({ min: 0, max: 0xffffffff }),
        (transactions, seed) => {
          const original = runDetection({ transactions, currency: 'USD' });

          // Reorder by random sort keys derived from the seed so the second
          // ordering is a real permutation (not a fixed reverse/rotation).
          const reordered = transactions
            .map((t, i) => ({ t, k: Math.sin((i + 1) * (seed + 1)) }))
            .sort((a, b) => a.k - b.k)
            .map((x) => x.t);

          const reorderedResult = runDetection({
            transactions: reordered,
            currency: 'USD',
          });

          if (hasAnyVampire(original)) coverageHits++;

          expect(allVampireIds(reorderedResult)).toEqual(
            allVampireIds(original),
          );
        },
      ),
      { numRuns: RUNS },
    );

    // Coverage guard: the generator must exercise real detection, not pass
    // vacuously. Fails loudly if fewer than 80% of runs produced a vampire.
    const coverageRatio = coverageHits / RUNS;
    expect(coverageRatio).toBeGreaterThanOrEqual(COVERAGE_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// Property 3b: Same-Merchant Clustering Order Independence
// ---------------------------------------------------------------------------

// Property 3b: Same-Merchant Clustering Order Independence — Validates: Requirements 4.5, 4.8
describe('Property 3b: Same-Merchant Clustering Order Independence', () => {
  it('runDetection yields identical vampire ids AND bite memberships when same-merchant near-boundary series are reordered', () => {
    fc.assert(
      fc.property(
        arbitrarySameMerchantStatement,
        // A genuinely random permutation of the SAME multiset of transactions.
        fc.integer({ min: 0, max: 0xffffffff }),
        (transactions, seed) => {
          const original = runDetection({ transactions, currency: 'USD' });

          // Reorder by random sort keys derived from the seed so the second
          // ordering is a real permutation (not a fixed reverse/rotation).
          const reordered = transactions
            .map((t, i) => ({ t, k: Math.sin((i + 1) * (seed + 1)) }))
            .sort((a, b) => a.k - b.k)
            .map((x) => x.t);

          const reorderedResult = runDetection({
            transactions: reordered,
            currency: 'USD',
          });

          // (a) Identical sorted vampire ids across both orderings.
          expect(allVampireIds(reorderedResult)).toEqual(
            allVampireIds(original),
          );

          // (b) Identical bite memberships per cluster across both orderings.
          const originalMap = biteMembershipMap(original);
          const reorderedMap = biteMembershipMap(reorderedResult);
          expect([...reorderedMap.entries()].sort()).toEqual(
            [...originalMap.entries()].sort(),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: No-Singleton Rule
// ---------------------------------------------------------------------------

// Property 4: No-Singleton Rule — Validates: Requirements 4.3, 4.9
describe('Property 4: No-Singleton Rule', () => {
  it('a lone debit transaction is never detected as recurring', () => {
    fc.assert(
      fc.property(arbitraryNoise, (tx) => {
        const debit: Transaction = { ...tx, type: 'debit' };
        const result = runDetection({ transactions: [debit], currency: 'USD' });
        expect(result.vampires.length).toBe(0);
        expect(result.possibleVampires.length).toBe(0);
      }),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Credit Exclusion
// ---------------------------------------------------------------------------

// Property 5: Credit Exclusion — Validates: Requirements 1.17, 4.10
describe('Property 5: Credit Exclusion', () => {
  it('no detected bite is ever a credit transaction', () => {
    let coverageHits = 0;

    fc.assert(
      fc.property(arbitraryStatement, (transactions) => {
        // Force the first transaction to a credit so there is always at least
        // one credit in the mix that detection must exclude.
        const withCredit: Transaction[] = [
          { ...transactions[0], type: 'credit' },
          ...transactions.slice(1),
        ];
        const result = runDetection({
          transactions: withCredit,
          currency: 'USD',
        });

        if (hasAnyVampire(result)) coverageHits++;

        for (const vampire of [...result.vampires, ...result.possibleVampires]) {
          for (const bite of vampire.bites) {
            expect(bite.type).not.toBe('credit');
          }
        }
      }),
      { numRuns: RUNS },
    );

    // Coverage guard: see Property 3.
    const coverageRatio = coverageHits / RUNS;
    expect(coverageRatio).toBeGreaterThanOrEqual(COVERAGE_THRESHOLD);
  });
});
