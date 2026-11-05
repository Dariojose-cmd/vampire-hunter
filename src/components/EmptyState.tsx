/**
 * EmptyState — a spooky "your crypt is empty" prompt shown when no statement
 * has been loaded and there are no saved decisions. Offers an upload CTA and a
 * "Try a sample" shortcut.
 */

import { useTranslation, type Language } from '@i18n/index';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  language: Language;
  onUpload: () => void;
  onTrySample: () => void;
}

export function EmptyState({ language, onUpload, onTrySample }: EmptyStateProps) {
  const { t } = useTranslation(language);
  return (
    <section className={styles.empty}>
      <span className={styles.icon} aria-hidden="true">⚰️</span>
      <h2 className={`${styles.title} font-display`}>{t('emptyState.title')}</h2>
      <p className={styles.subtitle}>{t('emptyState.subtitle')}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.cta} onClick={onUpload}>
          {t('emptyState.ctaButton')}
        </button>
        <button type="button" className={styles.sample} onClick={onTrySample}>
          {t('emptyState.sampleButton')}
        </button>
      </div>
      <p className={styles.tip}>{t('emptyState.tip')}</p>
    </section>
  );
}

export default EmptyState;
