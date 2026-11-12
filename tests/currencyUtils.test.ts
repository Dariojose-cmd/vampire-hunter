/**
 * Unit tests for src/engine/currencyUtils.ts
 *
 * Covers `inferCurrency(amountColumn, headerRow)`:
 *  - bare `$` value → USD
 *  - `€` symbol → EUR
 *  - explicit ISO code in a header cell → that code (e.g. MXN)
 *  - explicit ISO code in a value → that code
 *  - `$` with no other locale signal → USD
 *  - a non-`$` symbol (R$/S//£/¥/₩) wins over a bare `$`
 *  - nothing detected → USD default
 *
 * NOTE: `inferCurrency` only infers an ISO 4217 code from signals; it does NOT
 * perform rate conversion. The "threshold conversion / fallback rate 1.0"
 * behaviour referenced by spec task 13.17 lives in `threatLevelFromCents`
 * (covered in tests/profileBuilder.test.ts) and is intentionally NOT duplicated
 * here — this file stays focused on `inferCurrency`.
 */

import { describe, expect, it } from 'vitest';
import { inferCurrency, inferCurrencyDetailed } from '../src/engine/currencyUtils';

describe('inferCurrency', () => {
  it('detects USD from a bare `$` value', () => {
    expect(inferCurrency(['$12.99', '$4.99'], ['Date', 'Description', 'Amount'])).toBe(
      'USD',
    );
  });

  it('detects EUR from a `€` symbol', () => {
    expect(inferCurrency(['€12,99', '€4,99'], ['Fecha', 'Concepto', 'Importe'])).toBe(
      'EUR',
    );
  });

  it('detects MXN from an ISO code in a header cell', () => {
    expect(
      inferCurrency(['1299.00', '499.00'], ['Fecha', 'Concepto', 'Monto MXN']),
    ).toBe('MXN');
  });

  it('detects MXN from a `Moneda` value of `MXN`', () => {
    expect(
      inferCurrency(['MXN', '1299.00'], ['Fecha', 'Concepto', 'Monto', 'Moneda']),
    ).toBe('MXN');
  });

  it('detects via an explicit ISO 4217 code found in a value', () => {
    expect(inferCurrency(['100 COP', '200 COP'], ['Fecha', 'Valor'])).toBe('COP');
  });

  it('`$` with no other locale signal → USD', () => {
    expect(inferCurrency(['$1.00'], ['Amount'])).toBe('USD');
  });

  it('a non-`$` symbol (R$ → BRL) wins over a bare `$`', () => {
    // Both a BRL symbol and a bare `$` are present; the locale-specific symbol wins.
    expect(inferCurrency(['R$ 12,99', '$ 4.99'], ['Data', 'Valor'])).toBe('BRL');
  });

  it('a non-`$` symbol (S/ → PEN) wins over a bare `$`', () => {
    expect(inferCurrency(['S/ 12.90', '$ 4.99'], ['Fecha', 'Monto'])).toBe('PEN');
  });

  it('a non-`$` symbol (£ → GBP) wins over a bare `$`', () => {
    expect(inferCurrency(['£12.99', '$4.99'], ['Date', 'Amount'])).toBe('GBP');
  });

  it('a non-`$` symbol (¥ → JPY) wins over a bare `$`', () => {
    expect(inferCurrency(['¥1200', '$4.99'], ['Date', 'Amount'])).toBe('JPY');
  });

  it('a non-`$` symbol (₩ → KRW) wins over a bare `$`', () => {
    expect(inferCurrency(['₩12000', '$4.99'], ['Date', 'Amount'])).toBe('KRW');
  });

  it('nothing detected → USD default', () => {
    expect(inferCurrency(['12.99', '4.99'], ['Date', 'Description', 'Amount'])).toBe(
      'USD',
    );
  });

  it('empty inputs → USD default (never throws)', () => {
    expect(inferCurrency([], [])).toBe('USD');
  });
});

describe('inferCurrency locale heuristics', () => {
  it('does not flip a US statement with a Sao Paulo merchant to BRL', () => {
    expect(inferCurrency(['12.50', '8.00'], ['Date', 'Description', 'Amount'], ['SÃO PAULO CAFE'])).toBe('USD');
  });
  it('does not treat generic "Data"/"Categoria" headers as Portuguese', () => {
    expect(inferCurrency(['12.50'], ['Data', 'Categoria', 'Amount'])).toBe('USD');
  });
  it('detects BRL from unambiguous Portuguese headers', () => {
    expect(inferCurrency(['12,50'], ['Data', 'Descrição', 'Valor'])).toBe('BRL');
  });
  it('detects BRL from "pagamento recebido" text', () => {
    expect(inferCurrency(['12,50'], ['a', 'b'], ['Pagamento recebido'])).toBe('BRL');
  });
  it('lets an explicit symbol outrank Portuguese signals', () => {
    expect(inferCurrency(['€12,50'], ['Descrição'])).toBe('EUR');
  });
});

describe('inferCurrencyDetailed', () => {
  it('reports detected=false only for the no-signal USD fallback', () => {
    expect(inferCurrencyDetailed(['12.99'], ['Date', 'Description', 'Amount'])).toEqual({
      currency: 'USD',
      detected: false,
    });
  });

  it('treats a bare $ as detected USD', () => {
    expect(inferCurrencyDetailed(['$12.99'], ['Date', 'Amount'])).toEqual({
      currency: 'USD',
      detected: true,
    });
  });

  it('reports detected=true for an explicit ISO code', () => {
    expect(inferCurrencyDetailed(['GBP'], ['Currency'])).toEqual({
      currency: 'GBP',
      detected: true,
    });
  });
});
