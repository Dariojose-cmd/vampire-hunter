/**
 * Vampire Hunter — ICS (iCalendar) Generator
 * Pure TypeScript only. Zero React imports.
 *
 * Produces an RFC 5545 VCALENDAR/VEVENT reminder for a vampire's next charge.
 * The reminder fires 3 days before the predicted next bite, giving the user
 * time to cancel. The function NEVER throws — it returns `Result<string, AppError>`.
 */

import type { AppError, IcsI18n, Result, Vampire } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format an integer-cents amount into a human-readable currency string.
 *
 * Uses `Intl.NumberFormat` when the currency code is valid; falls back to a
 * plain `<code> <amount>` string if the runtime rejects the currency code so
 * the generator never throws.
 */
function formatAmount(medianAmountCents: number, currency: string): string {
  const amount = medianAmountCents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Escape a value for use inside an ICS TEXT field, per RFC 5545 §3.3.11:
 * backslash, comma and semicolon are escaped, and newlines become `\n`.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Replace `{{name}}` and `{{amount}}` tokens in an i18n template.
 */
function fillTemplate(template: string, name: string, amount: string): string {
  return template
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{amount\}\}/g, amount);
}

/**
 * Subtract `days` from an ISO `YYYY-MM-DD` date, in UTC, returning the
 * compact ICS DATE form `YYYYMMDD`. Throws on malformed input so the caller
 * can convert it into an AppError.
 */
function isoMinusDaysToIcsDate(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  const [y, m, d] = parts;
  if (
    parts.length !== 3 ||
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  const base = Date.UTC(y, m - 1, d);
  const shifted = new Date(base - days * 86_400_000);
  if (Number.isNaN(shifted.getTime())) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  const yyyy = shifted.getUTCFullYear().toString().padStart(4, '0');
  const mm = (shifted.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = shifted.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// ---------------------------------------------------------------------------
// generateIcs
// ---------------------------------------------------------------------------

/**
 * Build a valid ICS reminder string for a vampire's upcoming charge.
 *
 * The event is an all-day event scheduled 3 days before `vampire.nextBiteDate`,
 * with a localized SUMMARY and DESCRIPTION built from the supplied i18n
 * templates. Date math is done in UTC to avoid DST off-by-one errors.
 *
 * @param vampire      - The vampire whose next bite we are warning about
 * @param language     - UI language ('en' | 'es'); reserved for future use
 * @param i18nStrings  - Translated ICS templates (summary, description, filename)
 * @returns            `Result<string, AppError>` — never throws
 *
 * _Validates: Requirements 10.1, 10.2, 10.3_
 */
export function generateIcs(
  vampire: Vampire,
  language: 'en' | 'es',
  i18nStrings: IcsI18n,
): Result<string, AppError> {
  // `language` is part of the public contract even though the localized copy
  // arrives pre-resolved via `i18nStrings`; reference it to keep the signature
  // explicit without affecting behaviour.
  void language;

  try {
    const eventDate = isoMinusDaysToIcsDate(vampire.nextBiteDate, 3);

    const amount = formatAmount(vampire.medianAmountCents, vampire.currency);
    const name = vampire.displayName;

    const summary = escapeText(fillTemplate(i18nStrings.icsEventSummary, name, amount));
    const description = escapeText(
      fillTemplate(i18nStrings.icsEventDescription, name, amount),
    );

    // Deterministic-ish UID + stamp. DTSTAMP must be a UTC date-time.
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = `${vampire.id}-${eventDate}@vampire-hunter`;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Vampire Hunter//Reminder//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${eventDate}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    // RFC 5545 requires CRLF line endings and a trailing CRLF.
    const ics = lines.join('\r\n') + '\r\n';

    return { ok: true, value: ics };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'PARSE_FAILED',
        message:
          err instanceof Error
            ? `Failed to generate ICS: ${err.message}`
            : 'Failed to generate ICS reminder.',
      },
    };
  }
}
