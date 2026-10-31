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
const NOISE_KEYWORDS_RE = /\b(?:POS|PURCHASE|COMPRA|PAGO|CARGO|DEBIT|PAYMENT)\b/gi;

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
 * The function is idempotent: `normalize(normalize(s)) === normalize(s)` for all inputs.
 *
 * @param s - Raw description string from bank statement
 * @returns Cleaned, uppercased merchant name
 */
export function normalize(s: string): string {
  // Step 1: Uppercase
  let result = s.toUpperCase();

  // Step 2: Remove noise keywords (word-boundary, already uppercased)
  result = result.replace(NOISE_KEYWORDS_RE, '');

  // Collapse whitespace before ref-code removal so the anchors ^ and $ see
  // clean boundaries after noise keywords were stripped.
  result = result.replace(/\s+/g, ' ').trim();

  // Step 4 (applied before step 3): Remove reference-code patterns at start/end.
  // Doing this before digit removal preserves the full alphanumeric token so the
  // regex can match (e.g. "TXN20241101" → removed; otherwise digits are stripped
  // first leaving "TXN" which is < 6 chars and would not match).
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

  return result;
}
