/**
 * Vampire Hunter — Transaction Description Normalizer
 * Pure TypeScript only. Zero React imports.
 *
 * Cleans merchant description strings so that the same service
 * is not split into multiple candidates due to reference codes
 * or formatting noise.
 */

/**
 * Noise keywords to strip from descriptions (word-boundary matched,
 * case-insensitive). Order does not matter — all are removed in one pass.
 */
const NOISE_KEYWORDS_RE = /\b(?:POS|PURCHASE|COMPRA|PAGO|CARGO|DEBITO|DEBIT|PAYMENT)\b/gi;

/**
 * Card-number pattern: 4 or more consecutive digits.
 * Per Requirement 2.1: "sequences of 4 or more consecutive digits".
 */
const CARD_NUMBER_RE = /\d{4,}/g;

/**
 * Reference-code pattern: alphanumeric tokens of 6+ characters
 * anchored at the start OR end of the string (after prior cleanup passes),
 * with at least one digit present (purely alphabetic words are likely merchant
 * names, not ref codes).
 *
 * We apply ref-code removal (step 4) BEFORE digit removal (step 3) in actual
 * execution order so that tokens like "TXN20241101" or "REF123456" are matched
 * and removed as a whole unit, before their digit portions are stripped by the
 * card-number regex. This matches the design intent: both steps run; ref-code
 * removal just needs to see the complete token. Idempotence is preserved because
 * a second pass finds no ref-code tokens at the boundaries.
 *
 * The regex requires the token to contain at least one digit
 * (`[A-Z0-9]*\d[A-Z0-9]{5,}` → total length ≥ 6 chars with ≥ 1 digit).
 */
const REF_CODE_START_RE = /^[A-Z0-9]*\d[A-Z0-9]{5,}\s*/;
const REF_CODE_END_RE = /\s*[A-Z0-9]*\d[A-Z0-9]{5,}$/;

/**
 * Reference codes anywhere in the string: a whole alphanumeric token of 6+
 * characters containing at least one digit (e.g. the RT4GH7ZK0 in
 * "AMAZON PRIME*RT4GH7ZK0 AMZN.COM/BILL WA"). Purely alphabetic words are kept, as are product names of the shape
 * LETTERS(4+) + 1-3 digits (OFFICE365, XBOX360, PLAYSTATION5).
 */
const REF_CODE_ANYWHERE_RE =
  /(?<![A-Z0-9])(?![A-Z]{4,}\d{1,3}(?![A-Z0-9]))(?=[A-Z0-9]*\d)[A-Z0-9]{6,}(?![A-Z0-9])/g;

/**
 * Phone numbers: optional country code, optional parenthesised area code,
 * 3-3-4 digits with optional space/dot/dash separators (800-555-1234,
 * (800) 555 1234, 1-800-555-1234, 8885551234).
 */
const PHONE_RE = /(?<![\w])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])/g;

/** Store numbers such as "#1234" or "# 42". */
const STORE_NUMBER_RE = /#\s*\d+/g;

/** "7ELEVEN", "7 ELEVEN", "7-ELEVEN" all collapse to one canonical form. */
const SEVEN_ELEVEN_RE = /\b7[\s-]*ELEVEN\b/g;

/**
 * Full dates embedded in descriptions: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
 * Stripped before any other cleanup so "SMART FIT 2026-01-05" does not leave
 * a "-01-05" remnant after the card-number pass removes the year.
 */
const DATE_RE =
  /(?<!\d)(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})(?!\d)/g;

/** Remove diacritics (accents) from a string. */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Normalize a bank transaction description string.
 * Accents are removed so descriptions differing only by accents group together.
 * Use `normalizeForDisplay` to keep accents for showing a name to the user.
 */
export function normalize(s: string): string {
  return normalizeCore(s, true);
}

/** Same cleanup as `normalize`, but keeps accents (for display only). */
export function normalizeForDisplay(s: string): string {
  return normalizeCore(s, false);
}

