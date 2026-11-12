/**
 * Vampire Hunter — creeping-amount split detection.
 * Pure TypeScript only. Zero React imports.
 *
 * Amount clustering can split one merchant whose price creeps up every month
 * (groceries, delivery apps) into several small clusters, each of which looks
 * like a steady subscription. This helper finds those merchants so the caller
 * can cap their scores below the vampire threshold.
 */

import type { Cadence, Transaction } from './types';

/** Minimum number of merged bites for a series to count as "creeping". */
export const MIN_CREEPING_BITES = 4;

/** Minimal per-cluster view needed by {@link findCreepingSplitIds}. */
export interface CreepingInput {
  id: string;
  normalizedName: string;
  /** Null when the cluster has no recurring cadence (such clusters are ignored). */
  cadence: Cadence | null;
  hasCatalogMatch: boolean;
  bites: Transaction[];
}

/** True when each amount is strictly higher than the previous one. */
function isStrictlyRising(bites: Transaction[]): boolean {
  const sorted = [...bites].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].amountCents <= sorted[i - 1].amountCents) return false;
  }
  return true;
}

/**
 * Returns the ids of clusters that belong to a creeping-amount split.
 *
 * A merchant (same `normalizedName`) qualifies, per cadence, when it has 2+
 * clusters of that cadence, none matched to the catalog, and the merged bites
 * of those clusters (sorted by date) number at least {@link MIN_CREEPING_BITES}
 * and are strictly rising. Plateaus (repeated amounts) and flat multi-plan
 * merchants interleave equal amounts, so they never qualify.
 */
export function findCreepingSplitIds(items: CreepingInput[]): Set<string> {
  const groups = new Map<string, CreepingInput[]>();
  for (const it of items) {
    if (it.cadence === null) continue;
    const key = `${it.normalizedName}\u0000${it.cadence}`;
    const list = groups.get(key);
    if (list) list.push(it);
    else groups.set(key, [it]);
  }

  const ids = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (group.some((g) => g.hasCatalogMatch)) continue;
    const merged = group.flatMap((g) => g.bites);
    if (merged.length < MIN_CREEPING_BITES) continue;
    if (!isStrictlyRising(merged)) continue;
    for (const g of group) ids.add(g.id);
  }
  return ids;
}
