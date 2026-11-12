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

describe('ISO-only date statement', () => {
  it('parses and detects a vampire when every date is YYYY-MM-DD', () => {
    const headers = ['Date', 'Description', 'Amount', 'Currency'];
    const rows = [
      ['2025-01-05', 'NETFLIX STREAMING SERVICE', '-15.49', 'USD'],
      ['2025-02-05', 'NETFLIX STREAMING SERVICE', '-15.49', 'USD'],
      ['2025-03-05', 'NETFLIX STREAMING SERVICE', '-15.49', 'USD'],
      ['2025-04-05', 'NETFLIX STREAMING SERVICE', '-15.49', 'USD'],
      ['2025-05-05', 'NETFLIX STREAMING SERVICE', '-15.49', 'USD'],
      ['2025-05-10', 'SALARY DIRECT DEPOSIT', '3000.00', 'USD'],
    ];
    const parsed = parseStatement(headers, rows);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.value.transactions.length).toBe(6);

    const result = runDetection({
      transactions: parsed.value.transactions,
      currency: parsed.value.currency,
    });
    const all = [...result.vampires, ...result.possibleVampires];
    expect(all.some((v) => /NETFLIX/i.test(JSON.stringify(v)))).toBe(true);
    expect(all.some((v) => /SALARY/i.test(JSON.stringify(v)))).toBe(false);
  });
});

describe('vampire ids are stable for the sample statements', () => {
  const EXPECTED_IDS: Record<string, string[]> = {
    'latam-bank-cop.csv': [
      'NETFLIX ENTRETENIMIENTO MENSUAL_0',
      'SPOTIFY MUSIC SUSCRIPCION_0',
      'SMARTFIT GIMNASIO MENSUAL_0',
      'CLARO PLAN MOVIL_0',
    ],
    'latam-bank-mxn.csv': [
      'NETFLIX ENTRETENIMIENTO MENSUAL_0',
      'SPOTIFY MUSIC SUSCRIPCION_0',
      'DISNEY PLUS STREAMING_0',
      'BLIM TV STREAMING LOCAL_0',
      'SMART FIT GIMNASIO MENSUAL_0',
    ],
    'messy-statement.csv': [
      'NETFLIX MONTHLY SUBSCRIPTION_0',
      'SPOTIFY PREMIUM MUSIC_0',
      'GYM MEMBERSHIP FIT CLUB_0',
    ],
    'us-bank-usd.csv': [
      'COSTCO ANNUAL MEMBERSHIP_0',
      'NETFLIX STREAMING SERVICE_0',
      'SPOTIFY USA MUSIC SUBSCRIPTION_0',
      'APPLE.COM/BILL_0',
      'APPLE.COM/BILL_1',
      'MEALBOX HELLOFRESH SUBSCRIPTION_0',
      'AMAZON PRIME MEMBERSHIP FEE_0',
      'PLANET FITNESS GYM MEMBERSHIP_0',
      'AT&T WIRELESS MOBILE PLAN_0',
      'GREEN CHEF WEEKLY MEAL BOX_0',
    ],
  };

  for (const [file, ids] of Object.entries(EXPECTED_IDS)) {
    it(`${file} yields the expected vampire ids`, () => {
      const { vampires, possibleVampires } = detectFromSample(file);
      expect(vampires.map((v) => v.id)).toEqual(ids);
      expect(possibleVampires).toEqual([]);
    });
  }
});

describe('accents and embedded dates in descriptions', () => {
  it('groups accent variants and dates into one vampire, keeping the accented display name', () => {
    const headers = ['Date', 'Description', 'Amount', 'Currency'];
    const rows = [
      ['2025-01-05', 'SUSCRIPCIÓN ZETA 2025-01-05', '-9.99', 'USD'],
      ['2025-02-05', 'SUSCRIPCION ZETA 05/02/2025', '-9.99', 'USD'],
      ['2025-03-05', 'SUSCRIPCIÓN ZETA 05-03-2025', '-9.99', 'USD'],
      ['2025-04-05', 'SUSCRIPCION ZETA 2025-04-05', '-9.99', 'USD'],
      ['2025-05-05', 'SUSCRIPCIÓN ZETA 2025-05-05', '-9.99', 'USD'],
    ];
    const parsed = parseStatement(headers, rows);
    if (!parsed.ok) throw new Error('parse failed');
    const result = runDetection({
      transactions: parsed.value.transactions,
      currency: parsed.value.currency,
    });
    const all = [...result.vampires, ...result.possibleVampires];
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('SUSCRIPCION ZETA_0');
    expect(all[0].displayName).toBe('SUSCRIPCIÓN ZETA');
  });
});

describe('sample vampire ids are stable across sign-convention changes', () => {
  it.each([
    ['us-bank-usd.csv', 10],
    ['latam-bank-mxn.csv', 5],
    ['latam-bank-cop.csv', 4],
    ['messy-statement.csv', 3],
  ])('%s keeps its vampire ids', (file, count) => {
    const { vampires } = detectFromSample(file);
    expect(vampires.length).toBe(count);
  });
});
