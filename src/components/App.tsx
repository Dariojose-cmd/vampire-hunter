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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
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
import { useSoundEngine } from './useSoundEngine';
import { CryptAtmosphere } from './CryptAtmosphere';
import { Uploader, UPLOAD_HEADING_ID } from './Uploader';
import { ColumnMapper } from './ColumnMapper';
import { Crypt } from './Crypt';
import { LanguageSwitch } from './LanguageSwitch';
import { CurrencySelector } from './CurrencySelector';
import { BurnButton } from './BurnButton';
import { BurnOverlay } from './BurnOverlay';
import { Icon } from './Icon';
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
    soundEnabled,
    setSoundEnabled,
    setDecision,
    setLanguage,
    setCurrency,
    burn,
  } = useCryptStorage();

  const [view, setView] = useState<View>('upload');
  const [burnPhase, setBurnPhase] = useState<'idle' | 'burning'>('idle');
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);

  // Held while the user is in the ColumnMapper, so we can re-parse on confirm.
  const [pendingCsv, setPendingCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [dateAmbiguous, setDateAmbiguous] = useState(false);

  const { t } = useTranslation(language);
  const sound = useSoundEngine(soundEnabled);
  const reducedMotion = useReducedMotion() ?? false;

  // Fire crackle while the burn sequence runs.
  useEffect(() => {
    if (burnPhase === 'burning') sound.startCrackle({ reducedMotion });
  }, [burnPhase, sound, reducedMotion]);

  // Whenever the Upload View renders, ensure scroll is at top and focus its
  // heading. Skip focus on the very first mount (don't steal focus on load).
  const firstUploadRun = useRef(true);
  useLayoutEffect(() => {
    if (view !== 'upload') return;
    // 'instant' (not 'auto'): 'auto' inherits html { scroll-behavior: smooth }.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (firstUploadRun.current) {
      firstUploadRun.current = false;
      return;
    }
    document.getElementById(UPLOAD_HEADING_ID)?.focus({ preventScroll: true });
  }, [view]);

  function reset() {
    setResult(null);
    setPendingCsv(null);
    setDateAmbiguous(false);
    setErrorKey(null);
    setView('upload');
  }

  /**
   * Burn confirmed: wipe persisted decisions immediately (the data wipe must
   * not depend on the animation, Req 1.4/8.4), then start the burn sequence.
   * We intentionally keep `view === 'results'` so the crypt stays visible under
   * the flames; the view switch is deferred to onBurnComplete (Req 1.5/1.6).
   */
  function onBurnConfirmed() {
    burn();
    setBurnPhase('burning');
  }

  /** Burn sequence finished: switch to the Upload View (empty altar), then idle. */
  function onBurnComplete() {
    sound.stopCrackle();
    reset();
    setBurnPhase('idle');
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
          <span className={styles.brandMark} aria-hidden="true"><Icon name="bat" /></span>
          <span>Vampire Hunter</span>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => {
              // enable() must run inside the click (user gesture).
              if (soundEnabled) sound.disable();
              else sound.enable();
              setSoundEnabled(!soundEnabled);
            }}
            aria-pressed={soundEnabled}
            aria-label={t('nav.soundToggleAriaLabel')}
            title={soundEnabled ? t('nav.soundOn') : t('nav.soundOff')}
          >
            <Icon name={soundEnabled ? 'sound-on' : 'sound-off'} />
          </button>
          <LanguageSwitch language={language} onChange={setLanguage} />
          <CurrencySelector language={language} currency={currency} onChange={setCurrency} />
          {view === 'results' && (
            <BurnButton language={language} onConfirm={onBurnConfirmed} />
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
            sound={sound}
            decisions={decisions}
            onDecision={setDecision}
            onUploadAnother={reset}
          />
        )}

      </main>

      {burnPhase === 'burning' && <BurnOverlay onComplete={onBurnComplete} />}
    </div>
  );
}

export default App;
