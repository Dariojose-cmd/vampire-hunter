/**
 * VampireCard — a single vampire rendered as a tombstone/headstone.
 *
 * Shows the generated avatar, display name (with an amount subtitle when two
 * vampires share a name), cadence, amount per bite, blood drained, next bite
 * date, a threat badge (glow scales Low → Critical), and flag badges for a
 * price increase and a free-trial-turned-paid.
 *
 * Decision states: spared (dimmed green), garlic (warm pulsing edge). Staking
 * triggers the "stake moment" — the tombstone cracks and crumbles into dust
 * while a freed bat flies away. Under prefers-reduced-motion this collapses to
 * a simple fade (and the decorative crack/dust/bat are hidden via CSS).
 */

import { useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Vampire, ThreatLevel, Cadence, DecisionType } from '@engine/types';
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
  currency: string;
  showAmountSubtitle?: boolean;
  index?: number;
  /** When true, play the staggered rise-from-the-grave entrance. */
  revealed?: boolean;
  /** Current decision for this vampire (controls visual state). */
  decision?: DecisionType;
  /** True while the stake crumble animation is playing. */
  isStaking?: boolean;
  /** Garlic generation failed → disable the garlic button. */
  garlicDisabled?: boolean;
  /** Opens the stake modal; receives the trigger button for focus return. */
  onStakeClick?: (v: Vampire, trigger: HTMLElement) => void;
  onSpare?: (v: Vampire) => void;
  onGarlic?: (v: Vampire) => void;
  /** Clears a staked decision (Undo on a staked card). */
  onUnstake?: (v: Vampire) => void;
}

/** A small escaping-bat SVG used in the stake moment. */
function EscapeBat() {
  return (
    <span className={styles.escapeBat} aria-hidden="true">
      <svg viewBox="0 0 64 32" fill="currentColor">
        <path d="M32 20c-1.5-6-4-9-5.5-10 .3 1.4 0 2.8-.8 3.6-1.6-2.4-4.2-4.3-7-5 .9 1 1.2 2.1 1 3.2-2.4-2.3-6-3.8-9.7-3.8 1.8 1 3 2.3 3.4 3.9-1.2-.5-2.6-.6-3.9-.3 2.6 1 4.7 2.7 6 4.8 1.3 2.1 1.8 3.7 2 5.2 1.4-1.9 3.3-3 5.3-3.2 2.2-.2 4 .5 5.4 1.9.3-1 .9-1.8 1.8-2.3.9.5 1.5 1.3 1.8 2.3 1.4-1.4 3.2-2.1 5.4-1.9 2 .2 3.9 1.3 5.3 3.2.2-1.5.7-3.1 2-5.2 1.3-2.1 3.4-3.8 6-4.8-1.3-.3-2.7-.2-3.9.3.4-1.6 1.6-2.9 3.4-3.9-3.7 0-7.3 1.5-9.7 3.8.2-1.1.5-2.2 1-3.2-2.8.7-5.4 2.6-7 5-.8-.8-1.1-2.2-.8-3.6-1.5 1-4 4-5.5 10z" />
      </svg>
    </span>
  );
}

