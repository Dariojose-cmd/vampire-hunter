import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

function build(bookType: 'xlsx' | 'biff8'): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Date', 'Description', 'Amount'],
    ['2024-01-05', 'NETFLIX', -15.49],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer | Uint8Array;
  const u8 = out instanceof Uint8Array ? out : new Uint8Array(out);
  return u8.slice().buffer;
}

afterEach(() => {
  vi.doUnmock('xlsx');
  vi.resetModules();
});

describe('readWorkbook: corrupt workbook', () => {
  it('reads a valid xlsx and xls (sanity)', async () => {
    const { readWorkbook } = await import('../src/engine/excelReader');
    expect((await readWorkbook(build('xlsx'))).ok).toBe(true);
    expect((await readWorkbook(build('biff8'))).ok).toBe(true);
  });

  it.each(['xlsx', 'biff8'] as const)('truncated %s returns ok:false', async (type) => {
    const { readWorkbook } = await import('../src/engine/excelReader');
    const full = build(type);
    const cut = full.slice(0, Math.floor(full.byteLength / 3));
    const r = await readWorkbook(cut);
    expect(r.ok).toBe(false);
  });

  it('random bytes and tiny buffers return ok:false', async () => {
    const { readWorkbook } = await import('../src/engine/excelReader');
    const rnd = new Uint8Array(512).map((_, i) => (i * 37 + 11) % 256);
    rnd[0] = 0x01;
    expect((await readWorkbook(rnd.buffer)).ok).toBe(false);
    expect((await readWorkbook(new ArrayBuffer(4))).ok).toBe(false);
    expect((await readWorkbook(new ArrayBuffer(0))).ok).toBe(false);
  });
});

describe('readWorkbook: failed dynamic import', () => {
  it('factory that throws resolves to ok:false', async () => {
    const bytes = build('xlsx');
    vi.resetModules();
    vi.doMock('xlsx', () => {
      throw new Error('chunk load failed');
    });
    const { readWorkbook } = await import('../src/engine/excelReader');
    await expect(readWorkbook(bytes)).resolves.toMatchObject({ ok: false });
  });

  it('async-rejecting factory resolves to ok:false', async () => {
    const bytes = build('xlsx');
    vi.resetModules();
    vi.doMock('xlsx', async () => {
      await Promise.resolve();
      throw new Error('chunk load failed');
    });
    const { readWorkbook } = await import('../src/engine/excelReader');
    await expect(readWorkbook(bytes)).resolves.toMatchObject({ ok: false });
  });
});
