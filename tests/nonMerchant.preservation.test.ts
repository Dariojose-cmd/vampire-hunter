/**
 * Preservation (Property 2) for the non-merchant false-positives fix.
 * Written and run against the UNFIXED engine; must pass before and after the fix.
 *
 * - Golden: tests/baselines/detectionOutput.json (recorded from the unfixed engine
 *   with scripts/dumpBaseline.ts) for the 5 in-app samples and 14 bank fixtures.
 * - Exclusion scan: the proposed NON_MERCHANT_RE (local copy, see design.md) matches
 *   exactly 8 known descriptions across those 19 CSVs. If this fails, ask the user;
 *   never edit the golden to make it pass.
 * - Look-alikes are not matched; PIX / Tikkie / "TO person" / bare IVA stay detected.
 * - Property: for clean merchants the output equals the pre-fix algorithm (oracle).
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { parseCsvText } from '../src/components/csvUtils';
import { parseStatement, runDetection, VAMPIRE_THRESHOLD } from '../src/engine/index';
import { normalize, normalizeForDisplay } from '../src/engine/normalizer';
import { buildCandidates } from '../src/engine/grouper';
import { detectCadence, detectFreeTrial } from '../src/engine/cadenceDetector';
import { matchCatalog } from '../src/engine/catalogMatcher';
import { computeScore } from '../src/engine/scorer';
import { isNonMerchant } from '../src/engine/nonMerchant';
import type { CatalogEntry, Transaction } from '../src/engine/types';
import catalogJson from '../src/data/catalog.json';

const matchesNonMerchant = isNonMerchant;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ROOT = process.cwd();
const DIRS = ['samples', 'tests/fixtures/banks'];

const files: string[] = DIRS.flatMap((dir) =>
  readdirSync(resolve(ROOT, dir))
    .filter((f) => f.endsWith('.csv'))
    .sort()
    .map((f) => `${dir}/${f}`),
);

function parseFile(rel: string) {
  const text = readFileSync(resolve(ROOT, rel), 'utf-8').replace(/^\uFEFF/, '');
  const { headers, rows } = parseCsvText(text);
  const parsed = parseStatement(headers, rows);
  if (!parsed.ok) throw new Error(`parse failed: ${rel}`);
  return parsed.value;
}

interface GoldenItem {
  id: string;
  displayName: string;
  cadence: string;
  medianAmountCents: number;
  confidenceScore: number;
  bites: number;
  hasPriceIncrease: boolean;
  hasFreeTrial: boolean;
}
interface GoldenEntry {
  vampires: GoldenItem[];
  possibleVampires: GoldenItem[];
}

const golden = JSON.parse(
  readFileSync(resolve(ROOT, 'tests/baselines/detectionOutput.json'), 'utf-8'),
) as Record<string, GoldenEntry>;

/** Drop badge flags only for thin series that are not quarterly/yearly. */
function comparable(item: GoldenItem): Partial<GoldenItem> {
  const thin = item.bites < 3 && item.cadence !== 'quarterly' && item.cadence !== 'yearly';
  if (!thin) return item;
  const { hasPriceIncrease: _p, hasFreeTrial: _f, ...rest } = item;
  void _p;
  void _f;
  return rest;
}

function toGoldenItem(v: {
  id: string;
  displayName: string;
  cadence: string;
  medianAmountCents: number;
  confidenceScore: number;
  bites: unknown[];
  hasPriceIncrease: boolean;
  hasFreeTrial: boolean;
}): GoldenItem {
  return {
    id: v.id,
    displayName: v.displayName,
    cadence: v.cadence,
    medianAmountCents: v.medianAmountCents,
    confidenceScore: v.confidenceScore,
    bites: v.bites.length,
    hasPriceIncrease: v.hasPriceIncrease,
    hasFreeTrial: v.hasFreeTrial,
  };
}

