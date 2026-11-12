/**
 * Garlic chime tests (ux-burn-garlic-sound-fixes).
 *
 * Feature: ux-burn-garlic-sound-fixes, Property 9: Chime plays only on success while enabled
 *
 * Validates: Requirements 9.1, 9.5, 9.6, 12.7
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import fc from 'fast-check';

const mocks = vi.hoisted(() => ({ download: vi.fn<(...args: unknown[]) => boolean>() }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

vi.mock('@components/garlicDownload', () => ({
  downloadGarlicIcs: (...args: unknown[]) => mocks.download(...args),
}));

import { Crypt } from '@components/Crypt';
import { createSoundEngine, type AudioContextLike, type SoundEngine } from '../src/audio/soundEngine';
import type { DetectionResult, Vampire } from '@engine/types';

// ---------------------------------------------------------------------------
// Minimal fake Web Audio context
// ---------------------------------------------------------------------------

class FakeParam {
  value = 1;
  freqs: number[] = [];
  setValueAtTime(v: number): this {
    this.value = v;
    this.freqs.push(v);
    return this;
  }
  linearRampToValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
  setValueCurveAtTime(): this {
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  detune = new FakeParam();
  Q = new FakeParam();
  delayTime = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  reduction = 0;
  constructor(public kind: string) {}
  connect(d: unknown) {
    return d;
  }
  disconnect() {}
  start() {}
  stop() {}
}

class FakeCtx {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  private make(kind: string) {
    const n = new FakeNode(kind);
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.make('gain');
  }
  createOscillator() {
    return this.make('oscillator');
  }
  createBufferSource() {
    return this.make('bufferSource');
  }
  createBiquadFilter() {
    return this.make('biquad');
  }
  createDelay() {
    return this.make('delay');
  }
  createDynamicsCompressor() {
    return this.make('compressor');
  }
  createBuffer(_c: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  /** Oscillators tuned to a chime partial (880 / 1320 Hz). */
  chimeOscillators(since = 0) {
    // Only nodes created after `since`: the Pad upper voices also sit at 880 Hz (amendment 4).
    return this.nodes.slice(since).filter(
      (n) => n.kind === 'oscillator' && n.frequency.freqs.some((f) => f === 880 || f === 1320),
    );
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VAMPIRE: Vampire = {
  id: 'vamp_0',
  normalizedName: 'NETFLIX',
  displayName: 'Netflix',
  cadence: 'monthly',
  bites: [],
  medianAmountCents: 1499,
  annualBloodLossCents: 17988,
  threatLevel: 'Medium',
  firstBiteDate: '2024-01-15',
  lastBiteDate: '2024-03-15',
  nextBiteDate: '2024-04-15',
  confidenceScore: 90,
  isAmountStable: true,
  hasFreeTrial: false,
  hasPriceIncrease: false,
  amountHistory: [1499, 1499, 1499],
  avatarSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
  currency: 'USD',
};

const RESULT = { vampires: [VAMPIRE], possibleVampires: [] } as unknown as DetectionResult;

function mountCrypt(sound: SoundEngine) {
  return render(
    <Crypt
      language="en"
      currency="USD"
      result={RESULT}
      sound={sound}
      decisions={{}}
      onDecision={() => {}}
      onUploadAnother={() => {}}
    />,
  );
}

/** Wait out the summoning ritual, then click the Garlic button. */
function clickGarlic(container: HTMLElement) {
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  const btn = container.querySelector<HTMLButtonElement>('button[aria-describedby^="garlic-hint-"]');
  expect(btn).not.toBeNull();
  fireEvent.click(btn!);
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.download.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Feature: ux-burn-garlic-sound-fixes, Property 9
// ---------------------------------------------------------------------------

describe('Feature: ux-burn-garlic-sound-fixes, Property 9: Chime plays only on success while enabled', () => {
  it('real engine: chime oscillators exist iff enabled && download succeeded; disabled never touches the factory', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (enabled, success) => {
        mocks.download.mockReset();
        mocks.download.mockReturnValue(success);
        const ctxs: FakeCtx[] = [];
        const factory = vi.fn(() => {
          const c = new FakeCtx();
          ctxs.push(c);
          return c as unknown as AudioContextLike;
        });
        const engine = createSoundEngine({ factory, random: () => 0.5 });
        if (enabled) engine.enable();
        const { container, unmount } = mountCrypt(engine);
        const baseline = ctxs[0]?.nodes.length ?? 0;
        clickGarlic(container);

        const chimed = ctxs.some((c) => c.chimeOscillators(baseline).length > 0);
        expect(chimed).toBe(enabled && success);
        if (!enabled) expect(factory).not.toHaveBeenCalled();
        expect(mocks.download).toHaveBeenCalledTimes(1);

        engine.disable();
        unmount();
        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it('mocked engine: playChime is called iff the download succeeded', () => {
    fc.assert(
      fc.property(fc.boolean(), (success) => {
        mocks.download.mockReturnValue(success);
        const engine: SoundEngine = {
          enable: vi.fn(),
          disable: vi.fn(),
          isEnabled: () => true,
          playStake: vi.fn(),
          startCrackle: vi.fn(),
          stopCrackle: vi.fn(),
          playChime: vi.fn(),
          setDocumentHidden: vi.fn(),
        };
        const { container, unmount } = mountCrypt(engine);
        clickGarlic(container);

        expect(engine.playChime).toHaveBeenCalledTimes(success ? 1 : 0);

        unmount();
        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});
