/**
 * No-emoji guard + i18n key-parity guard.
 *
 * PART A — design Correctness Property 4: after the de-emojification, no emoji
 *          codepoints remain in the UI layer (components + i18n strings).
 *          Validates: Requirements 5.2, 7.1
 *
 * PART B — design Correctness Property 6: en.json and es.json expose an identical
 *          set of (dot-notated) translation keys.
 *          Validates: Requirement 7.4
 *
 * This is a plain Node/fs + JSON test. It reads source files from disk, so it does
 * not depend on the jsdom environment (fs is available there under Node anyway).
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();

/**
 * Emoji detection regex. Covers the common pictographic blocks:
 *  - 1F300–1FAFF  Misc symbols & pictographs, supplemental symbols, emoticons, etc.
 *  - 2600–27BF    Misc symbols + Dingbats (includes most "☠ ⚰ 🛡-adjacent" symbols)
 *  - 2B00–2BFF    Misc symbols and arrows (stars, etc.)
 *  - 1F000–1F0FF  Mahjong/Domino/Playing-card pictographs
 *  - 20E3         Combining enclosing keycap (used in keycap emoji sequences)
 *
 * Deliberately EXCLUDED so ordinary typography never trips the guard:
 *  - × U+00D7 multiplication sign (used as a close glyph)
 *  - • U+2022 bullet, … U+2026 ellipsis, – U+2013 / — U+2014 dashes, curly quotes
 * The ZWJ (U+200D), variation selectors (U+FE00–FE0F) and keycap mark only form emoji when
 * attached to a pictographic base codepoint, so matching the base alone is sufficient (and
 * avoids joiner/combining sequences in a character class, which lint flags).
 */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1F0FF}]/u;

/** Scan text and return the first emoji match, or null if clean. */
function findEmoji(text: string): string | null {
  const m = text.match(EMOJI_RE);
  return m ? m[0] : null;
}

/** Recursively collect files under `dir` whose path matches `filter`. */
function walk(dir: string, filter: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, filter));
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Recursively collect dot-notated keys from a plain JSON object. */
function collectKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('No emoji in the UI layer (Correctness Property 4)', () => {
  const componentFiles = walk(resolve(ROOT, 'src/components'), (p) =>
    p.endsWith('.tsx'),
  );
  const i18nFiles = [
    resolve(ROOT, 'src/i18n/en.json'),
    resolve(ROOT, 'src/i18n/es.json'),
  ];
  const scanned = [...componentFiles, ...i18nFiles];

  it('scans at least the component .tsx files and both i18n JSON files', () => {
    // Sanity: the walk actually found something, so a passing suite is meaningful.
    expect(componentFiles.length).toBeGreaterThan(0);
    expect(scanned).toContain(resolve(ROOT, 'src/i18n/en.json'));
    expect(scanned).toContain(resolve(ROOT, 'src/i18n/es.json'));
  });

  it.each(scanned)('%s contains no emoji codepoints', (file) => {
    const content = readFileSync(file, 'utf8');
    const match = findEmoji(content);
    expect(
      match,
      match
        ? `Found emoji ${JSON.stringify(match)} (codepoint U+${match
            .codePointAt(0)!
            .toString(16)
            .toUpperCase()}) in ${file}`
        : undefined,
    ).toBeNull();
  });

  it('does not flag ordinary typography (× • … – — curly quotes)', () => {
    // Guard against an over-broad regex: these legitimate glyphs must pass.
    expect(findEmoji('close × bullet • ellipsis … dash – em — "curly" \u2018q\u2019')).toBeNull();
  });
});

describe('i18n key parity (Correctness Property 6)', () => {
  const en = JSON.parse(
    readFileSync(resolve(ROOT, 'src/i18n/en.json'), 'utf8'),
  ) as unknown;
  const es = JSON.parse(
    readFileSync(resolve(ROOT, 'src/i18n/es.json'), 'utf8'),
  ) as unknown;

  it('en.json and es.json have identical key sets', () => {
    const enKeys = new Set(collectKeys(en));
    const esKeys = new Set(collectKeys(es));

    const missingFromEs = [...enKeys].filter((k) => !esKeys.has(k)).sort();
    const missingFromEn = [...esKeys].filter((k) => !enKeys.has(k)).sort();

    expect(
      missingFromEs,
      `Keys present in en.json but missing from es.json: ${missingFromEs.join(', ')}`,
    ).toEqual([]);
    expect(
      missingFromEn,
      `Keys present in es.json but missing from en.json: ${missingFromEn.join(', ')}`,
    ).toEqual([]);
  });
});
