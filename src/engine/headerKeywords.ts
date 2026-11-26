/**
 * Vampire Hunter — shared header keywords
 * Pure TypeScript only. Zero React imports.
 *
 * Single source of truth for the vocabulary that identifies date, description
 * and amount columns by header text. Used by `detectColumns` (parser.ts) and
 * by the header locator / Excel reader, so they never drift apart.
 *
 * All regexes are non-global (safe to reuse with `.test`) and expect the
 * header to be lowercased and trimmed by the caller.
 */

/** Headers that denote a date column. */
export const DATE_HEADER_RE =
  /date|buchungstag|buchungsdatum|fecha|data\b|^dat$|[^a-z]dat[^a-z]/;

/** Headers that denote a description column. */
export const DESCRIPTION_HEADER_RE =
  /desc|concept|narrat|descripcion|title|titulo|título|merchant|payee|lan[cç]amento|hist[oó]rico|omschrijving|\bnaam\b|verwendungszweck|auftraggeber|beg[uü]nstigter|libell[eé]/;

/** Headers that denote a single amount column. */
export const AMOUNT_HEADER_RE =
  /amount|monto|importe|valor|total|bedrag|betrag|montant/;
