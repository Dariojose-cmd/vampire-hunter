/**
 * Encoding (UTF-8 / windows-1252), rates note and burn/toast tests.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { decodeCsvBytes, parseCsvText } from '@components/csvUtils';
import { parseStatement } from '../src/engine/index';
import { CurrencySelector } from '@components/CurrencySelector';
import { formatRatesDate } from '@components/format';
import { BurnOverlay } from '@components/BurnOverlay';
import exchangeRates from '../src/data/exchangeRates.json';

afterEach(() => {
  cleanup();
});

const fixture = readFileSync(resolve(__dirname, 'fixtures/encoding/panaderia-windows1252.csv'));

describe('decodeCsvBytes', () => {
  it('fixture is really windows-1252 (invalid UTF-8)', () => {
    expect(fixture.includes(0xcd)).toBe(true);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(fixture)).toThrow();
  });

  it('falls back to windows-1252 and keeps accents', () => {
    const text = decodeCsvBytes(fixture);
    expect(text).toContain('PANADERÍA');
    expect(text).toContain('Débito');
  });

  it('keeps accents in the parsed merchant name', () => {
    const { headers, rows } = parseCsvText(decodeCsvBytes(fixture));
    const parsed = parseStatement(headers, rows);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const names = JSON.stringify(parsed.value);
      expect(names).toContain('PANADERÍA');
      expect(names).not.toContain('\uFFFD');
    }
  });

  it('passes UTF-8 through and strips a BOM', () => {
    const utf8 = new TextEncoder().encode('Descripción,PANADERÍA');
    expect(decodeCsvBytes(utf8)).toBe('Descripción,PANADERÍA');
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodeCsvBytes(withBom)).toBe('Descripción,PANADERÍA');
  });
});

describe('CurrencySelector rates note', () => {
  it('formats the date per language', () => {
    expect(formatRatesDate('2025-01-15', 'en')).toBe('January 15, 2025');
    expect(formatRatesDate('2025-01-15', 'es')).toMatch(/15 de enero de 2025/);
  });

  it('shows the approximate-rates note in EN and ES', () => {
    expect(exchangeRates.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    render(<CurrencySelector language="en" currency="USD" onChange={() => {}} />);
    expect(screen.getByText(/Approximate rates as of January 15, 2025/)).toBeTruthy();
    cleanup();
    render(<CurrencySelector language="es" currency="USD" onChange={() => {}} />);
    expect(screen.getByText(/Tasas aproximadas al 15 de enero de 2025/)).toBeTruthy();
  });
});

describe('BurnOverlay marks the body while visible', () => {
  it('sets and clears data-burning; toast CSS hides itself', () => {
    const { unmount } = render(<BurnOverlay onComplete={() => {}} />);
    expect(document.body.dataset.burning).toBe('true');
    unmount();
    expect(document.body.dataset.burning).toBeUndefined();
    const css = readFileSync(resolve(__dirname, '../src/components/GarlicToast.module.css'), 'utf8');
    expect(css).toMatch(/body\[data-burning\]\)\s*\.toast\s*\{\s*display:\s*none/);
  });
});
