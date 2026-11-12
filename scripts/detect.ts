/**
 * Run a bank-statement CSV through the real detection engine and print the
 * result as JSON. Runs fully offline: reads one local file, writes to stdout.
 *
 * Usage: npx tsx scripts/detect.ts <file.csv>
 *
 * Mirrors the app's flow in src/components/App.tsx (parseCsvText ->
 * parseStatement -> runDetection). Exit code 1 on parse failure (the error is
 * still printed as JSON so callers can see which AppError code the engine hit).
 */

import { readFileSync } from 'node:fs';
import { parseCsvText } from '../src/components/csvUtils';
import { parseStatement, runDetection } from '../src/engine/index';
import type { Vampire } from '../src/engine/types';

function summarize(v: Vampire) {
  return {
    name: v.displayName,
    normalizedName: v.normalizedName,
    cadence: v.cadence,
    medianAmountCents: v.medianAmountCents,
    annualBloodLossCents: v.annualBloodLossCents,
    confidenceScore: v.confidenceScore,
    isAmountStable: v.isAmountStable,
    hasFreeTrial: v.hasFreeTrial,
    hasPriceIncrease: v.hasPriceIncrease,
    catalogMatch: v.catalogEntry?.canonicalName ?? null,
    bites: v.bites.length,
    firstBiteDate: v.firstBiteDate,
    lastBiteDate: v.lastBiteDate,
    currency: v.currency,
  };
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/detect.ts <file.csv>');
    process.exit(2);
  }

  let text: string;
  try {
    text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (e) {
    console.error(`Cannot read ${file}: ${(e as Error).message}`);
    process.exit(2);
  }

  const { headers, rows } = parseCsvText(text);
  const parsed = parseStatement(headers, rows);

  if (!parsed.ok) {
    console.log(JSON.stringify({ file, ok: false, error: parsed.error }, null, 2));
    process.exit(1);
  }

  const { transactions, skipped, layout, currency } = parsed.value;
  const result = runDetection({ transactions, currency });

  console.log(
    JSON.stringify(
      {
        file,
        ok: true,
        currency,
        layout: layout.type,
        transactions: transactions.length,
        skippedRows: skipped,
        vampires: result.vampires.map(summarize),
        possibleVampires: result.possibleVampires.map(summarize),
      },
      null,
      2,
    ),
  );
}

main();
