/**
 * Preservation properties: bank-format-parser-fixes.
 *
 * These cover inputs OUTSIDE the bug condition and must PASS on both the
 * unfixed and the fixed engine.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { detectColumns, inferDateFormat, parseDate, parseRows } from '../src/engine/parser';
import { parseStatement, runDetection } from '../src/engine/index';
import { computeScore } from '../src/engine/scorer';
import type { ColumnLayout, RecurrenceCandidate, Transaction } from '../src/engine/types';

const pad2 = (n: number): string => String(n).padStart(2, '0');
const fmtCents = (c: number): string => `${Math.floor(c / 100)}.${pad2(c % 100)}`;

const syllable = fc.constantFrom('zor', 'blax', 'quin', 'dle', 'vrum', 'plok', 'xyl', 'wump', 'jixt', 'krel');
const word = fc.array(syllable, { minLength: 2, maxLength: 3 }).map((p) => p.join(''));
const merchant = fc
  .tuple(word, word)
  .map(([a, b]) => `${a[0].toUpperCase()}${a.slice(1)} ${b[0].toUpperCase()}${b.slice(1)}`);

const isoDate = fc
  .record({
    y: fc.integer({ min: 2000, max: 2099 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ y, m, d }) => ({ y, m, d, iso: `${y}-${pad2(m)}-${pad2(d)}` }));

const cents = fc.integer({ min: 1, max: 999999 });

// ---------------------------------------------------------------------------
// Signed amounts
// ---------------------------------------------------------------------------
describe('preservation: signed amounts', () => {
  it('classifies by sign (negative = debit) and has no indicatorCol', () => {
    // negatives >= positives keeps the "positive is charge" heuristic off.
    const rowsArb = fc
      .tuple(
        fc.array(fc.tuple(isoDate, cents), { minLength: 1, maxLength: 8 }),
        fc.array(fc.tuple(isoDate, cents), { minLength: 0, maxLength: 1 }),
      )
      .map(([neg, pos]) => ({ neg, pos }));
    fc.assert(
      fc.property(rowsArb, ({ neg, pos }) => {
        const body: { row: string[]; expected: 'debit' | 'credit'; cents: number }[] = [
          ...neg.map(([d, c], i) => ({
            row: [d.iso, `Shop ${i}`, `-${fmtCents(c)}`],
            expected: 'debit' as const,
            cents: c,
          })),
          ...pos.map(([d, c], i) => ({
            row: [d.iso, `Refund ${i}`, fmtCents(c)],
            expected: 'credit' as const,
            cents: c,
          })),
        ];
        const parsed = parseStatement(['Date', 'Description', 'Amount'], body.map((b) => b.row));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.layout.type).toBe('single');
        expect('indicatorCol' in parsed.value.layout).toBe(false);
        expect(parsed.value.transactions.map((t) => [t.type, t.amountCents])).toEqual(
          body.map((b) => [b.expected, b.cents]),
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Split debit / credit columns
// ---------------------------------------------------------------------------
describe('preservation: split Debit/Credit columns', () => {
  it('classifies by the populated column', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(isoDate, cents, fc.boolean()), { minLength: 1, maxLength: 10 }),
        (items) => {
          const rows = items.map(([d, c, isDebit], i) => [
            d.iso,
            `Item ${i}`,
            isDebit ? fmtCents(c) : '',
            isDebit ? '' : fmtCents(c),
          ]);
          const parsed = parseStatement(['Date', 'Description', 'Debit', 'Credit'], rows);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.value.layout.type).toBe('split');
          expect(parsed.value.transactions.map((t) => [t.type, t.amountCents])).toEqual(
            items.map(([, c, isDebit]) => [isDebit ? 'debit' : 'credit', c]),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Date formats
// ---------------------------------------------------------------------------
describe('preservation: date formats', () => {
  it('DD/MM/YYYY parses to ISO when a day > 12 decides the column', () => {
    fc.assert(
      fc.property(
        fc.array(isoDate, { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 13, max: 28 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 2000, max: 2099 }),
        (others, day, month, year) => {
          const decider = { y: year, m: month, d: day, iso: `${year}-${pad2(month)}-${pad2(day)}` };
          const all = [decider, ...others];
          const col = all.map((x) => `${pad2(x.d)}/${pad2(x.m)}/${x.y}`);
          expect(inferDateFormat(col)).toBe('DD/MM/YYYY');
          col.forEach((s, i) => {
            const r = parseDate(s, 'DD/MM/YYYY');
            expect(r.ok && r.value).toBe(all[i].iso);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('MM/DD/YYYY parses to ISO when a day > 12 decides the column', () => {
    fc.assert(
      fc.property(
        fc.array(isoDate, { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 13, max: 28 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 2000, max: 2099 }),
        (others, day, month, year) => {
          const decider = { y: year, m: month, d: day, iso: `${year}-${pad2(month)}-${pad2(day)}` };
          const all = [decider, ...others];
          const col = all.map((x) => `${pad2(x.m)}/${pad2(x.d)}/${x.y}`);
          expect(inferDateFormat(col)).toBe('MM/DD/YYYY');
          col.forEach((s, i) => {
            const r = parseDate(s, 'MM/DD/YYYY');
            expect(r.ok && r.value).toBe(all[i].iso);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('YYYY-MM-DD (with optional time) parses to the same ISO string', () => {
    fc.assert(
      fc.property(
        fc.array(isoDate, { minLength: 1, maxLength: 6 }),
        fc.constantFrom('', ' 10:12:00', 'T08:30:15', 'T23:59:59Z'),
        (dates, suffix) => {
          const col = dates.map((x) => x.iso + suffix);
          expect(inferDateFormat(col)).toBe('YYYY-MM-DD');
          col.forEach((s, i) => {
            const r = parseDate(s, 'YYYY-MM-DD');
            expect(r.ok && r.value).toBe(dates[i].iso);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('slash columns with every day and month <= 12 stay ambiguous', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            a: fc.integer({ min: 1, max: 12 }),
            b: fc.integer({ min: 1, max: 12 }),
            y: fc.integer({ min: 2000, max: 2099 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (items) => {
          const col = items.map((x) => `${pad2(x.a)}/${pad2(x.b)}/${x.y}`);
          expect(inferDateFormat(col)).toBe('ambiguous');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------
describe('preservation: score is computeScore (no cap)', () => {
  const toTx = (name: string, date: string, amountCents: number, i: number): Transaction => ({
    id: String(i),
    date,
    description: name,
    normalizedName: '',
    amountCents,
    type: 'debit',
    currency: 'USD',
  });

  const monthly = (name: string, n: number, day: number, amountCents: number): Transaction[] =>
    Array.from({ length: n }, (_, i) => {
      const monthIdx = i % 12;
      const year = 2023 + Math.floor(i / 12);
      return toTx(name, `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`, amountCents, i);
    });

  const asCandidate = (
    v: ReturnType<typeof runDetection>['vampires'][number],
  ): RecurrenceCandidate => ({
    normalizedName: v.normalizedName,
    bites: v.bites,
    cadence: v.cadence,
    medianAmountCents: v.medianAmountCents,
    isAmountStable: v.isAmountStable,
    hasFreeTrial: v.hasFreeTrial,
    hasPriceIncrease: v.hasPriceIncrease,
    amountHistory: v.amountHistory,
  });

  it('candidates with 3+ bites keep their computeScore result', () => {
    fc.assert(
      fc.property(
        merchant,
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 100, max: 50000 }),
        (name, n, day, amount) => {
          const { vampires, possibleVampires } = runDetection({
            transactions: monthly(name, n, day, amount),
            currency: 'USD',
          });
          const all = [...vampires, ...possibleVampires].filter((v) => v.bites.length >= 3);
          expect(all.length).toBeGreaterThan(0);
          for (const v of all) {
            expect(v.confidenceScore).toBe(computeScore(asCandidate(v), v.catalogEntry !== undefined));
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('2-bite candidates with a catalog match keep their computeScore result', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('NETFLIX.COM', 'SPOTIFY', 'HULU', 'DISNEY PLUS'),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 300, max: 5000 }),
        (name, day, amount) => {
          const { vampires, possibleVampires } = runDetection({
            transactions: monthly(name, 2, day, amount),
            currency: 'USD',
          });
          const all = [...vampires, ...possibleVampires].filter(
            (v) => v.bites.length === 2 && v.catalogEntry !== undefined,
          );
          expect(all.length).toBeGreaterThan(0);
          for (const v of all) {
            expect(v.confidenceScore).toBe(computeScore(asCandidate(v), true));
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Known headers
// ---------------------------------------------------------------------------
describe('preservation: known headers win over wider text columns', () => {
  it('a header-matched description is chosen over any wider text column', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Description', 'Concepto', 'Merchant', 'Payee', 'Title', 'Narrative', 'Descripcion'),
        fc.integer({ min: 0, max: 1 }),
        fc.array(fc.tuple(isoDate, cents), { minLength: 1, maxLength: 5 }),
        (descHeader, wideBefore, items) => {
          // Layout: [Date, (Notes), Desc, (Notes), Amount] with Notes much wider than Desc.
          const wide = 'A much longer free text note that is wider than the description column';
          const headers = ['Date'];
          if (wideBefore) headers.push('Notes');
          headers.push(descHeader);
          if (!wideBefore) headers.push('Notes');
          headers.push('Amount');
          const descIdx = headers.indexOf(descHeader);
          const rows = items.map(([d, c], i) => {
            const r = [d.iso];
            if (wideBefore) r.push(wide);
            r.push(`Shop ${i}`);
            if (!wideBefore) r.push(wide);
            r.push(`-${fmtCents(c)}`);
            return r;
          });
          const layout = detectColumns(headers, rows);
          expect('code' in layout).toBe(false);
          if ('code' in layout) return;
          expect(layout.descCol).toBe(descIdx);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Zero amount
// ---------------------------------------------------------------------------
describe('preservation: zero amount stays a debit', () => {
  it('0.00 is a debit for either sign convention', () => {
    const layout: ColumnLayout = { type: 'single', amountCol: 2, dateCol: 0, descCol: 1 };
    fc.assert(
      fc.property(
        isoDate,
        fc.constantFrom('0', '0.00', '-0.00', '$0.00'),
        fc.boolean(),
        (d, raw, positiveIsCharge) => {
          const { transactions } = parseRows(
            [[d.iso, 'Free Trial', raw]],
            layout,
            'YYYY-MM-DD',
            'dotDecimal',
            positiveIsCharge,
          );
          expect(transactions).toHaveLength(1);
          expect(transactions[0].amountCents).toBe(0);
          expect(transactions[0].type).toBe('debit');
        },
      ),
      { numRuns: 50 },
    );
  });
});
