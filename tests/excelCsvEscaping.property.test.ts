import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../src/engine/excelReader';
import { parseCsvText } from '../src/components/csvUtils';

/**
 * Feature: excel-statement-support
 * Property 5: Special characters in Excel text cells survive a CSV round trip
 * **Validates: Requirements 3.9**
 *
 * Generator notes: strings are non-empty and start and end with a letter, so
 * leading/trailing whitespace handling (an XML/SheetJS concern, not ours) is
 * not under test. Cells are written with explicit t:'s', so numeric-looking
 * text is not a concern either. Commas, double quotes and \n appear freely
 * in the middle.
 *
 * Known SheetJS behavior (not a bug in our code): reading an .xlsx normalizes
 * "\r\n" in a cell to "\n" (XML line-ending normalization) before
 * readWorkbook sees it. Verified in isolation: XLSX.write then XLSX.read of
 * 'a\r\nb' yields 'a\nb'. So \r\n is excluded from the generator. Our
 * csvField quoting and Papa Parse both preserve \r\n inside quoted fields.
 */

const middle = fc.array(
  fc.constantFrom(',', '"', '\n', 'a', 'b', 'Z', '1', ' ', '-', ';', "'"),
  { maxLength: 12 },
);
const letter = fc.constantFrom('a', 'N', 'x', 'Q');

const specialText = fc
  .tuple(letter, middle, letter)
  .map(([a, mid, b]) => a + mid.join('') + b);

function bytesWithDescription(text: string): ArrayBuffer {
  const aoa: Array<Array<string | number>> = [
    ['Date', 'Description', 'Amount'],
    ['2024-01-15', 'PLACEHOLDER', -9.99],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['B2'] = { t: 's', v: text };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('Property 5: special characters in Excel text cells survive a CSV round trip', () => {
  it('Description cell equals the original string after readWorkbook + parseCsvText', async () => {
    await fc.assert(
      fc.asyncProperty(specialText, async (text) => {
        const res = await readWorkbook(bytesWithDescription(text));
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const { headers, rows } = parseCsvText(res.csvText);
        expect(headers).toEqual(['Date', 'Description', 'Amount']);
        expect(rows).toHaveLength(1);
        expect(rows[0][1]).toBe(text);
        expect(rows[0][0]).toBe('2024-01-15');
        expect(rows[0]).toHaveLength(3);
      }),
      { numRuns: 100 },
    );
  });
});
