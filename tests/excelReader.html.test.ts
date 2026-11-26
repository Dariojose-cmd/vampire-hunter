/**
 * Many banks (common in Latin America) download an HTML page with a .xls
 * extension. Found with a real Ecuadorian bank export on Nov 25, 2026
 * ("HTML document, UTF-8, CRLF", starts with "<!DO"): readWorkbook rejected it.
 * These fixtures are synthetic, built to match that shape.
 */
import { describe, it, expect } from 'vitest';
import { readWorkbook } from '../src/engine/excelReader';
import { locateHeader } from '../src/engine/headerLocator';
import { parseStatement, runDetection } from '../src/engine/index';
import { parseCsvText } from '../src/components/csvUtils';

const enc = (s: string, bom = false) => {
  const u8 = new TextEncoder().encode((bom ? '﻿' : '') + s);
  return u8.slice().buffer as ArrayBuffer;
};

function movements(amount: (v: number) => string): string {
  const rows: string[] = [];
  for (let m = 1; m <= 6; m++) {
    const mm = String(m).padStart(2, '0');
    rows.push(`<tr><td>03/${mm}/2026</td><td>PAGO NETFLIX.COM</td><td>${amount(10.99)}</td><td></td><td>500,00</td></tr>`);
    rows.push(`<tr><td>22/${mm}/2026</td><td>DÉBITO SPOTIFY</td><td>${amount(5.99)}</td><td></td><td>480,00</td></tr>`);
    rows.push(`<tr><td>1${(m % 3) + 5}/${mm}/2026</td><td>SUPERMAXI QUITO</td><td>${amount(40 + m * 7.31)}</td><td></td><td>400,00</td></tr>`);
    rows.push(`<tr><td>28/${mm}/2026</td><td>TRANSFERENCIA SUELDO</td><td></td><td>${amount(850)}</td><td>1.300,00</td></tr>`);
  }
  return rows.join('\r\n');
}

function bankPage(amount: (v: number) => string): string {
  return `<!DOCTYPE html>\r\n<html><head><meta charset="utf-8"><title>Estado de cuenta</title>
<script>document.title='x'</script></head><body>
<table><tr><td>
  <table><tr><td colspan="2">BANCO EJEMPLO S.A.</td></tr>
         <tr><td>Cuenta:</td><td>2200000000</td></tr>
         <tr><td>Período:</td><td>Octubre 2026</td></tr></table>
</td></tr><tr><td>
  <table>
    <tr><th colspan="5">MOVIMIENTOS</th></tr>
    <tr><th>Fecha</th><th>Descripción</th><th>Débito</th><th>Crédito</th><th>Saldo</th></tr>
    ${movements(amount)}
  </table>
</td></tr></table></body></html>`;
}

async function run(bytes: ArrayBuffer) {
  const r = await readWorkbook(bytes);
  if (!r.ok) throw new Error('read failed: ' + r.error.message);
  const raw = parseCsvText(r.csvText);
  const loc = locateHeader([raw.headers, ...raw.rows]);
  const p = parseStatement(loc.headers, loc.rows);
  if (!p.ok) throw new Error('parse failed: ' + JSON.stringify(p.error));
  const det = runDetection({ transactions: p.value.transactions, currency: 'USD' });
  return { csvText: r.csvText, headers: loc.headers, vampires: det.vampires.map((v) => v.displayName).sort() };
}

const comma = (v: number) => v.toFixed(2).replace('.', ',');
const dot = (v: number) => v.toFixed(2);

