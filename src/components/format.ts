/**
 * Pure presentation helpers for the UI layer (currency + dates).
 * No React, no network. Money arrives as integer cents.
 */

/**
 * Format integer cents in the given ISO 4217 currency, localized to the UI
 * language.
 *
 * Grouping follows the language: English groups with commas (1,844,400) and
 * Spanish with dots (1.844.400). We use `es-CO` for Spanish because it uses the
 * dot as the thousands separator (and this is a Latin-American product);
 * `es-MX` would group with commas.
 *
 * Decimal places follow the CURRENCY, not a fixed `2`: we let `Intl` apply each
 * currency's natural precision, so zero-decimal currencies (COP, CLP, JPY, …)
 * render without decimals while USD/EUR/etc. keep two.
 */
export function formatMoney(cents: number, currency: string, lang: 'en' | 'es'): string {
  const locale = lang === 'es' ? 'es-CO' : 'en-US';
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Format an ISO (YYYY-MM-DD) date as a short localized date. */
export function formatDate(iso: string, lang: 'en' | 'es'): string {
  const locale = lang === 'es' ? 'es-CO' : 'en-US';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}
