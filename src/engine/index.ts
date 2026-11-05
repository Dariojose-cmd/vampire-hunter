/**
 * Vampire Hunter — Detection Engine public API
 * Pure TypeScript only. Zero React imports.
 *
 * Wires the individual engine modules into a single `runDetection` pipeline
 * and a `parseStatement` orchestration helper. Both functions never throw.
 */

import type {
  AppError,
  CatalogEntry,
  ColumnLayout,
  DateFormat,
  DetectionInput,
  DetectionResult,
  ExchangeRates,
  NumberFormat,
  RecurrenceCandidate,
  Result,
  Transaction,
  Vampire,
} from './types';

import { normalize } from './normalizer';
import { buildCandidates } from './grouper';
import { detectCadence, detectFreeTrial } from './cadenceDetector';
import { matchCatalog } from './catalogMatcher';
import { computeScore } from './scorer';
import {
  annualBloodLossCents,
  generateAvatar,
  predictNextBite,
  threatLevelFromCents,
} from './profileBuilder';
import {
  detectColumns,
  inferDateFormat,
  inferNumberFormat,
  parseRows,
} from './parser';
import { inferCurrency } from './currencyUtils';

import catalogJson from '../data/catalog.json';
import exchangeRatesJson from '../data/exchangeRates.json';

// Typed views over the bundled JSON data.
const CATALOG = catalogJson as CatalogEntry[];
const EXCHANGE_RATES = exchangeRatesJson as ExchangeRates;

// ---------------------------------------------------------------------------
// runDetection
// ---------------------------------------------------------------------------

/**
 * Run the full detection pipeline against a set of parsed transactions.
 *
 * Pipeline (in order):
 *   1. Credit filter — drop every `type === 'credit'` transaction first.
 *   2. Normalize — set `normalizedName = normalize(description)` on survivors.
 *   3. Group + cluster — `buildCandidates` applies Step 1 → 2a → 2b and returns
 *      `{ id, candidate }` pairs (bites sorted ascending, median, stability,
 *      authoritative `hasPriceIncrease`, amountHistory).
 *   4. Per candidate: detect cadence (null → excluded, enforcing the
 *      no-singleton / non-recurring rule), detect free trial, pre-match the
 *      catalog, score, then build the full Vampire profile. The grouper's
 *      `hasPriceIncrease` is carried straight through (single source of truth).
 *   5. Split by confidence: ≥ 60 → `vampires`; 1–59 → `possibleVampires`;
 *      0 → excluded from both.
 *
 * Never throws.
 *
 * Requirements: 4.1, 4.8, 4.9, 4.10, 5.3, 5.5
 */
