/**
 * Unit tests for grouper.ts — Steps 1 and 2a (task 7.1)
 *
 * Coverage targets:
 *  - Same merchant, two different amounts interleaved → 2 clusters
 *  - Same merchant, all same amount → 1 cluster
 *  - Different merchants → independent grouping
 *  - Single transaction → 1 cluster (task 7.2 / cadence detector will exclude singletons)
 *  - Amounts within 10% → merged into one cluster
 *  - Amounts outside 10% → separate clusters
 *  - Cluster indices ordered by ascending median (stable IDs)
 *  - Order-independence: shuffling input produces same clusters
 */

import { describe, it, expect } from 'vitest';
import { groupByMerchant } from '../src/engine/grouper';
import type { Transaction } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _id = 0;
function makeTxn(
  normalizedName: string,
  amountCents: number,
  date: string = '2026-01-01',
): Transaction {
  _id++;
  return {
    id: `txn-${_id}`,
    date,
    description: normalizedName,
    normalizedName,
    amountCents,
    type: 'debit',
    currency: 'USD',
  };
}

/** Returns all cluster IDs whose key starts with the given normalizedName. */
function clustersFor(
  map: Map<string, Transaction[]>,
  normalizedName: string,
): string[] {
  return [...map.keys()].filter((k) => k.startsWith(`${normalizedName}_`));
}

/** Shuffle an array (Fisher-Yates) with a fixed seed for reproducibility. */
function shuffle<T>(arr: T[], seed = 42): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Stable string key for the cluster membership of a result map. */
function clusterKey(map: Map<string, Transaction[]>): string {
  const entries = [...map.entries()]
    .map(([k, bites]) => `${k}:[${bites.map((b) => b.id).sort().join(',')}]`)
    .sort();
  return entries.join('|');
}

// ---------------------------------------------------------------------------
// Step 1: Primary grouping
// ---------------------------------------------------------------------------

describe('groupByMerchant — Step 1: primary grouping', () => {
  it('groups transactions from different merchants independently', () => {
    const txns = [
      makeTxn('NETFLIX', 1549),
      makeTxn('SPOTIFY', 999),
      makeTxn('NETFLIX', 1549),
      makeTxn('SPOTIFY', 999),
    ];

    const result = groupByMerchant(txns);

    const netflixClusters = clustersFor(result, 'NETFLIX');
    const spotifyClusters = clustersFor(result, 'SPOTIFY');

    expect(netflixClusters).toHaveLength(1);
    expect(spotifyClusters).toHaveLength(1);
    expect(result.get('NETFLIX_0')).toHaveLength(2);
    expect(result.get('SPOTIFY_0')).toHaveLength(2);
  });

  it('returns an empty map for empty input', () => {
    const result = groupByMerchant([]);
    expect(result.size).toBe(0);
  });

  it('handles a single transaction — produces one cluster with one bite', () => {
    const txn = makeTxn('AMAZON PRIME', 1499);
    const result = groupByMerchant([txn]);

    expect(result.size).toBe(1);
    expect(result.get('AMAZON PRIME_0')).toEqual([txn]);
  });
});

// ---------------------------------------------------------------------------
// Step 2a: Amount clustering
// ---------------------------------------------------------------------------

