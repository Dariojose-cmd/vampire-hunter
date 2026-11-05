/**
 * Uploader — the upload screen. An old tome resting on a stone altar where the
 * user "offers" their bank statement (drag & drop or click to browse), with the
 * privacy promise always visible and a "Try a sample" picker for the four
 * bundled sample files.
 *
 * All parsing happens in the browser; raw CSV text is handed to the parent via
 * `onCsv` and never leaves the device.
 */

import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation, type Language, type TranslationKey } from '@i18n/index';
import { isCsvFile } from './csvUtils';
import { SamplePicker } from './SamplePicker';
import styles from './Uploader.module.css';

export interface UploaderProps {
  language: Language;
  /** Error message key to display (e.g. a parse/column error), or null. */
  errorKey?: TranslationKey | null;
  onDismissError?: () => void;
  /** Receives the source name and raw CSV text for in-browser parsing. */
  onCsv: (sourceName: string, csvText: string) => void;
}

export function Uploader({ language, errorKey, onDismissError, onCsv }: UploaderProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showSamples, setShowSamples] = useState(false);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => onCsv(file.name, String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!isCsvFile(file)) {
      // Surface a friendly error via the same channel the engine uses.
      onCsv(file.name, ''); // empty text → parent reports a parse error
      return;
    }
    readFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }

  function openFileDialog() {
    inputRef.current?.click();
  }

  function onAltarKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFileDialog();
    }
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h1 className={`${styles.title} font-display`}>{t('upload.title')}</h1>
        <p className={styles.subtitle}>{t('upload.subtitle')}</p>
      </header>

      {errorKey && (
        <div className={styles.error} role="alert">
          <span>⚠️</span>
          <span>{t(errorKey)}</span>
          {onDismissError && (
            <button
              type="button"
              className={styles.errorDismiss}
              onClick={onDismissError}
              aria-label={t('errors.dismissAriaLabel')}
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* The altar / tome drop zone. A labelled button for a11y; the hidden
          native file input does the actual file selection. */}
      <motion.div
        className={`${styles.altar} ${dragActive ? styles.altarActive : ''}`}
        role="button"
        tabIndex={0}
        aria-label={t('upload.dropZoneLabel')}
        onClick={openFileDialog}
        onKeyDown={onAltarKeyDown}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        animate={reduce ? undefined : { scale: dragActive ? 1.02 : 1 }}
        transition={{ duration: 0.18 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className={styles.hiddenInput}
          onChange={(e) => handleFiles(e.target.files)}
          tabIndex={-1}
        />
        <div className={styles.tome}>
          <svg className={styles.tomeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M4 5c0-1 1-2 2-2h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6c-1 0-2-1-2-2V5z" />
            <path d="M4 18c0-1 1-2 2-2h12" />
            <path d="M9 8h6M9 11h6" strokeLinecap="round" />
            <path d="M12 14.5v4M10 16.5h4" strokeLinecap="round" />
          </svg>
          <span className={styles.dropLabel}>
            {dragActive ? t('upload.dropZoneActive') : t('upload.dropZoneLabel')}
          </span>
          <span className={styles.dropHint}>{t('upload.supportedFormats')}</span>
        </div>
      </motion.div>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={openFileDialog}>
          {t('upload.browseButton')}
        </button>
        <span className={styles.orText}>{t('upload.orText')}</span>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => setShowSamples(true)}
        >
          {t('upload.trySampleButton')}
        </button>
      </div>

      <div className={styles.privacy}>
        <p className={styles.privacyMain}>{t('upload.privacyNotice')}</p>
        <p className={styles.privacyDetail}>{t('upload.privacyNoticeDetail')}</p>
      </div>

      {showSamples && (
        <SamplePicker
          language={language}
          onPick={(file, text) => { setShowSamples(false); onCsv(file, text); }}
          onClose={() => setShowSamples(false)}
        />
      )}
    </section>
  );
}

export default Uploader;
