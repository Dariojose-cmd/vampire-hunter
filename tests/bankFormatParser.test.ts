/**
 * bank-format-parser-fixes: unit + property tests.
 * Task 3.4b section: creeping-amount split clusters are capped below vampire level.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseStatement, runDetection, VAMPIRE_THRESHOLD } from '../src/engine/index';
import type { Transaction } from '../src/engine/types';
import {
  classifyIndicator,
  detectColumns,
  inferDateFormat,
  parseDate,
  parseRows,
} from '../src/engine/parser';

const pad2 = (n: number): string => String(n).padStart(2, '0');

let seq = 0;
function tx(date: string, description: string, amountCents: number): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    date,
    description,
    normalizedName: '',
    amountCents,
    type: 'debit',
    currency: 'EUR',
  };
}

function detect(txns: Transaction[]) {
  return runDetection({ transactions: txns, currency: 'EUR' });
}

const matches = (name: string) => (v: { displayName: string; normalizedName: string }) =>
  `${v.displayName} ${v.normalizedName}`.toLowerCase().includes(name.toLowerCase());

/** Monthly series on one day: [year-month index i] -> amounts[i]. */
function monthly(desc: string, day: number, amounts: number[], startMonth = 0): Transaction[] {
  return amounts.map((a, i) => {
    const m = startMonth + i;
    const y = 2024 + Math.floor(m / 12);
    return tx(`${y}-${pad2((m % 12) + 1)}-${pad2(day)}`, desc, a);
  });
}

/** Nonsense names that cannot match the catalog. */
const syllable = fc.constantFrom('zor', 'blax', 'quin', 'dle', 'vrum', 'plok', 'xyl', 'wump', 'jixt', 'krel');
const word = fc
  .array(syllable, { minLength: 2, maxLength: 3 })
  .map((p) => p.join(''));
const merchantName = fc.tuple(word, word).map(([a, b]) => `${a} ${b}`);

