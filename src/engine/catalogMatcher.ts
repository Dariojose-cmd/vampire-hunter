/**
 * Vampire Hunter — Catalog Matcher
 * Pure TypeScript only. Zero React imports.
 *
 * Matches a normalized merchant name against the local known-services
 * catalog (src/data/catalog.json) using word-boundary regular expressions.
 *
 * See design.md section 7 for the algorithm.
 */

import type { CatalogEntry } from './types';

/**
 * Remove diacritics (e.g. "SUSCRIPCIÓN" -> "SUSCRIPCION", "Ñ" -> "N") so that
 * matching is accent-insensitive on both sides.
 */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Escape all regex special characters in `term` so it can be embedded in a
 * `RegExp` and matched literally.
 *
 * Escapes: . * + ? ^ $ { } ( ) | [ ] \ and /
 *
 * @param term - The literal string to escape.
 * @returns The escaped string, safe to embed in a RegExp source.
 */
export function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Build the case-insensitive boundary regex for a catalog term. Terms that end
 * (or start) with a word character use `\b`; terms ending in a symbol such as
 * "DISNEY+" use a lookaround instead, because `\b` after "+" would only match
 * when another word character followed it.
 */
export function buildTermPattern(term: string): RegExp {
  const lead = /^\w/.test(stripAccents(term)) ? '\\b' : '(?<!\\w)';
  const trail = /\w$/.test(stripAccents(term)) ? '\\b' : '(?!\\w)';
  return new RegExp(lead + escapeRegex(stripAccents(term)) + trail, 'i');
}

/**
 * Match a normalized merchant name against the catalog.
 *
 * For each entry, a case-insensitive word-boundary regex is built for the
 * canonical name and every alias: `new RegExp('\\b' + escapeRegex(term) + '\\b', 'i')`.
 * The first entry whose canonical name or any alias matches `normalizedName`
 * is returned; otherwise `undefined`.
 *
 * Word-boundary semantics mean "MAX" matches "HBO MAX" but not "MAXI DESPENSA",
 * and "APPLE" matches "APPLE.COM BILL" but not "SNAPPLE BEVERAGES". Special
 * characters in aliases (e.g. "APPLE.COM/BILL") are escaped so they match
 * literally rather than as regex wildcards.
 *
 * @param normalizedName - Output of the normalizer for a transaction.
 * @param catalog - The catalog of known services.
 * @returns The first matching `CatalogEntry`, or `undefined` if none match.
 */
export function matchCatalog(
  normalizedName: string,
  catalog: CatalogEntry[],
): CatalogEntry | undefined {
  const haystack = stripAccents(normalizedName);
  for (const entry of catalog) {
    const terms = [entry.canonicalName, ...entry.aliases];
    for (const term of terms) {
      if (!term) continue;
      const pattern = buildTermPattern(term);
      if (pattern.test(haystack)) {
        return entry;
      }
    }
  }
  return undefined;
}