export function runDetection(input: DetectionInput): DetectionResult {
  const vampires: Vampire[] = [];
  const possibleVampires: Vampire[] = [];

  try {
    // Step 1: exclude credits before anything else.
    const debits = input.transactions.filter((t) => t.type !== 'credit');

    // Step 2: normalize each surviving transaction's merchant name.
    const normalized: Transaction[] = debits.map((t) => ({
      ...t,
      normalizedName: normalize(t.description),
    }));

    // Step 3: group + cluster (Steps 1 → 2a → 2b applied inside).
    const candidates = buildCandidates(normalized);

    // Step 4: build a Vampire for each recurring candidate.
    for (const { id, candidate } of candidates) {
      // 4a. Cadence — null means non-recurring (incl. single-transaction
      // groups), so the candidate is excluded entirely.
      const cadence = detectCadence(candidate.bites.map((b) => b.date));
      if (cadence === null) continue;

      // 4b. Free-trial detection.
      const hasFreeTrial = detectFreeTrial(
        candidate.bites,
        candidate.medianAmountCents,
      );

      // 4c. Full RecurrenceCandidate. `hasPriceIncrease` is taken straight from
      // the grouper (single source of truth — reflects the cluster-merge
      // decision). We do NOT recompute it here.
      const recurrence: RecurrenceCandidate = {
        normalizedName: candidate.normalizedName,
        bites: candidate.bites,
        cadence,
        medianAmountCents: candidate.medianAmountCents,
        isAmountStable: candidate.isAmountStable,
        hasFreeTrial,
        hasPriceIncrease: candidate.hasPriceIncrease,
        amountHistory: candidate.amountHistory,
      };

      // 4d. Catalog pre-match.
      const match = matchCatalog(candidate.normalizedName, CATALOG);

      // 4e. Confidence score.
      const confidenceScore = computeScore(recurrence, match !== undefined);

      // Score 0 → excluded from both lists.
      if (confidenceScore <= 0) continue;

      // 4f. Profile fields.
      const annualCents = annualBloodLossCents(
        candidate.medianAmountCents,
        cadence,
      );
      const threatLevel = threatLevelFromCents(
        annualCents,
        input.currency,
        EXCHANGE_RATES,
      );
      const firstBiteDate = candidate.bites[0].date;
      const lastBiteDate = candidate.bites[candidate.bites.length - 1].date;
      const nextBiteDate = predictNextBite(lastBiteDate, cadence);
      const avatarSvg = generateAvatar(candidate.normalizedName);
      const displayName = match ? match.canonicalName : candidate.normalizedName;

      // 4g. Assemble the Vampire.
      const vampire: Vampire = {
        id,
        normalizedName: candidate.normalizedName,
        displayName,
        cadence,
        bites: candidate.bites,
        medianAmountCents: candidate.medianAmountCents,
        annualBloodLossCents: annualCents,
        threatLevel,
        firstBiteDate,
        lastBiteDate,
        nextBiteDate,
        confidenceScore,
        isAmountStable: candidate.isAmountStable,
        hasFreeTrial,
        hasPriceIncrease: candidate.hasPriceIncrease,
        amountHistory: candidate.amountHistory,
        catalogEntry: match,
        avatarSvg,
        currency: input.currency,
      };

      // Step 5: split by confidence threshold.
      if (confidenceScore >= 60) {
        vampires.push(vampire);
      } else {
        possibleVampires.push(vampire);
      }
    }
  } catch {
    // Safety net — the engine must never throw. On any unexpected failure we
    // return whatever has been collected so far (possibly empty).
  }

  return { vampires, possibleVampires };
}

// ---------------------------------------------------------------------------
// parseStatement
// ---------------------------------------------------------------------------

/** Successful payload of `parseStatement`. */
export interface ParsedStatement {
  transactions: Transaction[];
  /** Number of rows that could not be parsed and were skipped. */
  skipped: number;
  /** The detected column layout (single vs split). */
  layout: ColumnLayout;
  /**
   * Detected ISO 4217 currency code. Inferred from a dedicated currency column
   * (headers matching currency/moneda/divisa), the amount column(s), and the
   * header row combined. Defaults to 'USD' when no signal is found.
   */
  currency: string;
}

/** Returns a typed AppError wrapped in a failed Result. */
function fail(code: AppError['code'], message: string): { ok: false; error: AppError } {
  return { ok: false, error: { code, message } };
}

/**
 * Orchestrate the parser functions to turn raw CSV cells into `Transaction[]`.
 *
 * Steps:
 *   1. `detectColumns(headers, rows)` — if it returns a `COLUMN_MAPPING_NEEDED`
 *      AppError, propagate it as `{ ok: false, error }`.
 *   2. Infer the date format from the date column. `'ambiguous'` →
 *      `DATE_FORMAT_AMBIGUOUS`.
 *   3. Infer the number format:
 *        - `single` layout → infer from the single amount column.
 *        - `split`  layout → infer from the DEBIT and CREDIT columns TOGETHER
 *          (a single combined array of the non-empty values from both columns).
 *          Debit and credit share the same locale, and one column alone may not
 *          reveal the decimal convention; combining gives full evidence.
 *   3b. Infer currency from a dedicated currency column (header matching
 *       currency/moneda/divisa), the amount column(s), and the header row,
 *       combined. Explicit ISO codes win over a bare `$` (→ USD fallback).
 *   4. `parseRows(...)` — if it yields zero transactions, return `NO_VALID_ROWS`.
 *
 * Never throws.
 *
 * Requirements: 1.3–1.8, 5.3, 5.5
 */
