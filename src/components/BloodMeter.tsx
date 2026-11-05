/**
 * BloodMeter — a vial of blood that visualizes the yearly "blood loss".
 *
 * The vial starts full and drains as vampires are staked: the fill height is
 * `stillDraining / grandTotal`. Beside the vial, a compact readout shows the
 * yearly total with per-month and per-day equivalents, plus the blood saved so
 * far. No empty space — the readout fills the panel.
 *
 * Fill + saved counter animate on stake/un-stake. Respects reduced motion.
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
  const fillPct = total > 0 ? Math.round((drainingCents / total) * 100) : 0;
  const allStaked = total > 0 && drainingCents === 0;

  const yearly = formatMoney(drainingCents, currency, language);
  const monthly = formatMoney(Math.round(drainingCents / 12), currency, language);
  const daily = formatMoney(Math.round(drainingCents / 365), currency, language);

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
            initial={false}
            animate={{ height: `${fillPct}%` }}
            transition={{ duration: reduce ? 0 : 0.9, ease: 'easeOut' }}
          >
            <span className={styles.fillShine} />
          </motion.div>
        </div>
      </div>

      <div className={styles.readout}>
        {allStaked ? (
          <p className={styles.allSafe}>{t('bloodMeter.allStaked')}</p>
        ) : (
          <>
            <div className={styles.primary}>
              <span className={styles.drainingValue}>{yearly}</span>
              <span className={styles.perYear}>{t('bloodMeter.perYear')}</span>
            </div>
            <div className={styles.equivalents}>
              <span className={styles.equiv}>{t('bloodMeter.perMonth', { amount: monthly })}</span>
              <span className={styles.dot} aria-hidden="true">•</span>
              <span className={styles.equiv}>{t('bloodMeter.perDay', { amount: daily })}</span>
            </div>
          </>
        )}

        <div className={styles.savedRow} aria-live="polite">
          <span className={styles.savedLabel}>🛡️ {t('bloodMeter.savedLabel')}</span>
          <span className={styles.savedValue}>{formatMoney(savedCents, currency, language)}</span>
        </div>
      </div>
    </section>
  );
}

export default BloodMeter;
