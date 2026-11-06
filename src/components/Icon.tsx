/**
 * Icon — the single source of inline SVG markup for the app.
 *
 * Every glyph is wrapped in one shared `<svg>` with an identical viewBox,
 * stroke weight, and linecaps, so the whole set reads as one thin-line-art
 * gothic style. Colors are never hardcoded: every shape inherits the theme
 * via `stroke="currentColor"`, so an icon follows its surrounding text color.
 *
 * Accessibility: icons are decorative by default (`aria-hidden="true"`) so
 * they are never accidentally announced. Pass a `title` to make an icon
 * announced — it then exposes `role="img"`, an `aria-label`, and a `<title>`.
 *
 * Icons are inline SVG only: no `<img>`, no network fetch for icon assets.
 *
 * NOTE: the glyph geometry in `PATHS` is authored in task 1.2. This file
 * establishes the component contract, the shared wrapper, and the a11y
 * behavior; the stub shapes below keep the component compiling and
 * type-checking until the final geometry lands.
 */

import type { ReactNode } from 'react';
import styles from './Icon.module.css';

/** The complete set of named glyphs that replace the app's emojis. */
export type IconName =
  | 'blood-drop'
  | 'coffin'
  | 'tombstone'
  | 'shield'
  | 'garlic'
  | 'praying-hands'
  | 'trend-up'
  | 'ticket'
  | 'flame'
  | 'link'
  | 'warning'
  | 'bat'
  | 'sound-on'
  | 'sound-off'
  | 'undo'
  | 'marker-us'
  | 'marker-mx'
  | 'marker-co'
  | 'web'
  | 'lock';

export interface IconProps {
  /** Which glyph to render. */
  name: IconName;
  /** CSS size; defaults to '1em' so icons track adjacent text (Req 4.4). */
  size?: string | number;
  /**
   * Accessible name. When provided, the icon is announced (role="img");
   * when omitted (default), the icon is decorative (aria-hidden) (Req 6.4).
   */
  title?: string;
  className?: string;
}

/**
 * Per-concept glyph geometry, keyed by {@link IconName}.
 *
 * Each entry is the inner shape set for one glyph, authored in a single
 * thin-line-art gothic style on the shared `0 0 24 24` viewBox (geometry
 * roughly in the 2–22 range, centered). Every shape is stroke-only — no
 * `fill` or `stroke` color attributes — so each glyph inherits
 * `currentColor`, `stroke-width`, and round caps/joins from the shared
 * `<svg>` wrapper. Each concept is defined once here and reused by every
 * caller, so there are no per-location variants.
 */
