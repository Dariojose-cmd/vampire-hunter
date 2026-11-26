import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { classifyFile } from '../src/components/csvUtils';

const RECOGNIZED_EXT = new Set(['csv', 'xlsx', 'xls', 'pdf']);
const RECOGNIZED_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
]);

const alnum = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const lower = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

const baseArb = fc.array(fc.constantFrom(...alnum), { minLength: 1, maxLength: 12 }).map((c) => c.join(''));
const extArb = fc
  .array(fc.constantFrom(...alnum), { minLength: 1, maxLength: 8 })
  .map((c) => c.join(''))
  .filter((e) => !RECOGNIZED_EXT.has(e.toLowerCase()));
const mimeArb = fc
  .tuple(
    fc.array(fc.constantFrom(...lower), { minLength: 1, maxLength: 10 }).map((c) => c.join('')),
    fc.array(fc.constantFrom(...lower), { minLength: 1, maxLength: 10 }).map((c) => c.join('')),
  )
  .map(([a, b]) => `${a}/${b}`)
  .filter((m) => !RECOGNIZED_MIME.has(m));

describe('classifyFile properties', () => {
  /**
   * Feature: excel-statement-support, Property 7: Unrecognized file extensions are rejected with the generic message
   * **Validates: Requirements 4.4**
   */
  it('returns unknown for unrecognized extensions and MIME types', () => {
    fc.assert(
      fc.property(baseArb, extArb, mimeArb, (base, ext, type) => {
        const file = new File([''], `${base}.${ext}`, { type });
        return classifyFile(file) === 'unknown';
      }),
      { numRuns: 200 },
    );
  });

  it('returns unknown for unrecognized extensions with empty MIME type', () => {
    fc.assert(
      fc.property(baseArb, extArb, (base, ext) => {
        return classifyFile(new File([''], `${base}.${ext}`, { type: '' })) === 'unknown';
      }),
      { numRuns: 100 },
    );
  });
});
