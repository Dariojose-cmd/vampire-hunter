/**
 * WCAG 2.x contrast ratio helpers. Pure TypeScript: no React, no DOM.
 */

export interface Rgb {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** Parses `#rgb` or `#rrggbb` (opaque only). Returns null for anything else. */
export function parseHexColor(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  const s = hex.trim();
  const m6 = HEX_6.exec(s);
  if (m6) {
    return {
      r: parseInt(m6[1], 16),
      g: parseInt(m6[2], 16),
      b: parseInt(m6[3], 16),
    };
  }
  const m3 = HEX_3.exec(s);
  if (m3) {
    return {
      r: parseInt(m3[1] + m3[1], 16),
      g: parseInt(m3[2] + m3[2], 16),
      b: parseInt(m3[3] + m3[3], 16),
    };
  }
  return null;
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(c: Rgb): number {
  return (
    0.2126 * channelToLinear(c.r) +
    0.7152 * channelToLinear(c.g) +
    0.0722 * channelToLinear(c.b)
  );
}

/** WCAG 2.x contrast ratio, symmetric, in [1, 21]. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return Math.min(21, Math.max(1, ratio));
}