const PATHS: Record<IconName, ReactNode> = {
  // Teardrop: pointed top, round bottom.
  'blood-drop': <path d="M12 3C12 3 6 10.5 6 15a6 6 0 0 0 12 0C18 10.5 12 3 12 3Z" />,
  // Hexagonal six-sided coffin outline.
  coffin: (
    <path d="M9 3h6l2 5-1.2 13H8.2L7 8l2-5Z" />
  ),
  // Rounded-top gravestone with a minimal cross hint and a ground line.
  tombstone: (
    <>
      <path d="M6 21V10a6 6 0 0 1 12 0v11" />
      <path d="M12 7v5" />
      <path d="M10 9h4" />
      <path d="M4 21h16" />
    </>
  ),
  // Heraldic shield with an inner check mark.
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z" />
      <path d="M9 11.5 11 14l4-4.5" />
    </>
  ),
  // Garlic bulb (three rounded cloves) with a small sprout on top.
  garlic: (
    <>
      <path d="M12 5c-1.6 0-2 1.6-2 3" />
      <path d="M12 5c1.6 0 2 1.6 2 3" />
      <path d="M12 8c-3 0-5 2.6-5 6a5 5 0 0 0 10 0c0-3.4-2-6-5-6Z" />
      <path d="M12 8c-1.8 0-2.4 3-2.4 6" />
      <path d="M12 8c1.8 0 2.4 3 2.4 6" />
    </>
  ),
  // Two hands together: a steeple formed by mirrored curves.
  'praying-hands': (
    <>
      <path d="M12 4 7 11v6a2 2 0 0 0 2 2h3V4Z" />
      <path d="M12 4l5 7v6a2 2 0 0 1-2 2h-3V4Z" />
    </>
  ),
  // Upward trend line with an arrowhead (chart up).
  'trend-up': (
    <>
      <path d="M4 16l5-5 3 3 6-6" />
      <path d="M15 8h5v5" />
    </>
  ),
  // Ticket stub with a perforation notch down the middle.
  ticket: (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" />
      <path d="M13 6v1" />
      <path d="M13 11v2" />
      <path d="M13 17v1" />
    </>
  ),
  // Single flame outline with an inner curl.
  flame: (
    <>
      <path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .4 1 1 1.6 1.8 2C11 8 11 5 12 3Z" />
    </>
  ),
  // Two interlocking rounded chain links.
  link: (
    <>
      <path d="M10 14a3 3 0 0 1 0-4l2-2a3 3 0 0 1 4 4l-1 1" />
      <path d="M14 10a3 3 0 0 1 0 4l-2 2a3 3 0 0 1-4-4l1-1" />
    </>
  ),
  // Warning triangle with an exclamation mark.
  warning: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  // Simple bat silhouette: scalloped wings and a small body.
  bat: (
    <path d="M12 8c-.6-1-1.4-1.6-2.4-1.6L8 8 6.4 6.4C4 6.4 2.5 8.4 2.5 11c1.4-.6 2.4-.4 3 .4C6 10.4 7 10 8 10.4c-.4 1.4.4 2.8 1.6 3.4L12 17l2.4-3.2c1.2-.6 2-2 1.6-3.4 1-.4 2 0 2.5 1.4.6-.8 1.6-1 3-.4 0-2.6-1.5-4.6-3.9-4.6L16 8l-1.6-1.6C13.4 6.4 12.6 7 12 8Z" />
  ),
  // Speaker with two sound waves.
  'sound-on': (
    <>
      <path d="M4 9v6h3l5 4V5L7 9H4Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  // Speaker with an X (muted).
  'sound-off': (
    <>
      <path d="M4 9v6h3l5 4V5L7 9H4Z" />
      <path d="M16 10l4 4" />
      <path d="M20 10l-4 4" />
    </>
  ),
  // Counter-clockwise undo arrow doubling back.
  undo: (
    <>
      <path d="M7 10h7a5 5 0 0 1 0 10h-3" />
      <path d="M7 10 10 7" />
      <path d="M7 10l3 3" />
    </>
  ),
  // marker-us: a small heraldic shield (distinct from markers below).
  'marker-us': (
    <path d="M12 4 6 6v6c0 3.5 2.6 5.8 6 7.5 3.4-1.7 6-4 6-7.5V6l-6-2Z" />
  ),
  // marker-mx: a hanging scroll/banner with rolled ends.
  'marker-mx': (
    <>
      <path d="M8 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2" />
      <path d="M8 6a2 2 0 0 1 0 4H6" />
      <path d="M16 18a2 2 0 0 1 0-4h2" />
    </>
  ),
  // marker-co: a triangular pennant on a pole.
  'marker-co': (
    <>
      <path d="M7 4v16" />
      <path d="M7 5l11 3.5L7 12" />
    </>
  ),
  // Spider web: radial strands with connecting arcs.
  web: (
    <>
      <path d="M12 3v18" />
      <path d="M4.5 7.5 19.5 16.5" />
      <path d="M19.5 7.5 4.5 16.5" />
      <path d="M8.5 7.8a7 7 0 0 1 7 0" />
      <path d="M6.5 12a9 9 0 0 1 11 0" />
      <path d="M8.5 16.2a7 7 0 0 0 7 0" />
    </>
  ),
  // Padlock: rounded shackle over a rectangular body with a keyhole.
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
      <path d="M12 14v2.5" />
    </>
  ),
};

export function Icon({ name, size = '1em', title, className }: IconProps) {
  const decorative = title === undefined;
  const classes = className ? `${styles.icon} ${className}` : styles.icon;

  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
    >
      {!decorative && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

export default Icon;
