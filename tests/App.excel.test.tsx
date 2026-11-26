/**
 * App-level Excel / Junk_Rows tests (spec excel-statement-support, task 7.7).
 *
 * Validates: Requirements 3.14, 3.16, 9.6, 9.7
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { App } from '@components/App';
import en from '../src/i18n/en.json';

const FIXTURES = resolve(__dirname, 'fixtures/excel');

function input(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function upload(container: HTMLElement, f: File) {
  fireEvent.change(input(container), { target: { files: [f] } });
}

/** Copy bytes into a fresh Uint8Array so the File holds same-realm data. */
function bytesOf(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function xlsxFile(rows: unknown[][], name = 'x.xlsx'): File {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([new Uint8Array(out)], name);
}

/** Crypt view is showing: the upload heading is gone and a vampire name is visible. */
async function expectCrypt() {
  await waitFor(() => expect(screen.queryByText(en.upload.title)).toBeNull());
  expect((await screen.findAllByText(/netflix/i)).length).toBeGreaterThan(0);
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

describe('App with non-plausible Excel dates (Req 3.14, 3.16)', () => {
  it('does not crash and keeps the upload area usable', async () => {
    const rows = [
      ['Fecha', 'Descripcion', 'Monto'],
      [5, 'NETFLIX.COM', -15.49],
      [45292.5, 'NETFLIX.COM', -15.49],
    ];
    const { container } = render(<App />);
    upload(container, xlsxFile(rows));

    // Either the column mapper or an error message appears; both are acceptable.
    await waitFor(() => {
      const mapper = screen.queryByText(en.columnMapper.title);
      const alert = screen.queryByRole('alert');
      expect(mapper !== null || alert !== null).toBe(true);
    });

    // App is still usable: go back to the upload area if needed, then a valid CSV works.
    const back = screen.queryByRole('button', { name: en.columnMapper.cancelButton });
    if (back) fireEvent.click(back);
    await waitFor(() => expect(input(container)).not.toBeNull());
    const csv =
      'Date,Description,Amount\n2025-01-05,NETFLIX.COM,-15.49\n2025-02-05,NETFLIX.COM,-15.49\n' +
      '2025-03-05,NETFLIX.COM,-15.49\n2025-04-05,NETFLIX.COM,-15.49\n2025-01-09,CORNER SHOP,-4.20\n';
    upload(container, new File([csv], 'ok.csv', { type: 'text/csv' }));
    await expectCrypt();
  });
});

describe('App with Junk_Rows above the header (Req 9.6, 9.7)', () => {
  it('renders vampires from a CSV with title/account rows first', async () => {
    const text = readFileSync(resolve(FIXTURES, 'layout-a-serial-dates.csv'), 'utf8');
    expect(text.split('\n')[0]).toMatch(/Statement of Account/);
    const { container } = render(<App />);
    upload(container, new File([text], 'junk.csv', { type: 'text/csv' }));
    await expectCrypt();
  });

  it('renders vampires from an Excel file with title/account rows first', async () => {
    const bytes = bytesOf(resolve(FIXTURES, 'layout-a-serial-dates.xlsx'));
    const { container } = render(<App />);
    upload(container, new File([bytes], 'layout-a.xlsx'));
    await expectCrypt();
  });
});

describe('App file-type errors (EN)', () => {
  it('shows the pdfNotSupported message for a PDF', async () => {
    const { container } = render(<App />);
    upload(container, new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(en.errors.pdfNotSupported);
  });

  it('shows the fileNotCsv message for an unknown file', async () => {
    const { container } = render(<App />);
    upload(container, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(en.errors.fileNotCsv);
  });
});