describe('creeping-amount split (task 3.4b)', () => {
  /**
   * **Validates: Requirements 2.8**
   */
  it('property: a strictly rising uncatalogued monthly series never yields a vampire', () => {
    fc.assert(
      fc.property(
        merchantName,
        fc.integer({ min: 6, max: 12 }),
        fc.integer({ min: 1000, max: 20000 }),
        fc.double({ min: 1.08, max: 1.25, noNaN: true }),
        fc.integer({ min: 1, max: 28 }),
        (name, bites, start, growth, day) => {
          const amounts: number[] = [];
          let cur = start;
          for (let i = 0; i < bites; i++) {
            amounts.push(Math.round(cur));
            cur *= growth;
          }
          const { vampires } = detect(monthly(name, day, amounts));
          expect(vampires.filter(matches(name))).toHaveLength(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.8**
   */
  it('property: flat multi-plan merchants keep their vampires', () => {
    fc.assert(
      fc.property(
        merchantName,
        fc.integer({ min: 500, max: 5000 }),
        fc.integer({ min: 160, max: 300 }),
        fc.integer({ min: 3, max: 8 }),
        fc.integer({ min: 3, max: 8 }),
        (name, planA, pctB, nA, nB) => {
          const planB = Math.round((planA * pctB) / 100);
          const txns = [...monthly(name, 5, Array(nA).fill(planA)), ...monthly(name, 20, Array(nB).fill(planB))];
          const { vampires } = detect(txns);
          expect(vampires.filter(matches(name)).length).toBeGreaterThanOrEqual(2);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('Padaria do Ze: 8 rising monthly bites stay below vampire level', () => {
    const amounts = [1295, 1390, 1485, 1580, 1675, 1770, 1865, 1960];
    const res = detect(monthly('PADARIA DO ZE', 22, amounts, 0));
    expect(res.vampires.filter(matches('padaria'))).toHaveLength(0);
    for (const v of res.possibleVampires) expect(v.confidenceScore).toBeLessThan(VAMPIRE_THRESHOLD);
  });

  it('Thuisbezorgd.nl: 8 rising bites stay below vampire level', () => {
    const amounts = [2330, 2460, 2590, 2720, 2850, 2980, 3110, 3240];
    const res = detect(monthly('Thuisbezorgd.nl', 8, amounts, 0));
    expect(res.vampires.filter(matches('thuisbezorgd'))).toHaveLength(0);
  });

  it('plateau price increase (4 x 10,00 then 4 x 12,00) keeps its vampire', () => {
    const amounts = [1000, 1000, 1000, 1000, 1200, 1200, 1200, 1200];
    const res = detect(monthly('Zorblax Plok', 10, amounts, 0));
    expect(res.vampires.filter(matches('zorblax')).length).toBeGreaterThanOrEqual(1);
  });

  it('catalogued Netflix price increase (13,99 x5 then 15,49 x3) stays a vampire', () => {
    const amounts = [1399, 1399, 1399, 1399, 1399, 1549, 1549, 1549];
    const res = detect(monthly('NETFLIX.COM', 12, amounts, 0));
    const hits = res.vampires.filter(matches('netflix'));
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some((v) => v.confidenceScore >= VAMPIRE_THRESHOLD)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 3.6: indicator columns, headers, compact dates, 2-bite cap
// ---------------------------------------------------------------------------

const ING_HEADERS = ['Datum', 'Naam / Omschrijving', 'Rekening', 'Tegenrekening', 'Code', 'Af Bij', 'Bedrag (EUR)', 'Mutatiesoort', 'Mededelingen'];
const ITAU_HEADERS = ['data', 'lançamento', 'ag./origem', 'valor (R$)', 'saldos'];

describe('classifyIndicator', () => {
  it.each([
    ['Af', 'debit'], ['Bij', 'credit'], ['D', 'debit'], ['C', 'credit'],
    ['DB', 'debit'], ['CR', 'credit'], ['Débito', 'debit'], ['Crédito', 'credit'],
    ['Debito', 'debit'], ['credito', 'credit'], ['  bIJ ', 'credit'], ['AF', 'debit'],
    ['Cargo', 'debit'], ['Abono', 'credit'],
  ] as const)('%s -> %s', (v, expected) => {
    expect(classifyIndicator(v)).toBe(expected);
  });

  it.each(['', '  ', 'xyz', 'DEBIT CARD', 'Transfer', '12,50'])('unknown "%s" -> null', (v) => {
    expect(classifyIndicator(v)).toBeNull();
  });
});

describe('detectColumns: indicator columns', () => {
  it('ING header row resolves description, amount, indicator', () => {
    const rows = [
      ['20250103', 'Netflix', 'NL00', 'NL01', 'BA', 'Af', '13,99', 'Betaalautomaat', 'x'],
      ['20250125', 'Salaris', 'NL00', 'NL01', 'OV', 'Bij', '2800,00', 'Overschrijving', 'y'],
    ];
    const layout = detectColumns(ING_HEADERS, rows);
    expect('code' in layout).toBe(false);
    if ('code' in layout || layout.type !== 'single') throw new Error('expected single layout');
    expect(layout.dateCol).toBe(0);
    expect(layout.descCol).toBe(1);
    expect(layout.indicatorCol).toBe(5);
    expect(layout.amountCol).toBe(6);
  });

  it('Itaú header row resolves description and amount, no indicator', () => {
    const rows = [
      ['03/01/2025', 'PAO DE ACUCAR', '3912', '-187,40', '12.158,27'],
      ['05/01/2025', 'NETFLIX.COM', '3912', '-55,90', '12.102,37'],
    ];
    const layout = detectColumns(ITAU_HEADERS, rows);
    expect('code' in layout).toBe(false);
    if ('code' in layout || layout.type !== 'single') throw new Error('expected single layout');
    expect(layout.descCol).toBe(1);
    expect(layout.amountCol).toBe(3);
    expect(layout.indicatorCol).toBeUndefined();
  });

  it('"Débito/Crédito" is an indicator, not a split debit column', () => {
    const rows = [
      ['03/01/2025', 'Netflix', 'Débito', '55,90'],
      ['04/01/2025', 'Salario', 'Crédito', '3000,00'],
    ];
    const layout = detectColumns(['Data', 'Descrição', 'Débito/Crédito', 'Valor'], rows);
    expect('code' in layout).toBe(false);
    if ('code' in layout) return;
    expect(layout.type).toBe('single');
    if (layout.type === 'single') expect(layout.indicatorCol).toBe(2);
  });

  it('Chase "Details" (DEBIT/CREDIT) is not an indicator', () => {
    const rows = [
      ['DEBIT', '01/03/2025', 'NETFLIX.COM', '-15.49', 'DEBIT_CARD'],
      ['CREDIT', '01/04/2025', 'PAYROLL', '2500.00', 'ACH_CREDIT'],
    ];
    const layout = detectColumns(['Details', 'Posting Date', 'Description', 'Amount', 'Type'], rows);
    expect('code' in layout).toBe(false);
    if ('code' in layout || layout.type !== 'single') throw new Error('expected single layout');
    expect(layout.indicatorCol).toBeUndefined();
    expect(layout.descCol).toBe(2);
  });
});

describe('compact dates', () => {
  it('parses valid compact dates to ISO', () => {
    expect(parseDate('20250103', 'DD/MM/YYYY')).toEqual({ ok: true, value: '2025-01-03' });
    expect(parseDate('20241231', 'YYYY-MM-DD')).toEqual({ ok: true, value: '2024-12-31' });
    expect(inferDateFormat(['20250103', '20250215'])).toBe('YYYY-MM-DD');
    expect(inferDateFormat(['20250103', '2025-02-15'])).toBe('YYYY-MM-DD');
  });

  it.each(['20251345', '20250230', '20250431'])('rejects invalid compact date %s', (s) => {
    expect(parseDate(s, 'YYYY-MM-DD').ok).toBe(false);
  });

  it.each(['12345678', '99999999', '00000000', '30251301'])('8-digit non-date %s is not a date', (s) => {
    expect(parseDate(s, 'YYYY-MM-DD').ok).toBe(false);
    expect(inferDateFormat([s])).not.toBe('YYYY-MM-DD');
  });
});

describe('parseRows with an indicator column', () => {
  const layout = { type: 'single' as const, dateCol: 0, descCol: 1, indicatorCol: 2, amountCol: 3 };
  const run = (ind: string, amount: string) =>
    parseRows([['20250103', 'Thing', ind, amount]], layout, 'YYYY-MM-DD', 'commaDecimal').transactions[0];

  it('Bij + unsigned amount -> credit', () => expect(run('Bij', '10,00').type).toBe('credit'));
  it('Af + unsigned amount -> debit', () => expect(run('Af', '10,00').type).toBe('debit'));
  it('Bij + 0,00 -> debit', () => expect(run('Bij', '0,00').type).toBe('debit'));
  it('unknown indicator uses sign logic', () => {
    expect(run('???', '-10,00').type).toBe('debit');
    expect(run('???', '10,00').type).toBe('credit');
  });
  it('empty indicator uses sign logic', () => {
    expect(run('', '-10,00').type).toBe('debit');
    expect(run('', '10,00').type).toBe('credit');
  });
});

describe('2-bite cap', () => {
  it('uncatalogued 2-bite series scores at most 59 and is not a vampire', () => {
    const res = detect([tx('2025-06-20', 'Zorblax Plok', 1250), tx('2025-06-28', 'Zorblax Plok', 1250)]);
    expect(res.vampires).toHaveLength(0);
    for (const v of res.possibleVampires) expect(v.confidenceScore).toBeLessThanOrEqual(VAMPIRE_THRESHOLD - 1);
  });

  it('catalogued 2-bite series is not capped by the 2-bite rule', () => {
    const res = detect([tx('2025-05-10', 'NETFLIX.COM', 1549), tx('2025-06-10', 'NETFLIX.COM', 1549)]);
    const all = [...res.vampires, ...res.possibleVampires].filter(matches('netflix'));
    expect(all.length).toBeGreaterThan(0);
    expect(Math.max(...all.map((v) => v.confidenceScore))).toBeGreaterThanOrEqual(VAMPIRE_THRESHOLD);
  });
});

describe('properties: indicator, dates, caps, fallback', () => {
  /** **Validates: Requirements 2.1, 2.2** */
  it('property: income is never a vampire', () => {
    const headers = ['Datum', 'Naam / Omschrijving', 'Af Bij', 'Bedrag (EUR)'];
    fc.assert(
      fc.property(
        merchantName,
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 500, max: 500000 }),
        fc.constantFrom('Bij', 'bij', 'BIJ'),
        (merchant, months, day, cents, ind) => {
          const amount = `${Math.floor(cents / 100)},${pad2(cents % 100)}`;
          const rows = Array.from({ length: months }, (_, i) => [`2025${pad2(i + 1)}${pad2(day)}`, merchant, ind, amount]);
          const parsed = parseStatement(headers, rows);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.value.transactions.every((t) => t.type === 'credit')).toBe(true);
          const { vampires, possibleVampires } = runDetection({
            transactions: parsed.value.transactions,
            currency: parsed.value.currency,
          });
          const key = merchant.toLowerCase().replace(/[^a-z]/g, '');
          const hits = [...vampires, ...possibleVampires].filter((v) =>
            [v.displayName, v.normalizedName, ...v.bites.map((b) => b.description)].some((h) =>
              h.toLowerCase().replace(/[^a-z]/g, '').includes(key),
            ),
          );
          expect(hits).toHaveLength(0);
        },
      ),
      { numRuns: 25 },
    );
  });

  /** **Validates: Requirements 2.1** */
  it('property: indicator wins over amount sign', () => {
    const layout = { type: 'single' as const, dateCol: 0, descCol: 1, indicatorCol: 2, amountCol: 3 };
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9_999_999 }),
        fc.boolean(),
        fc.constantFrom('Af', 'D', 'DB', 'Débito'),
        fc.constantFrom('Bij', 'C', 'CR', 'Crédito'),
        fc.boolean(),
        (cents, negative, debitWord, creditWord, isDebit) => {
          const amount = `${negative ? '-' : ''}${Math.floor(cents / 100)},${pad2(cents % 100)}`;
          const ind = isDebit ? debitWord : creditWord;
          const t = parseRows([['20250103', 'X Y', ind, amount]], layout, 'YYYY-MM-DD', 'commaDecimal').transactions[0];
          expect(t.type).toBe(isDebit ? 'debit' : 'credit');
          expect(t.amountCents).toBe(cents);
        },
      ),
    );
  });

  /** **Validates: Requirements 2.6** */
  it('property: compact date round trip', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.constantFrom('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'),
        (y, m, d, fmt) => {
          const iso = `${y}-${pad2(m)}-${pad2(d)}`;
          const compact = `${y}${pad2(m)}${pad2(d)}`;
          expect(parseDate(compact, fmt)).toEqual({ ok: true, value: iso });
          expect(inferDateFormat([compact])).toBe('YYYY-MM-DD');
        },
      ),
    );
  });

  /** **Validates: Requirements 2.7** */
  it('property: 2-bite uncatalogued series is never a vampire', () => {
    fc.assert(
      fc.property(
        merchantName,
        fc.integer({ min: 4, max: 400 }),
        fc.integer({ min: 100, max: 100000 }),
        fc.integer({ min: 0, max: 300 }),
        (name, gap, cents, offset) => {
          const base = new Date(Date.UTC(2024, 0, 1 + offset));
          const second = new Date(base.getTime() + gap * 86400000);
          const iso = (d: Date) => d.toISOString().slice(0, 10);
          const res = detect([tx(iso(base), name, cents), tx(iso(second), name, cents)]);
          expect(res.vampires.filter(matches(name))).toHaveLength(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  /** **Validates: Requirements 2.3, 2.4, 2.5** */
  it('property: description fallback picks the widest text column', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.array(fc.integer({ min: 4, max: 10 }), { minLength: 3, maxLength: 3 }),
        (wideIdx, baseLens) => {
          // Three unassigned text columns; the chosen one is strictly widest.
          const lens = baseLens.map((l, i) => (i === wideIdx ? l + 15 : l));
          const headers = ['fecha', 'colx', 'coly', 'colz', 'importe'];
          const rows = [1, 2, 3].map((n) => [
            `2025-0${n}-03`,
            ...lens.map((l, i) => `${'abcdefghij'[i]}${'q'.repeat(l)}${n}`),
            '-12.50',
          ]);
          const layout = detectColumns(headers, rows);
          expect('code' in layout).toBe(false);
          if (!('code' in layout)) expect(layout.descCol).toBe(wideIdx + 1);
        },
      ),
    );
  });

  /** **Validates: Requirements 2.3, 3.4** */
  it('property: a keyword header wins over a wider text column', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Description', 'Concepto', 'Merchant', 'lançamento', 'Omschrijving', 'Naam'),
        fc.integer({ min: 1, max: 3 }),
        (kw, extra) => {
          const headers = ['fecha', 'otro', kw, 'importe'];
          const rows = [1, 2, 3].map((n) => [
            `2025-0${n}-03`,
            'w'.repeat(40 + extra) + n,
            `Shop${n}`,
            '-12.50',
          ]);
          const layout = detectColumns(headers, rows);
          expect('code' in layout).toBe(false);
          if (!('code' in layout)) expect(layout.descCol).toBe(2);
        },
      ),
    );
  });
});
