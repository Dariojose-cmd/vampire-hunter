/**
 * App — top-level state and view routing for Vampire Hunter.
 *
 * Owns: parsed transactions, detection result, UI language, display currency,
 * and the "possible vampires" toggle. Routes between three views:
 *   - Uploader       (no results yet)
 *   - ColumnMapper   (engine returned COLUMN_MAPPING_NEEDED or ambiguous date)
 *   - results        (detection succeeded)
 *
 * The entire pipeline runs client-side: Papa Parse → parseStatement /
 * parseWithLayout → runDetection. No transaction data is ever sent over the
 * network (Requirement 13.1).
 */

import { useState } from 'react';
import {
  parseStatement,
  parseWithLayout,
  runDetection,
} from '@engine/index';
import type {
  ColumnLayout,
  DateFormat,
  DetectionResult,
} from '@engine/types';
import { useTranslation, type Language, type TranslationKey } from '@i18n/index';
import { parseCsvText } from './csvUtils';
import { CryptAtmosphere } from './CryptAtmosphere';
import { Uploader } from './Uploader';
import { ColumnMapper } from './ColumnMapper';
import { Crypt } from './Crypt';
import styles from './App.module.css';

type View = 'upload' | 'mapper' | 'results';

/** Map an engine AppError code to a user-facing i18n key. */
function errorKeyForCode(code: string): TranslationKey {
  switch (code) {
    case 'PARSE_FAILED': return 'errors.parseFailed';
    case 'NO_VALID_ROWS': return 'errors.noValidRows';
    case 'COLUMN_MAPPING_NEEDED': return 'errors.columnMappingNeeded';
    case 'DATE_FORMAT_AMBIGUOUS': return 'errors.dateFormatAmbiguous';
    case 'STORAGE_UNAVAILABLE': return 'errors.storageUnavailable';
    default: return 'errors.generic';
  }
}

const CURRENCIES = ['USD', 'MXN', 'COP', 'ARS', 'CLP', 'EUR', 'BRL', 'GBP', 'CAD', 'PEN'];

export function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [currency, setCurrency] = useState<string>('USD');
  const [view, setView] = useState<View>('upload');
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const [result, setResult] = useState<DetectionResult | null>(null);

  // Held while the user is in the ColumnMapper, so we can re-parse on confirm.
  const [pendingCsv, setPendingCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [dateAmbiguous, setDateAmbiguous] = useState(false);

  const { t } = useTranslation(language);

  function reset() {
    setResult(null);
    setPendingCsv(null);
    setDateAmbiguous(false);
    setErrorKey(null);
    setView('upload');
  }

  /** Entry point from Uploader / SamplePicker: raw CSV text. */
  function handleCsv(_sourceName: string, csvText: string) {
    setErrorKey(null);

    if (csvText.trim() === '') {
      setErrorKey('errors.fileNotCsv');
      return;
    }

    const { headers, rows } = parseCsvText(csvText);
    const parsed = parseStatement(headers, rows);

    if (!parsed.ok) {
      const code = parsed.error.code;
      if (code === 'COLUMN_MAPPING_NEEDED' || code === 'DATE_FORMAT_AMBIGUOUS') {
        setPendingCsv({ headers, rows });
        setDateAmbiguous(code === 'DATE_FORMAT_AMBIGUOUS');
        setView('mapper');
        return;
      }
      setErrorKey(errorKeyForCode(code));
      return;
    }

    finishDetection(parsed.value.transactions, parsed.value.currency);
  }

  /** Confirm handler from the ColumnMapper. */
  function handleMapperConfirm(layout: ColumnLayout, dateFormat: DateFormat | null) {
    if (!pendingCsv) { reset(); return; }
    const chosenFormat: DateFormat = dateFormat ?? 'YYYY-MM-DD';
    const parsed = parseWithLayout(pendingCsv.headers, pendingCsv.rows, layout, chosenFormat);
    if (!parsed.ok) {
      setErrorKey(errorKeyForCode(parsed.error.code));
      setView('upload');
      setPendingCsv(null);
      return;
    }
    finishDetection(parsed.value.transactions, parsed.value.currency);
  }

  function finishDetection(transactions: import('@engine/types').Transaction[], detectedCurrency: string) {
    setCurrency(detectedCurrency);
    const detection = runDetection({ transactions, currency: detectedCurrency });
    setResult(detection);
    setPendingCsv(null);
    setView('results');
  }


  return (
    <div className={styles.app}>
      <CryptAtmosphere />

      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">🦇</span>
          <span>Vampire Hunter</span>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setSoundEnabled((v) => !v)}
            aria-pressed={soundEnabled}
            aria-label={t('nav.soundToggleAriaLabel')}
            title={soundEnabled ? t('nav.soundOn') : t('nav.soundOff')}
          >
            {soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
          </button>
          <button
            type="button"
            className={styles.langBtn}
            onClick={() => setLanguage((l) => (l === 'en' ? 'es' : 'en'))}
            aria-label={t('nav.languageSwitchAriaLabel')}
          >
            {t('nav.languageSwitch')}
          </button>
          <div className={styles.control}>
            <label htmlFor="currency">{t('currencySelector.label')}</label>
            <select
              id="currency"
              className={styles.select}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label={t('currencySelector.ariaLabel')}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {view === 'upload' && (
          <Uploader
            language={language}
            errorKey={errorKey}
            onDismissError={() => setErrorKey(null)}
            onCsv={handleCsv}
          />
        )}

        {view === 'mapper' && pendingCsv && (
          <ColumnMapper
            language={language}
            headers={pendingCsv.headers}
            dateFormatAmbiguous={dateAmbiguous}
            onCancel={reset}
            onConfirm={handleMapperConfirm}
          />
        )}

        {view === 'results' && result && (
          <Crypt
            language={language}
            currency={currency}
            result={result}
            soundEnabled={soundEnabled}
            onUploadAnother={reset}
          />
        )}
      </main>
    </div>
  );
}

export default App;
