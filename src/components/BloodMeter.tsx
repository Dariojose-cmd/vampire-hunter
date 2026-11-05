/**
 * BloodMeter — a vial of blood that fills with the total annual blood loss
 * across the vampires still draining the user (not staked), with a readout of
 * blood saved from the ones already staked.
 *
 * The fill height animates (Framer Motion) relative to the grand total, so
 * staking a vampire visibly drops the level. Respects reduced motion.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation, type Language } from '@i18n/index';
import { formatMoney } from './format';
import styles from './BloodMeter.module.css';

export interface BloodMeterProps {
  language: Language;
  currency: string;
  /** Annual blood loss (cents) still draining — un-staked vampires. */
  drainingCents: number;
  /** Annual blood loss (cents) saved — staked vampires. */
  savedCents: number;
}

export function BloodMeter({
  language,
  currency,
  drainingCents,
  savedCents,
}: BloodMeterProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();

  const total = drainingCents + savedCents;
  // Fill represents the share still draining. Empty vial (all staked) = 0%.
  const fillPct = total > 0 ? Math.round((drainingCents / total) * 100) : 0;
  const allStaked = total > 0 && drainingCents === 0;

  return (
    <section
      className={styles.meter}
      role="group"
      aria-label={t('bloodMeter.ariaLabel')}
    >
      <div className={styles.vial} aria-hidden="true">
        <div className={styles.vialNeck} />
        <div className={styles.vialGlass}>
          <motion.div
            className={styles.fill}
            initial={reduce ? false : { height: '0%' }}
            animate={{ height: `${fillPct}%` }}
            transition={{ duration: reduce ? 0 : 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className={styles.readout}>
        {allStaked ? (
          <p className={styles.allSafe}>{t('bloodMeter.allStaked')}</p>
        ) : (
          <div className={styles.row}>
            <span className={styles.draining}>
              {t('bloodMeter.drainingValue', { amount: formatMoney(drainingCents, currency, language) })}
            </span>
            <span className={styles.label}>{t('bloodMeter.draining')}</span>
          </div>
        )}
        {savedCents > 0 && (
          <p className={styles.saved}>
            🛡️ {t('bloodMeter.savedValue', { amount: formatMoney(savedCents, currency, language) })}
          </p>
        )}
      </div>
    </section>
  );
}

export default BloodMeter;
