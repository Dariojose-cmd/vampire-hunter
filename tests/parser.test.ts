/**
 * Unit tests for inferNumberFormat and parseCents
 * Requirements: 1.8, 1.12
 */

import { describe, it, expect } from 'vitest';
import { inferNumberFormat, parseCents } from '../src/engine/parser';

// ---------------------------------------------------------------------------
// inferNumberFormat
// ---------------------------------------------------------------------------

describe('inferNumberFormat', () => {
  it('dot always followed by 3 digits → noDecimal', () => {
    expect(inferNumberFormat(['45.900', '12.500', '1.200.000'])).toBe('noDecimal');
  });

  it('dot=thousands, comma=decimal → commaDecimal', () => {
    expect(inferNumberFormat(['45,90', '12,50', '1.200,00'])).toBe('commaDecimal');
  });

  it('dot followed by 2 digits → dotDecimal', () => {
    expect(inferNumberFormat(['45.90', '12.50'])).toBe('dotDecimal');
  });

  it('single value with comma decimal → commaDecimal', () => {
    expect(inferNumberFormat(['1,99'])).toBe('commaDecimal');
  });

  it('single value with dot decimal → dotDecimal', () => {
    expect(inferNumberFormat(['1.99'])).toBe('dotDecimal');
  });

  it('no separators at all → noDecimal', () => {
    expect(inferNumberFormat(['100', '200', '1000'])).toBe('noDecimal');
  });

  it('empty column → noDecimal', () => {
    expect(inferNumberFormat([])).toBe('noDecimal');
  });

  it('column with only empty strings → noDecimal', () => {
    expect(inferNumberFormat(['', '   ', ''])).toBe('noDecimal');
  });

  it('mixed integers and dot-decimal → dotDecimal', () => {
    expect(inferNumberFormat(['100', '12.50', '8.99'])).toBe('dotDecimal');
  });

  it('comma thousands with dot decimal - US millions format', () => {
    expect(inferNumberFormat(['1,000.00', '2,500.99'])).toBe('dotDecimal');
  });

  it('dot thousands only, multiple groups → noDecimal', () => {
    expect(inferNumberFormat(['1.000.000', '2.500.000'])).toBe('noDecimal');
  });

  it('comma thousands only, multiple groups → noDecimal', () => {
    expect(inferNumberFormat(['1,000,000', '2,500,000'])).toBe('noDecimal');
  });

  it('ignores currency symbols when inferring', () => {
    expect(inferNumberFormat(['$45.90', 'USD 12.50'])).toBe('dotDecimal');
  });
});

// ---------------------------------------------------------------------------
// parseCents
// ---------------------------------------------------------------------------

describe('parseCents', () => {
  // dotDecimal
  it('dotDecimal: simple value', () => {
    expect(parseCents('12.50', 'dotDecimal')).toBe(1250);
  });

  it('dotDecimal: with comma thousands separator', () => {
    expect(parseCents('1,299.99', 'dotDecimal')).toBe(129999);
  });

  it('dotDecimal: integer (no decimal part)', () => {
    expect(parseCents('100', 'dotDecimal')).toBe(10000);
  });

  it('dotDecimal: strips $ symbol', () => {
    expect(parseCents('$1,299.99', 'dotDecimal')).toBe(129999);
  });

  it('dotDecimal: strips USD code', () => {
    expect(parseCents('USD 45.90', 'dotDecimal')).toBe(4590);
  });

  it('dotDecimal: returns absolute value for negative strings', () => {
    expect(parseCents('-45.90', 'dotDecimal')).toBe(4590);
  });

  it('dotDecimal: strips whitespace', () => {
    expect(parseCents('  12.50  ', 'dotDecimal')).toBe(1250);
  });

  // commaDecimal
  it('commaDecimal: simple value', () => {
    expect(parseCents('12,50', 'commaDecimal')).toBe(1250);
  });

  it('commaDecimal: with dot thousands separator', () => {
    expect(parseCents('1.200,00', 'commaDecimal')).toBe(120000);
  });

  it('commaDecimal: strips R$ symbol', () => {
    expect(parseCents('R$45,90', 'commaDecimal')).toBe(4590);
  });

  it('commaDecimal: strips BRL code', () => {
    expect(parseCents('BRL 1.200,00', 'commaDecimal')).toBe(120000);
  });

  it('commaDecimal: strips COP code', () => {
    expect(parseCents('COP 45,90', 'commaDecimal')).toBe(4590);
  });

  it('commaDecimal: strips € symbol', () => {
    expect(parseCents('€9,99', 'commaDecimal')).toBe(999);
  });

  it('commaDecimal: returns absolute value', () => {
    expect(parseCents('-1.200,00', 'commaDecimal')).toBe(120000);
  });

  // noDecimal
  it('noDecimal: plain integer', () => {
    expect(parseCents('45900', 'noDecimal')).toBe(4590000);
  });

  it('noDecimal: dot-only thousands groups', () => {
    expect(parseCents('45.900', 'noDecimal')).toBe(4590000);
  });

  it('noDecimal: multi-group thousands', () => {
    expect(parseCents('1.200.000', 'noDecimal')).toBe(120000000);
  });

  it('noDecimal: comma-group thousands', () => {
    expect(parseCents('1,000,000', 'noDecimal')).toBe(100000000);
  });

  it('noDecimal: strips COP code', () => {
    expect(parseCents('COP 1.200.000', 'noDecimal')).toBe(120000000);
  });

  // Result is always an integer
  it('result is always an integer — dotDecimal', () => {
    expect(Number.isInteger(parseCents('3.14159', 'dotDecimal'))).toBe(true);
  });

  it('result is always an integer — commaDecimal', () => {
    expect(Number.isInteger(parseCents('3,14159', 'commaDecimal'))).toBe(true);
  });

  it('result is always an integer — noDecimal', () => {
    expect(Number.isInteger(parseCents('31415900', 'noDecimal'))).toBe(true);
  });

  // Currency symbols
  it('strips £ symbol', () => {
    expect(parseCents('£9.99', 'dotDecimal')).toBe(999);
  });

  it('strips ¥ symbol', () => {
    expect(parseCents('¥1000', 'noDecimal')).toBe(100000);
  });

  it('strips ₩ symbol', () => {
    expect(parseCents('₩5000', 'noDecimal')).toBe(500000);
  });

  it('strips S/ symbol (PEN)', () => {
    expect(parseCents('S/45,90', 'commaDecimal')).toBe(4590);
  });

  it('strips MXN code', () => {
    expect(parseCents('MXN 99.90', 'dotDecimal')).toBe(9990);
  });

  it('strips ARS code', () => {
    expect(parseCents('ARS 1.200,00', 'commaDecimal')).toBe(120000);
  });

  it('strips CAD code', () => {
    expect(parseCents('CAD 12.50', 'dotDecimal')).toBe(1250);
  });

  it('strips GBP code', () => {
    expect(parseCents('GBP 9.99', 'dotDecimal')).toBe(999);
  });

  it('strips CLP code', () => {
    expect(parseCents('CLP 5000', 'noDecimal')).toBe(500000);
  });

  it('strips PEN code', () => {
    expect(parseCents('PEN 45,90', 'commaDecimal')).toBe(4590);
  });

  // Edge cases
  it('returns 0 for non-numeric input', () => {
    expect(parseCents('N/A', 'dotDecimal')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseCents('', 'dotDecimal')).toBe(0);
  });
});