export function VampireCard({
  vampire,
  language,
  currency,
  showAmountSubtitle = false,
  index = 0,
  revealed = true,
  decision = null,
  isStaking = false,
  garlicDisabled = false,
  onStakeClick,
  onSpare,
  onGarlic,
  onUnstake,
}: VampireCardProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();
  const stakeBtnRef = useRef<HTMLButtonElement>(null);

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

  // Dust particles — deterministic positions so re-renders don't reshuffle.
  const dust = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: `${8 + (i * 6.5) % 84}%`,
        dx: `${((i % 5) - 2) * 14}px`,
        delay: `${(i % 7) * 0.05}s`,
      })),
    [],
  );

  const decisionClass =
    decision === 'spared' ? styles.spared :
    decision === 'garlic' ? styles.garlic : '';
  const activeClass =
    decision === 'garlic' ? styles.garlicActive :
    decision === 'spared' ? styles.sparedActive : '';

  // Reduced motion staking → plain fade; otherwise the crumble keyframes run.
  const stakingClass = isStaking && !reduce ? styles.crumble : '';

  return (
    <motion.article
      className={`${styles.card} ${THREAT_CARD_CLASS[vampire.threatLevel]} ${decisionClass} ${activeClass} ${stakingClass}`}
      role="article"
      aria-label={ariaLabel}
      initial={reduce ? false : { opacity: 0, y: 40 }}
      animate={
        isStaking && reduce
          ? { opacity: 0, transition: { duration: 0.3 } }
          : revealed
            ? { opacity: 1, y: 0 }
            : { opacity: 0, y: 40 }
      }
      transition={{ duration: reduce ? 0 : 0.5, ease: 'easeOut', delay: reduce || !revealed ? 0 : Math.min(index * 0.08, 0.8) }}
    >
      {/* Stake-moment overlays (hidden under reduced motion via CSS). */}
      {isStaking && (
        <>
          <span className={styles.crack} aria-hidden="true" />
          <div className={styles.dust} aria-hidden="true">
            {dust.map((d, i) => (
              <span
                key={i}
                style={{ ['--x' as string]: d.x, ['--dx' as string]: d.dx, ['--d' as string]: d.delay }}
              />
            ))}
          </div>
          <EscapeBat />
        </>
      )}

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

      {/* In-flow decision banner (never clipped by the arched top). Shown for
          spared / garlic; staked gets its own state block below. */}
      {(decision === 'spared' || decision === 'garlic') && (
        <div className={`${styles.decisionBanner} ${decision === 'spared' ? styles.bannerSpared : styles.bannerGarlic}`}>
          {decision === 'spared'
            ? `🙏 ${t('vampireCard.decisionSpared')}`
            : `🧄 ${t('vampireCard.decisionGarlic')}`}
        </div>
      )}

      {decision === 'staked' ? (
        // Staked state: clearly "done", with an Undo affordance.
        <div className={styles.stakedBlock}>
          <div className={styles.stakedState}>
            <span className={styles.stakedMark} aria-hidden="true">🪦</span>
            <span>
              <strong>{t('vampireCard.stakedState')}</strong>
              <span className={styles.stakedDetail}>{t('vampireCard.stakedStateDetail')}</span>
            </span>
          </div>
          <button
            ref={stakeBtnRef}
            type="button"
            className={`${styles.actionBtn} ${styles.undoBtn}`}
            onClick={() => onUnstake?.(vampire)}
            aria-label={t('vampireCard.undoAriaLabel', { name: vampire.displayName })}
          >
            ↺ {t('vampireCard.undoButton')}
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            ref={stakeBtnRef}
            type="button"
            className={`${styles.actionBtn} ${styles.stakeBtn}`}
            onClick={() => stakeBtnRef.current && onStakeClick?.(vampire, stakeBtnRef.current)}
            aria-label={t('vampireCard.stakeAriaLabel', { name: vampire.displayName })}
          >
            {t('vampireCard.stakeButton')}
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.spareBtn}`}
            onClick={() => onSpare?.(vampire)}
            aria-pressed={decision === 'spared'}
            aria-label={t('vampireCard.spareAriaLabel', { name: vampire.displayName })}
          >
            {t('vampireCard.spareButton')}
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.garlicBtn}`}
            onClick={() => onGarlic?.(vampire)}
            disabled={garlicDisabled}
            aria-pressed={decision === 'garlic'}
            aria-label={t('vampireCard.garlicAriaLabel', {
              name: vampire.displayName,
              nextDate: formatDate(vampire.nextBiteDate, language),
            })}
          >
            {t('vampireCard.garlicButton')}
          </button>
        </div>
      )}
    </motion.article>
  );
}

export default VampireCard;
