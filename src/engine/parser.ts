/**
 * Vampire Hunter — CSV parser
 * Pure TypeScript only. Zero React imports.
 * All functions return Result<T, AppError> and never throw.
 */

import type { AppError, ColumnLayout, DateFormat, NumberFormat, Result, Transaction } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Days in a given month (1-indexed), accounting for leap years. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Zero-pads a number to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Returns a PARSE_FAILED AppError with the given message. */
function parseFailed(message: string): { ok: false; error: AppError } {
  return { ok: false, error: { code: 'PARSE_FAILED', message } };
}

/**
 * Validates that the combination of year/month/day represents a real
 * calendar date. Returns true when valid.
 */
function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (year < 1) return false;
  return true;
}

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------

const TIME_SUFFIX_RE =
  /[ T]\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:[AaPp]\.?[Mm]\.?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Trims a value and removes a trailing time-of-day part (e.g. " 10:12:00", "T10:12:00Z"). */
function stripTimePart(s: string): string {
  const trimmed = s.trim();
  return trimmed.replace(TIME_SUFFIX_RE, '').trim();
}

/** German-style dotted date (DD.MM.YYYY); always day-first. */
const DOTTED_DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** Compact YYYYMMDD date (e.g. 20251231), with plausible year/month/day ranges. */
const COMPACT_DATE_RE = /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Parses a date string in one of the three supported formats and returns an
 * ISO 8601 date string (YYYY-MM-DD) wrapped in a Result.
 *
 * Supported formats: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
 *
 * Never throws — all errors are returned as { ok: false, error }.
 */
export function parseDate(
  s: string,
  format: DateFormat,
): Result<string, AppError> {
  try {
    const trimmed = stripTimePart(s ?? '');

    if (trimmed === '') {
      return parseFailed(`Empty date string`);
    }

    // Compact YYYYMMDD is unambiguous regardless of the requested format.
    if (COMPACT_DATE_RE.test(trimmed)) {
      const year = parseInt(trimmed.slice(0, 4), 10);
      const month = parseInt(trimmed.slice(4, 6), 10);
      const day = parseInt(trimmed.slice(6, 8), 10);
      if (!isValidDate(year, month, day)) {
        return parseFailed(
          `"${trimmed}" is not a real calendar date (year=${year}, month=${month}, day=${day})`,
        );
      }
      return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
    }

    // Dotted DD.MM.YYYY (German/Central European) is unambiguously day-first.
    const dotted = DOTTED_DATE_RE.exec(trimmed);
    if (dotted) {
      const day = parseInt(dotted[1], 10);
      const month = parseInt(dotted[2], 10);
      const year = parseInt(dotted[3], 10);
      if (!isValidDate(year, month, day)) {
        return parseFailed(
          `"${trimmed}" is not a real calendar date (year=${year}, month=${month}, day=${day})`,
        );
      }
      return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
    }

    if (format === 'YYYY-MM-DD') {
      // Expected: YYYY-MM-DD  (separator can be '-')
      const parts = trimmed.split('-');
      if (parts.length !== 3) {
        return parseFailed(
          `Cannot parse "${trimmed}" as ${format}: expected 3 segments separated by '-'`,
        );
      }
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);

      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return parseFailed(`Cannot parse "${trimmed}" as ${format}: non-numeric segment`);
      }
      if (!isValidDate(year, month, day)) {
        return parseFailed(
          `"${trimmed}" is not a real calendar date (year=${year}, month=${month}, day=${day})`,
        );
      }
      return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
    }

    // YYYY-MM-DD values are unambiguous regardless of the column's inferred format.
    // A mixed-format statement (some rows ISO, some slash-delimited) would otherwise
    // lose every ISO row when the column is inferred as DD/MM/YYYY or MM/DD/YYYY.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parts = trimmed.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isValidDate(year, month, day)) {
        return parseFailed(
          `"${trimmed}" is not a real calendar date (year=${year}, month=${month}, day=${day})`,
        );
      }
      return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
    }

    // DD/MM/YYYY and MM/DD/YYYY both use '/' as separator
    const parts = trimmed.split('/');
    if (parts.length !== 3) {
      return parseFailed(
        `Cannot parse "${trimmed}" as ${format}: expected 3 segments separated by '/'`,
      );
    }

    const a = parseInt(parts[0], 10); // first segment
    const b = parseInt(parts[1], 10); // second segment
    const year = parseInt(parts[2], 10);

    if (isNaN(a) || isNaN(b) || isNaN(year)) {
      return parseFailed(`Cannot parse "${trimmed}" as ${format}: non-numeric segment`);
    }

    const day = format === 'DD/MM/YYYY' ? a : b;
    const month = format === 'DD/MM/YYYY' ? b : a;

    if (!isValidDate(year, month, day)) {
      return parseFailed(
        `"${trimmed}" is not a real calendar date (year=${year}, month=${month}, day=${day})`,
      );
    }

    return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
  } catch {
    // Safety net — function must never throw
    return parseFailed(`Unexpected error parsing "${s}"`);
  }
}

