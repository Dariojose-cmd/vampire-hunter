/**
 * Vampire Hunter — Currency detection utilities
 * Pure TypeScript only. Zero React imports. Never throws.
 *
 * `inferCurrency` scans amount-column values and the header row for either an
 * explicit ISO 4217 code or a currency symbol, and returns the best-guess
 * ISO 4217 code for the statement. A locale-specific signal (a non-`$` symbol
 * or an explicit ISO code) always wins over a bare `$`, which falls back to USD.
 */

/**
 * Known ISO 4217 codes we recognize. The first ten mirror the static exchange
 * rate table (`exchangeRates.json`); the rest are common codes that may appear
 * in statements even though we fall back to rate 1.0 for them downstream.
 */
const ISO_CODES: readonly string[] = [
  'USD', 'EUR', 'MXN', 'COP', 'ARS', 'BRL', 'CLP', 'GBP', 'CAD', 'PEN',
  'JPY', 'KRW', 'CHF', 'AUD', 'NZD', 'CNY', 'HKD', 'SEK', 'NOK', 'DKK',
  'PLN', 'ZAR', 'INR', 'SGD', 'UYU', 'BOB', 'PYG', 'VES', 'GTQ', 'CRC',
  'DOP', 'HNL', 'NIO', 'PAB',
];

/**
 * Locale-specific symbols mapped to their ISO 4217 code. These outrank a bare
 * `$`. `R$` and `S/` are multi-character and must be tested before `$`.
 * Order within this list is the match priority (first found wins).
 */
const SYMBOL_MAP: ReadonlyArray<{ symbol: string; code: string }> = [
  { symbol: 'R$', code: 'BRL' }, // must precede bare '$'
  { symbol: 'S/', code: 'PEN' },
  { symbol: '€', code: 'EUR' },
  { symbol: '£', code: 'GBP' },
  { symbol: '¥', code: 'JPY' },
  { symbol: '₩', code: 'KRW' },
];

/** Build a case-insensitive, word-boundary regex for an ISO code. */
function isoCodeRegex(code: string): RegExp {
  // \b works correctly here because ISO codes are ASCII letters. This matches
  // "USD" in "Amount (USD)" or "100 USD" but not the substring inside a longer
  // alphanumeric token.
  return new RegExp(`\\b${code}\\b`, 'i');
}

/**
 * Infer the statement currency from the amount column values and the header row.
 *
 * Matching priority:
 *   1. An explicit ISO 4217 code found in any header or value.
 *   2. A locale-specific symbol (R$, S/, €, £, ¥, ₩).
 *   3. A bare `$` with no other signal → 'USD'.
 *   4. Nothing detected → 'USD'.
 *
 * @param amountColumn - Raw amount-column string values (may contain symbols/codes).
 * @param headerRow    - Raw CSV header cells.
 * @returns A valid ISO 4217 currency code. Defaults to 'USD'.
 */
export function inferCurrency(amountColumn: string[], headerRow: string[]): string {
  // Defensive: tolerate null/undefined entries without throwing.
  const haystacks: string[] = [];
  if (Array.isArray(headerRow)) {
    for (const h of headerRow) {
      if (typeof h === 'string' && h.length > 0) haystacks.push(h);
    }
  }
  if (Array.isArray(amountColumn)) {
    for (const v of amountColumn) {
      if (typeof v === 'string' && v.length > 0) haystacks.push(v);
    }
  }

  // Priority 1: explicit ISO 4217 code (word-boundary matched).
  for (const code of ISO_CODES) {
    const re = isoCodeRegex(code);
    for (const text of haystacks) {
      if (re.test(text)) {
        return code;
      }
    }
  }

  // Priority 2: locale-specific symbol (non-`$`). R$ / S/ tested first.
  for (const { symbol, code } of SYMBOL_MAP) {
    for (const text of haystacks) {
      if (text.includes(symbol)) {
        return code;
      }
    }
  }

  // Priority 3: bare `$` with no other locale signal → USD.
  for (const text of haystacks) {
    if (text.includes('$')) {
      return 'USD';
    }
  }

  // Priority 4: nothing detected → default.
  return 'USD';
}
