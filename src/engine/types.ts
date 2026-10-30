/**
 * Vampire Hunter — shared TypeScript types and error model
 * Pure TypeScript only. Zero React imports.
 * All monetary values are integer cents. All dates are ISO 8601 strings.
 */

// ---------------------------------------------------------------------------
// Raw parsing types
// ---------------------------------------------------------------------------

/**
 * Describes how the CSV amount column(s) are laid out:
 * - `single`: one column where debits are negative and credits are positive
 * - `split`:  separate debit and credit columns
 */
export type ColumnLayout =
  | { type: 'single'; amountCol: number; dateCol: number; descCol: number }
  | {
      type: 'split';
      debitCol: number;
      creditCol: number;
      dateCol: number;
      descCol: number;
    };

/** A raw row after Papa Parse, before any type conversion. */
export interface ParsedRow {
  rawDate: string;
  rawDescription: string;
  /** May use comma or dot as decimal separator (e.g. "1.299,00" or "12.99"). */
  rawAmount: string;
  /** Optional dedicated currency column value. */
  rawCurrency?: string;
}

/** How the decimal/thousands separators are used in an amount column. */
export type NumberFormat = 'dotDecimal' | 'commaDecimal' | 'noDecimal';

/** Supported date string formats fed into the parser. */
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

/** Direction of a bank transaction. */
export type TransactionType = 'debit' | 'credit';

/**
 * A single parsed, validated bank transaction.
 * `amountCents` is always a positive integer (sign is encoded in `type`).
 */
export interface Transaction {
  /** Deterministic hash derived from row index + description. */
  id: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: string;
  /** Original, unmodified description from the CSV. */
  description: string;
  /** Output of the Normalizer — used for grouping. */
  normalizedName: string;
  /** Positive integer cents (always > 0, or 0 for free-trial charges). */
  amountCents: number;
  type: TransactionType;
  /** ISO 4217 currency code, e.g. 'USD'. */
  currency: string;
}

/** Detected payment frequency. */
export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * A group of transactions that appear to recur, before confidence scoring.
 */
export interface RecurrenceCandidate {
  normalizedName: string;
  /** All charge instances sorted by date ascending. */
  bites: Transaction[];
  cadence: Cadence;
  /** Median bite amount in cents. */
  medianAmountCents: number;
  /** True if all bites are within 10% of the median (excluding free-trial first bite). */
  isAmountStable: boolean;
  /** True if the first bite was 0 cents or < 20% of the median. */
  hasFreeTrial: boolean;
  /** True if amounts are monotonically non-decreasing with at least one > 5% increase. */
  hasPriceIncrease: boolean;
  /** Bite amounts in cents, chronological order. */
  amountHistory: number[];
}

/** A `RecurrenceCandidate` after the scoring step. */
export interface ScoredCandidate extends RecurrenceCandidate {
  /** Integer 0–100. */
  confidenceScore: number;
}

/** Severity category derived from Annual Blood Loss in USD equivalent. */
export type ThreatLevel = 'Low' | 'Medium' | 'High' | 'Critical';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** An entry in the local known-services catalog (catalog.json). */
export interface CatalogEntry {
  id: string;
  canonicalName: string;
  /** Uppercase normalized aliases used for matching. */
  aliases: string[];
  cancelUrl: string;
  /** Ordered step-by-step cancellation instructions. */
  cancelSteps: string[];
  /** Optional bundled asset path or remote URL. */
  logoUrl?: string;
}

// ---------------------------------------------------------------------------
// Vampire (final output)
// ---------------------------------------------------------------------------

/**
 * A fully built vampire profile, ready for the UI.
 * `confidenceScore >= 60` → `vampires`; `1–59` → `possibleVampires`.
 */
export interface Vampire {
  /**
   * Stable identifier: `normalizedName + '_' + clusterIndex`. Clusters of the same
   * merchant are indexed by ascending median amount, so the same statement always
   * yields the same ids (two subscriptions from one merchant never share an id).
   */
  id: string;
  normalizedName: string;
  /** Canonical catalog name if matched; otherwise `normalizedName`. */
  displayName: string;
  cadence: Cadence;
  bites: Transaction[];
  /** Median bite amount in cents. */
  medianAmountCents: number;
  /** `medianAmountCents * cadence_multiplier` in cents. */
  annualBloodLossCents: number;
  threatLevel: ThreatLevel;
  /** ISO 8601 date string of the earliest bite. */
  firstBiteDate: string;
  /** ISO 8601 date string of the most recent bite. */
  lastBiteDate: string;
  /** ISO 8601 date string: predicted next charge. */
  nextBiteDate: string;
  /** Integer 0–100. */
  confidenceScore: number;
  isAmountStable: boolean;
  hasFreeTrial: boolean;
  hasPriceIncrease: boolean;
  /** Bite amounts in cents, chronological order. */
  amountHistory: number[];
  catalogEntry?: CatalogEntry;
  /** Deterministically generated SVG string (same input → same output). */
  avatarSvg: string;
  /** ISO 4217 currency code. */
  currency: string;
}

