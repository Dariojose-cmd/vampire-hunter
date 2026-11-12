/**
 * Property test for the persisted sound preference.
 *
 * Feature: ux-burn-garlic-sound-fixes, Property 12: soundEnabled round-trips and burn resets it
 *
 * **Validates: Requirements 6.1, 10.4, 11.3**
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { burnCrypt, loadCryptStorage, saveCryptStorage } from '../src/engine/cryptStorage';
import type { CryptStorage } from '../src/engine/types';

afterEach(() => {
  localStorage.clear();
});

function make(soundEnabled: boolean): CryptStorage {
  return { decisions: {}, language: 'en', currency: 'USD', soundEnabled };
}

describe('Feature: ux-burn-garlic-sound-fixes, Property 12', () => {
  it('save then load returns the same soundEnabled value', () => {
    fc.assert(
      fc.property(fc.boolean(), (soundEnabled) => {
        localStorage.clear();
        expect(saveCryptStorage(make(soundEnabled)).ok).toBe(true);
        expect(loadCryptStorage()?.soundEnabled).toBe(soundEnabled);
      }),
      { numRuns: 100 },
    );
  });

  it('after burnCrypt(), soundEnabled loads as false', () => {
    fc.assert(
      fc.property(fc.boolean(), (soundEnabled) => {
        localStorage.clear();
        saveCryptStorage(make(soundEnabled));
        burnCrypt();
        expect(loadCryptStorage()?.soundEnabled ?? false).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
