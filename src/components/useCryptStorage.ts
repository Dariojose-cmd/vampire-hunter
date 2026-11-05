/**
 * useCryptStorage — React hook wrapping the pure localStorage persistence.
 *
 * Initializes state from `loadCryptStorage()` on mount, exposes setters for
 * decisions / language / currency, and writes through to localStorage on every
 * change. Raw transaction data and CSV contents are never persisted.
 *
 * Decisions are keyed by the stable vampire id (`normalizedName_clusterIndex`),
 * so loading the same statement again restores the user's choices.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  burnCrypt as burnCryptStorage,
  emptyCryptStorage,
  loadCryptStorage,
  saveCryptStorage,
} from '@engine/cryptStorage';
import type { CryptStorage, DecisionType } from '@engine/types';
import type { Language } from '@i18n/index';

export interface UseCryptStorage {
  /** Decisions keyed by vampire id. */
  decisions: Record<string, DecisionType>;
  language: Language;
  currency: string;
  /** True if a previous write failed (storage disabled / full). */
  storageUnavailable: boolean;
  setDecision: (vampireId: string, decision: DecisionType) => void;
  setLanguage: (language: Language) => void;
  setCurrency: (currency: string) => void;
  /** Wipe everything: clear localStorage and reset React state. */
  burn: () => void;
}

export function useCryptStorage(): UseCryptStorage {
  // Lazy init from storage so the first render already reflects saved state.
  const [storage, setStorage] = useState<CryptStorage>(
    () => loadCryptStorage() ?? emptyCryptStorage(),
  );
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  // Skip the write-through on the very first effect run (nothing changed yet).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const result = saveCryptStorage(storage);
    setStorageUnavailable(!result.ok);
  }, [storage]);

  const setDecision = useCallback((vampireId: string, decision: DecisionType) => {
    setStorage((prev) => {
      const decisions = { ...prev.decisions };
      if (decision === null) {
        delete decisions[vampireId];
      } else {
        decisions[vampireId] = {
          vampireId,
          decision,
          decidedAt: new Date().toISOString(),
        };
      }
      return { ...prev, decisions };
    });
  }, []);

  const setLanguage = useCallback((language: Language) => {
    setStorage((prev) => ({ ...prev, language }));
  }, []);

  const setCurrency = useCallback((currency: string) => {
    setStorage((prev) => ({ ...prev, currency }));
  }, []);

  const burn = useCallback(() => {
    burnCryptStorage();
    setStorage(emptyCryptStorage());
    setStorageUnavailable(false);
  }, []);

  // Project the stored UserDecision records down to a simple id→decision map
  // for the UI (components only need the decision kind, not the timestamp).
  const decisions: Record<string, DecisionType> = {};
  for (const [id, rec] of Object.entries(storage.decisions)) {
    decisions[id] = rec.decision;
  }

  return {
    decisions,
    language: storage.language,
    currency: storage.currency,
    storageUnavailable,
    setDecision,
    setLanguage,
    setCurrency,
    burn,
  };
}