describe('readWorkbook: HTML page saved as .xls', () => {
  it('picks the movements table (nested layout tables) and finds only the subscriptions', async () => {
    const out = await run(enc(bankPage(comma)));
    expect(out.headers.slice(0, 5)).toEqual(['Fecha', 'Descripción', 'Débito', 'Crédito', 'Saldo']);
    expect(out.vampires).toEqual(['Netflix', 'Spotify']);
  });

  it('works with dot-decimal amounts and a UTF-8 BOM', async () => {
    const out = await run(enc(bankPage(dot), true));
    expect(out.vampires).toEqual(['Netflix', 'Spotify']);
  });

  it('decodes a Windows-1252 page (accents survive)', async () => {
    const html = bankPage(comma);
    const bytes = Uint8Array.from(html, (ch) => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 63));
    const r = await readWorkbook(bytes.slice().buffer);
    expect(r.ok && r.csvText.includes('Descripción')).toBe(true);
  });

  it('does not run scripts or keep markup in cells', async () => {
    const r = await readWorkbook(enc(bankPage(comma)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.csvText).not.toMatch(/<|document\.title/);
  });

  it('HTML without any table returns ok:false', async () => {
    const r = await readWorkbook(enc('<!DOCTYPE html><html><body><p>Sesión expirada</p></body></html>'));
    expect(r.ok).toBe(false);
  });

  it('plain text that is not HTML is still rejected', async () => {
    const r = await readWorkbook(enc('Fecha,Descripcion,Monto\n01/01/2026,X,1'));
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Yearless month-name dates ("15-oct."), same shape as the real statement:
// a summary table with "Fecha este Corte: dd-mm-yyyy", movements crossing a
// month boundary, debit/credit both filled ("0.00" in the unused one).
// ---------------------------------------------------------------------------

const MES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];

function cutPage(cut: string, movements: Array<[number, number, string, string, string]>): string {
  const rows = movements
    .map(([d, m, desc, deb, cre]) =>
      `<tr><td>${String(d).padStart(2, '0')}-${MES[m - 1]}</td><td>9999</td><td>12345678</td><td>${desc}</td><td>${deb}</td><td>${cre}</td><td>100.00</td></tr>`)
    .join('\r\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<table><tr><td>Fecha de Ultimo Corte:</td><td>15-09-2026</td><td>Razón Social:</td><td>X</td></tr>
<tr><td>Fecha este Corte:</td><td>${cut}</td><td>Cuenta:</td><td>2200000000</td></tr></table>
<table><tr><td><strong>MOVIMIENTOS</strong></td></tr>
<tr><td>FECHA</td><td>OFIC.</td><td>N.DOC.</td><td>DESCRIPCION</td><td>DEBITO</td><td>CREDITO</td><td>SALDO</td></tr>
${rows}
<tr></tr></table></body></html>`;
}

describe('readWorkbook: yearless month-name dates (real Ecuadorian layout)', () => {
  it('takes the year from "Fecha este Corte" and reads every movement', async () => {
    const r = await readWorkbook(enc(cutPage('14-11-2026', [
      [15, 10, 'PAGO NETFLIX', '10.99', '0.00'],
      [31, 10, 'SUPERMAXI', '45.20', '0.00'],
      [3, 11, 'SUELDO', '0.00', '850.00'],
      [13, 11, 'FARMACIA', '7.10', '0.00'],
    ])));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const raw = parseCsvText(r.csvText);
    const loc = locateHeader([raw.headers, ...raw.rows]);
    expect(loc.rows.filter((x) => x.some((c) => c !== '')).map((x) => x[0])).toEqual([
      '2026-10-15', '2026-10-31', '2026-11-03', '2026-11-13',
    ]);
    const p = parseStatement(loc.headers, loc.rows);
    expect(p.ok && p.value.transactions.length).toBe(4);
  });

  it('a December movement on a January statement belongs to the previous year', async () => {
    const r = await readWorkbook(enc(cutPage('14-01-2027', [
      [20, 12, 'PAGO NETFLIX', '10.99', '0.00'],
      [5, 1, 'SUPERMAXI', '45.20', '0.00'],
    ])));
    expect(r.ok && r.csvText).toContain('2026-12-20');
    expect(r.ok && r.csvText).toContain('2027-01-05');
  });

  it('month names with a year, in ES/EN/PT, are read as given', async () => {
    const { parseMonthNameDate } = await import('../src/engine/monthNameDates');
    expect(parseMonthNameDate('15-OCT-2026')).toEqual({ day: 15, month: 10, year: 2026 });
    expect(parseMonthNameDate('5 dic. 26')).toEqual({ day: 5, month: 12, year: 2026 });
    expect(parseMonthNameDate('03/Ago')).toEqual({ day: 3, month: 8, year: null });
    expect(parseMonthNameDate('9-sept.')).toEqual({ day: 9, month: 9, year: null });
    expect(parseMonthNameDate('12-dez')).toEqual({ day: 12, month: 12, year: null });
    expect(parseMonthNameDate('31-abr.')).toBeNull();
    expect(parseMonthNameDate('PAGO 15 OCT')).toBeNull();
  });
});
