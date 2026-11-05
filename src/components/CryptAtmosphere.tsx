/**
 * CryptAtmosphere — decorative ambient layer for the candle-lit crypt.
 *
 * Renders a full moon behind thin drifting clouds, a faint star field,
 * drifting ground fog, flickering candle-light pools, and a few slow bats
 * crossing the night — all behind the content. It is `aria-hidden` and
 * non-interactive. All motion is CSS-driven and disabled under
 * `prefers-reduced-motion` (see the CSS module), so no JS motion logic is needed.
 */

import styles from './CryptAtmosphere.module.css';

/** A single bat silhouette; wings flap via the inner group. */
function Bat() {
  return (
    <svg viewBox="0 0 64 32" fill="currentColor" aria-hidden="true">
      <g className={styles.batWing}>
        <path d="M32 20c-1.5-6-4-9-5.5-10 .3 1.4 0 2.8-.8 3.6-1.6-2.4-4.2-4.3-7-5 .9 1 1.2 2.1 1 3.2-2.4-2.3-6-3.8-9.7-3.8 1.8 1 3 2.3 3.4 3.9-1.2-.5-2.6-.6-3.9-.3 2.6 1 4.7 2.7 6 4.8 1.3 2.1 1.8 3.7 2 5.2 1.4-1.9 3.3-3 5.3-3.2 2.2-.2 4 .5 5.4 1.9.3-1 .9-1.8 1.8-2.3.9.5 1.5 1.3 1.8 2.3 1.4-1.4 3.2-2.1 5.4-1.9 2 .2 3.9 1.3 5.3 3.2.2-1.5.7-3.1 2-5.2 1.3-2.1 3.4-3.8 6-4.8-1.3-.3-2.7-.2-3.9.3.4-1.6 1.6-2.9 3.4-3.9-3.7 0-7.3 1.5-9.7 3.8.2-1.1.5-2.2 1-3.2-2.8.7-5.4 2.6-7 5-.8-.8-1.1-2.2-.8-3.6-1.5 1-4 4-5.5 10z" />
      </g>
    </svg>
  );
}

export function CryptAtmosphere() {
  return (
    <div className={styles.atmosphere} aria-hidden="true">
      <div className={styles.stars} />
      <div className={styles.moon} />
      <div className={styles.clouds} />

      <div className={`${styles.fog} ${styles.fogFar}`} />
      <div className={`${styles.fog} ${styles.fogNear}`} />

      <div className={`${styles.candle} ${styles.candleLeft}`} />
      <div className={`${styles.candle} ${styles.candleRight}`} />

      <div className={`${styles.bat} ${styles.bat1}`}><Bat /></div>
      <div className={`${styles.bat} ${styles.bat2}`}><Bat /></div>
      <div className={`${styles.bat} ${styles.bat3}`}><Bat /></div>
      <div className={`${styles.bat} ${styles.bat4}`}><Bat /></div>

      <div className={styles.vignette} />
    </div>
  );
}

export default CryptAtmosphere;
