/**
 * Integration test — end-to-end over the four sample bank statements.
 *
 * Runs each real `samples/*.csv` through Papa Parse → `parseStatement`
 * (currency + layout + number-format inference) → `runDetection`, and asserts
 * the detected currency, the high-confidence vampire count, and the
 * credit-exclusion guarantee (salary/payroll credits must never surface as
 * vampires).
 *
 * Regression guard for the currency-column detection bug: MXN/COP statements
 * carry their ISO code in a dedicated `Moneda` column (the amount column has no
 * symbol), so they must be detected as MXN/COP rather than defaulting to USD.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import { describe, it, expect } from 'vitest';

import { parseStatement, runDetection } from '../src/engine/index';
import type { Vampire } from '../src/engine/types';

const SAMPLES_DIR = resolve(process.cwd(), 'samples');

/** Read a sample CSV and split it into a header row + data rows. */
function loadSample(file: string): { headers: string[]; rows: string[][] } {
  const text = readFileSync(resolve(SAMPLES_DIR, file), 'utf-8');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const data = parsed.data as string[][];
  const headers = data[0] ?? [];
  const rows = data.slice(1);
  return { headers, rows };
}

/** Run the full pipeline for a sample file. */
function detectFromSample(file: string): {
  currency: string;
  vampires: Vampire[];
  possibleVampires: Vampire[];
} {
  const { headers, rows } = loadSample(file);
  const parsed = parseStatement(headers, rows);
  expect(parsed.ok, `parseStatement should succeed for ${file}`).toBe(true);
  if (!parsed.ok) throw new Error('unreachable');

  const result = runDetection({
    transactions: parsed.value.transactions,
    currency: parsed.value.currency,
  });

  return {
    currency: parsed.value.currency,
    vampires: result.vampires,
    possibleVampires: result.possibleVampires,
  };
}

const SALARY_RE = /SALARY|NOMINA|ABONO NOMINA/i;

describe('sample statement integration', () => {
  it('us-bank-usd.csv → USD with 10 vampires', () => {
    const { currency, vampires } = detectFromSample('us-bank-usd.csv');
    expect(currency).toBe('USD');
    expect(vampires.length).toBe(10);
  });

  it('latam-bank-mxn.csv → MXN with 5 vampires', () => {
    const { currency, vampires } = detectFromSample('latam-bank-mxn.csv');
    expect(currency).toBe('MXN');
    expect(vampires.length).toBe(5);
  });

  it('latam-bank-cop.csv → COP with 4 vampires', () => {
    const { currency, vampires } = detectFromSample('latam-bank-cop.csv');
    expect(currency).toBe('COP');
    expect(vampires.length).toBe(4);
  });

  it('messy-statement.csv → USD with 3 vampires', () => {
    const { currency, vampires } = detectFromSample('messy-statement.csv');
    expect(currency).toBe('USD');
    expect(vampires.length).toBe(3);
  });

  it.each([
    'us-bank-usd.csv',
    'latam-bank-mxn.csv',
    'latam-bank-cop.csv',
    'messy-statement.csv',
  ])('%s never surfaces a salary/credit as a vampire', (file) => {
    const { vampires, possibleVampires } = detectFromSample(file);
    const allVampires = [...vampires, ...possibleVampires];

    for (const v of allVampires) {
      for (const bite of v.bites) {
        expect(bite.type).not.toBe('credit');
        expect(
          SALARY_RE.test(bite.description),
          `vampire "${v.displayName}" in ${file} contains a salary/credit bite: "${bite.description}"`,
        ).toBe(false);
      }
    }
  });
});
