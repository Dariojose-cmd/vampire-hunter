/**
 * Pure presentation helpers for the UI layer (currency + dates).
 * No React, no network. Money arrives as integer cents.
 */

/** Format integer cents in the given ISO 4217 currency, localized to the UI language. */
export function formatMoney(cents: number, currency: string, lang: 'en' | 'es'): string {
  const locale = lang === 'es' ? 'es-MX' : 'en-US';
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // COP/CLP etc. are usually shown without cents; let Intl decide defaults
      // but cap fraction digits so large LatAm sums stay readable.
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Format an ISO (YYYY-MM-DD) date as a short localized date. */
export function formatDate(iso: string, lang: 'en' | 'es'): string {
  const locale = lang === 'es' ? 'es-MX' : 'en-US';
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
