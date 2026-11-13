/**
 * SealPanel — non-modal "How do we know?" disclosure region.
 *
 * No focus trap and no autofocus on open. While open, a capture-phase Escape
 * handler on `document` closes it, stops propagation (so other Escape
 * handlers such as the SamplePicker's do not also fire) and returns focus to
 * the seal button.
 */

import { useEffect, type RefObject } from 'react';
import { useTranslation, type Language } from '@i18n/index';
import styles from './SealPanel.module.css';

export interface SealPanelProps {
  id: string;
  language: Language;
  open: boolean;
  /** Status sentences (same text as the live region). */
  fullSentences: string;
  onClose: () => void;
  /** The seal button; receives focus when Escape closes the panel. */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function SealPanel({
  id,
  language,
  open,
  fullSentences,
  onClose,
  returnFocusRef,
}: SealPanelProps) {
  const { t } = useTranslation(language);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      returnFocusRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, returnFocusRef]);

  return (
    <div
      id={id}
      role="region"
      aria-label={t('seal.panelTitle')}
      className={styles.panel}
      hidden={!open}
    >
      <h2 className={styles.title}>{t('seal.panelTitle')}</h2>
      <p className={styles.status}>{fullSentences}</p>
      <p className={styles.text}>{t('seal.panelCsp')}</p>
      <p className={styles.text}>{t('seal.panelMeasured')}</p>
      <p className={styles.text}>{t('seal.panelBlocked')}</p>
      <p className={styles.text}>{t('seal.panelHowTo')}</p>
      <button type="button" className={styles.close} onClick={() => {
        onClose();
        returnFocusRef.current?.focus();
      }}>
        {t('seal.panelClose')}
      </button>
    </div>
  );
}

export default SealPanel;
