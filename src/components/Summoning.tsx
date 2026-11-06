/**
 * Summoning — a brief (~1s) "Hunting…" ritual shown after a statement is
 * parsed, before the vampires are revealed. Purely presentational; the parent
 * controls how long it is mounted. Respects reduced motion (CSS freezes the
 * spinning sigil; the overlay still appears and dismisses).
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation, type Language } from '@i18n/index';
import { Icon } from './Icon';
import styles from './Summoning.module.css';

export interface SummoningProps {
  language: Language;
}

export function Summoning({ language }: SummoningProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className={styles.sigil} aria-hidden="true">
        <span className={styles.ring} />
        <span className={`${styles.ring} ${styles.ring2}`} />
        <span className={styles.drop}><Icon name="blood-drop" /></span>
      </div>
      <h2 className={`${styles.title} font-display`}>{t('crypt.summoning')}</h2>
      <p className={styles.hint}>{t('crypt.summoningHint')}</p>
    </motion.div>
  );
}

export default Summoning;
