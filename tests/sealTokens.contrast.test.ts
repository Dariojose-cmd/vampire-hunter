import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio, parseHexColor } from '../src/engine/contrast';

const ROOT = resolve(__dirname, '..');
const MIN = 4.5;

function parseTokens(css: string): Map<string, string> {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map<string, string>();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  // Later declarations win, except inside @media blocks which only tweak non-colors.
  while ((m = re.exec(stripped))) {
    if (!map.has(m[1])) map.set(m[1], m[2].trim());
  }
  return map;
}

function resolveToken(tokens: Map<string, string>, name: string): string | null {
  let value = tokens.get(name);
  const seen = new Set<string>([name]);
  while (value !== undefined) {
    const v = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(value);
    if (!v) return value;
    if (seen.has(v[1])) return null;
    seen.add(v[1]);
    value = tokens.get(v[1]);
  }
  return null;
}

const PAIRS: Array<[string, string, string]> = [
  ['default', '--seal-text', '--seal-bg'],
  ['hover', '--seal-text', '--seal-bg-hover'],
  ['focus', '--seal-text', '--seal-bg'],
  ['expanded', '--seal-text', '--seal-bg-expanded'],
  ['offline', '--seal-offline-text', '--seal-bg'],
  ['online', '--seal-text', '--seal-bg'],
  ['panel', '--seal-panel-text', '--seal-panel-bg'],
];

describe('seal tokens contrast', () => {
  const tokens = parseTokens(readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8'));

  for (const [state, fg, bg] of PAIRS) {
    it(`state=${state} pair=${fg} on ${bg} meets ${MIN}`, () => {
      const fgVal = resolveToken(tokens, fg);
      const bgVal = resolveToken(tokens, bg);
      const fgRgb = fgVal ? parseHexColor(fgVal) : null;
      const bgRgb = bgVal ? parseHexColor(bgVal) : null;
      expect(fgRgb, `state=${state} ${fg} is not an opaque hex color (${fgVal})`).not.toBeNull();
      expect(bgRgb, `state=${state} ${bg} is not an opaque hex color (${bgVal})`).not.toBeNull();
      const ratio = contrastRatio(fgRgb!, bgRgb!);
      expect(
        ratio >= MIN,
        `state=${state} pair=${fg} on ${bg} ratio=${ratio.toFixed(2)} (min ${MIN})`,
      ).toBe(true);
    });
  }
});

describe('seal CSS modules only use --seal-* colors', () => {
  const files = ['src/components/PrivacySeal.module.css', 'src/components/SealPanel.module.css'];
  const ALLOWED = /^(transparent|inherit|currentColor|var\(\s*--seal-[\w-]+\s*\))$/i;

  for (const rel of files) {
    const abs = resolve(ROOT, rel);
    const exists = existsSync(abs);
    it.skipIf(!exists)(`${rel} color declarations`, () => {
      const css = readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const re = /(?:^|[;{\s])(color|background|background-color)\s*:\s*([^;}]+)/gi;
      const bad: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(css))) {
        const value = m[2].trim().replace(/\s*!important$/i, '');
        if (!ALLOWED.test(value)) bad.push(`${m[1]}: ${value}`);
      }
      expect(bad, `${rel} has non --seal-* colors`).toEqual([]);
    });
  }
});
