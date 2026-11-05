/**
 * App — top-level state and view routing for Vampire Hunter.
 *
 * Persistence (task 20): language, currency, and per-vampire decisions are held
 * in `useCryptStorage` and written through to localStorage on every change.
 * Raw transactions / CSV text are NEVER persisted. Because vampire ids are
 * stable (`normalizedName_clusterIndex`), re-loading the same statement
 * restores the saved decisions.
 *
 * Views: Uploader (no results) · ColumnMapper (mapping needed) · Crypt (results).
 * The whole pipeline runs client-side; no transaction data leaves the device.
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
  Transaction,
} from '@engine/types';
import { useTranslation, type TranslationKey } from '@i18n/index';
import { parseCsvText } from './csvUtils';
import { useCryptStorage } from './useCryptStorage';
import { CryptAtmosphere } from './CryptAtmosphere';
import { Uploader } from './Uploader';
import { ColumnMapper } from './ColumnMapper';
import { Crypt } from './Crypt';
import { LanguageSwitch } from './LanguageSwitch';
import { CurrencySelector } from './CurrencySelector';
import { BurnButton } from './BurnButton';
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

export function App() {
  // Persisted settings + decisions (localStorage-backed).
  const {
    decisions,
    language,
    currency,
    setDecision,
    setLanguage,
    setCurrency,
    burn,
  } = useCryptStorage();

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
    if (csvText.trim() === '') { setErrorKey('errors.fileNotCsv'); return; }

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

  function finishDetection(transactions: Transaction[], detectedCurrency: string) {
    // Only adopt the auto-detected currency if the user has not already chosen
    // one this session (currency is persisted; don't stomp a saved preference
    // on every upload — but a fresh install starts at USD and should follow the
    // statement). We update when the detected currency differs AND the current
    // value is the default USD, mirroring the detector's intent without
    // overriding an explicit user choice mid-session.
    if (detectedCurrency && currency === 'USD') setCurrency(detectedCurrency);
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
          <LanguageSwitch language={language} onChange={setLanguage} />
          <CurrencySelector language={language} currency={currency} onChange={setCurrency} />
          {view === 'results' && (
            <BurnButton language={language} onConfirm={() => { burn(); reset(); }} />
          )}
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
            decisions={decisions}
            onDecision={setDecision}
            onUploadAnother={reset}
          />
        )}
      </main>
    </div>
  );
}

export default App;