/** Build `count` monthly debits of a constant amount, on the 15th. */
function monthlySeries(description: string, count: number, amountCents = 2500): Transaction[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    date: new Date(Date.UTC(2023, i, 15)).toISOString().slice(0, 10),
    description,
    normalizedName: '',
    amountCents,
    type: 'debit' as const,
    currency: 'USD',
  }));
}

// ---------------------------------------------------------------------------
// 1. Golden
// ---------------------------------------------------------------------------
describe('golden detection output (19 CSVs)', () => {
  it('covers 5 samples and 14 bank fixtures', () => {
    expect(files).toHaveLength(19);
    expect(Object.keys(golden).sort()).toEqual([...files].sort());
  });

  it.each(files)('%s matches the golden baseline', (rel) => {
    const { transactions, currency } = parseFile(rel);
    const r = runDetection({ transactions, currency });
    const actual = {
      vampires: r.vampires.map((v) => comparable(toGoldenItem(v))),
      possibleVampires: r.possibleVampires.map((v) => comparable(toGoldenItem(v))),
    };
    const expected = {
      vampires: golden[rel].vampires.map(comparable),
      possibleVampires: golden[rel].possibleVampires.map(comparable),
    };
    expect(actual).toEqual(expected);
  });

  it('keeps COSTCO ANNUAL MEMBERSHIP (yearly, 2 bites, price increase, score 80) in amex-us fixtures', () => {
    for (const rel of ['tests/fixtures/banks/amex-us.csv', 'tests/fixtures/banks/amex-us-probe.csv']) {
      const { transactions, currency } = parseFile(rel);
      const r = runDetection({ transactions, currency });
      const costco = [...r.vampires, ...r.possibleVampires].find((v) =>
        v.id.startsWith('COSTCO ANNUAL MEMBERSHIP'),
      );
      expect(costco, rel).toBeDefined();
      expect(costco?.cadence).toBe('yearly');
      expect(costco?.bites.length).toBe(2);
      expect(costco?.hasPriceIncrease).toBe(true);
      expect(costco?.confidenceScore).toBe(80);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Exclusion scan
// ---------------------------------------------------------------------------
describe('exclusion list scan', () => {
  const KNOWN = [
    'RETIRO CAJERO AUTOMATICO',
    'TRANSFERENCIA RECIBIDA FAMILIAR',
    'TRANSFERENCIA ENVIADA ARRIENDO',
    'TRANSFERENCIA ENVIADA AMIGO',
    'TRANSFERENCIA ENVIADA RENTA',
    'TRANSFERENCIA A NEQUI',
    'SAQUE ATM 24H',
    'ATM Withdrawal',
  ];

  it('matches exactly the 8 known descriptions across the 19 CSVs', () => {
    const hits = new Set<string>();
    for (const rel of files) {
      for (const t of parseFile(rel).transactions) {
        if (matchesNonMerchant(t.description)) hits.add(t.description.trim());
      }
    }
    expect([...hits].sort()).toEqual([...KNOWN].sort());
  });

  it('never matches a description that is in the golden vampire / possible lists', () => {
    for (const rel of files) {
      const { transactions } = parseFile(rel);
      const byDesc = new Map(transactions.map((t) => [t.description.trim(), t]));
      const { currency } = parseFile(rel);
      const r = runDetection({ transactions, currency });
      for (const v of [...r.vampires, ...r.possibleVampires]) {
        for (const b of v.bites) {
          expect(matchesNonMerchant(b.description), `${rel}: ${b.description}`).toBe(false);
        }
      }
      expect(byDesc.size).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Look-alikes
// ---------------------------------------------------------------------------
describe('look-alikes are not non-merchant', () => {
  it.each([
    'COMISION',
    'MANTENIMIENTO',
    'TARIFA CESTA SERVICOS',
    'NETFLIX PRESENTE CARTAO',
    'PAGO PSE SMART FIT',
    'PAGO CLARO COLOMBIA',
    'PIX ENVIADO MARIA SILVA',
    'TO JOHN SMITH',
    'TIKKIE JAN',
    'TRANSFERWISE',
    'IVA',
    'IMPUESTO',
  ])('%s does not match', (d) => {
    expect(matchesNonMerchant(d)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Still detected (ids, cadence, score observed on the unfixed engine)
// ---------------------------------------------------------------------------
describe('person-to-person and bare tax descriptions stay detected', () => {
  it.each([
    ['PIX ENVIADO MARIA SILVA', 'PIX ENVIADO MARIA SILVA_0'],
    ['TIKKIE JAN', 'TIKKIE JAN_0'],
    ['TO JOHN SMITH', 'TO JOHN SMITH_0'],
    ['IVA', 'IVA_0'],
  ])('%s as a 4-charge monthly series is listed', (desc, id) => {
    const r = runDetection({ transactions: monthlySeries(desc, 4), currency: 'USD' });
    const all = [...r.vampires, ...r.possibleVampires];
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(id);
    expect(all[0].cadence).toBe('monthly');
    expect(all[0].confidenceScore).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// 5. Property: clean merchants match the pre-fix algorithm (oracle)
// ---------------------------------------------------------------------------
const CATALOG = catalogJson as CatalogEntry[];

/** Pre-fix pipeline, kept verbatim as the oracle. */
function oracle(transactions: Transaction[]) {
  const debits = transactions.filter((t) => t.type !== 'credit');
  const normalized = debits.map((t) => ({ ...t, normalizedName: normalize(t.description) }));
  const out: ReturnType<typeof toGoldenItem>[] = [];
  for (const { id, candidate } of buildCandidates(normalized)) {
    const cadence = detectCadence(candidate.bites.map((b) => b.date));
    if (cadence === null) continue;
    const match = matchCatalog(candidate.normalizedName, CATALOG);
    const hasFreeTrial = detectFreeTrial(candidate.bites, candidate.medianAmountCents);
    let score = computeScore(
      {
        normalizedName: candidate.normalizedName,
        bites: candidate.bites,
        cadence,
        medianAmountCents: candidate.medianAmountCents,
        isAmountStable: candidate.isAmountStable,
        hasFreeTrial,
        hasPriceIncrease: candidate.hasPriceIncrease,
        amountHistory: candidate.amountHistory,
      },
      match !== undefined,
    );
    if (candidate.bites.length === 2 && match === undefined) {
      score = Math.min(score, VAMPIRE_THRESHOLD - 1);
    }
    if (score <= 0) continue;
    out.push({
      id,
      displayName: match
        ? match.canonicalName
        : normalizeForDisplay(candidate.bites[0].description) || candidate.normalizedName,
      cadence,
      medianAmountCents: candidate.medianAmountCents,
      confidenceScore: score,
      bites: candidate.bites.length,
      hasPriceIncrease: candidate.hasPriceIncrease,
      hasFreeTrial,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const merchantName = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{3,8}$/),
    fc.option(fc.stringMatching(/^[A-Z]{3,8}$/), { nil: undefined }),
    fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  )
  .map(([a, b, n]) => [a, b, n].filter((x) => x !== undefined).join(' '))
  .filter((n) => !matchesNonMerchant(n));

describe('property: clean merchant series equal the pre-fix algorithm', () => {
  it('monthly constant-amount series (3-12 charges) are unchanged', () => {
    fc.assert(
      fc.property(
        merchantName,
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 100, max: 50_000 }),
        (name, count, cents) => {
          const tx = monthlySeries(name, count, cents);
          const r = runDetection({ transactions: tx, currency: 'USD' });
          const actual = [...r.vampires, ...r.possibleVampires]
            .map(toGoldenItem)
            .sort((a, b) => a.id.localeCompare(b.id));
          expect(actual).toEqual(oracle(tx));
        },
      ),
      { numRuns: 100 },
    );
  });
});
