/**
 * Vampire Hunter — Transaction Grouper
 * Pure TypeScript only. Zero React imports.
 *
 * Groups transactions by normalized merchant name (Step 1), then splits each
 * primary group into amount-based clusters using iterative k-medians convergence
 * to guarantee order-independence (Step 2a).
 *
 * Step 2b (price-increase merge): non-overlapping clusters from the same merchant
 * are merged when the price step is ≤ 50% and the trend is upward.
 */

import type { Transaction } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the median of a sorted array of numbers.
 * Returns the middle element (odd length) or the floor of the average of the
 * two middle elements (even length). Uses integer math to keep cents as ints.
 *
 * The caller is responsible for sorting the array before passing it.
 */
function median(sorted: number[]): number {
  const len = sorted.length;
  if (len === 0) return 0;
  const mid = Math.floor(len / 2);
  if (len % 2 === 1) {
    return sorted[mid];
  }
  // Even length: floor of average to keep integers
  return Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Compute the running median for an unsorted array of amount values.
 * Sorts a copy internally so the source order is not mutated.
 */
function computeMedian(amounts: number[]): number {
  const sorted = [...amounts].sort((a, b) => a - b);
  return median(sorted);
}

/**
 * Returns true if `amount` is within 10% of `clusterMedian` (inclusive).
 * Guard against division-by-zero: a cluster with median 0 accepts only 0.
 */
function isWithinTolerance(amount: number, clusterMedian: number): boolean {
  if (clusterMedian === 0) return amount === 0;
  return Math.abs(amount - clusterMedian) / clusterMedian <= 0.1;
}

/**
 * Absolute percentage difference between `amount` and `clusterMedian`.
 * Used to break ties when a bite falls within 10% of multiple clusters.
 */
function absPctDiff(amount: number, clusterMedian: number): number {
  if (clusterMedian === 0) return amount === 0 ? 0 : Infinity;
  return Math.abs(amount - clusterMedian) / clusterMedian;
}

// ---------------------------------------------------------------------------
// Iterative k-medians clustering (order-independent)
// ---------------------------------------------------------------------------

/**
 * Cluster a flat array of transactions from a single merchant into amount-based
 * groups using the iterative convergence approach described in the design.
 *
 * Algorithm:
 *  1. Initial assignment: iterate bites once, assign each to an existing cluster
 *     (if within 10% of its median) or start a new cluster.
 *  2. Recompute each cluster's median.
 *  3. Reassign ALL bites to the best cluster given updated medians.
 *  4. Repeat 2-3 until no bite changes cluster (stable assignment).
 *
 * This is equivalent to k-medians with dynamic k, which converges to a stable
 * partition that is independent of the original input order.
 *
 * @returns An array of transaction arrays, one per cluster, unsorted by cluster index.
 */
function clusterByAmount(bites: Transaction[]): Transaction[][] {
  if (bites.length === 0) return [];

  // ---- Step 1: Initial single-pass seed clustering ----
  // We collect the amounts first and seed clusters greedily.
  // The initial assignment may be order-dependent, but convergence corrects it.

  let clusterAmounts: number[][] = []; // parallel to clusters; stores cents only
  let clusterBites: Transaction[][] = [];

  for (const bite of bites) {
    const amount = bite.amountCents;

    // Find all clusters within 10% tolerance
    const eligible: { idx: number; diff: number }[] = [];
    for (let i = 0; i < clusterAmounts.length; i++) {
      const med = computeMedian(clusterAmounts[i]);
      if (isWithinTolerance(amount, med)) {
        eligible.push({ idx: i, diff: absPctDiff(amount, med) });
      }
    }

    if (eligible.length === 0) {
      // No matching cluster — create a new one
      clusterAmounts.push([amount]);
      clusterBites.push([bite]);
    } else {
      // Assign to closest cluster (smallest % diff)
      eligible.sort((a, b) => a.diff - b.diff);
      const best = eligible[0].idx;
      clusterAmounts[best].push(amount);
      clusterBites[best].push(bite);
    }
  }

  // ---- Steps 2-4: Iterative reassignment until stable ----
  let changed = true;
  while (changed) {
    changed = false;

    // Recompute medians from current assignment
    const medians = clusterAmounts.map((amounts) => computeMedian(amounts));

    // Build new empty clusters
    const newClusterAmounts: number[][] = medians.map(() => []);
    const newClusterBites: Transaction[][] = medians.map(() => []);

    for (const bite of bites) {
      const amount = bite.amountCents;

      // Find best cluster based on current medians
      const eligible: { idx: number; diff: number }[] = [];
      for (let i = 0; i < medians.length; i++) {
        if (isWithinTolerance(amount, medians[i])) {
          eligible.push({ idx: i, diff: absPctDiff(amount, medians[i]) });
        }
      }

      let targetIdx: number;
      if (eligible.length === 0) {
        // Bite no longer fits any cluster — start a new one for this iteration.
        // This can happen transiently during convergence as medians shift.
        targetIdx = newClusterAmounts.length;
        newClusterAmounts.push([]);
        newClusterBites.push([]);
      } else {
        eligible.sort((a, b) => a.diff - b.diff);
        targetIdx = eligible[0].idx;
      }

      newClusterAmounts[targetIdx].push(amount);
      newClusterBites[targetIdx].push(bite);
    }

    // Remove any empty clusters that may have been vacated
    const nonEmpty = newClusterAmounts
      .map((amounts, i) => ({ amounts, bites: newClusterBites[i] }))
      .filter((c) => c.amounts.length > 0);

    const nextAmounts = nonEmpty.map((c) => c.amounts);
    const nextBites = nonEmpty.map((c) => c.bites);

    // Check if membership changed (compare sorted bite IDs per cluster)
    const oldSets = clusterBites.map((c) =>
      c.map((t) => t.id).sort().join(','),
    );
    const newSets = nextBites.map((c) =>
      c.map((t) => t.id).sort().join(','),
    );

    // Compare as sorted sets of cluster sets (cluster identity is not stable
    // across iterations, so we compare set-of-sets)
    const oldKey = [...oldSets].sort().join('|');
    const newKey = [...newSets].sort().join('|');

    if (oldKey !== newKey) {
      changed = true;
    }

    clusterAmounts = nextAmounts;
    clusterBites = nextBites;
  }

  return clusterBites;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step 2b: Price-increase merge helpers
// ---------------------------------------------------------------------------

/**
 * Returns the earliest ISO date string in a set of bites.
 * Bites must be non-empty.
 */
function earliestDate(bites: Transaction[]): string {
  return bites.reduce((min, b) => (b.date < min ? b.date : min), bites[0].date);
}

/**
 * Returns the latest ISO date string in a set of bites.
 * Bites must be non-empty.
 */
function latestDate(bites: Transaction[]): string {
  return bites.reduce((max, b) => (b.date > max ? b.date : max), bites[0].date);
}

/**
 * Returns true when cluster A and cluster B do NOT overlap in time —
 * i.e. every bite in A is strictly before every bite in B.
 */
function isNonOverlapping(a: Transaction[], b: Transaction[]): boolean {
  const aLast = latestDate(a);
  const bFirst = earliestDate(b);
  return aLast < bFirst;
}

/**
 * The amount of the chronologically first bite in a cluster.
 */
function firstBiteAmount(bites: Transaction[]): number {
  const sorted = [...bites].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[0].amountCents;
}

/**
 * The amount of the chronologically last bite in a cluster.
 */
function lastBiteAmount(bites: Transaction[]): number {
  const sorted = [...bites].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1].amountCents;
}

/**
 * Attempt a single round of price-increase merges on a flat array of clusters.
 *
 * Iterates over all ordered pairs (A, B) where A entirely precedes B in time.
 * Merges the first eligible pair found, then returns `{ clusters, merged: true }`
 * so the caller can loop until stable.
 *
 * Two clusters A (earlier) and B (later) can be merged when ALL hold:
 *   1. Non-overlapping: every bite in A is strictly before every bite in B.
 *   2. B's first bite amount ≤ A's last bite amount × 1.5 (≤ 50% higher).
 *   3. B's median > A's median (upward trend).
 */
function mergePriceIncreaseRound(
  clusters: Transaction[][],
): { clusters: Transaction[][]; merged: boolean } {
  for (let i = 0; i < clusters.length; i++) {
    for (let j = 0; j < clusters.length; j++) {
      if (i === j) continue;

      const a = clusters[i];
      const b = clusters[j];

      // Condition 1: a entirely precedes b
      if (!isNonOverlapping(a, b)) continue;

      // Condition 2: B's first bite amount ≤ A's last × 1.5
      const aLast = lastBiteAmount(a);
      const bFirst = firstBiteAmount(b);
      if (bFirst > aLast * 1.5) continue;

      // Condition 3: upward trend (B median > A median)
      const medA = computeMedian(a.map((t) => t.amountCents));
      const medB = computeMedian(b.map((t) => t.amountCents));
      if (medB <= medA) continue;

      // All conditions met — merge a and b into one cluster
      const merged = [...a, ...b];
      const rest = clusters.filter((_, idx) => idx !== i && idx !== j);
      return { clusters: [...rest, merged], merged: true };
    }
  }

  return { clusters, merged: false };
}

/**
 * Repeatedly apply price-increase merges until no more merges are possible.
 * Returns the final stable array of clusters together with a Set of cluster
 * references (by their sorted bite-ID key) that were formed via a merge — so
 * the caller can set `hasPriceIncrease = true` on those clusters.
 */
function applyPriceIncreaseMerge(
  initialClusters: Transaction[][],
): { clusters: Transaction[][]; mergedKeys: Set<string> } {
  let current = initialClusters;

  // Track which clusters existed before this step so we can detect new ones
  const originalKeys = new Set(
    initialClusters.map((c) =>
      c
        .map((t) => t.id)
        .sort()
        .join(','),
    ),
  );

  let merged = true;
  while (merged) {
    const result = mergePriceIncreaseRound(current);
    merged = result.merged;
    current = result.clusters;
  }

  // Any cluster whose membership key was not present in the original set
  // was created by a merge and should have hasPriceIncrease = true.
  const mergedKeys = new Set<string>();
  for (const cluster of current) {
    const key = cluster
      .map((t) => t.id)
      .sort()
      .join(',');
    if (!originalKeys.has(key)) {
      mergedKeys.add(key);
    }
  }

  return { clusters: current, mergedKeys };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Group transactions by normalized merchant name (Step 1), then split each
 * merchant group into amount clusters (Step 2a).
 *
 * Returns a `Map<string, Transaction[]>` where:
 *   - Key:   `normalizedName + "_" + clusterIndex`  (0-based, indexed by
 *             ascending cluster median so IDs are stable across uploads)
 *   - Value: All transaction bites belonging to that cluster, in the order
 *             they were encountered in the input (unsorted; callers sort by
 *             date as needed).
 *
 * Step 2b (price-increase merge) is NOT applied here (it requires knowing the
 * per-merchant cluster context). Use `buildCandidates` to get the full pipeline
 * including Step 2b.
 *
 * Requirements: 4.1, 4.5
 *
 * @param transactions - Debit transactions with populated `normalizedName` fields.
 */
export function groupByMerchant(
  transactions: Transaction[],
): Map<string, Transaction[]> {
  // ---- Step 1: Primary grouping by normalizedName ----
  const primaryGroups = new Map<string, Transaction[]>();

  for (const txn of transactions) {
    const name = txn.normalizedName;
    const existing = primaryGroups.get(name);
    if (existing) {
      existing.push(txn);
    } else {
      primaryGroups.set(name, [txn]);
    }
  }

  // ---- Step 2a: Amount clustering within each primary group ----
  const result = new Map<string, Transaction[]>();

  for (const [normalizedName, group] of primaryGroups) {
    const clusters = clusterByAmount(group);

    // Sort clusters by their median amount (ascending) so cluster indices are
    // stable across different input orderings — same merchant always gets the
    // same index for the same amount level.
    const clustersWithMedian = clusters.map((bites) => ({
      bites,
      median: computeMedian(bites.map((b) => b.amountCents)),
    }));

    clustersWithMedian.sort((a, b) => a.median - b.median);

    // Emit each cluster with its stable ID
    for (let i = 0; i < clustersWithMedian.length; i++) {
      const clusterId = `${normalizedName}_${i}`;
      result.set(clusterId, clustersWithMedian[i].bites);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Partial RecurrenceCandidate (cadence and hasFreeTrial set by cadenceDetector)
// ---------------------------------------------------------------------------

/**
 * The subset of `RecurrenceCandidate` that `buildCandidates` can fill in.
 * `cadence` and `hasFreeTrial` require cadence analysis and are left for
 * `cadenceDetector.ts` to populate.
 */
export interface PartialCandidate {
  normalizedName: string;
  bites: Transaction[];
  medianAmountCents: number;
  isAmountStable: boolean;
  hasPriceIncrease: boolean;
  amountHistory: number[];
}

/**
 * Run the full grouping pipeline (Steps 1, 2a, 2b) and convert each resulting
 * cluster into a `PartialCandidate`.
 *
 * The full pipeline:
 *   1. Primary grouping by `normalizedName`
 *   2a. Intra-merchant amount clustering (order-independent k-medians)
 *   2b. Price-increase merge of non-overlapping clusters
 *   3. Finalize each cluster into a `PartialCandidate`
 *
 * Cluster IDs are `normalizedName + "_" + i` where `i` is the 0-based index
 * ordered by ascending median amount (same merchant, same amounts → same ID
 * across re-uploads of the same file).
 *
 * Requirements: 4.1, 4.5, 4.6
 *
 * @param transactions - Debit transactions with populated `normalizedName` fields.
 * @returns Array of `{ id, candidate }` objects ready for cadence detection.
 */
export function buildCandidates(
  transactions: Transaction[],
): Array<{ id: string; candidate: PartialCandidate }> {
  // ---- Step 1: Primary grouping by normalizedName ----
  const primaryGroups = new Map<string, Transaction[]>();

  for (const txn of transactions) {
    const name = txn.normalizedName;
    const existing = primaryGroups.get(name);
    if (existing) {
      existing.push(txn);
    } else {
      primaryGroups.set(name, [txn]);
    }
  }

  const output: Array<{ id: string; candidate: PartialCandidate }> = [];

  for (const [normalizedName, group] of primaryGroups) {
    // ---- Step 2a: Amount clustering ----
    const rawClusters = clusterByAmount(group);

    // ---- Step 2b: Price-increase merge ----
    const { clusters: mergedClusters, mergedKeys } =
      applyPriceIncreaseMerge(rawClusters);

    // Sort merged clusters by ascending median for stable indexing
    const clustersWithMedian = mergedClusters.map((bites) => {
      const amounts = bites.map((b) => b.amountCents);
      const med = computeMedian(amounts);
      const key = bites
        .map((t) => t.id)
        .sort()
        .join(',');
      return { bites, median: med, hasPriceIncrease: mergedKeys.has(key) };
    });

    clustersWithMedian.sort((a, b) => a.median - b.median);

    // ---- Step 3: Finalize into PartialCandidate ----
    for (let i = 0; i < clustersWithMedian.length; i++) {
      const { bites, median: med, hasPriceIncrease } = clustersWithMedian[i];

      // Sort bites chronologically for amountHistory and stability check
      const sortedBites = [...bites].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const amountHistory = sortedBites.map((b) => b.amountCents);

      // isAmountStable: all bites within 10% of median
      const isAmountStable =
        med === 0
          ? amountHistory.every((a) => a === 0)
          : amountHistory.every(
              (a) => Math.abs(a - med) / med <= 0.1,
            );

      const id = `${normalizedName}_${i}`;

      output.push({
        id,
        candidate: {
          normalizedName,
          bites: sortedBites,
          medianAmountCents: med,
          isAmountStable,
          hasPriceIncrease,
          amountHistory,
        },
      });
    }
  }

  return output;
}
