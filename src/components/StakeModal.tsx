/**
 * StakeModal — shown when the user chooses to stake (cancel) a vampire.
 *
 * Displays the catalog cancellation URL + step-by-step instructions (when the
 * vampire matched the catalog), a ready-to-send cancellation email draft built
 * from the i18n template, and a one-click copy button. Confirming performs the
 * stake (which triggers the crumble animation in the card).
 *
 * Accessibility: focus is trapped within the dialog (Tab / Shift+Tab cycle),
 * the first control is auto-focused, Escape closes, and focus returns to the
 * triggering Stake button on close.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Vampire } from '@engine/types';
import { useTranslation, type Language } from '@i18n/index';
import styles from './StakeModal.module.css';

export interface StakeModalProps {
  vampire: Vampire;
  language: Language;
  /** Element to return focus to when the modal closes. */
  returnFocusTo?: HTMLElement | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function StakeModal({
  vampire,
  language,
  returnFocusTo,
  onConfirm,
  onClose,
}: StakeModalProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  const name = vampire.displayName;
  const steps = vampire.catalogEntry?.cancelSteps?.[language] ?? [];
  const cancelUrl = vampire.catalogEntry?.cancelUrl;

  const emailSubject = t('stakeModal.emailSubject', { name });
  const emailBody = t('stakeModal.emailBody', { name });
  const emailText = `${emailSubject}\n\n${emailBody}`;

  // Close + restore focus to the trigger.
  const close = useCallback(() => {
    onClose();
    returnFocusTo?.focus();
  }, [onClose, returnFocusTo]);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  // Focus trap + Escape handling.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; fail silently (the textarea is selectable).
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className={styles.backdrop}
        onClick={close}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-label={t('stakeModal.ariaLabel', { name })}
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, y: 14, scale: 0.98 }}
          transition={{ duration: 0.22 }}
        >
          <div className={styles.header}>
            <h2 className={styles.title}>{t('stakeModal.title', { name })}</h2>
            <button
              ref={firstRef}
              type="button"
              className={styles.close}
              onClick={close}
              aria-label={t('stakeModal.closeAriaLabel')}
            >
              ×
            </button>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('stakeModal.stepsTitle')}</h3>
            {cancelUrl && (
              <a
                className={styles.cancelLink}
                href={cancelUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                🔗 {t('stakeModal.cancelUrlButton')}
              </a>
            )}
            {steps.length > 0 ? (
              <ol className={styles.steps}>
                {steps.map((step, i) => (
                  <li key={i} className={styles.step}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className={styles.noSteps}>{t('stakeModal.noStepsAvailable', { name })}</p>
            )}
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('stakeModal.emailDraftTitle')}</h3>
            <textarea
              className={styles.emailBox}
              readOnly
              value={emailText}
              aria-label={t('stakeModal.emailDraftAriaLabel')}
            />
            <button
              type="button"
              className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
              onClick={copyEmail}
              aria-label={t('stakeModal.copyEmailAriaLabel')}
            >
              {copied ? t('stakeModal.copyEmailSuccess') : t('stakeModal.copyEmailButton')}
            </button>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={() => { onConfirm(); close(); }}
              aria-label={t('stakeModal.confirmStakeAriaLabel', { name })}
            >
              🩸 {t('stakeModal.confirmStakeButton')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default StakeModal;
