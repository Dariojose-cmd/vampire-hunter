/**
 * Vampire Hunter — Transaction Grouper
 * Pure TypeScript only. Zero React imports.
 *
 * Groups transactions by normalized merchant name (Step 1), then splits each
 * primary group into amount-based clusters using iterative k-medians convergence
 * to guarantee order-independence (Step 2a).
 *
 * Step 2b has two sub-passes:
 *   2b-i  Free-trial merge: a cluster whose bites are all 0 or < 20% of another
 *          cluster's median, entirely before that cluster, last bite ≤ 45 days
 *          before the other cluster's first bite → absorbed as leading bites.
 *   2b-ii Price-increase merge: non-overlapping clusters from the same merchant
 *          merged when the price step is ≤ 50% and the trend is upward.
 */

import type { Transaction } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the median of a sorted array of numbers.
 * Returns the middle element (odd length) or the floor of the average of the
 * two middle elements (even length). Uses integer math to keep cents as ints.
 */
function median(sorted: number[]): number {
  const len = sorted.length;
  if (len === 0) return 0;
  const mid = Math.floor(len / 2);
  if (len % 2 === 1) {
    return sorted[mid];
  }
  return Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Compute the median for an unsorted array of amount values.
 * Sorts a copy internally so the source is not mutated.
 */
function computeMedian(amounts: number[]): number {
  const sorted = [...amounts].sort((a, b) => a - b);
  return median(sorted);
}

/**
 * Returns true if `amount` is within 10% of `clusterMedian` (inclusive).
 * A cluster with median 0 accepts only 0.
 */
function isWithinTolerance(amount: number, clusterMedian: number): boolean {
  if (clusterMedian === 0) return amount === 0;
  return Math.abs(amount - clusterMedian) / clusterMedian <= 0.1;
}

/**
 * Absolute percentage difference between `amount` and `clusterMedian`.
 */
function absPctDiff(amount: number, clusterMedian: number): number {
  if (clusterMedian === 0) return amount === 0 ? 0 : Infinity;
  return Math.abs(amount - clusterMedian) / clusterMedian;
}

/** Returns the earliest ISO date string in a non-empty array of bites. */
function earliestDate(bites: Transaction[]): string {
  return bites.reduce((min, b) => (b.date < min ? b.date : min), bites[0].date);
}

/** Returns the latest ISO date string in a non-empty array of bites. */
function latestDate(bites: Transaction[]): string {
  return bites.reduce((max, b) => (b.date > max ? b.date : max), bites[0].date);
}

/** Returns the number of calendar days between two ISO date strings (b - a). */
function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 86_400_000;
  return (Date.parse(isoB) - Date.parse(isoA)) / msPerDay;
}

/**
 * True when every bite in A is strictly before every bite in B.
 */
function isNonOverlapping(a: Transaction[], b: Transaction[]): boolean {
  return latestDate(a) < earliestDate(b);
}

/** Amount of the chronologically first bite. */
function firstBiteAmount(bites: Transaction[]): number {
  const sorted = [...bites].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[0].amountCents;
}

/** Amount of the chronologically last bite. */
function lastBiteAmount(bites: Transaction[]): number {
  const sorted = [...bites].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1].amountCents;
}

/**
 * Detects a sustained price increase within a chronologically-sorted series of
 * amounts (integer cents). Returns true when there exists a split index
 * `p` in `[1, k-1]` such that:
 *   - every later amount is ≥ every earlier amount:
 *       min(a[p..k-1]) >= max(a[0..p-1])
 *   - the later segment's median is at least 2% above the earlier segment's
 *     median: median(a[p..]) * 100 >= median(a[..p]) * 102
 *
 * The 2% comparison is done on integer cents (×100 / ×102) to avoid float
 * rounding. Uses the file's `computeMedian` helper for consistency.
 */