// ---------------------------------------------------------------------------
// User decisions
// ---------------------------------------------------------------------------

/** The action a user has taken on a vampire. `null` means no decision yet. */
export type DecisionType = 'staked' | 'spared' | 'garlic' | null;

/** One persisted user decision for a single vampire. */
export interface UserDecision {
  vampireId: string;
  decision: DecisionType;
  /** ISO 8601 timestamp of when the decision was made. */
  decidedAt: string;
}

// ---------------------------------------------------------------------------
// Persistence (localStorage schema)
// ---------------------------------------------------------------------------

/**
 * Shape of the value stored under the key `'vampire-hunter:crypt'`.
 * Raw transaction data is NEVER persisted here.
 */
export interface CryptStorage {
  /** Keyed by vampireId. */
  decisions: Record<string, UserDecision>;
  language: 'en' | 'es';
  /** ISO 4217 currency override selected by the user. */
  currency: string;
}

// ---------------------------------------------------------------------------
// Detection engine public API
// ---------------------------------------------------------------------------

/** Input contract for `runDetection`. */
export interface DetectionInput {
  transactions: Transaction[];
  /** ISO 4217 currency code detected from (or selected for) the statement. */
  currency: string;
}

/** Output contract for `runDetection`. */
export interface DetectionResult {
  /** Vampires with `confidenceScore >= 60`. */
  vampires: Vampire[];
  /** Vampires with `confidenceScore` in the range [1, 59]. */
  possibleVampires: Vampire[];
}

// ---------------------------------------------------------------------------
// Error model and Result type
// ---------------------------------------------------------------------------

/**
 * All error codes the engine can produce.
 * - `PARSE_FAILED`           — a row or value could not be parsed
 * - `COLUMN_MAPPING_NEEDED`  — required columns could not be auto-detected
 * - `DATE_FORMAT_AMBIGUOUS`  — date format cannot be inferred from column data
 * - `NO_VALID_ROWS`          — file parsed but yielded zero usable transactions
 * - `STORAGE_UNAVAILABLE`    — localStorage read/write failed
 */
export type AppErrorCode =
  | 'PARSE_FAILED'
  | 'COLUMN_MAPPING_NEEDED'
  | 'DATE_FORMAT_AMBIGUOUS'
  | 'NO_VALID_ROWS'
  | 'STORAGE_UNAVAILABLE';

/**
 * Structured error object returned by engine functions.
 * Engine functions never throw — they return `Result<T, AppError>`.
 */
export interface AppError {
  code: AppErrorCode;
  message: string;
  /**
   * Present on `COLUMN_MAPPING_NEEDED` errors: the list of CSV column headers
   * so the UI can populate the ColumnMapper selects.
   */
  headers?: string[];
}

/**
 * Discriminated-union result type used throughout the engine.
 *
 * ```ts
 * const r = parseDate(s, format);
 * if (r.ok) {
 *   // r.value is string
 * } else {
 *   // r.error is AppError
 * }
 * ```
 */
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ---------------------------------------------------------------------------
// Currency helpers
// ---------------------------------------------------------------------------

/** Static exchange-rate table: ISO 4217 code → rate relative to USD. */
export type ExchangeRates = Record<string, number>;

// ---------------------------------------------------------------------------
// ICS generator i18n strings
// ---------------------------------------------------------------------------

/**
 * Translated strings required by `generateIcs`.
 * Consumers should pass the relevant i18n leaf from `en.json` / `es.json`.
 */
export interface IcsI18n {
  /** e.g. "⚠️ {{name}} charge in 3 days" */
  icsEventSummary: string;
  /** e.g. "Your {{name}} subscription is about to charge {{amount}}. …" */
  icsEventDescription: string;
  /** e.g. "vampire-reminder-{{name}}.ics" */
  icsFilename: string;
}
