/**
 * Cleansed — the ending moment, shown when every vampire has a decision.
 * "The crypt is cleansed" over a warm dawn glow, with the total yearly blood
 * saved. Appears above the grid; respects reduced motion (CSS keeps it static).
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation, type Language } from '@i18n/index';
import { formatMoney } from './format';
import styles from './Cleansed.module.css';

export interface CleansedProps {
  language: Language;
  currency: string;
  /** Total yearly blood saved from all staked vampires (cents). */
  savedCents: number;
}

export function Cleansed({ language, currency, savedCents }: CleansedProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();

  return (
    <motion.section
      className={styles.banner}
      role="status"
      aria-live="polite"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
    >
      <span className={styles.sun} aria-hidden="true" />
      <h2 className={`${styles.title} font-display`}>{t('crypt.cleansedTitle')}</h2>
      <p className={styles.subtitle}>{t('crypt.cleansedSubtitle')}</p>
      <p className={styles.saved}>
        🛡️ <span className={styles.savedAmount}>
          {t('crypt.cleansedSaved', { amount: formatMoney(savedCents, currency, language) })}
        </span>
      </p>
    </motion.section>
  );
}

export default Cleansed;
