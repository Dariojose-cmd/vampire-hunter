/**
 * SamplePicker — a small modal offering the four bundled sample statements.
 *
 * Selecting a sample fetches the CSV *from the app's own bundled assets* (a
 * same-origin static file served by Vite / the static host — no third-party
 * network call and no user data involved) and hands the raw text back to the
 * parent, which runs it through the in-browser parser.
 *
 * Focus is trapped lightly: Escape closes, the first option auto-focuses.
 */

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation, type Language } from '@i18n/index';
import styles from './SamplePicker.module.css';

/** A bundled sample file: the public path and its i18n label key + icon. */
interface SampleDef {
  file: string;
  labelKey:
    | 'upload.samplePicker.us'
    | 'upload.samplePicker.mxn'
    | 'upload.samplePicker.cop'
    | 'upload.samplePicker.messy';
  icon: string;
}

const SAMPLES: SampleDef[] = [
  { file: 'us-bank-usd.csv', labelKey: 'upload.samplePicker.us', icon: '🦅' },
  { file: 'latam-bank-mxn.csv', labelKey: 'upload.samplePicker.mxn', icon: '🌮' },
  { file: 'latam-bank-cop.csv', labelKey: 'upload.samplePicker.cop', icon: '☕' },
  { file: 'messy-statement.csv', labelKey: 'upload.samplePicker.messy', icon: '🕸️' },
];

export interface SamplePickerProps {
  language: Language;
  /** Called with the selected sample's filename and its raw CSV text. */
  onPick: (fileName: string, csvText: string) => void;
  onClose: () => void;
}

export function SamplePicker({ language, onPick, onClose }: SamplePickerProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();
  const firstBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handlePick(file: string) {
    // Samples live under /samples served as static, same-origin assets.
    // This is a bundled-asset read, not a data upload; no user data leaves
    // the device and no third party is contacted.
    const res = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
    const text = await res.text();
    onPick(file, text);
  }

  return (
    <AnimatePresence>
      <motion.div
        className={styles.backdrop}
        onClick={onClose}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-label={t('upload.samplePicker.title')}
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22 }}
        >
          <h2 className={styles.title}>{t('upload.samplePicker.title')}</h2>

          <div className={styles.list}>
            {SAMPLES.map((s, i) => (
              <button
                key={s.file}
                ref={i === 0 ? firstBtnRef : undefined}
                type="button"
                className={styles.sample}
                onClick={() => handlePick(s.file)}
              >
                <span className={styles.sampleIcon} aria-hidden="true">{s.icon}</span>
                <span className={styles.sampleLabel}>{t(s.labelKey)}</span>
              </button>
            ))}
          </div>

          <button type="button" className={styles.close} onClick={onClose}>
            {t('upload.samplePicker.close')}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default SamplePicker;
