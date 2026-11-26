import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../src/engine/excelReader';

/**
 * Property 6: Excel_Reader never throws on malformed input
 * **Validates: Requirements 5.2, 5.5**
 */

function build(bookType: 'xlsx' | 'biff8', rows: (string | number)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  const out = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer | Uint8Array;
  return (out instanceof Uint8Array ? out : new Uint8Array(out)).slice();
}

const rowsArb = fc.array(
  fc.tuple(
    fc.constantFrom('2024-01-05', '2024-02-05', 'Date'),
    fc.string({ maxLength: 12 }),
    fc.integer({ min: -100000, max: 100000 }),
  ),
  { minLength: 1, maxLength: 6 },
);
const typeArb = fc.constantFrom('xlsx' as const, 'biff8' as const);

function toBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.slice().buffer as ArrayBuffer;
}

function startsWith(u8: Uint8Array, magic: number[]): boolean {
  return u8.length >= magic.length && magic.every((b, i) => u8[i] === b);
}

async function expectResult(buf: ArrayBuffer): Promise<{ ok: boolean; code?: string }> {
  const r = await readWorkbook(buf);
  expect(typeof r.ok).toBe('boolean');
  return r.ok ? { ok: true } : { ok: false, code: r.error.code };
}

describe('Property 6: readWorkbook never throws on malformed input', () => {
  it('arbitrary bytes without ZIP/OLE2 signature resolve to PARSE_FAILED', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), async (bytes) => {
        fc.pre(
          !startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) &&
            !startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        );
        const r = await expectResult(toBuffer(bytes));
        expect(r).toEqual({ ok: false, code: 'PARSE_FAILED' });
      }),
      { numRuns: 100 },
    );
  });

  it('arbitrary bytes with a ZIP/OLE2 prefix always resolve to a Result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom([0x50, 0x4b, 0x03, 0x04], [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        fc.uint8Array({ maxLength: 256 }),
        async (magic, tail) => {
          const u8 = new Uint8Array([...magic, ...tail]);
          await expectResult(toBuffer(u8));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('truncated valid workbooks always resolve to a Result', async () => {
    await fc.assert(
      fc.asyncProperty(typeArb, rowsArb, fc.double({ min: 0, max: 1, noNaN: true }), async (type, rows, frac) => {
        const full = build(type, rows);
        const cut = full.slice(0, Math.floor(full.length * frac));
        await expectResult(toBuffer(cut));
      }),
      { numRuns: 100 },
    );
  });

  it('valid workbooks with randomly corrupted bytes always resolve to a Result', async () => {
    await fc.assert(
      fc.asyncProperty(
        typeArb,
        rowsArb,
        fc.array(fc.tuple(fc.double({ min: 0, max: 0.999999, noNaN: true }), fc.integer({ min: 0, max: 255 })), {
          minLength: 1,
          maxLength: 20,
        }),
        async (type, rows, edits) => {
          const u8 = build(type, rows);
          for (const [pos, val] of edits) u8[Math.floor(pos * u8.length)] = val;
          await expectResult(toBuffer(u8));
        },
      ),
      { numRuns: 100 },
    );
  });
});
