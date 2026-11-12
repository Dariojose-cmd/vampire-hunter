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

const PORTUGUESE_HEADER_RE = /descri[cç][aã]o|lan[cç]amento|estabelecimento|\bdata\b|categoria|\bt[ií]tulo\b|\bvalor\b.*\bdata\b/i;
const PORTUGUESE_TEXT_RE = /[ãõ]|\bpagamento\s+recebido\b|\bestorno\b|\bparcela\b/i;
const SPANISH_HEADER_RE =
  /fecha|descripci[oó]n|concepto|importe|monto|d[eé]bito|cr[eé]dito|saldo|cargo|abono|sucursal|movimiento|divisa/i;

/** Plain amount with dot thousands and no decimals, e.g. "44.900" or "1.250.000". */
const DOT_THOUSANDS_INT_RE = /^\d{1,3}(?:\.\d{3})+$/;
/** Amount with comma decimals, e.g. "54,90" or "2.145,10". */
const COMMA_DECIMAL_RE = /^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{1,2}$/;

/**
 * Infer a currency from locale signals when the statement carries no explicit
 * ISO code or symbol:
 *   - Portuguese headers or text (BRL)
 *   - Spanish headers + large integers with dot thousands (COP)
 *   - Spanish headers + comma-decimal amounts (EUR)
 * Returns null when there is no confident signal.
 */
export function inferCurrencyFromLocale(
  amountColumn: string[],
  headerRow: string[],
  textSamples: string[] = [],
): string | null {
  const headers = (Array.isArray(headerRow) ? headerRow : []).filter(
    (h): h is string => typeof h === 'string',
  );
  const portugueseHeader = headers.some((h) => PORTUGUESE_HEADER_RE.test(h));
  const portugueseText = textSamples.some(
    (t) => typeof t === 'string' && PORTUGUESE_TEXT_RE.test(t),
  );
  if (portugueseHeader || portugueseText) return 'BRL';

  if (!headers.some((h) => SPANISH_HEADER_RE.test(h))) return null;

  let dotInt = 0;
  let commaDec = 0;
  let numeric = 0;
  for (const v of Array.isArray(amountColumn) ? amountColumn : []) {
    if (typeof v !== 'string') continue;
    const clean = v
      .replace(/[\s$€()+-]/g, '')
      .replace(/^-/, '');
    if (!/^[\d.,]+$/.test(clean)) continue;
    numeric++;
    if (DOT_THOUSANDS_INT_RE.test(clean)) dotInt++;
    else if (COMMA_DECIMAL_RE.test(clean)) commaDec++;
  }
  if (numeric === 0) return null;
  if (dotInt > 0 && commaDec === 0 && dotInt / numeric >= 0.5) return 'COP';
  if (commaDec > 0 && commaDec / numeric >= 0.5) return 'EUR';
  return null;
}

/**
 * Infer the statement currency from the amount column values and the header row.
 *
 * Matching priority:
 *   1. An explicit ISO 4217 code found in any header or value.
 *   2. A locale-specific symbol (R$, S/, €, £, ¥, ₩).
 *   2b. Locale signals (see {@link inferCurrencyFromLocale}).
 *   3. A bare `$` with no other signal → 'USD'.
 *   4. Nothing detected → 'USD'.
 *
 * @param amountColumn - Raw amount-column string values (may contain symbols/codes).
 * @param headerRow    - Raw CSV header cells.
 * @returns A valid ISO 4217 currency code. Defaults to 'USD'.
 */
export function inferCurrency(
  amountColumn: string[],
  headerRow: string[],
  textSamples: string[] = [],
): string {
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

  // Priority 2b: locale signals (no explicit code or symbol). Strict enough
  // that US-style statements never trigger them.
  const locale = inferCurrencyFromLocale(amountColumn, headerRow, textSamples);
  if (locale) return locale;

  // Priority 3: bare `$` with no other locale signal → USD.
  for (const text of haystacks) {
    if (text.includes('$')) {
      return 'USD';
    }
  }

  // Priority 4: nothing detected → default.
  return 'USD';
}
