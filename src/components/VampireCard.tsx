/**
 * VampireCard — a single vampire rendered as a tombstone/headstone.
 *
 * Shows the generated avatar, display name (with an amount subtitle when two
 * vampires share a name, e.g. the two Apple subscriptions), cadence phrase,
 * amount per bite, total blood drained, next bite date, the threat badge (glow
 * intensity scales with Low → Critical), and flag badges for a price increase
 * and a free-trial-turned-paid. Action buttons (Stake/Spare/Garlic) are present
 * here; their modals arrive in task 19, so clicks bubble up via callbacks.
 */

import { motion, useReducedMotion } from 'framer-motion';
import type { Vampire, ThreatLevel, Cadence } from '@engine/types';
import { useTranslation, type Language, type TranslationKey } from '@i18n/index';
import { formatMoney, formatDate } from './format';
import styles from './VampireCard.module.css';

const THREAT_CARD_CLASS: Record<ThreatLevel, string> = {
  Low: styles.threatLow,
  Medium: styles.threatMedium,
  High: styles.threatHigh,
  Critical: styles.threatCritical,
};

const THREAT_BADGE_CLASS: Record<ThreatLevel, string> = {
  Low: styles.badgeLow,
  Medium: styles.badgeMedium,
  High: styles.badgeHigh,
  Critical: styles.badgeCritical,
};

const CADENCE_KEY: Record<Cadence, TranslationKey> = {
  weekly: 'vampireCard.cadenceWeekly',
  monthly: 'vampireCard.cadenceMonthly',
  quarterly: 'vampireCard.cadenceQuarterly',
  yearly: 'vampireCard.cadenceYearly',
};

export interface VampireCardProps {
  vampire: Vampire;
  language: Language;
  /** Currency to display amounts in (UI override or detected). */
  currency: string;
  /** True when another vampire shares this display name — show amount subtitle. */
  showAmountSubtitle?: boolean;
  /** Stagger index for the entrance animation. */
  index?: number;
  onStake?: (v: Vampire) => void;
  onSpare?: (v: Vampire) => void;
  onGarlic?: (v: Vampire) => void;
}

export function VampireCard({
  vampire,
  language,
  currency,
  showAmountSubtitle = false,
  index = 0,
  onStake,
  onSpare,
  onGarlic,
}: VampireCardProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();

  const amountPerBite = formatMoney(vampire.medianAmountCents, currency, language);
  const bloodDrained = formatMoney(
    vampire.bites.reduce((sum, b) => sum + b.amountCents, 0),
    currency,
    language,
  );
  const annualLoss = formatMoney(vampire.annualBloodLossCents, currency, language);
  const threatLabel = t(`threatLevel.${vampire.threatLevel}` as TranslationKey);

  const ariaLabel = t('vampireCard.ariaLabel', {
    name: vampire.displayName,
    threatLevel: threatLabel,
    annualLoss,
  });

  return (
    <motion.article
      className={`${styles.card} ${THREAT_CARD_CLASS[vampire.threatLevel]}`}
      role="article"
      aria-label={ariaLabel}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(index * 0.05, 0.4) }}
    >
      {/* Avatar — engine-generated, deterministic, trusted SVG string. */}
      <div
        className={styles.avatar}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: vampire.avatarSvg }}
      />

      <div>
        <h3 className={styles.name}>{vampire.displayName}</h3>
        {showAmountSubtitle && (
          <p className={styles.subtitle}>{t('vampireCard.amountPerBite', { amount: amountPerBite })}</p>
        )}
        <p className={styles.cadence}>{t(CADENCE_KEY[vampire.cadence])}</p>
      </div>

      <div className={styles.badges}>
        <span
          className={`${styles.threatBadge} ${THREAT_BADGE_CLASS[vampire.threatLevel]}`}
          aria-label={t(`threatLevel.${vampire.threatLevel}_ariaLabel` as TranslationKey)}
        >
          🩸 {threatLabel}
        </span>
        {vampire.hasPriceIncrease && (
          <span className={styles.flagBadge}>📈 {t('vampireCard.priceIncreaseLabel')}</span>
        )}
        {vampire.hasFreeTrial && (
          <span className={`${styles.flagBadge} ${styles.flagTrial}`}>🎟️ {t('vampireCard.freeTrial')}</span>
        )}
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t('vampireCard.amountPerBiteLabel')}</span>
          <span className={styles.statValue}>{amountPerBite}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t('vampireCard.bloodDrained')}</span>
          <span className={styles.statValue}>{bloodDrained}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t('vampireCard.nextBite')}</span>
          <span className={styles.statValue}>{formatDate(vampire.nextBiteDate, language)}</span>
        </div>
        <div className={`${styles.stat} ${styles.annual}`}>
          <span className={styles.statLabel}>{t('vampireCard.annualBloodLoss')}</span>
          <span className={styles.statValue}>{annualLoss}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.stakeBtn}`}
          onClick={() => onStake?.(vampire)}
          aria-label={t('vampireCard.stakeAriaLabel', { name: vampire.displayName })}
        >
          {t('vampireCard.stakeButton')}
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.spareBtn}`}
          onClick={() => onSpare?.(vampire)}
          aria-label={t('vampireCard.spareAriaLabel', { name: vampire.displayName })}
        >
          {t('vampireCard.spareButton')}
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.garlicBtn}`}
          onClick={() => onGarlic?.(vampire)}
          aria-label={t('vampireCard.garlicAriaLabel', {
            name: vampire.displayName,
            nextDate: formatDate(vampire.nextBiteDate, language),
          })}
        >
          {t('vampireCard.garlicButton')}
        </button>
      </div>
    </motion.article>
  );
}

export default VampireCard;