// ---------------------------------------------------------------------------
// inferDateFormat
// ---------------------------------------------------------------------------

/**
 * Inspects an entire date column to determine the date format used.
 *
 * Algorithm (per the spec):
 *  - Skip empty / null / whitespace-only values.
 *  - Split each value on '/' or '-'.
 *  - If any row's first segment is > 12 → format is 'DD/MM/YYYY'.
 *  - If any row's second segment is > 12 → format is 'MM/DD/YYYY'.
 *  - If every non-empty value is ISO (YYYY-MM-DD) → 'YYYY-MM-DD'.
 *  - If neither signal is found across the whole column → 'ambiguous'.
 *
 * Note: 'DD/MM/YYYY' signal takes priority over 'MM/DD/YYYY' because a first
 * segment > 12 is unambiguous proof that it cannot be a month.
 */
export function inferDateFormat(column: string[]): DateFormat | 'ambiguous' {
  let sawIso = false;
  let sawSlash = false;
  for (const raw of column) {
    if (raw == null) continue;
    const value = stripTimePart(raw);
    if (value === '') continue;

    // Dotted DD.MM.YYYY is always day-first.
    if (DOTTED_DATE_RE.test(value)) return 'DD/MM/YYYY';

    // The DD/MM vs MM/DD ambiguity only applies to slash-separated dates.
    // Hyphen-separated values follow YYYY-MM-DD where the first segment is a
    // 4-digit year (always > 12), so we skip them to avoid a false positive.
    if (!value.includes('/')) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) || COMPACT_DATE_RE.test(value)) sawIso = true;
      continue;
    }
    sawSlash = true;

    const parts = value.split('/');
    if (parts.length < 2) continue;

    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);

    if (!isNaN(first) && first > 12) {
      // Day in first position → DD/MM/YYYY
      return 'DD/MM/YYYY';
    }

    if (!isNaN(second) && second > 12) {
      // Day in second position → MM/DD/YYYY
      return 'MM/DD/YYYY';
    }
  }

  // A column of only ISO dates is unambiguous (year-first, no DD/MM vs MM/DD
  // question). Mixed ISO + undecidable slash dates stay 'ambiguous'.
  if (sawIso && !sawSlash) return 'YYYY-MM-DD';

  return 'ambiguous';
}

// ---------------------------------------------------------------------------
// Currency symbol / code stripping
// ---------------------------------------------------------------------------

/**
 * Regex that removes all known currency symbols and ISO 4217 codes.
 * Multi-character codes (R$, S/, USD …) must appear before single-character
 * symbols so that e.g. "R$" is removed as a unit rather than leaving "R".
 */
const CURRENCY_RE =
  /(?:USD|EUR|MXN|COP|ARS|BRL|CLP|GBP|CAD|PEN|R\$|S\/|\$|€|£|¥|₩)/g;