describe('groupByMerchant — Step 2a: amount clustering', () => {
  it('puts all same-amount bites into one cluster', () => {
    const txns = [
      makeTxn('SPOTIFY', 999, '2026-01-01'),
      makeTxn('SPOTIFY', 999, '2026-02-01'),
      makeTxn('SPOTIFY', 999, '2026-03-01'),
    ];

    const result = groupByMerchant(txns);
    const clusters = clustersFor(result, 'SPOTIFY');

    expect(clusters).toHaveLength(1);
    expect(result.get('SPOTIFY_0')).toHaveLength(3);
  });

  it('creates two clusters when two distinct amounts are interleaved', () => {
    // APPLE.COM/BILL at $2.99 (299 cents) and $10.99 (1099 cents) interleaved
    const txns = [
      makeTxn('APPLE.COM BILL', 299, '2026-01-01'),  // iCloud
      makeTxn('APPLE.COM BILL', 1099, '2026-01-05'), // Apple Music
      makeTxn('APPLE.COM BILL', 299, '2026-02-01'),
      makeTxn('APPLE.COM BILL', 1099, '2026-02-05'),
      makeTxn('APPLE.COM BILL', 299, '2026-03-01'),
      makeTxn('APPLE.COM BILL', 1099, '2026-03-05'),
    ];

    const result = groupByMerchant(txns);
    const clusters = clustersFor(result, 'APPLE.COM BILL');

    expect(clusters).toHaveLength(2);

    // The lower-median cluster should be index 0 (sorted ascending by median)
    const cluster0 = result.get('APPLE.COM BILL_0')!;
    const cluster1 = result.get('APPLE.COM BILL_1')!;
    expect(cluster0.every((t) => t.amountCents === 299)).toBe(true);
    expect(cluster1.every((t) => t.amountCents === 1099)).toBe(true);
  });

  it('merges amounts within 10% of the cluster median into one cluster', () => {
    // 1000, 1050, 980 — all within 10% of each other
    const txns = [
      makeTxn('GYM', 1000, '2026-01-01'),
      makeTxn('GYM', 1050, '2026-02-01'),
      makeTxn('GYM', 980, '2026-03-01'),
    ];

    const result = groupByMerchant(txns);
    const clusters = clustersFor(result, 'GYM');

    expect(clusters).toHaveLength(1);
    expect(result.get('GYM_0')).toHaveLength(3);
  });

  it('creates separate clusters for amounts more than 10% apart', () => {
    // 1000 vs 1200 — 20% difference, should be separate clusters
    const txns = [
      makeTxn('MERCHANT', 1000, '2026-01-01'),
      makeTxn('MERCHANT', 1200, '2026-01-15'),
      makeTxn('MERCHANT', 1000, '2026-02-01'),
      makeTxn('MERCHANT', 1200, '2026-02-15'),
    ];

    const result = groupByMerchant(txns);
    const clusters = clustersFor(result, 'MERCHANT');

    expect(clusters).toHaveLength(2);
  });

  it('assigns bite to the closest cluster when within 10% of multiple clusters', () => {
    // Clusters at 1000 and 1050; a bite at 1025 is equidistant.
    // After convergence it should belong to exactly one cluster.
    const txns = [
      makeTxn('SVC', 1000, '2026-01-01'),
      makeTxn('SVC', 1000, '2026-02-01'),
      makeTxn('SVC', 1050, '2026-01-15'),
      makeTxn('SVC', 1050, '2026-02-15'),
      makeTxn('SVC', 1025, '2026-03-01'), // ambiguous — goes to closest
    ];

    const result = groupByMerchant(txns);
    const clusters = clustersFor(result, 'SVC');

    // The 1025 bite must appear in exactly one cluster (no duplicates, no loss)
    const allBites = clusters.flatMap((k) => result.get(k)!);
    const ambiguousBites = allBites.filter((t) => t.amountCents === 1025);
    expect(ambiguousBites).toHaveLength(1);

    // Total bite count is preserved
    expect(allBites).toHaveLength(5);
  });

  it('cluster indices are ordered by ascending median amount', () => {
    // Three distinct amounts: 500, 1500, 3000
    const txns = [
      makeTxn('MULTI', 3000, '2026-01-01'),
      makeTxn('MULTI', 500, '2026-01-05'),
      makeTxn('MULTI', 1500, '2026-01-10'),
      makeTxn('MULTI', 3000, '2026-02-01'),
      makeTxn('MULTI', 500, '2026-02-05'),
      makeTxn('MULTI', 1500, '2026-02-10'),
    ];

    const result = groupByMerchant(txns);

    const c0 = result.get('MULTI_0')!;
    const c1 = result.get('MULTI_1')!;
    const c2 = result.get('MULTI_2')!;

    // Median of each cluster should be ascending
    const med = (bites: Transaction[]) => {
      const sorted = [...bites.map((b) => b.amountCents)].sort((a, b) => a - b);
      const m = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1
        ? sorted[m]
        : Math.floor((sorted[m - 1] + sorted[m]) / 2);
    };

    expect(med(c0)).toBeLessThanOrEqual(med(c1));
    expect(med(c1)).toBeLessThanOrEqual(med(c2));
  });

  it('total bite count is preserved across all clusters', () => {
    const txns = [
      makeTxn('SVC2', 100, '2026-01-01'),
      makeTxn('SVC2', 500, '2026-01-05'),
      makeTxn('SVC2', 100, '2026-02-01'),
      makeTxn('SVC2', 500, '2026-02-05'),
      makeTxn('SVC2', 100, '2026-03-01'),
    ];

    const result = groupByMerchant(txns);
    const allBites = [...result.values()].flat();

    expect(allBites).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Order-independence
// ---------------------------------------------------------------------------

describe('groupByMerchant — order-independence', () => {
  it('produces the same clusters regardless of input order', () => {
    const base = [
      makeTxn('APPLE.COM BILL', 299, '2026-01-01'),
      makeTxn('APPLE.COM BILL', 1099, '2026-01-05'),
      makeTxn('APPLE.COM BILL', 299, '2026-02-01'),
      makeTxn('APPLE.COM BILL', 1099, '2026-02-05'),
    ];

    const shuffled = shuffle(base);

    const r1 = groupByMerchant(base);
    const r2 = groupByMerchant(shuffled);

    expect(clusterKey(r1)).toBe(clusterKey(r2));
  });

  it('produces the same clusters for multiple shuffles of a 3-cluster merchant', () => {
    const base = [
      makeTxn('TEST', 100, '2026-01-01'),
      makeTxn('TEST', 100, '2026-02-01'),
      makeTxn('TEST', 500, '2026-01-15'),
      makeTxn('TEST', 500, '2026-02-15'),
      makeTxn('TEST', 2000, '2026-01-20'),
      makeTxn('TEST', 2000, '2026-02-20'),
    ];

    const seeds = [1, 7, 13, 99, 123];
    const keys = seeds.map((seed) => clusterKey(groupByMerchant(shuffle(base, seed))));

    // All shuffles should produce the same cluster membership key
    const allSame = keys.every((k) => k === keys[0]);
    expect(allSame).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCandidates — Step 2b + finalization
// ---------------------------------------------------------------------------

import { buildCandidates } from '../src/engine/grouper';

describe('buildCandidates — Step 2b: price-increase merge', () => {
  it('interleaved different-amount bites stay as two candidates (no merge)', () => {
    // APPLE.COM/BILL at $2.99 and $10.99 interleaved — overlap in time → no merge
    const txns = [
      makeTxn('APPLE.COM BILL', 299, '2026-01-01'),
      makeTxn('APPLE.COM BILL', 1099, '2026-01-05'),
      makeTxn('APPLE.COM BILL', 299, '2026-02-01'),
      makeTxn('APPLE.COM BILL', 1099, '2026-02-05'),
      makeTxn('APPLE.COM BILL', 299, '2026-03-01'),
      makeTxn('APPLE.COM BILL', 1099, '2026-03-05'),
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(2);
    result.forEach((r) => expect(r.candidate.hasPriceIncrease).toBe(false));

    // Lower-median cluster should be index 0
    const c0 = result.find((r) => r.id === 'APPLE.COM BILL_0')!;
    const c1 = result.find((r) => r.id === 'APPLE.COM BILL_1')!;
    expect(c0.candidate.medianAmountCents).toBe(299);
    expect(c1.candidate.medianAmountCents).toBe(1099);
  });

  it('sequential price step within 50% produces one candidate with hasPriceIncrease = true', () => {
    // NETFLIX: $13.99 (Jan), $15.49 (Apr), $17.99 (Jul)
    // $13.99 → $15.49: 10.7% apart (> 10%) → two clusters in 2a
    // 2b: non-overlapping, $15.49 ≤ $13.99 × 1.5 → merge into one
    const txns = [
      makeTxn('NETFLIX', 1399, '2026-01-17'),
      makeTxn('NETFLIX', 1399, '2026-02-17'),
      makeTxn('NETFLIX', 1549, '2026-04-17'),
      makeTxn('NETFLIX', 1799, '2026-07-17'),
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('NETFLIX_0');
    expect(result[0].candidate.hasPriceIncrease).toBe(true);
    expect(result[0].candidate.bites).toHaveLength(4);
  });

  it('sequential price step > 50% stays as two separate candidates', () => {
    // $1000 then $1600 — B_first ($1600) > A_last ($1000) × 1.5 → no merge
    const txns = [
      makeTxn('SERVICE', 1000, '2026-01-01'),
      makeTxn('SERVICE', 1000, '2026-02-01'),
      makeTxn('SERVICE', 1600, '2026-05-01'),
      makeTxn('SERVICE', 1600, '2026-06-01'),
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(2);
    result.forEach((r) => expect(r.candidate.hasPriceIncrease).toBe(false));
  });

  it('overlapping clusters are never merged', () => {
    // Two amounts at same merchant with overlapping dates
    const txns = [
      makeTxn('PLAN', 500, '2026-01-01'),
      makeTxn('PLAN', 800, '2026-01-15'),
      makeTxn('PLAN', 500, '2026-02-01'),
      makeTxn('PLAN', 800, '2026-02-15'),
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(2);
    result.forEach((r) => expect(r.candidate.hasPriceIncrease).toBe(false));
  });

  it('single transaction produces one candidate (no merge possible)', () => {
    const txns = [makeTxn('SOLO', 999, '2026-03-01')];
    const result = buildCandidates(txns);
    expect(result).toHaveLength(1);
    expect(result[0].candidate.hasPriceIncrease).toBe(false);
    expect(result[0].candidate.bites).toHaveLength(1);
  });

  it('multiple merchants are grouped and merged independently', () => {
    const txns = [
      // NETFLIX: sequential price step within 50% → 1 candidate merged
      makeTxn('NETFLIX', 1399, '2026-01-17'),
      makeTxn('NETFLIX', 1549, '2026-04-17'),
      // SPOTIFY: same amount → 1 candidate, no merge needed
      makeTxn('SPOTIFY', 999, '2026-01-21'),
      makeTxn('SPOTIFY', 999, '2026-02-21'),
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(2);

    const netflix = result.find((r) => r.candidate.normalizedName === 'NETFLIX')!;
    const spotify = result.find((r) => r.candidate.normalizedName === 'SPOTIFY')!;

    expect(netflix).toBeDefined();
    expect(spotify).toBeDefined();
    expect(netflix.candidate.hasPriceIncrease).toBe(true);
    expect(spotify.candidate.hasPriceIncrease).toBe(false);
  });
});

describe('buildCandidates — candidate finalization', () => {
  it('bites are sorted by date ascending in the candidate', () => {
    const txns = [
      makeTxn('SVC', 999, '2026-03-01'),
      makeTxn('SVC', 999, '2026-01-01'),
      makeTxn('SVC', 999, '2026-02-01'),
    ];

    const result = buildCandidates(txns);
    const dates = result[0].candidate.bites.map((b) => b.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('amountHistory reflects chronological order', () => {
    const txns = [
      makeTxn('SVC', 1000, '2026-01-01'),
      makeTxn('SVC', 1050, '2026-02-01'),
      makeTxn('SVC', 1100, '2026-03-01'),
    ];

    const result = buildCandidates(txns);
    expect(result[0].candidate.amountHistory).toEqual([1000, 1050, 1100]);
  });

  it('isAmountStable is true when all bites are within 10% of median', () => {
    const txns = [
      makeTxn('GYM', 1000, '2026-01-01'),
      makeTxn('GYM', 1050, '2026-02-01'),
      makeTxn('GYM', 980, '2026-03-01'),
    ];

    const result = buildCandidates(txns);
    expect(result[0].candidate.isAmountStable).toBe(true);
  });

  it('isAmountStable is false on a merged cluster with wide amount spread', () => {
    // 1000 and 1400: 40% apart → two clusters in 2a.
    // Non-overlapping, 1400 ≤ 1000 × 1.5 → 2b merges them.
    // Merged median = floor((1000 + 1400) / 2) = 1200.
    // 1000 vs median 1200 → 16.7% diff → isAmountStable = false on merged cluster.
    const txns = [
      makeTxn('SVC', 1000, '2026-01-01'),
      makeTxn('SVC', 1000, '2026-02-01'),
      makeTxn('SVC', 1400, '2026-05-01'),
      makeTxn('SVC', 1400, '2026-06-01'),
    ];

    const result = buildCandidates(txns);
    // Should merge into one candidate (40% step, non-overlapping, within 50%)
    expect(result).toHaveLength(1);
    expect(result[0].candidate.hasPriceIncrease).toBe(true);
    expect(result[0].candidate.isAmountStable).toBe(false);
  });

  it('medianAmountCents is correct for an even-length cluster', () => {
    // Sorted: [1000, 1000, 1050, 1050] → median = floor((1000 + 1050) / 2) = 1025
    const txns = [
      makeTxn('SVC', 1000, '2026-01-01'),
      makeTxn('SVC', 1050, '2026-02-01'),
      makeTxn('SVC', 1000, '2026-03-01'),
      makeTxn('SVC', 1050, '2026-04-01'),
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(1);
    expect(result[0].candidate.medianAmountCents).toBe(1025);
  });

  it('returns empty array for empty input', () => {
    expect(buildCandidates([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Step 2b-i: Free-trial merge
// ---------------------------------------------------------------------------

describe('buildCandidates — Step 2b-i: free-trial merge', () => {
  it('HelloFresh sample: $0 trial + five $12.99 charges → one cluster, amountHistory [0,1299,1299,1299,1299,1299]', () => {
    // Mirrors the us-bank-usd.csv HelloFresh rows (dates are already ISO here)
    const txns: Transaction[] = [
      { id: 'hf1', date: '2026-05-21', description: 'MEALBOX HELLOFRESH SUBSCRIPTION', normalizedName: 'HELLOFRESH', amountCents: 0,    type: 'debit', currency: 'USD' },
      { id: 'hf2', date: '2026-06-21', description: 'MEALBOX HELLOFRESH SUBSCRIPTION', normalizedName: 'HELLOFRESH', amountCents: 1299, type: 'debit', currency: 'USD' },
      { id: 'hf3', date: '2026-07-21', description: 'MEALBOX HELLOFRESH SUBSCRIPTION', normalizedName: 'HELLOFRESH', amountCents: 1299, type: 'debit', currency: 'USD' },
      { id: 'hf4', date: '2026-08-21', description: 'MEALBOX HELLOFRESH SUBSCRIPTION', normalizedName: 'HELLOFRESH', amountCents: 1299, type: 'debit', currency: 'USD' },
      { id: 'hf5', date: '2026-09-21', description: 'MEALBOX HELLOFRESH SUBSCRIPTION', normalizedName: 'HELLOFRESH', amountCents: 1299, type: 'debit', currency: 'USD' },
      { id: 'hf6', date: '2026-10-21', description: 'MEALBOX HELLOFRESH SUBSCRIPTION', normalizedName: 'HELLOFRESH', amountCents: 1299, type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('HELLOFRESH_0');
    expect(result[0].candidate.amountHistory).toEqual([0, 1299, 1299, 1299, 1299, 1299]);
    expect(result[0].candidate.hasPriceIncrease).toBe(false);
  });

  it('trial bite at exactly 0 merges into paid cluster within 45-day gap', () => {
    const txns: Transaction[] = [
      { id: 't1', date: '2026-01-01', description: 'SVC', normalizedName: 'SVC', amountCents: 0,    type: 'debit', currency: 'USD' },
      { id: 't2', date: '2026-02-01', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' },
      { id: 't3', date: '2026-03-01', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(1);
    expect(result[0].candidate.amountHistory).toEqual([0, 999, 999]);
    expect(result[0].candidate.hasPriceIncrease).toBe(false);
  });

  it('trial bite < 20% of paid median merges within 45-day gap', () => {
    // Paid median 1000, trial bite 150 cents (15% of 1000 < 20%) → merge
    const txns: Transaction[] = [
      { id: 't1', date: '2026-01-01', description: 'SVC', normalizedName: 'SVC', amountCents: 150,  type: 'debit', currency: 'USD' },
      { id: 't2', date: '2026-02-01', description: 'SVC', normalizedName: 'SVC', amountCents: 1000, type: 'debit', currency: 'USD' },
      { id: 't3', date: '2026-03-01', description: 'SVC', normalizedName: 'SVC', amountCents: 1000, type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(1);
    expect(result[0].candidate.amountHistory[0]).toBe(150);
  });

  it('trial bite ≥ 20% of paid median does NOT merge (stays separate)', () => {
    // Paid median 1000, trial bite 250 cents (25% of 1000 ≥ 20%) → no merge
    const txns: Transaction[] = [
      { id: 't1', date: '2026-01-01', description: 'SVC', normalizedName: 'SVC', amountCents: 250,  type: 'debit', currency: 'USD' },
      { id: 't2', date: '2026-02-01', description: 'SVC', normalizedName: 'SVC', amountCents: 1000, type: 'debit', currency: 'USD' },
      { id: 't3', date: '2026-03-01', description: 'SVC', normalizedName: 'SVC', amountCents: 1000, type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);
    // 250 is > 10% below 1000 so it forms its own cluster in 2a.
    // 250 >= 200 (20% of 1000) so trial merge does NOT apply.
    expect(result).toHaveLength(2);
    expect(result.every((r) => !r.candidate.hasPriceIncrease)).toBe(true);
  });

  it('gap of exactly 45 days between trial last bite and paid first bite → merges', () => {
    const txns: Transaction[] = [
      { id: 't1', date: '2026-01-01', description: 'SVC', normalizedName: 'SVC', amountCents: 0,    type: 'debit', currency: 'USD' },
      { id: 't2', date: '2026-02-15', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' }, // 45 days later
      { id: 't3', date: '2026-03-15', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(1);
  });

  it('gap of 46 days → does NOT merge (stays separate)', () => {
    const txns: Transaction[] = [
      { id: 't1', date: '2026-01-01', description: 'SVC', normalizedName: 'SVC', amountCents: 0,    type: 'debit', currency: 'USD' },
      { id: 't2', date: '2026-02-16', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' }, // 46 days later
      { id: 't3', date: '2026-03-16', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(2);
  });

  it('trial merge does not fire when trial and paid clusters overlap in time', () => {
    const txns: Transaction[] = [
      { id: 't1', date: '2026-01-01', description: 'SVC', normalizedName: 'SVC', amountCents: 0,    type: 'debit', currency: 'USD' },
      { id: 't2', date: '2026-01-15', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' },
      { id: 't3', date: '2026-01-20', description: 'SVC', normalizedName: 'SVC', amountCents: 0,    type: 'debit', currency: 'USD' }, // same timeframe
      { id: 't4', date: '2026-02-15', description: 'SVC', normalizedName: 'SVC', amountCents: 999,  type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);
    // The 0-amount bites overlap with 999-amount bites → no trial merge
    expect(result).toHaveLength(2);
  });

  it('trial merge is independent per merchant', () => {
    const txns: Transaction[] = [
      // NETFLIX: trial then paid → merge
      { id: 'n1', date: '2026-01-01', description: 'NETFLIX', normalizedName: 'NETFLIX', amountCents: 0,    type: 'debit', currency: 'USD' },
      { id: 'n2', date: '2026-02-01', description: 'NETFLIX', normalizedName: 'NETFLIX', amountCents: 1549, type: 'debit', currency: 'USD' },
      { id: 'n3', date: '2026-03-01', description: 'NETFLIX', normalizedName: 'NETFLIX', amountCents: 1549, type: 'debit', currency: 'USD' },
      // SPOTIFY: no trial → stays one cluster already
      { id: 's1', date: '2026-01-21', description: 'SPOTIFY', normalizedName: 'SPOTIFY', amountCents: 999,  type: 'debit', currency: 'USD' },
      { id: 's2', date: '2026-02-21', description: 'SPOTIFY', normalizedName: 'SPOTIFY', amountCents: 999,  type: 'debit', currency: 'USD' },
    ];

    const result = buildCandidates(txns);
    expect(result).toHaveLength(2);

    const netflix = result.find((r) => r.candidate.normalizedName === 'NETFLIX')!;
    const spotify = result.find((r) => r.candidate.normalizedName === 'SPOTIFY')!;

    expect(netflix.candidate.amountHistory).toEqual([0, 1549, 1549]);
    expect(netflix.candidate.hasPriceIncrease).toBe(false);
    expect(spotify.candidate.amountHistory).toEqual([999, 999]);
  });
});
