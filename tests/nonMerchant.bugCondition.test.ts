/**
 * Bug condition exploration: non-merchant false positives.
 * Spec: .kiro/specs/non-merchant-false-positives-fix (task 1).
 *
 * These tests encode the EXPECTED behavior. Cases 1 to 4 must FAIL on unfixed
 * code; cases 4b, 5 and 6 are guards that pass before and after the fix.
 * All data is synthetic.
 *
 * COUNTEREXAMPLES FOUND ON UNFIXED CODE (first run, 20 failed / 7 passed):
 *  - Case 1: the real-shape statement (49 movements) lists 2 possibleVampires:
 *    "****RETENCION IVASD DLC* UBER" (weekly, 2 bites) and
 *    "TRANSFERENCIA INTERNET" (weekly, 2 bites). Flags are false here because
 *    the amounts are constant; flags need a price step or a trial-sized first
 *    charge (see case 4).
 *  - Case 2: all 11 descriptions are listed as 4-charge monthly series
 *    (displayName: TRANSFERENCIA INTERNET, TRANSFER TO SAVINGS, TRANSFERÊNCIA
 *    ENVIADA, RETENCION IVA, RETENÇÃO IMPOSTO, RETIRO CAJERO, ATM WITHDRAWAL,
 *    SAQUE ATM 24H, TARJETA DE CREDITO, PAGAMENTO FATURA CARTAO, CREDIT CARD).
 *    fast-check counterexample: ["TRANSFERENCIA INTERNET", 500, 29].
 *  - Case 3: displayName is "*ACME SHOP*" (edge asterisks kept).
 *    fast-check counterexample: prefix "*", suffix "*", 500 cents.
 *  - Case 4: 2-charge monthly and weekly series have hasFreeTrial=true
 *    (first charge 10% of median) and hasPriceIncrease=true (20% step).
 *    fast-check counterexample: ["monthly", 29, 31], 500 cents, trial=false.
 *
 * Fixture note for case 4b: a 2-charge quarterly series with a trial-sized
 * first charge is never detected by the engine (trial merge needs <= 45 days
 * between the trial and the paid cluster; quarterly gaps are 85-97 days), so
 * the quarterly guard checks hasPriceIncrease instead of hasFreeTrial.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readWorkbook } from '../src/engine/excelReader';
import { locateHeader } from '../src/engine/headerLocator';
import { parseStatement, runDetection } from '../src/engine/index';
import { parseCsvText } from '../src/components/csvUtils';
import type { Cadence, Transaction, Vampire } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Synthetic HTML-as-.xls statement (shape of the real Ecuadorian export)
// ---------------------------------------------------------------------------

const enc = (s: string) => new TextEncoder().encode(s).slice().buffer as ArrayBuffer;
const MES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];

type Mov = [day: number, month: number, desc: string, debit: string, credit: string];

function statementPage(movs: Mov[]): string {
  const rows = movs
    .map(
      ([d, m, desc, deb, cre]) =>
        `<tr><td>${String(d).padStart(2, '0')}-${MES[m - 1]}</td><td>9999</td><td>12345678</td><td>${desc}</td><td>${deb}</td><td>${cre}</td><td>100.00</td></tr>`,
    )
    .join('\r\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<table><tr><td>Fecha de Ultimo Corte:</td><td>15-09-2026</td><td>Razón Social:</td><td>X</td></tr>
<tr><td>Fecha este Corte:</td><td>14-11-2026</td><td>Cuenta:</td><td>2200000000</td></tr></table>
<table><tr><td><strong>MOVIMIENTOS</strong></td></tr>
<tr><td>FECHA</td><td>OFIC.</td><td>N.DOC.</td><td>DESCRIPCION</td><td>DEBITO</td><td>CREDITO</td><td>SALDO</td></tr>
${rows}
<tr></tr></table></body></html>`;
}

const SHOPS = [
  'SUPERMAXI QUITO', 'FARMACIA CRUZ AZUL', 'PANADERIA SAN JOSE', 'GASOLINERA PRIMAX', 'LIBRERIA MUNDO',
  'RESTAURANTE EL FOGON', 'FERRETERIA CENTRAL', 'CAFE DEL PARQUE', 'ZAPATERIA LUNA', 'PELUQUERIA ESTILO',
  'MERCADO LA FLORESTA', 'TIENDA DON PEPE', 'OPTICA VISION', 'JUGUETERIA ALEGRIA', 'HELADERIA POLAR',
  'LAVANDERIA BURBUJA', 'VETERINARIA PATITAS', 'PIZZERIA ROMA', 'CINEMA PLAZA', 'PAPELERIA TINTA',
  'FLORISTERIA ROSAL', 'TALLER MECANICO SUR', 'BAZAR ORIENTE', 'FRUTERIA TROPICAL', 'ESTACIONAMIENTO CENTRO',
  'CARNICERIA LA RES', 'BOUTIQUE AURORA', 'DROGUERIA SALUD', 'MUEBLERIA HOGAR', 'SODA LA ESQUINA',
  'SANDUCHERIA EL BUEN', 'TECNOLOGIA EXPRESS', 'DEPORTES ANDES', 'MINIMARKET 24', 'ASADERO LOS POLLOS',
  'CHOCOLATERIA CACAO', 'GRANOS Y MAS', 'LIBROS Y CAFE', 'JUGOS NATURALES', 'ABARROTES NORTE', 'CALZADO RAPIDO',
  'SPA RELAX', 'FOTOCOPIAS UNIVERSIDAD', 'AGENCIA DE VIAJES SOL', 'TAPICERIA MODERNA', 'RELOJERIA TIEMPO',
];

function realShapeMovements(): Mov[] {
  const m: Mov[] = [];
  // Non-merchant pairs, nine days apart.
  m.push([15, 10, '****RETENCION IVASD DLC* UBER', '0.64', '0.00']);
  m.push([24, 10, '****RETENCION IVASD DLC* UBER', '0.64', '0.00']);
  m.push([16, 10, 'TRANSFERENCIA INTERNET', '7.55', '0.00']);
  m.push([25, 10, 'TRANSFERENCIA INTERNET', '7.55', '0.00']);
  m.push([18, 10, 'RETIRO CAJERO AUTOMATICO', '40.00', '0.00']);
  m.push([5, 11, 'RETIRO CAJERO AUTOMATICO', '40.00', '0.00']);
  m.push([20, 10, 'PAGO TARJETA DE CREDITO', '120.00', '0.00']);
  m.push([8, 11, 'PAGO TARJETA DE CREDITO', '120.00', '0.00']);
  // Salary.
  m.push([30, 10, 'ACREDITACION SUELDO', '0.00', '850.00']);
  // One-off purchases, unique names, unique amounts.
  SHOPS.forEach((shop, i) => {
    const onOct = i < 22;
    const day = onOct ? 15 + (i % 17) : 1 + ((i - 22) % 13);
    m.push([day, onOct ? 10 : 11, shop, (3.1 + i * 1.37).toFixed(2), '0.00']);
  });
  return m;
}

async function runPage(html: string) {
  const r = await readWorkbook(enc(html));
  if (!r.ok) throw new Error('read failed: ' + r.error.message);
  const raw = parseCsvText(r.csvText);
  const loc = locateHeader([raw.headers, ...raw.rows]);
  const p = parseStatement(loc.headers, loc.rows);
  if (!p.ok) throw new Error('parse failed: ' + JSON.stringify(p.error));
  return runDetection({ transactions: p.value.transactions, currency: 'USD' });
}

// ---------------------------------------------------------------------------
// Direct series builder
// ---------------------------------------------------------------------------

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function series(description: string, amounts: number[], gapDays: number, start = '2025-01-10'): Transaction[] {
  return amounts.map((amountCents, i) => ({
    id: `${description}-${i}`,
    date: addDays(start, i * gapDays),
    description,
    normalizedName: '',
    amountCents,
    type: 'debit' as const,
    currency: 'USD',
  }));
}

function listed(txs: Transaction[]): Vampire[] {
  const r = runDetection({ transactions: txs, currency: 'USD' });
  return [...r.vampires, ...r.possibleVampires];
}

const byName = (items: Vampire[], needle: string) =>
  items.filter((v) => v.displayName.toUpperCase().includes(needle.toUpperCase()));

// ---------------------------------------------------------------------------
// Case 1
// ---------------------------------------------------------------------------

describe('bug condition: real-shape statement (case 1)', () => {
  it('lists no vampires and no possible vampires', async () => {
    const movs = realShapeMovements();
    expect(movs.length).toBeGreaterThanOrEqual(50);
    const res = await runPage(statementPage(movs));
    expect(res.vampires.map((v) => v.displayName)).toEqual([]);
    expect(res.possibleVampires.map((v) => v.displayName)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Case 2
// ---------------------------------------------------------------------------

const NON_MERCHANT_DESCRIPTIONS = [
  'TRANSFERENCIA INTERNET',
  'TRANSFER TO SAVINGS',
  'TRANSFERÊNCIA ENVIADA',
  'RETENCION IVA',
  'RETENÇÃO IMPOSTO',
  'RETIRO CAJERO',
  'ATM WITHDRAWAL',
  'SAQUE ATM 24H',
  'PAGO TARJETA DE CREDITO',
  'PAGAMENTO FATURA CARTAO',
  'CREDIT CARD PAYMENT',
];

describe('bug condition: non-merchant descriptions are not listed (case 2)', () => {
  it.each(NON_MERCHANT_DESCRIPTIONS)('%s as a 4-charge monthly series', (desc) => {
    expect(listed(series(desc, [4500, 4500, 4500, 4500], 30)).map((v) => v.displayName)).toEqual([]);
  });

  it('holds for any amount and monthly gap (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_MERCHANT_DESCRIPTIONS),
        fc.integer({ min: 500, max: 200000 }),
        fc.integer({ min: 29, max: 31 }),
        (desc, cents, gap) => {
          const items = listed(series(desc, [cents, cents, cents, cents], gap));
          expect(items.map((v) => v.displayName)).toEqual([]);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Case 3
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

// Edge junk per the trim rule: * # _ ~ | \ / = + - and whitespace ('.' is not trimmed).
const JUNK_EDGE = /^[*#_~|\\/=+\-\s]|[*#_~|\\/=+\-\s]$/;

describe('bug condition: edge symbols in displayName (case 3)', () => {
  it('*ACME SHOP* shows without edge asterisks', () => {
    const items = listed(series('*ACME SHOP*', [1299, 1299, 1299], 30));
    expect(items.length).toBeGreaterThan(0);
    for (const v of items) expect(v.displayName).not.toMatch(JUNK_EDGE);
  });

  it('holds for any symbol run around a merchant (property)', () => {
    const sym = fc.string({ unit: fc.constantFrom('*', '#', '-', '_', '~', '|', '=', '+'), minLength: 1, maxLength: 4 });
    fc.assert(
      fc.property(sym, sym, fc.integer({ min: 500, max: 50000 }), (pre, post, cents) => {
        const items = listed(series(`${pre}ACME SHOP${post}`, [cents, cents, cents], 30));
        for (const v of items) expect(v.displayName).not.toMatch(JUNK_EDGE);
      }),
      { numRuns: 20 },
    );
  });
});

// ---------------------------------------------------------------------------
// Case 4
// ---------------------------------------------------------------------------

describe('bug condition: flags on 2-charge weekly/monthly series (case 4)', () => {
  const cases: Array<[string, number]> = [
    ['monthly', 30],
    ['weekly', 7],
  ];

  it.each(cases)('%s: first charge at 10 pct of median has hasFreeTrial=false', (_n, gap) => {
    // median of [a, b] is 1000 -> a = 100 (10%), b = 1900
    const items = byName(listed(series('ACME STREAMING', [100, 1900], gap)), 'ACME STREAMING');
    expect(items).toHaveLength(1);
    expect(items[0].bites).toHaveLength(2);
    expect(items[0].hasFreeTrial).toBe(false);
  });

  it.each(cases)('%s: 20 pct step has hasPriceIncrease=false', (_n, gap) => {
    const items = byName(listed(series('ACME STREAMING', [1000, 1200], gap)), 'ACME STREAMING');
    expect(items).toHaveLength(1);
    expect(items[0].bites).toHaveLength(2);
    expect(items[0].hasPriceIncrease).toBe(false);
  });

  it('holds for any amount and gap (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<[Cadence, number, number]>(['monthly', 29, 31], ['weekly', 7, 7]),
        fc.integer({ min: 500, max: 100000 }),
        fc.integer({ min: 0, max: 2 }),
        fc.boolean(),
        ([, lo, hi], m, gapOffset, trial) => {
          const gap = Math.min(hi, lo + gapOffset);
          const amounts = trial
            ? [Math.round(m * 0.1), 2 * m - Math.round(m * 0.1)]
            : [m, Math.round(m * 1.2)];
          const items = byName(listed(series('ACME STREAMING', amounts, gap)), 'ACME STREAMING');
          for (const v of items) {
            expect(v.bites.length).toBe(2);
            expect(v.hasFreeTrial).toBe(false);
            expect(v.hasPriceIncrease).toBe(false);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Case 4b (guard)
// ---------------------------------------------------------------------------

describe('guard: long-cadence flags are kept (case 4b)', () => {
  it('2-charge yearly series with a 20% step keeps hasPriceIncrease', () => {
    const items = byName(listed(series('COSTCO ANNUAL MEMBERSHIP', [6000, 7200], 365)), 'COSTCO');
    expect(items).toHaveLength(1);
    expect(items[0].cadence).toBe('yearly');
    expect(items[0].hasPriceIncrease).toBe(true);
  });

  // A 2-charge quarterly series with a trial-sized first charge cannot exist in
  // the engine: the grouper only merges a trial cluster into the paid cluster
  // when they are at most 45 days apart, and quarterly gaps are 85-97 days, so
  // such a pair is never detected at all. The guard for quarterly series
  // therefore uses the price-history flag, which the grouper does produce.
  it('2-charge quarterly series with a 20% step keeps hasPriceIncrease', () => {
    const items = byName(listed(series('ACME QUARTERLY CLUB', [1000, 1200], 91)), 'ACME QUARTERLY');
    expect(items).toHaveLength(1);
    expect(items[0].cadence).toBe('quarterly');
    expect(items[0].hasPriceIncrease).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Case 5 (guard)
// ---------------------------------------------------------------------------

describe('guard: bank fees are still listed (case 5)', () => {
  it('COMISION MANTENIMIENTO CUENTA, 4 monthly charges', () => {
    const items = listed(series('COMISION MANTENIMIENTO CUENTA', [350, 350, 350, 350], 30));
    expect(byName(items, 'MANTENIMIENTO')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Case 6 (guard)
// ---------------------------------------------------------------------------

describe('guard: person-to-person and bare tax stay listed (case 6)', () => {
  it.each([
    ['PIX ENVIADO MARIA SILVA', 'MARIA SILVA'],
    ['TIKKIE JAN', 'TIKKIE'],
    ['TO JOHN SMITH', 'JOHN SMITH'],
    ['IVA', 'IVA'],
  ])('%s as a 4-charge monthly series', (desc, needle) => {
    const items = listed(series(desc, [5000, 5000, 5000, 5000], 30));
    expect(byName(items, needle).length).toBeGreaterThanOrEqual(1);
  });
});