// ---------------------------------------------------------------------------
// inferNumberFormat
// ---------------------------------------------------------------------------

/**
 * Inspect every non-empty value in an amount column and determine how
 * separators (`.` and `,`) are used.
 *
 * Algorithm (column-level):
 * - A separator is a **thousands separator** if, across ALL its occurrences
 *   in the column, it is ALWAYS followed by exactly 3 digits.
 * - A separator is a **decimal separator** if it is EVER followed by 1–2 digits.
 *
 * Returns:
 * - `'commaDecimal'`  — dot=thousands, comma=decimal
 * - `'dotDecimal'`    — comma=thousands (or absent), dot=decimal
 * - `'noDecimal'`     — either separator used only as thousands, or no separators
 *
 * Requirements: 1.8, 1.12
 */
export function inferNumberFormat(column: string[]): NumberFormat {
  const dotStats = { seenAs3: 0, seenAs12: 0 };
  const commaStats = { seenAs3: 0, seenAs12: 0 };
  const SEP_RE = /[.,](\d*)/g;

  for (const value of column) {
    if (!value || value.trim() === '') continue;

    // Strip currency symbols so they don't interfere with digit counts
    const clean = value.trim().replace(CURRENCY_RE, '').trim();

    SEP_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SEP_RE.exec(clean)) !== null) {
      const sep = clean[match.index]; // '.' or ','
      const digits = match[1]; // digits immediately following the separator

      const stats = sep === '.' ? dotStats : commaStats;
      if (digits.length === 3) {
        stats.seenAs3++;
      } else if (digits.length >= 1 && digits.length <= 2) {
        stats.seenAs12++;
      }
      // length 0 (trailing separator) or > 3 — no evidence either way
    }
  }

  const dotIsThousands = dotStats.seenAs3 > 0 && dotStats.seenAs12 === 0;
  const dotIsDecimal = dotStats.seenAs12 > 0;
  const commaIsThousands = commaStats.seenAs3 > 0 && commaStats.seenAs12 === 0;
  const commaIsDecimal = commaStats.seenAs12 > 0;

  if (dotIsThousands && commaIsDecimal) return 'commaDecimal';
  if (commaIsThousands && dotIsDecimal) return 'dotDecimal';

  if (dotIsDecimal) return 'dotDecimal';
  if (commaIsDecimal) return 'commaDecimal';

  // One separator used only as thousands, or no separators at all
  return 'noDecimal';
}

// ---------------------------------------------------------------------------
// parseCents
// ---------------------------------------------------------------------------

/**
 * Convert a raw amount string to a positive integer count of cents.
 *
 * Steps:
 * 1. Strip all whitespace and currency symbols.
 * 2. Apply format:
 *    - `dotDecimal`:   commas = thousands separators → remove; dot = decimal
 *    - `commaDecimal`: dots = thousands separators → remove; comma → decimal dot
 *    - `noDecimal`:    remove all dots and commas; integer value
 * 3. Multiply by 100, round to nearest integer.
 * 4. Return absolute value (sign handled externally by debit/credit logic).
 *
 * Requirements: 1.8, 1.12
 */
export function parseCents(s: string, format: NumberFormat): number {
  // Step 1: strip whitespace and currency symbols
  // Accounting-style negatives such as "(15.49)" are treated as magnitude only
  let clean = s.replace(/\s+/g, '').replace(CURRENCY_RE, '').replace(/[()]/g, '');

  // Step 2: normalize separators per format
  switch (format) {
    case 'dotDecimal':
      clean = clean.replace(/,/g, '');
      break;
    case 'commaDecimal':
      clean = clean.replace(/\./g, '').replace(',', '.');
      break;
    case 'noDecimal':
      clean = clean.replace(/[.,]/g, '');
      break;
  }

  // Step 3: parse and convert to cents
  const numeric = parseFloat(clean);
  if (!isFinite(numeric)) return 0;

  // Step 4: absolute value, rounded to integer
  return Math.round(Math.abs(numeric) * 100);
}

