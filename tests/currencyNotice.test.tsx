/**
 * Currency-not-detected notice: shown in the results view only when the CSV had
 * no currency signal (USD fallback), in EN and ES, and cleared once the user
 * picks a currency.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CRYPT_STORAGE_KEY } from '@engine/cryptStorage';
import { App } from '@components/App';

const months = ['2025-01-05', '2025-02-05', '2025-03-05', '2025-04-05', '2025-05-05'];
const NO_SIGNAL_CSV =
  'Date,Description,Amount\n' +
  months.map((d) => `${d},NETFLIX.COM,-15.49`).join('\n') +
  '\n2025-01-09,CORNER SHOP,-4.20\n';
const SIGNAL_CSV =
  'Date,Description,Amount,Currency\n' +
  months.map((d) => `${d},NETFLIX.COM,-15.49,GBP`).join('\n') +
  '\n2025-01-09,CORNER SHOP,-4.20,GBP\n';

const EN_TEXT = 'Currency not detected — showing USD. Change it here.';
const ES_TEXT = 'Moneda no detectada — mostrando USD. Cámbiala aquí.';

function upload(container: HTMLElement, csv: string) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([csv], 'statement.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('scrollTo', () => {});
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('currency not detected notice', () => {
  it('shows the EN notice for a CSV without a currency signal and hides it after changing currency', async () => {
    const { container } = render(<App />);
    upload(container, NO_SIGNAL_CSV);
    const notice = await screen.findByText(EN_TEXT);
    expect(notice.closest('[role="status"]')).not.toBeNull();

    fireEvent.change(document.getElementById('currency') as HTMLSelectElement, {
      target: { value: 'EUR' },
    });
    await waitFor(() => expect(screen.queryByText(EN_TEXT)).toBeNull());
  });

  it('shows the ES notice when the language is Spanish', async () => {
    localStorage.setItem(
      CRYPT_STORAGE_KEY,
      JSON.stringify({ decisions: {}, language: 'es', currency: 'USD' }),
    );
    const { container } = render(<App />);
    upload(container, NO_SIGNAL_CSV);
    const notice = await screen.findByText(ES_TEXT);
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });

  it('does not show the notice when the CSV carries a currency', async () => {
    const { container } = render(<App />);
    upload(container, SIGNAL_CSV);
    await waitFor(() =>
      expect((document.getElementById('currency') as HTMLSelectElement).value).toBe('GBP'),
    );
    expect(screen.queryByText(EN_TEXT)).toBeNull();
  });
});
