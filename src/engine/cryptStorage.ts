/**
 * Vampire Hunter — localStorage persistence (pure TypeScript, zero React).
 *
 * Stores ONLY the user's decisions, language, and currency under a single key.
 * Raw transactions and CSV contents are NEVER persisted (privacy promise,
 * Requirement 11.2 / 13.1). Decisions are keyed by the stable vampire id
 * (`normalizedName_clusterIndex`), so re-loading the same statement restores
 * them.
 *
 * All functions handle `localStorage` being unavailable (private mode,
 * disabled storage, quota) gracefully: reads return `null`, writes report a
 * `STORAGE_UNAVAILABLE` Result instead of throwing.
 */

import type { CryptStorage, Result } from './types';

/** The single localStorage key. Versioned so future migrations are possible. */
export const CRYPT_STORAGE_KEY = 'vampire-hunter:crypt';

/** A fresh, empty storage object. */
export function emptyCryptStorage(): CryptStorage {
  return { decisions: {}, language: 'en', currency: 'USD', soundEnabled: false };
}

/** Narrowing guard: is the parsed value a plausible CryptStorage shape? */
function isCryptStorage(value: unknown): value is CryptStorage {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.decisions !== 'object' || v.decisions === null) return false;
  if (v.language !== 'en' && v.language !== 'es') return false;
  if (typeof v.currency !== 'string') return false;
  return true;
}

/**
 * Load persisted crypt storage. Returns `null` when nothing is stored or when
 * localStorage is unavailable / the stored value is corrupt. Never throws.
 */
export function loadCryptStorage(): CryptStorage | null {
  try {
    const raw = localStorage.getItem(CRYPT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCryptStorage(parsed)) return null;
    // Defensive copy with only the known fields — never trust extra keys and
    // never resurrect any accidentally-stored transaction data.
    return {
      decisions: parsed.decisions,
      language: parsed.language,
      currency: parsed.currency,
      soundEnabled: parsed.soundEnabled === true,
    };
  } catch {
    return null;
  }
}

/**
 * Persist crypt storage. Returns `{ ok: true }` on success or a
 * `STORAGE_UNAVAILABLE` error Result when the write fails. Never throws.
 *
 * Only `decisions`, `language`, `currency`, and the `soundEnabled` boolean are
 * written — no transactions.
 */
export function saveCryptStorage(storage: CryptStorage): Result<true> {
  try {
    const safe: CryptStorage = {
      decisions: storage.decisions,
      language: storage.language,
      currency: storage.currency,
      soundEnabled: storage.soundEnabled === true,
    };
    localStorage.setItem(CRYPT_STORAGE_KEY, JSON.stringify(safe));
    return { ok: true, value: true };
  } catch {
    return {
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: 'Could not save your decisions. Browser storage may be disabled or full.',
      },
    };
  }
}

/**
 * Burn the crypt: remove the stored key entirely. Never throws.
 */
export function burnCrypt(): void {
  try {
    localStorage.removeItem(CRYPT_STORAGE_KEY);
  } catch {
    // Nothing to do — storage unavailable means there is nothing persisted.
  }
}