// ---------------------------------------------------------------------------
// detectColumns
// ---------------------------------------------------------------------------

/** Date-like value pattern: 1-4 digits, separator, 1-2 digits, separator, 2-4 digits */
const DATE_VALUE_RE = /^\d{1,4}[/-]\d{1,2}[/-]\d{2,4}$/;

/**
 * Returns true if at least 70% of the non-empty values in the column
 * parse as finite numbers after stripping currency symbols and whitespace.
 */
function isMostlyNumeric(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v != null && v.trim() !== '');
  if (nonEmpty.length === 0) return false;
  const numeric = nonEmpty.filter((v) => {
    const clean = v.trim().replace(CURRENCY_RE, '').replace(/[,\s]/g, '').replace(/^-/, '').replace(/^\((.*)\)$/, '$1');
    return clean !== '' && isFinite(Number(clean));
  });
  return numeric.length / nonEmpty.length >= 0.7;
}

/** True when every value looks like a compact YYYYMMDD date. */
function isCompactDateColumn(values: string[]): boolean {
  return (
    values.length > 0 &&
    values.every((v) => COMPACT_DATE_RE.test(v))
  );
}

const DEBIT_INDICATORS = new Set(['af', 'd', 'db', 'deb', 'dr', 'debit', 'debito', 'cargo', 's', 'soll']);
const CREDIT_INDICATORS = new Set(['bij', 'c', 'cr', 'cred', 'credit', 'credito', 'abono', 'h', 'haben']);

