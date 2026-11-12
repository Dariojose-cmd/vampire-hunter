import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { parseStatement, parseWithLayout, runDetection } from '../src/engine/index';
import { detectPositiveIsCharge, parseRows } from '../src/engine/parser';
import type { ColumnLayout } from '../src/engine/types';

const layout: ColumnLayout = { type: 'single', amountCol: 2, dateCol: 0, descCol: 1 };
const headers = ['Date', 'Description', 'Amount'];

function load(file: string): { headers: string[]; rows: string[][] } {
  const text = readFileSync(resolve(process.cwd(), 'samples', file), 'utf-8');
  const data = Papa.parse<string[]>(text, { skipEmptyLines: true }).data as string[][];
  return { headers: data[0], rows: data.slice(1) };
}

describe('detectPositiveIsCharge', () => {
  it('true when positives dominate and negatives are payments', () => {
    const rows = [
      ['2026-01-05', 'NETFLIX', '15.49'],
      ['2026-01-06', 'SPOTIFY', '10.99'],
      ['2026-01-10', 'PAYMENT THANK YOU', '-100.00'],
    ];
    expect(detectPositiveIsCharge(rows, layout)).toBe(true);
  });

  it.each(['PAGO RECIBIDO', 'REFUND', 'ABONO', 'THANK YOU'])('recognises %s', (d) => {
    const rows = [
      ['2026-01-05', 'NETFLIX', '15.49'],
      ['2026-01-06', 'SPOTIFY', '10.99'],
      ['2026-01-10', d, '-20.00'],
    ];
    expect(detectPositiveIsCharge(rows, layout)).toBe(true);
  });

  it('false when negatives dominate', () => {
    const rows = [
      ['2026-01-05', 'NETFLIX', '-15.49'],
      ['2026-01-06', 'SPOTIFY', '-10.99'],
      ['2026-01-10', 'SALARY', '2000.00'],
    ];
    expect(detectPositiveIsCharge(rows, layout)).toBe(false);
  });

  it('false when positives dominate but negatives are ordinary purchases', () => {
    const rows = [
      ['2026-01-01', 'SALARY', '2000.00'],
      ['2026-01-02', 'BONUS', '500.00'],
      ['2026-01-05', 'NETFLIX', '-15.49'],
    ];
    expect(detectPositiveIsCharge(rows, layout)).toBe(false);
  });

  it('false for split layout', () => {
    const split: ColumnLayout = { type: 'split', debitCol: 2, creditCol: 3, dateCol: 0, descCol: 1 };
    expect(detectPositiveIsCharge([['2026-01-01', 'X', '5', '']], split)).toBe(false);
  });
});

describe('parseRows positiveIsCharge', () => {
  it('flips debit/credit classification', () => {
    const rows = [
      ['2026-01-05', 'A', '15.49'],
      ['2026-01-06', 'B', '-5.00'],
    ];
    const def = parseRows(rows, layout, 'YYYY-MM-DD', 'dotDecimal').transactions;
    expect(def.map((t) => t.type)).toEqual(['credit', 'debit']);
    const flipped = parseRows(rows, layout, 'YYYY-MM-DD', 'dotDecimal', true).transactions;
    expect(flipped.map((t) => t.type)).toEqual(['debit', 'credit']);
  });
});

describe('header-only CSV', () => {
  it('returns NO_VALID_ROWS', () => {
    const r = parseStatement(headers, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NO_VALID_ROWS');
  });
  it('returns NO_VALID_ROWS for blank-only rows', () => {
    const r = parseStatement(headers, [['', '', '']]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NO_VALID_ROWS');
  });
});

describe('Amex-style positive-charge statement (end to end)', () => {
  it('yields vampires and no payment vampire', () => {
    const { headers: h, rows } = load('amex-positive-charges.csv');
    const parsed = parseStatement(h, rows);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { vampires } = runDetection({
      transactions: parsed.value.transactions,
      currency: parsed.value.currency,
    });
    expect(vampires.map((v) => v.id).sort()).toEqual(
      ['AMAZON PRIME*MEMBERSHIP_0', 'NETFLIX.COM_0', 'SPOTIFY USA_0'],
    );
    const names = vampires.map((v) => v.displayName.toLowerCase()).join('|');
    expect(names).not.toContain('payment');
    expect(names).not.toContain('whole foods');
  });

  it('explicit override works through parseWithLayout', () => {
    const { headers: h, rows } = load('amex-positive-charges.csv');
    const parsed = parseWithLayout(h, rows, layout, 'YYYY-MM-DD', true);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(runDetection({ transactions: parsed.value.transactions, currency: 'USD' }).vampires.length)
      .toBe(3);
  });
});

describe('Property: flipping every sign and the convention is equivalent', () => {
  const amount = fc.integer({ min: 1, max: 99999 }).map((c) => (c / 100).toFixed(2));
  const row = fc.record({
    day: fc.integer({ min: 1, max: 28 }),
    month: fc.integer({ min: 1, max: 12 }),
    desc: fc.constantFrom('NETFLIX', 'SPOTIFY', 'PAYMENT', 'GYM', 'REFUND'),
    amt: amount,
    neg: fc.boolean(),
  });

  it('same vampire ids', () => {
    fc.assert(
      fc.property(fc.array(row, { minLength: 1, maxLength: 40 }), (items) => {
        const build = (flip: boolean): string[][] =>
          items.map((r) => [
            `2026-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
            r.desc,
            (r.neg !== flip ? '-' : '') + r.amt,
          ]);
        const run = (rows: string[][], positiveIsCharge: boolean) => {
          const t = parseRows(rows, layout, 'YYYY-MM-DD', 'dotDecimal', positiveIsCharge).transactions;
          const d = runDetection({ transactions: t, currency: 'USD' });
          return [...d.vampires, ...d.possibleVampires].map((v) => v.id).sort();
        };
        expect(run(build(true), true)).toEqual(run(build(false), false));
      }),
      { numRuns: 100 },
    );
  });
});

describe('existing samples keep the default convention', () => {
  it.each(['us-bank-usd.csv', 'latam-bank-mxn.csv', 'latam-bank-cop.csv', 'messy-statement.csv'])(
    '%s is not detected as positive-charges',
    (file) => {
      const { headers: h, rows } = load(file);
      const p = parseStatement(h, rows);
      expect(p.ok).toBe(true);
      if (p.ok) expect(detectPositiveIsCharge(rows, p.value.layout)).toBe(false);
    },
  );
});