export function parseStatement(
  headers: string[],
  rows: string[][],
): Result<ParsedStatement, AppError> {
  try {
    // Step 1: resolve column layout.
    const layoutResult = detectColumns(headers, rows);
    if ('code' in layoutResult) {
      // AppError (COLUMN_MAPPING_NEEDED and any future error codes).
      return { ok: false, error: layoutResult };
    }
    const layout: ColumnLayout = layoutResult;

    // Helper to pull non-empty trimmed values for a given column index.
    const columnValues = (col: number): string[] => {
      if (col < 0) return [];
      const out: string[] = [];
      for (const row of rows) {
        const cell = (row[col] ?? '').trim();
        if (cell !== '') out.push(cell);
      }
      return out;
    };

    // Step 2: infer date format.
    const dateFormatResult = inferDateFormat(columnValues(layout.dateCol));
    if (dateFormatResult === 'ambiguous') {
      return fail(
        'DATE_FORMAT_AMBIGUOUS',
        'Could not determine the date format from the date column. ' +
          'Please specify whether dates are DD/MM/YYYY or MM/DD/YYYY.',
      );
    }
    const dateFormat: DateFormat = dateFormatResult;

    // Step 3: infer number format.
    let numberFormat: NumberFormat;
    if (layout.type === 'single') {
      numberFormat = inferNumberFormat(columnValues(layout.amountCol));
    } else {
      // Combine the non-empty values from BOTH the debit and credit columns so
      // the inference sees the full evidence for the shared locale.
      const combined = [
        ...columnValues(layout.debitCol),
        ...columnValues(layout.creditCol),
      ];
      numberFormat = inferNumberFormat(combined);
    }

    // Step 3b: infer currency.
    // A dedicated currency column (header matching currency/moneda/divisa) is
    // the strongest signal — LatAm statements carry the ISO code there while
    // the amount column has no symbol. We combine that column's values with the
    // amount column(s) and the header row, then let inferCurrency decide
    // (explicit ISO codes outrank bare `$`, which falls back to USD).
    const assignedCols = new Set<number>(
      layout.type === 'single'
        ? [layout.dateCol, layout.descCol, layout.amountCol]
        : [layout.dateCol, layout.descCol, layout.debitCol, layout.creditCol],
    );
    let currencyColIndex = -1;
    for (let i = 0; i < headers.length; i++) {
      const h = (headers[i] ?? '').trim();
      if (/currency|moneda|divisa/i.test(h) && !assignedCols.has(i)) {
        currencyColIndex = i;
        break;
      }
    }
    const currencyColumnValues = columnValues(currencyColIndex);
    const amountColumnValues =
      layout.type === 'single'
        ? columnValues(layout.amountCol)
        : [...columnValues(layout.debitCol), ...columnValues(layout.creditCol)];
    const currency = inferCurrency(
      [...currencyColumnValues, ...amountColumnValues],
      headers,
    );

    // Step 4: parse the rows.
    const { transactions, skipped } = parseRows(
      rows,
      layout,
      dateFormat,
      numberFormat,
    );

    if (transactions.length === 0) {
      return fail(
        'NO_VALID_ROWS',
        'The file was parsed but contained no usable transactions.',
      );
    }

    return { ok: true, value: { transactions, skipped, layout, currency } };
  } catch {
    // Safety net — never throw.
    return fail('PARSE_FAILED', 'Unexpected error while parsing the statement.');
  }
}
