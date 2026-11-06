/**
 * BurnButton — "Burn the Crypt": wipe all saved decisions, language, and
 * currency from localStorage and reset the app.
 *
 * Clicking the button opens a confirmation modal (a destructive action must be
 * confirmed). The modal has a focus trap, auto-focuses Cancel (the safe
 * default), closes on Escape, and returns focus to the Burn button on close.
 * Confirming calls `onConfirm`, which performs the wipe.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation, type Language } from '@i18n/index';
import { Icon } from './Icon';
import styles from './BurnButton.module.css';

export interface BurnButtonProps {
  language: Language;
  /** Performs the actual wipe (clear storage + reset state). */
  onConfirm: () => void;
}

export function BurnButton({ language, onConfirm }: BurnButtonProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.burnBtn}
        onClick={() => setOpen(true)}
        aria-label={t('burn.buttonAriaLabel')}
      >
        <Icon name="flame" /> {t('burn.buttonLabel')}
      </button>

      <AnimatePresence>
        {open && (
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
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="burn-title"
              aria-describedby="burn-msg"
              onClick={(e) => e.stopPropagation()}
              initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <h2 id="burn-title" className={styles.title}>{t('burn.confirmTitle')}</h2>
              <p id="burn-msg" className={styles.message}>{t('burn.confirmMessage')}</p>
              <div className={styles.actions}>
                <button
                  ref={cancelRef}
                  type="button"
                  className={styles.cancelBtn}
                  onClick={close}
                  aria-label={t('burn.cancelAriaLabel')}
                >
                  {t('burn.cancelButton')}
                </button>
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={() => { onConfirm(); setOpen(false); }}
                  aria-label={t('burn.confirmAriaLabel')}
                >
                  <Icon name="flame" /> {t('burn.confirmButton')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default BurnButton;
