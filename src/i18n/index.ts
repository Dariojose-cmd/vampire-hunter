/**
 * i18n foundation for Vampire Hunter.
 *
 * Provides a typed `useTranslation` hook and a `t()` accessor that:
 *  - resolves deeply-nested keys with dot notation ("vampireCard.stakeButton")
 *  - interpolates `{{variable}}` placeholders
 *  - falls back to the English string when a Spanish key is missing
 *  - never throws — returns the key itself as last resort so the UI never breaks
 *
 * Requirements: 12.1, 12.3, 12.4
 */

import { useCallback } from 'react';
import en from './en.json';
import es from './es.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Language = 'en' | 'es';

/** Interpolation variables map, e.g. { name: 'Netflix', amount: '$14.99' } */
export type Vars = Record<string, string | number>;

// Derive the full shape of the translation tree from the English file
// (es.json must have the same structure).
type TranslationTree = typeof en;

// Utility: flatten a nested object type into "a.b.c" dot-path strings
type DotPaths<T, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? DotPaths<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K & string}`>
    : `${Prefix}${Prefix extends '' ? '' : '.'}${K & string}`;
}[keyof T];

/** All valid dot-notation keys that exist in the translation files */
export type TranslationKey = DotPaths<TranslationTree>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const catalogs: Record<Language, TranslationTree> = { en, es };

/**
 * Traverse a nested object by a dot-notation path.
 * Returns `undefined` if the path does not exist.
 */
function getByPath(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace `{{variable}}` placeholders with values from `vars`.
 */
function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Core resolution: look up `key` in the given language, falling back to
 * English, and finally returning the raw key string if nothing resolves.
 */
function resolve(lang: Language, key: string, vars?: Vars): string {
  const catalog = catalogs[lang] as Record<string, unknown>;
  const fallback = catalogs['en'] as Record<string, unknown>;

  const raw =
    getByPath(catalog, key) ??
    getByPath(fallback, key) ??
    key; // last resort — never crashes

  return interpolate(raw, vars);
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export interface UseTranslationReturn {
  /**
   * Translate a key, optionally interpolating `{{variable}}` placeholders.
   *
   * @example
   *   t('vampireCard.stakeAriaLabel', { name: 'Netflix' })
   *   // → "Stake Netflix – cancel this subscription"
   */
  t: (key: TranslationKey, vars?: Vars) => string;

  /** Active language code. */
  lang: Language;
}

/**
 * React hook that returns a `t()` accessor bound to the given language.
 *
 * The caller is responsible for holding `language` in React state and
 * passing it down (or via context). This keeps the hook pure and avoids
 * a global store dependency.
 *
 * @example
 *   const { t } = useTranslation('es');
 *   t('upload.title')          // "Encuentra Tus Vampiros"
 *   t('garlic.icsEventSummary', { name: 'Spotify' })
 */
export function useTranslation(lang: Language): UseTranslationReturn {
  const t = useCallback(
    (key: TranslationKey, vars?: Vars): string => resolve(lang, key, vars),
    [lang],
  );

  return { t, lang };
}

// ---------------------------------------------------------------------------
// Non-hook utility for engine-adjacent code (no React import needed there)
// ---------------------------------------------------------------------------

/**
 * Standalone translation function for use outside React components,
 * e.g. in `icsGenerator.ts` where only the language string is known.
 *
 * @example
 *   translate('es', 'garlic.icsEventDescription', { name: 'Netflix', amount: '$14.99' })
 */
export function translate(lang: Language, key: string, vars?: Vars): string {
  return resolve(lang, key, vars);
}