/** Lowercases, trims and strips accents. */
function foldText(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/**
 * Classifies a debit/credit indicator cell (e.g. "Af", "Bij", "D", "CR",
 * "Débito"). Case and accent insensitive. Returns null for empty/unknown values.
 */
export function classifyIndicator(value: string): 'debit' | 'credit' | null {
  const v = foldText(value);
  if (DEBIT_INDICATORS.has(v)) return 'debit';
  if (CREDIT_INDICATORS.has(v)) return 'credit';
  return null;
}

/** Headers that denote a debit/credit indicator column (after accent folding). */
const INDICATOR_HEADER_RE =
  /^(?:af\s*\/?\s*bij|d\s*\/\s*c|db\s*\/\s*cr|cr\s*\/\s*db|debito\s*\/\s*credito|debit\s*\/\s*credit|cargo\s*\/\s*abono|soll\s*\/?\s*haben|s\s*\/\s*h)$/;

/**
 * Finds a debit/credit indicator column: the header must match
 * INDICATOR_HEADER_RE and every non-empty value must be in the indicator
 * vocabulary. Returns -1 when none is found.
 */
export function detectIndicatorCol(headers: string[], rows: string[][]): number {
  for (let i = 0; i < headers.length; i++) {
    if (!INDICATOR_HEADER_RE.test(foldText(headers[i] ?? ''))) continue;
    const values = rows
      .map((r) => (r?.[i] ?? '').trim())
      .filter((v) => v !== '');
    if (values.length > 0 && values.every((v) => classifyIndicator(v) !== null)) {
      return i;
    }
  }
  return -1;
}

/** Headers that denote a date column. */
const DATE_HEADER_RE = /date|buchungstag|buchungsdatum|fecha|data\b|^dat$|[^a-z]dat[^a-z]/;
/** Headers that denote a running balance column. */
const BALANCE_HEADER_RE = /balance|saldo/;

/**
 * Auto-detects the column indices for date, description, and amount(s) from
 * CSV headers and a sample of row data. Returns a `ColumnLayout` on success,
 * or an `AppError` with code `'COLUMN_MAPPING_NEEDED'` when required columns
 * cannot be resolved.
 *
 * Requirements: 1.3, 1.4, 1.5, 1.6, 1.7
 */
export function detectColumns(
  headers: string[],
  rows: string[][],
): ColumnLayout | AppError {
  // Normalise headers for keyword matching
  const lc = headers.map((h) => (h ?? '').trim().toLowerCase());

  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let debitCol = -1;
  let creditCol = -1;

  // -----------------------------------------------------------------------
  // Pass 1: header-keyword heuristics (high confidence)
  // -----------------------------------------------------------------------
  let weakDescCol = -1;

  // Indicator column (checked before debit/credit keywords so "Débito/Crédito"
  // never becomes a split debit column). Needs a matching header AND at least
  // one non-empty value, all within the debit/credit vocabulary.
  const indicatorCol = detectIndicatorCol(headers, rows);

  // Revolut-style exports have "Started Date" and "Completed Date": prefer the
  // completed one (the settled date); otherwise the first date-like header wins.
  const completedDateCol = lc.findIndex(
    (h) => DATE_HEADER_RE.test(h) && /completed|completad/.test(h),
  );
  for (let i = 0; i < lc.length; i++) {
    if (i === indicatorCol) continue;
    const h = lc[i];
    const isDateHeader = DATE_HEADER_RE.test(h);

    // Date keywords
    if (dateCol === -1 && isDateHeader) {
      dateCol = completedDateCol !== -1 ? completedDateCol : i;
      continue;
    }

    // A second date-like column ("Fecha valor") is never description/amount.
    if (isDateHeader) continue;

    // Running balance columns are never the amount (or anything else we need).
    if (BALANCE_HEADER_RE.test(h)) continue;

    // Description keywords. "detail(s)" is a weak match: Chase uses it for the
    // DEBIT/CREDIT flag, so a real description column always wins over it.
    if (descCol === -1 && /desc|concept|narrat|descripcion|title|titulo|título|merchant|payee|lan[cç]amento|hist[oó]rico|omschrijving|\bnaam\b|verwendungszweck|auftraggeber|beg[uü]nstigter|libell[eé]/.test(h)) {
      descCol = i;
      continue;
    }
    if (weakDescCol === -1 && /detail/.test(h)) {
      weakDescCol = i;
      continue;
    }

    // Debit / split keywords (check before amount to avoid "debito" matching "amount")
    if (debitCol === -1 && /debit|débito|débito|charge|cargo|egreso|retiro/.test(h)) {
      debitCol = i;
      continue;
    }

    // Credit / split keywords
    if (creditCol === -1 && /credit|crédito|crédito|deposit|abono|ingreso/.test(h)) {
      creditCol = i;
      continue;
    }

    // Single amount keywords
    if (amountCol === -1 && /amount|monto|importe|valor|total|bedrag|betrag|montant/.test(h)) {
      amountCol = i;
      continue;
    }
  }
  if (descCol === -1) descCol = weakDescCol;

  // Split debit/credit layouts win over a stray single-amount match.
  if (debitCol !== -1 && creditCol !== -1) amountCol = -1;

  // Also check for "dat" as a standalone or contained match more liberally
  if (dateCol === -1) {
    for (let i = 0; i < lc.length; i++) {
      if (/dat/.test(lc[i])) {
        dateCol = i;
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Pass 2: value-type heuristics (fallback, medium confidence)
  // -----------------------------------------------------------------------
  // Build per-column value arrays (ignore blank rows)
  const nonBlankRows = rows.filter((row) =>
    row.some((cell) => cell != null && cell.trim() !== ''),
  );

  if (nonBlankRows.length > 0) {
    // Date column fallback
    if (dateCol === -1) {
      for (let i = 0; i < headers.length; i++) {
        const colValues = nonBlankRows.map((r) => (r[i] ?? '').trim());
        const nonEmpty = colValues.filter((v) => v !== '');
        if (
          nonEmpty.length > 0 &&
          (nonEmpty.every((v) => DATE_VALUE_RE.test(v)) || isCompactDateColumn(nonEmpty))
        ) {
          dateCol = i;
          break;
        }
      }
    }

    // Description fallback: widest text column among the unassigned ones.
    // Keyword matches (including the weak "detail") always win over this.
    if (descCol === -1) {
      let bestLen = 0;
      for (let i = 0; i < headers.length; i++) {
        if (
          i === dateCol || i === amountCol || i === debitCol ||
          i === creditCol || i === indicatorCol
        ) continue;
        const hl = lc[i] ?? '';
        if (DATE_HEADER_RE.test(hl) || BALANCE_HEADER_RE.test(hl)) continue;
        const nonEmpty = nonBlankRows
          .map((r) => (r[i] ?? '').trim())
          .filter((v) => v !== '');
        if (nonEmpty.length === 0) continue;
        if (isMostlyNumeric(nonEmpty) || isCompactDateColumn(nonEmpty)) continue;
        const mean = nonEmpty.reduce((a, v) => a + v.length, 0) / nonEmpty.length;
        if (mean > bestLen) {
          bestLen = mean;
          descCol = i;
        }
      }
    }

    // Amount column fallback (only if no split columns were found)
    if (amountCol === -1 && debitCol === -1) {
      for (let i = 0; i < headers.length; i++) {
        // Skip already-assigned columns
        if (i === dateCol || i === descCol || i === indicatorCol) continue;
        const hl = lc[i] ?? '';
        if (DATE_HEADER_RE.test(hl) || BALANCE_HEADER_RE.test(hl)) continue;
        const colValues = nonBlankRows.map((r) => (r[i] ?? '').trim());
        if (isMostlyNumeric(colValues) && !isCompactDateColumn(colValues.filter((v) => v !== ''))) {
          amountCol = i;
          break;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Resolve layout
  // -----------------------------------------------------------------------

  // Single-column layout: dateCol + descCol + amountCol
  if (dateCol !== -1 && descCol !== -1 && amountCol !== -1) {
    return indicatorCol !== -1
      ? { type: 'single', amountCol, dateCol, descCol, indicatorCol }
      : { type: 'single', amountCol, dateCol, descCol };
  }

  // Split-column layout: dateCol + descCol + debitCol (creditCol optional)
  if (dateCol !== -1 && descCol !== -1 && debitCol !== -1) {
    return {
      type: 'split',
      debitCol,
      creditCol: creditCol !== -1 ? creditCol : -1,
      dateCol,
      descCol,
    };
  }

  // Cannot resolve
  return {
    code: 'COLUMN_MAPPING_NEEDED',
    message:
      'Could not automatically detect required columns (date, description, amount). ' +
      'Please map the columns manually.',
    headers,
  };
}

// ---------------------------------------------------------------------------
// Sign convention detection
// ---------------------------------------------------------------------------

/** True when a raw amount string carries a leading minus or accounting parentheses. */
export function isNegativeAmount(rawAmount: string): boolean {
  const cleaned = rawAmount.replace(CURRENCY_RE, '').replace(/\s+/g, '');
  return cleaned.startsWith('-') || /^\(.*\)$/.test(cleaned);
}

/** Descriptions typical of payments/refunds on a statement that lists charges as positive. */
const PAYMENT_LIKE_RE =
  /payment|thank\s*you|refund|reversal|credit\s+adjust|pago|gracias|abono|reembolso|devoluci[oó]n|pagamento|obrigado|estorno/i;

/**
 * Detects whether a single-amount statement lists charges as POSITIVE numbers
 * (typical of credit-card exports such as Amex). Returns true when most
 * non-zero rows are positive and the negative rows (if any) look like
 * payments or refunds. Split layouts always return false.
 */
export function detectPositiveIsCharge(rows: string[][], layout: ColumnLayout): boolean {
  if (layout.type !== 'single') return false;
  if (layout.indicatorCol !== undefined) return false;
  let positives = 0;
  let negatives = 0;
  let paymentLikeNegatives = 0;
  for (const row of rows) {
    if (!row) continue;
    const raw = (row[layout.amountCol] ?? '').trim();
    if (raw === '' || !/\d/.test(raw)) continue;
    if (isNegativeAmount(raw)) {
      negatives++;
      if (PAYMENT_LIKE_RE.test(row[layout.descCol] ?? '')) paymentLikeNegatives++;
    } else if (/[1-9]/.test(raw)) {
      positives++;
    }
  }
  if (positives <= negatives) return false;
  if (negatives === 0) return true;
  return paymentLikeNegatives * 2 >= negatives;
}

// ---------------------------------------------------------------------------
// parseRows
// ---------------------------------------------------------------------------

/**
 * Simple FNV-1a-inspired hash that returns a hex string.
 * Deterministic: same input always produces the same output.
 */
function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h.toString(16);
}

/**
 * Parses raw CSV rows into `Transaction` objects using the detected column
 * layout, date format, and number format. Invalid or blank rows are skipped
 * and counted in `skipped`.
 *
 * Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.16, 1.17, 1.18
 */
export function parseRows(
  rows: string[][],
  layout: ColumnLayout,
  dateFormat: DateFormat,
  numberFormat: NumberFormat,
  positiveIsCharge = false,
): { transactions: Transaction[]; skipped: number } {
  const transactions: Transaction[] = [];
  let skipped = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    try {
      const row = rows[rowIndex];

      // Skip blank rows (all cells empty or whitespace) silently — they are
      // formatting artifacts (empty lines between CSV sections), not invalid data.
      if (!row || row.every((cell) => cell == null || cell.trim() === '')) {
        continue;
      }

      const rawDate = (row[layout.dateCol] ?? '').trim();
      const rawDescription = (row[layout.descCol] ?? '').trim();

      // Parse date — skip row on failure
      const dateResult = parseDate(rawDate, dateFormat);
      if (!dateResult.ok) {
        skipped++;
        continue;
      }

      let amountCents: number;
      let type: 'debit' | 'credit';

      if (layout.type === 'single') {
        const rawAmount = (row[layout.amountCol] ?? '').trim();
        amountCents = parseCents(rawAmount, numberFormat);

        // Determine type: strip currency/whitespace, check for leading minus
        const indicator =
          layout.indicatorCol !== undefined
            ? classifyIndicator(row[layout.indicatorCol] ?? '')
            : null;

        if (amountCents === 0) {
          // Requirement 1.18: zero-amount → debit (free trial)
          type = 'debit';
        } else if (indicator !== null) {
          // Indicator column wins over the amount sign.
          type = indicator;
        } else if (isNegativeAmount(rawAmount) !== positiveIsCharge) {
          // Default convention: negative = charge. Inverted when positiveIsCharge.
          type = 'debit';
        } else {
          type = 'credit';
        }
      } else {
        // split layout
        const rawDebit = (row[layout.debitCol] ?? '').trim();
        const rawCredit =
          layout.creditCol >= 0 ? (row[layout.creditCol] ?? '').trim() : '';

        // Determine which side is populated
        const debitCents = rawDebit !== '' ? parseCents(rawDebit, numberFormat) : 0;
        const creditCents = rawCredit !== '' ? parseCents(rawCredit, numberFormat) : 0;

        if (debitCents > 0) {
          amountCents = debitCents;
          type = 'debit';
        } else if (creditCents > 0) {
          amountCents = creditCents;
          type = 'credit';
        } else {
          // Both zero or both empty — treat as debit per Requirement 1.18
          amountCents = debitCents; // 0
          type = 'debit';
        }
      }

      const id = `${String(rowIndex)}-${simpleHash(rawDescription)}`;

      transactions.push({
        id,
        date: dateResult.value,
        description: rawDescription,
        normalizedName: '',
        amountCents,
        type,
        currency: 'USD',
      });
    } catch {
      // Safety net — never throw
      skipped++;
    }
  }

  return { transactions, skipped };
}
