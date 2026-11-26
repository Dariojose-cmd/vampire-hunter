/**
 * One-off: dump the golden detection baseline to tests/baselines/detectionOutput.json.
 * Runs the real engine over samples/*.csv and tests/fixtures/banks/*.csv.
 * Offline; reads local files and writes one local file.
 *
 * Usage: npx tsx scripts/dumpBaseline.ts
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsvText } from '../src/components/csvUtils';
import { parseStatement, runDetection } from '../src/engine/index';
import type { Vampire } from '../src/engine/types';

const ROOT = process.cwd();
const DIRS = ['samples', 'tests/fixtures/banks'];

function item(v: Vampire) {
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

const out: Record<string, unknown> = {};
for (const dir of DIRS) {
  const files = readdirSync(resolve(ROOT, dir))
    .filter((f) => f.endsWith('.csv'))
    .sort();
  for (const f of files) {
    const text = readFileSync(resolve(ROOT, dir, f), 'utf-8').replace(/^\uFEFF/, '');
    const { headers, rows } = parseCsvText(text);
    const parsed = parseStatement(headers, rows);
    if (!parsed.ok) throw new Error(`parse failed: ${dir}/${f}`);
    const { transactions, currency } = parsed.value;
    const r = runDetection({ transactions, currency });
    out[`${dir}/${f}`] = {
      vampires: r.vampires.map(item),
      possibleVampires: r.possibleVampires.map(item),
    };
  }
}
writeFileSync(
  resolve(ROOT, 'tests/baselines/detectionOutput.json'),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(`wrote ${Object.keys(out).length} entries`);
