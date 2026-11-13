/**
 * SamplePicker error handling tests (spec privacy-you-can-verify, task 11.12).
 *
 * Validates: Requirements 2.7, 2.8, 12.7
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SamplePicker } from '@components/SamplePicker';
import { Uploader } from '@components/Uploader';
import type { Language, TranslationKey } from '@i18n/index';
import enJson from '../src/i18n/en.json';
import esJson from '../src/i18n/es.json';

const CRYPT_KEY = 'vampire-hunter:crypt';
const CRYPT_VALUE = JSON.stringify({ decisions: { netflix: 'stake' }, note: 'ünïcode ✓' });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CRYPT_KEY, CRYPT_VALUE);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const failures: Array<[string, () => Promise<unknown>]> = [
  ['rejected fetch', () => Promise.reject(new TypeError('Failed to fetch'))],
  ['404 response', () => Promise.resolve(new Response('nope', { status: 404 }))],
];

describe('SamplePicker failures', () => {
  it.each(failures)('%s calls onError, never onPick, and leaves localStorage untouched', async (_n, impl) => {
    vi.stubGlobal('fetch', vi.fn(impl));
    const onPick = vi.fn();
    const onError = vi.fn();
    render(<SamplePicker language="en" onPick={onPick} onClose={() => {}} onError={onError} />);

    await userEvent.click(screen.getByRole('button', { name: /US Bank/ }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('errors.assetUnavailableOffline'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    expect(localStorage.getItem(CRYPT_KEY)).toBe(CRYPT_VALUE);
  });

  it('a successful fetch calls onPick with the filename and text', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('a,b\n1,2', { status: 200 }))));
    const onPick = vi.fn();
    const onError = vi.fn();
    render(<SamplePicker language="en" onPick={onPick} onClose={() => {}} onError={onError} />);

    await userEvent.click(screen.getByRole('button', { name: /US Bank/ }));

    await waitFor(() => expect(onPick).toHaveBeenCalledWith('us-bank-usd.csv', 'a,b\n1,2'));
    expect(onError).not.toHaveBeenCalled();
  });
});

function Harness({ language }: { language: Language }) {
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  return (
    <Uploader
      language={language}
      errorKey={errorKey}
      onCsv={() => {}}
      onSampleError={(k) => setErrorKey(k)}
    />
  );
}

describe('Uploader sample error display', () => {
  it.each(failures)('%s renders the localized message in en and es', async (_n, impl) => {
    const cases: Array<[Language, string, string]> = [
      ['en', enJson.upload.trySampleButton, enJson.errors.assetUnavailableOffline],
      ['es', esJson.upload.trySampleButton, esJson.errors.assetUnavailableOffline],
    ];
    for (const [lang, buttonLabel, expected] of cases) {
      vi.stubGlobal('fetch', vi.fn(impl));
      const { unmount } = render(<Harness language={lang} />);

      await userEvent.click(screen.getByRole('button', { name: buttonLabel }));
      const dialog = await screen.findByRole('dialog');
      const first = dialog.querySelector('button') as HTMLButtonElement;
      await userEvent.click(first);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain(expected);
      expect(localStorage.getItem(CRYPT_KEY)).toBe(CRYPT_VALUE);
      unmount();
    }
  });
});