function hasSustainedIncrease(amounts: number[]): boolean {
  const k = amounts.length;
  if (k < 2) return false;

  for (let p = 1; p < k; p++) {
    const earlier = amounts.slice(0, p);
    const later = amounts.slice(p);

    const maxEarlier = Math.max(...earlier);
    const minLater = Math.min(...later);
    if (minLater < maxEarlier) continue;

    const earlierMedian = computeMedian(earlier);
    const laterMedian = computeMedian(later);
    // Sustained ≥ 2% rise (integer-cents comparison).
    if (laterMedian * 100 >= earlierMedian * 102) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Iterative k-medians clustering (order-independent) — Step 2a
// ---------------------------------------------------------------------------

function clusterByAmount(bites: Transaction[]): Transaction[][] {
  if (bites.length === 0) return [];

  // Order-independence: cluster membership must not depend on the order the
  // bites arrive in. Seeding and k-medians reassignment both iterate the input
  // in order and tie-break only by absolute percent diff, so near-boundary
  // (within ~10%) same-merchant amounts can land in different clusters for
  // different input orders. Sorting a COPY into a canonical order
  // (amountCents asc, then date asc, then id asc) before clustering makes the
  // result deterministic without mutating the caller's array.
  const sorted = [...bites].sort((a, b) => {
    if (a.amountCents !== b.amountCents) return a.amountCents - b.amountCents;
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });

  let clusterAmounts: number[][] = [];
  let clusterBites: Transaction[][] = [];

  for (const bite of sorted) {
    const amount = bite.amountCents;
    const eligible: { idx: number; diff: number }[] = [];
    for (let i = 0; i < clusterAmounts.length; i++) {
      const med = computeMedian(clusterAmounts[i]);
      if (isWithinTolerance(amount, med)) {
        eligible.push({ idx: i, diff: absPctDiff(amount, med) });
      }
    }
    if (eligible.length === 0) {
      clusterAmounts.push([amount]);
      clusterBites.push([bite]);
    } else {
      eligible.sort((a, b) => a.diff - b.diff);
      const best = eligible[0].idx;
      clusterAmounts[best].push(amount);
      clusterBites[best].push(bite);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const medians = clusterAmounts.map((amounts) => computeMedian(amounts));
    const newClusterAmounts: number[][] = medians.map(() => []);
    const newClusterBites: Transaction[][] = medians.map(() => []);

    for (const bite of sorted) {
      const amount = bite.amountCents;
      const eligible: { idx: number; diff: number }[] = [];
      for (let i = 0; i < medians.length; i++) {
        if (isWithinTolerance(amount, medians[i])) {
          eligible.push({ idx: i, diff: absPctDiff(amount, medians[i]) });
        }
      }
      let targetIdx: number;
      if (eligible.length === 0) {
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

    const nonEmpty = newClusterAmounts
      .map((amounts, i) => ({ amounts, bites: newClusterBites[i] }))
      .filter((c) => c.amounts.length > 0);

    const nextAmounts = nonEmpty.map((c) => c.amounts);
    const nextBites = nonEmpty.map((c) => c.bites);

    const oldKey = [...clusterBites.map((c) => c.map((t) => t.id).sort().join(','))].sort().join('|');
    const newKey = [...nextBites.map((c) => c.map((t) => t.id).sort().join(','))].sort().join('|');

    if (oldKey !== newKey) changed = true;
    clusterAmounts = nextAmounts;
    clusterBites = nextBites;
  }

  return clusterBites;
}

// ---------------------------------------------------------------------------
// Step 2b-i: Free-trial merge
// ---------------------------------------------------------------------------

/**
 * A cluster T is a "trial cluster" relative to paid cluster P when ALL hold:
 *   1. Every bite in T is 0 cents or < 20% of P's median.
 *   2. T is entirely before P (non-overlapping).
 *   3. T's last bite is ≤ 45 days before P's first bite.
 *
 * When matched, T's bites are prepended to P as the leading (trial) bites.
 * The merged cluster is NOT marked hasPriceIncrease (it's a trial, not a step).
 *
 * Runs one scan per call; caller loops until stable.
 */
function mergeTrialRound(
  clusters: Transaction[][],
): { clusters: Transaction[][]; merged: boolean } {
  for (let t = 0; t < clusters.length; t++) {
    for (let p = 0; p < clusters.length; p++) {
      if (t === p) continue;

      const trial = clusters[t];
      const paid = clusters[p];

      // Condition 1: T entirely before P
      if (!isNonOverlapping(trial, paid)) continue;

      // Condition 2: gap ≤ 45 days
      const gap = daysBetween(latestDate(trial), earliestDate(paid));
      if (gap > 45) continue;

      // Condition 3: all bites in T are 0 or < 20% of P's median
      const medP = computeMedian(paid.map((tx) => tx.amountCents));
      const threshold = medP * 0.2;
      const allTrial = trial.every((tx) => tx.amountCents === 0 || tx.amountCents < threshold);
      if (!allTrial) continue;

      // Match — absorb T into P
      const merged = [...trial, ...paid];
      const rest = clusters.filter((_, idx) => idx !== t && idx !== p);
      return { clusters: [...rest, merged], merged: true };
    }
  }
  return { clusters, merged: false };
}

// ---------------------------------------------------------------------------
// Step 2b-ii: Price-increase merge
// ---------------------------------------------------------------------------

/**
 * Attempts one price-increase merge across all ordered pairs (A before B):
 *   1. Non-overlapping.
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

      if (!isNonOverlapping(a, b)) continue;

      const aLast = lastBiteAmount(a);
      const bFirst = firstBiteAmount(b);
      if (bFirst > aLast * 1.5) continue;

      const medA = computeMedian(a.map((t) => t.amountCents));
      const medB = computeMedian(b.map((t) => t.amountCents));
      if (medB <= medA) continue;

      const merged = [...a, ...b];
      const rest = clusters.filter((_, idx) => idx !== i && idx !== j);
      return { clusters: [...rest, merged], merged: true };
    }
  }
  return { clusters, merged: false };
}

// ---------------------------------------------------------------------------
// Step 2b: Combined merge pass
// ---------------------------------------------------------------------------

/**
 * Applies trial merges (2b-i) first, then price-increase merges (2b-ii),
 * repeating until stable. Returns the final clusters and two sets of
 * membership keys: those merged via trial and those merged via price increase.
 */
function applyStep2b(initialClusters: Transaction[][]): {
  clusters: Transaction[][];
  trialMergedKeys: Set<string>;
  priceIncreaseMergedKeys: Set<string>;
} {
  const clusterKey = (c: Transaction[]) =>
    c.map((t) => t.id).sort().join(',');

  // Track clusters that existed before any merging
  const originalKeys = new Set(initialClusters.map(clusterKey));

  let current = initialClusters;

  // Phase 1: free-trial merges
  let merged = true;
  while (merged) {
    const r = mergeTrialRound(current);
    merged = r.merged;
    current = r.clusters;
  }

  // Clusters that are new after trial merges
  const afterTrialKeys = new Set(current.map(clusterKey));
  const trialMergedKeys = new Set<string>();
  for (const k of afterTrialKeys) {
    if (!originalKeys.has(k)) trialMergedKeys.add(k);
  }

  // Phase 2: price-increase merges
  merged = true;
  while (merged) {
    const r = mergePriceIncreaseRound(current);
    merged = r.merged;
    current = r.clusters;
  }

  // Clusters that are new after price-increase merges (excluding trial-only ones)
  const priceIncreaseMergedKeys = new Set<string>();
  for (const cluster of current) {
    const k = clusterKey(cluster);
    if (!originalKeys.has(k) && !trialMergedKeys.has(k)) {
      priceIncreaseMergedKeys.add(k);
    }
  }

  return { clusters: current, trialMergedKeys, priceIncreaseMergedKeys };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Group transactions by normalized merchant name (Step 1) and apply amount
 * clustering (Step 2a). Does NOT apply Step 2b merges.
 *
 * Returns `Map<clusterId, Transaction[]>` where key is
 * `normalizedName + "_" + clusterIndex` (0-based, ascending by median).
 *
 * Requirements: 4.1, 4.5
 */
export function groupByMerchant(
  transactions: Transaction[],
): Map<string, Transaction[]> {
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

  const result = new Map<string, Transaction[]>();
  for (const [normalizedName, group] of primaryGroups) {
    const clusters = clusterByAmount(group);
    const withMedian = clusters
      .map((bites) => ({ bites, median: computeMedian(bites.map((b) => b.amountCents)) }))
      .sort((a, b) => a.median - b.median);

    for (let i = 0; i < withMedian.length; i++) {
      result.set(`${normalizedName}_${i}`, withMedian[i].bites);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Partial RecurrenceCandidate
// ---------------------------------------------------------------------------

/**
 * The subset of `RecurrenceCandidate` that `buildCandidates` can fill in.
 * `cadence` and `hasFreeTrial` require cadence analysis and are set later.
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
 * Run the full grouping pipeline (Steps 1 → 2a → 2b) and convert each cluster
 * into a `PartialCandidate`.
 *
 * Step 2b applies, in order:
 *   - Free-trial merge (2b-i): trial bites (all 0 or < 20% of paid median, ≤ 45
 *     days gap, entirely before) are absorbed into the paid cluster.
 *   - Price-increase merge (2b-ii): non-overlapping clusters where B_first ≤
 *     A_last × 1.5 and B median > A median are merged with hasPriceIncrease=true.
 *
 * Cluster IDs: `normalizedName + "_" + i` (0-based, ascending by median).
 *
 * Requirements: 4.1, 4.5, 4.6
 */
export function buildCandidates(
  transactions: Transaction[],
): Array<{ id: string; candidate: PartialCandidate }> {
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
    const rawClusters = clusterByAmount(group);
    const { clusters: mergedClusters, priceIncreaseMergedKeys } =
      applyStep2b(rawClusters);

    const clusterKey = (c: Transaction[]) => c.map((t) => t.id).sort().join(',');

    const withMedian = mergedClusters.map((bites) => {
      const med = computeMedian(bites.map((b) => b.amountCents));
      const key = clusterKey(bites);
      return { bites, median: med, hasPriceIncrease: priceIncreaseMergedKeys.has(key) };
    });

    withMedian.sort((a, b) => a.median - b.median);

    for (let i = 0; i < withMedian.length; i++) {
      const { bites, median: med, hasPriceIncrease: mergedPriceIncrease } = withMedian[i];
      const sortedBites = [...bites].sort((a, b) => a.date.localeCompare(b.date));
      const amountHistory = sortedBites.map((b) => b.amountCents);

      // Leading free-trial bites (0 or < 20% of the median) do not count
      // against stability: they are part of the trial, not a price change.
      let firstPaid = 0;
      while (
        firstPaid < amountHistory.length - 1 &&
        (amountHistory[firstPaid] === 0 || amountHistory[firstPaid] < med * 0.2)
      ) {
        firstPaid++;
      }
      const paidHistory = amountHistory.slice(firstPaid);
      const paidMedian = computeMedian(paidHistory);
      const isAmountStable =
        paidMedian === 0
          ? paidHistory.every((a) => a === 0)
          : paidHistory.every((a) => Math.abs(a - paidMedian) / paidMedian <= 0.1);

      // Price-increase detection within a single cluster. A sub-10% step is
      // absorbed into one cluster by k-medians, so it never triggers the 2b-ii
      // merge pass. Product decision: flag any *sustained* increase of ≥ 2%.
      // Search the trial-excluded chronological series (paidHistory) for a split
      // index p where every later bite is ≥ every earlier bite and the later
      // segment's median is at least 2% above the earlier segment's median.
      // OR this in with any price-increase already flagged by the 2b-ii merge.
      const hasPriceIncrease =
        mergedPriceIncrease || hasSustainedIncrease(paidHistory);

      output.push({
        id: `${normalizedName}_${i}`,
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
