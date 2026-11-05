/**
 * CryptAtmosphere — purely decorative ambient layer for the candle-lit crypt.
 *
 * Renders drifting fog, flickering candle-light pools, and a few slow bats
 * behind all content. It is `aria-hidden` and non-interactive. All motion is
 * CSS-driven and fully disabled under `prefers-reduced-motion` (see the CSS
 * module), so this component needs no JS motion logic.
 */

import styles from './CryptAtmosphere.module.css';

/** A single bat silhouette (wings flap via the inner group). */
function Bat() {
  return (
    <svg viewBox="0 0 64 32" fill="currentColor" aria-hidden="true">
      <g className={styles.batWing}>
        <path d="M32 18c-3-10-9-12-14-10 2-2 1-5-1-6 1 3-2 4-4 3-3 4-7 5-11 4 4 3 6 7 6 11 3-3 7-4 11-2 4 2 6 5 8 9 2-4 4-7 8-9 4-2 8-1 11 2 0-4 2-8 6-11-4 1-8 0-11-4-2 1-5 0-4-3-2 1-3 4-1 6-5-2-11 0-14 10z" />
      </g>
    </svg>
  );
}

export function CryptAtmosphere() {
  return (
    <div className={styles.atmosphere} aria-hidden="true">
      <div className={`${styles.fog} ${styles.fogFar}`} />
      <div className={`${styles.fog} ${styles.fogNear}`} />

      <div className={`${styles.candle} ${styles.candleLeft}`} />
      <div className={`${styles.candle} ${styles.candleRight}`} />

      <div className={`${styles.bat} ${styles.bat1}`}><Bat /></div>
      <div className={`${styles.bat} ${styles.bat2}`}><Bat /></div>
      <div className={`${styles.bat} ${styles.bat3}`}><Bat /></div>

      <div className={styles.vignette} />
    </div>
  );
}

export default CryptAtmosphere;
