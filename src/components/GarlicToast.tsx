import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './GarlicToast.module.css';

export const GARLIC_TOAST_DURATION_MS = 6000;

interface GarlicToastProps {
  message: string;
  kind: 'success' | 'error';
  closeLabel: string;
  onDismiss: () => void;
}

/** Polite status toast for garlic (reminder) results. Auto-dismisses after 6 s. */
export function GarlicToast({ message, kind, closeLabel, onDismiss }: GarlicToastProps) {
  const reduceMotion = useReducedMotion();
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  // Restarts whenever the message/kind changes (a new toast replaces the old one).
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), GARLIC_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, kind]);

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2 },
      };

  return (
    <motion.div
      className={`${styles.toast} ${kind === 'error' ? styles.error : styles.success}`}
      role="status"
      aria-live="polite"
      {...motionProps}
    >
      <span className={styles.message}>{message}</span>
      <button type="button" className={styles.close} onClick={onDismiss} aria-label={closeLabel}>
        <span aria-hidden="true">×</span>
      </button>
    </motion.div>
  );
}

export default GarlicToast;
