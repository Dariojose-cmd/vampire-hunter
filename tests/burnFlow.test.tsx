/**
 * Burn flow tests — design Correctness Property 5.
 *
 * Property 5: Confirming the burn clears Crypt Storage decisions synchronously,
 * and after the sequence completes the app shows the Upload View (empty altar)
 * — never the Cleansed victory ending.
 *
 * Validates: Requirements 1.4, 1.5, 1.6, 8.4
 *
 * ----------------------------------------------------------------------------
 * Approach chosen: FOCUSED orchestration-contract tests (guidance option (b)).
 *
 * Why not drive the full UI to the results view (option (a)): the Burn button
 * only renders when `view === 'results'`, which requires a real CSV upload
 * (FileReader + Papa Parse) to produce a DetectionResult. Driving that end to
 * end in jsdom is heavy and prone to flakiness. The burn *orchestration* is the
 * actual contract Property 5 is about, and it splits cleanly into two
 * deterministic pieces that together establish the property:
 *
 *   1. The data wipe is SYNCHRONOUS on confirm and does NOT depend on the
 *      animation. `App.onBurnConfirmed()` calls `useCryptStorage().burn()`
 *      immediately, then flips `burnPhase` to 'burning'. So we verify that
 *      `burn()` clears Crypt Storage synchronously — right after the `act()`
 *      call, with no timers advanced. (Req 1.4, 8.4)
 *
 *   2. The burn sequence ALWAYS resolves, so the app always reaches the Upload
 *      View. `App.onBurnComplete()` (which calls `reset()` → Upload View and is
 *      never routed through Cleansed) runs exactly when `BurnOverlay` fires
 *      `onComplete`. So we verify the overlay's completion contract: it fires
 *      `onComplete` exactly once within the full-motion budget, and also within
 *      the reduced-motion fade budget. Because App wires `onComplete` directly
 *      to `onBurnComplete` → `reset()` (→ `setView('upload')`), a guaranteed
 *      completion means a guaranteed landing on the Upload View, and the wiring
 *      never touches the Cleansed ending. (Req 1.5, 1.6)
 *
 * Follows tests/icon.test.tsx conventions: @testing-library/react render/
 * cleanup, the `@components` path alias, and afterEach(cleanup).
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { CRYPT_STORAGE_KEY } from '@engine/cryptStorage';
import type { CryptStorage } from '@engine/types';
import { useCryptStorage } from '@components/useCryptStorage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Seed localStorage with a crypt that has decisions, matching the stored schema. */
function seedCrypt(): CryptStorage {
  const seeded: CryptStorage = {
    decisions: {
      'netflix_0': { vampireId: 'netflix_0', decision: 'staked', decidedAt: '2024-01-01T00:00:00.000Z' },
      'spotify_0': { vampireId: 'spotify_0', decision: 'spared', decidedAt: '2024-01-02T00:00:00.000Z' },
    },
    language: 'en',
    currency: 'USD',
  };
  localStorage.setItem(CRYPT_STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

describe('Burn flow — wipe is immediate and animation-independent (Req 1.4, 8.4)', () => {
  it('burn() clears Crypt Storage decisions SYNCHRONOUSLY on confirm, before any animation', () => {
    seedCrypt();
    // Sanity: the seeded decisions really are present before the burn.
    const before = localStorage.getItem(CRYPT_STORAGE_KEY);
    expect(before).not.toBeNull();
    expect(before).toContain('netflix_0');
    expect(before).toContain('spotify_0');

    const { result } = renderHook(() => useCryptStorage());
    // The hook loads the seeded decisions on mount.
    expect(result.current.decisions['netflix_0']).toBe('staked');
    expect(result.current.decisions['spotify_0']).toBe('spared');

    // burn() is what App.onBurnConfirmed() calls immediately on confirm.
    act(() => {
      result.current.burn();
    });

    // SYNCHRONOUSLY — right after act(), with no timers advanced — the stored
    // decisions are gone. burnCrypt() removes the key via localStorage.removeItem.
    const after = localStorage.getItem(CRYPT_STORAGE_KEY);
    expect(after).not.toContain('netflix_0');
    expect(after).not.toContain('spotify_0');

    // And React state reflects an empty crypt.
    expect(result.current.decisions).toEqual({});
  });
});

describe('Burn flow — the sequence always resolves (Req 1.5, 1.6)', () => {
  it('BurnOverlay fires onComplete exactly once within the full-motion budget', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    // Imported inside the test so vi.useFakeTimers is active for the overlay's
    // internal setTimeout safety fallback.
    const { BurnOverlay } = await import('@components/BurnOverlay');

    render(<BurnOverlay onComplete={onComplete} />);

    // Not called before the budget elapses.
    expect(onComplete).not.toHaveBeenCalled();

    // Advance well past the full-motion budget (1400ms). The safety setTimeout
    // guarantees completion even if the animation event is missed in jsdom.
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);

    // Idempotent: running out any residual timers does not fire it again.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('BurnOverlay fires onComplete within the reduced-motion fade budget', async () => {
    // Mock ONLY framer-motion's useReducedMotion (keep the rest real) so the
    // overlay takes the reduced-motion branch deterministically — jsdom has no
    // matchMedia, so we cannot rely on prefers-reduced-motion media queries.
    vi.resetModules();
    vi.doMock('framer-motion', async () => {
      const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
      return { ...actual, useReducedMotion: () => true };
    });

    vi.useFakeTimers();
    const onComplete = vi.fn();

    const { BurnOverlay } = await import('@components/BurnOverlay');
    render(<BurnOverlay onComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();

    // Advance past the reduced-motion fade budget (280ms).
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.doUnmock('framer-motion');
  });
});
