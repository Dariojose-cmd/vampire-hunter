/**
 * Preservation: the 5 in-app samples (public/samples/*.csv) keep exactly the
 * vampire ids captured on the unfixed engine (tests/baselines/inAppSamples.vampireIds.json).
 * possibleIds are diagnostic only and are not asserted.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseCsvText } from '../src/components/csvUtils';
import { parseStatement, runDetection } from '../src/engine/index';

interface Baseline {
  vampireIds: string[];
  possibleIds: string[];
}

const baseline = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/baselines/inAppSamples.vampireIds.json'), 'utf-8'),
) as Record<string, Baseline>;

describe('in-app samples preservation', () => {
  it.each(Object.keys(baseline))('%s yields the baseline vampire ids', (file) => {
    const text = readFileSync(resolve(process.cwd(), 'public/samples', file), 'utf-8').replace(
      /^\uFEFF/,
      '',
    );
    const { headers, rows } = parseCsvText(text);
    const parsed = parseStatement(headers, rows);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    const result = runDetection({
      transactions: parsed.value.transactions,
      currency: parsed.value.currency,
    });
    expect(result.vampires.map((v) => v.id).sort()).toEqual(baseline[file].vampireIds);
  });
});
