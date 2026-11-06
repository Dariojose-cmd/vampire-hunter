/**
 * BurnOverlay — the "Burn the Crypt" cinematic.
 *
 * A presentational overlay that plays a brief flame-and-ash sequence over the
 * crypt region, then calls `onComplete` so the parent can switch back to the
 * Upload View (empty altar). It is positioned `absolute` over its positioned
 * parent (the crypt region inside <main>), sits at `--z-overlay`, and uses
 * `pointer-events: none` so it never traps keyboard/mouse input (Req 1.3).
 *
 * Full motion (≤ 1.4s, hard cap 1.5s):
 *   1. Flame Layer — inline SVG flame band anchored to the bottom that rises
 *      upward with a flicker, tinted with the theme tokens. Inline SVG only;
 *      no external asset and no network request (Req 2.1, 2.5).
 *   2. Char/dissolve scrim — a dark-to-transparent gradient that sweeps upward
 *      across the whole region, so the cards read as consumed by one sweeping
 *      fire (whole-region char, not per-card) (Req 2.2).
 *   3. Embers — a handful of small particles that drift up and fade with
 *      seeded (deterministic) offsets/delays so re-renders don't reshuffle
 *      them (Req 2.3).
 *
 * Reduced motion (≤ 280ms): no flames, no embers — a single scrim that
 * cross-fades in, then `onComplete` (Req 3.1, 3.2, 3.3).
 *
 * `onComplete` fires from the orchestrating animation's `onAnimationComplete`,
 * with a `setTimeout` safety fallback so it always runs even if an animation
 * event is missed; a ref flag guards it so it is only ever called once.
 *
 * The overlay is decorative (`aria-hidden`): it is not announced, and it
 * leaves no residual flame/ash once the parent unmounts it (Req 2.4).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './BurnOverlay.module.css';

const BURN_MS = 1400; // full-motion budget (< 1500 cap, Req 1.2)
const BURN_FADE_MS = 280; // reduced-motion (< 300, Req 3.2)

const EMBER_COUNT = 10;

export interface BurnOverlayProps {
  /** Called once when the sequence (or reduced-motion fade) finishes. */
  onComplete: () => void;
}

interface Ember {
  id: number;
  /** horizontal start position across the region (0–100%) */
  left: number;
  /** horizontal drift as it rises (px) */
  drift: number;
  /** how far up it travels (px, negative = upward) */
  rise: number;
  /** particle size (px) */
  size: number;
  /** start delay (s) */
  delay: number;
  /** travel duration (s) */
  duration: number;
}

/**
 * A tiny seeded pseudo-random generator (mulberry32). Deterministic so the
 * ember field is computed once via useMemo and never reshuffles on re-render.
 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildEmbers(count: number): Ember[] {
  const rng = makeRng(0x5eed_1234);
  const embers: Ember[] = [];
  for (let i = 0; i < count; i++) {
    embers.push({
      id: i,
      left: rng() * 100,
      drift: (rng() - 0.5) * 60,
      rise: -(40 + rng() * 80), // -40…-120
      size: 3 + rng() * 5,
      delay: rng() * 0.5,
      duration: 0.7 + rng() * 0.6,
    });
  }
  return embers;
}

export function BurnOverlay({ onComplete }: BurnOverlayProps) {
  const reduce = useReducedMotion();
  const firedRef = useRef(false);

  const embers = useMemo(() => buildEmbers(EMBER_COUNT), []);

  // Keep the latest callback in a ref so `complete` stays stable across renders.
  const fire = useRef(onComplete);
  useEffect(() => {
    fire.current = onComplete;
  }, [onComplete]);

  // Stable, idempotent: only ever fires onComplete once (guarded by the ref).
  const complete = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    fire.current();
  }, []);

  // Safety fallback: always resolve even if the animation event is missed.
  useEffect(() => {
    const ms = reduce ? BURN_FADE_MS : BURN_MS;
    const timer = window.setTimeout(complete, ms);
    return () => window.clearTimeout(timer);
  }, [reduce, complete]);

  if (reduce) {
    return (
      <motion.div
        className={styles.overlay}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: BURN_FADE_MS / 1000, ease: 'easeOut' }}
        onAnimationComplete={complete}
      >
        <div className={styles.scrim} />
      </motion.div>
    );
  }

  return (
    <motion.div
      className={styles.overlay}
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: BURN_MS / 1000, times: [0, 0.15, 0.8, 1], ease: 'linear' }}
      onAnimationComplete={complete}
    >
      {/* Char/dissolve scrim: sweeps upward over the whole region. */}
      <motion.div
        className={styles.scrim}
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: '0%', opacity: [0, 0.9, 1] }}
        transition={{ duration: (BURN_MS / 1000) * 0.85, ease: 'easeIn' }}
      />

      {/* Flame Layer: rises from the bottom and flickers. */}
      <motion.div
        className={styles.flameLayer}
        initial={{ scaleY: 0.1, y: '40%', opacity: 0 }}
        animate={{ scaleY: [0.1, 1.05, 1.15], y: ['40%', '0%', '-10%'], opacity: [0, 1, 0.85, 0] }}
        transition={{ duration: BURN_MS / 1000, times: [0, 0.35, 0.75, 1], ease: 'easeOut' }}
      >
        <svg
          className={styles.flameSvg}
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {/* Back flame band — deepest blood red. */}
          <motion.path
            className={styles.flameBack}
            d="M0 40 L0 22 Q6 8 12 18 Q18 2 26 16 Q32 6 40 18 Q48 4 56 16 Q64 6 72 18 Q80 4 88 16 Q94 8 100 20 L100 40 Z"
            animate={{ opacity: [0.5, 0.95, 0.6, 0.9, 0] }}
            transition={{ duration: BURN_MS / 1000, times: [0, 0.3, 0.55, 0.8, 1] }}
          />
          {/* Mid flame band — lighter blood red. */}
          <motion.path
            className={styles.flameMid}
            d="M0 40 L0 28 Q8 16 16 24 Q24 10 32 24 Q40 12 48 24 Q56 10 64 24 Q72 12 80 24 Q88 16 100 26 L100 40 Z"
            animate={{ opacity: [0.4, 0.9, 0.55, 0.85, 0] }}
            transition={{ duration: BURN_MS / 1000, times: [0, 0.35, 0.6, 0.82, 1] }}
          />
          {/* Front flame tips — warm candle glow. */}
          <motion.path
            className={styles.flameFront}
            d="M0 40 L0 33 Q10 26 20 32 Q30 22 40 32 Q50 24 60 32 Q70 22 80 32 Q90 26 100 33 L100 40 Z"
            animate={{ opacity: [0.6, 1, 0.7, 0.95, 0] }}
            transition={{ duration: BURN_MS / 1000, times: [0, 0.25, 0.5, 0.78, 1] }}
          />
        </svg>
      </motion.div>

      {/* Embers: drift up and fade with seeded offsets. */}
      <div className={styles.emberField} aria-hidden="true">
        {embers.map((e) => (
          <motion.span
            key={e.id}
            className={styles.ember}
            style={{ left: `${e.left}%`, width: e.size, height: e.size }}
            initial={{ y: 0, x: 0, opacity: 0 }}
            animate={{ y: e.rise, x: e.drift, opacity: [0, 1, 1, 0] }}
            transition={{
              duration: e.duration,
              delay: 0.3 + e.delay,
              times: [0, 0.2, 0.7, 1],
              ease: 'easeOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

export default BurnOverlay;
