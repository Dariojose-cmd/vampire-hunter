// Feature: excel-statement-support, Property 3: Numeric amount cells round-trip to cents without floating-point error
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fc from 'fast-check';
import { readWorkbook } from '../src/engine/excelReader';
import { parseCents } from '../src/engine/parser';

function bytesOf(rows: Array<Array<string | number>>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

// Integer cents up to +/- 10^13 (i.e. 100 billion units), including negatives.
const centsArb = fc.oneof(
  fc.integer({ min: -100_000, max: 100_000 }),
  fc.integer({ min: -10_000_000_000_000, max: 10_000_000_000_000 }),
);

describe('Property 3: numeric amount cells round-trip to cents', () => {
  /**
   * **Validates: Requirements 3.6, 3.8, 3.11**
   */
  it('formats with 2 decimals and parses back to exactly Math.round(v * 100)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(centsArb, { minLength: 1, maxLength: 8 }), async (centsList) => {
        const values = centsList.map((c) => c / 100);
        const rows: Array<Array<string | number>> = [
          ['Description', 'Amount'],
          ...values.map((v, i): [string, number] => [`ROW${i}`, v]),
        ];
        const res = await readWorkbook(bytesOf(rows));
        expect(res.ok).toBe(true);
        if (!res.ok) return;

        const lines = res.csvText.split('\n');
        expect(lines).toHaveLength(values.length + 1);

        values.forEach((v, i) => {
          const text = lines[i + 1].split(',')[1];
          // exactly 2 decimals, dot separator, no thousands separator, no exponent
          expect(text).toMatch(/^-?\d+\.\d{2}$/);
          expect(text).not.toMatch(/[eE]/);

          const cents = parseCents(text, 'dotDecimal');
          // parseCents returns the magnitude (sign is handled by the debit/credit logic),
          // so the sign is checked on the text and the magnitude on the cents.
          expect(text.startsWith('-')).toBe(v < 0);
          expect(cents).toBe(Math.abs(Math.round(v * 100)));
          expect(cents).toBe(Math.abs(centsList[i]));

          // Same value written without the 2-decimal formatting parses identically.
          expect(parseCents(String(v), 'dotDecimal')).toBe(cents);
        });
      }),
      { numRuns: 100 },
    );
  });
});
