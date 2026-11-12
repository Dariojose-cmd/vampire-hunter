/**
 * Integration test: real bank export formats.
 *
 * Runs every CSV in tests/fixtures/banks/ through the same pipeline the app
 * uses (parseCsvText -> parseStatement -> runDetection) and compares the result
 * with the sibling `<name>.expected.json`:
 *   - the detected currency matches,
 *   - every expected subscription is a vampire (cadence, median amount, bites),
 *   - nothing else reaches the vampire tier,
 *   - no `mustNotDetect` merchant reaches the vampire tier (weak "possible"
 *     matches are allowed).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { parseCsvText } from '../src/components/csvUtils';
import { parseStatement, runDetection } from '../src/engine/index';

const BANKS_DIR = resolve(process.cwd(), 'tests/fixtures/banks');

interface ExpectedSubscription {
  name: string;
  cadence: string;
  medianAmountCents: number;
  bites?: number;
}

interface ExpectedFile {
  bank: string;
  currency: string;
  expected: ExpectedSubscription[];
  mustNotDetect: string[];
}

const fixtures = readdirSync(BANKS_DIR)
  .filter((f) => f.endsWith('.csv'))
  .sort();

const squash = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Does the vampire's identity contain the expected merchant's first word? */
function namesMatch(
  v: { displayName: string; normalizedName: string; bites: { description: string }[] },
  expectedName: string,
): boolean {
  const first = squash(expectedName.split(/\s+/)[0] ?? '');
  const haystacks = [v.displayName, v.normalizedName, ...v.bites.map((b) => b.description)];
  return haystacks.some((h) => squash(h).includes(first));
}

describe('bank statement fixtures', () => {
  it('finds fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('%s matches its expected.json', (file) => {
    const expected = JSON.parse(
      readFileSync(resolve(BANKS_DIR, file.replace(/\.csv$/, '.expected.json')), 'utf-8'),
    ) as ExpectedFile;

    const text = readFileSync(resolve(BANKS_DIR, file), 'utf-8').replace(/^\uFEFF/, '');
    const { headers, rows } = parseCsvText(text);
    const parsed = parseStatement(headers, rows);
    expect(parsed.ok, `parseStatement should succeed for ${file}`).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');

    expect(parsed.value.currency).toBe(expected.currency);

    const { vampires } = runDetection({
      transactions: parsed.value.transactions,
      currency: parsed.value.currency,
    });

    // Every expected subscription is detected as a vampire, exactly once.
    const unmatched = [...vampires];
    for (const exp of expected.expected) {
      const idx = unmatched.findIndex(
        (v) =>
          namesMatch(v, exp.name) &&
          v.cadence === exp.cadence &&
          v.medianAmountCents === exp.medianAmountCents &&
          (exp.bites === undefined || v.bites.length === exp.bites),
      );
      expect(idx, `${file}: "${exp.name}" should be detected as a vampire`).toBeGreaterThanOrEqual(0);
      unmatched.splice(idx, 1);
    }

    // Nothing else reaches the vampire tier.
    expect(
      unmatched.map((v) => v.displayName),
      `${file}: unexpected vampires`,
    ).toEqual([]);

    // mustNotDetect merchants never reach the vampire tier.
    for (const v of vampires) {
      const haystacks = [v.displayName, v.normalizedName, ...v.bites.map((b) => b.description)];
      for (const banned of expected.mustNotDetect) {
        const needle = banned.toLowerCase();
        expect(
          haystacks.some((h) => h.toLowerCase().includes(needle)),
          `${file}: "${banned}" must not be detected (found in "${v.displayName}")`,
        ).toBe(false);
      }
    }
  });
});