/**
 * Normalize a bank transaction description string.
 *
 * Logical steps (per spec):
 * 1. Uppercase all characters
 * 2. Remove noise keywords (POS, PURCHASE, COMPRA, PAGO, CARGO, DEBIT, PAYMENT)
 * 3. Remove card-number patterns (4+ consecutive digits)
 * 4. Remove reference-code patterns (alphanumeric tokens of 6+ chars at start/end)
 * 5. Collapse consecutive whitespace to a single space
 * 6. Trim leading/trailing whitespace
 *
 * Execution order: steps 3 and 4 are intentionally applied as 4-then-3 so that
 * mixed alphanumeric ref-code tokens (e.g. "TXN20241101") are removed whole
 * before the digit-strip pass fragments them into short alphabetic remnants.
 * Both steps always run; the logical numbering from the spec is preserved.
 *
 * The cleaning steps are iterated to a fixpoint: a single pass is not enough to
 * be idempotent, because removing a boundary-anchored ref code (or a leading
 * noise keyword) can shift a previously-interior token so that it now sits at a
 * boundary and matches the ref-code regex on the next pass. We therefore repeat
 * the pass until the string stops changing, so that `normalize` is a fixpoint
 * and `normalize(normalize(s)) === normalize(s)` for all inputs.
 *
 * @param s - Raw description string from bank statement
 * @returns Cleaned, uppercased merchant name
 */
function normalizeCore(s: string, removeAccents: boolean): string {
  // Step 1: Uppercase (done once; the loop below only strips characters).
  let result = removeAccents ? stripAccents(s) : s;
  result = result.toUpperCase();
  if (removeAccents) result = stripAccents(result);

  // Iterate the cleaning steps until the string reaches a fixpoint. Each pass
  // only removes or collapses characters, so the string is monotonically
  // shrinking-or-stable and convergence is quick; the cap is a defensive guard
  // against any pathological non-convergence.
  const MAX_ITERATIONS = 100;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const prev = result;

    // Full dates first, so their digits are not mangled by later passes.
    result = result.replace(DATE_RE, ' ');

    // Phone numbers, store numbers and 7-ELEVEN spelling. 7-ELEVEN is made
    // canonical first so "7ELEVEN" is not mistaken for a reference code.
    result = result.replace(PHONE_RE, ' ');
    result = result.replace(STORE_NUMBER_RE, ' ');
    result = result.replace(SEVEN_ELEVEN_RE, '7-ELEVEN');

    // Step 2: Remove noise keywords (word-boundary, already uppercased)
    result = result.replace(NOISE_KEYWORDS_RE, '');

    // Collapse whitespace before ref-code removal so the anchors ^ and $ see
    // clean boundaries after noise keywords were stripped.
    result = result.replace(/\s+/g, ' ').trim();

    // Step 4 (applied before step 3): Remove reference-code patterns at start/end.
    // Doing this before digit removal preserves the full alphanumeric token so the
    // regex can match (e.g. "TXN20241101" → removed; otherwise digits are stripped
    // first leaving "TXN" which is < 6 chars and would not match).
    result = result.replace(REF_CODE_ANYWHERE_RE, ' ');
    result = result.replace(/\s+/g, ' ').trim();
    result = result.replace(REF_CODE_START_RE, '');
    result = result.replace(REF_CODE_END_RE, '');

    // Step 3: Remove card-number patterns (4+ consecutive digits).
    // Runs after ref-code removal; catches any remaining standalone digit sequences
    // such as card suffixes ("VISA 4321") that were not part of a ref-code token.
    result = result.replace(CARD_NUMBER_RE, '');

    // Step 5: Collapse consecutive whitespace to single space
    result = result.replace(/\s+/g, ' ');

    // Step 6: Trim
    result = result.trim();

    // Fixpoint reached: another pass would be a no-op.
    if (result === prev) break;
  }

  return result;
}
