import { describe, it, expect } from 'vitest';
import { parseStatement } from '../src/engine/index';

const headers = ['Date', 'Description', 'Amount'];

describe('parseStatement currencyDetected', () => {
  it('is false when nothing signals a currency', () => {
    const r = parseStatement(headers, [['2025-01-05', 'NETFLIX', '-15.49']]);
    expect(r.ok && r.value.currencyDetected).toBe(false);
    expect(r.ok && r.value.currency).toBe('USD');
  });

  it('is true for a bare $', () => {
    const r = parseStatement(headers, [['2025-01-05', 'NETFLIX', '-$15.49']]);
    expect(r.ok && r.value.currencyDetected).toBe(true);
  });

  it('is true for a dedicated currency column', () => {
    const r = parseStatement([...headers, 'Currency'], [['2025-01-05', 'NETFLIX', '-15.49', 'GBP']]);
    expect(r.ok && r.value.currency).toBe('GBP');
    expect(r.ok && r.value.currencyDetected).toBe(true);
  });
});
