/**
 * App-level Sound_Toggle, persistence, visibility and burn interaction tests.
 *
 * Validates: Requirements 6.1, 6.3, 6.6, 6.9, 7.9, 7.10
 *
 * No real AudioContext is ever used: `defaultAudioContextFactory` from
 * '@audio/index' is replaced by a spy that returns a fake context. The real
 * sound engine and the real `useSoundEngine` hook still run on top of it, so
 * the assertions cover the actual App wiring.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CRYPT_STORAGE_KEY } from '@engine/cryptStorage';

const { factoryMock } = vi.hoisted(() => ({ factoryMock: vi.fn() }));

vi.mock('@audio/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@audio/index')>();
  return {
    ...actual,
    defaultAudioContextFactory: () => factoryMock(),
  };
});

import { App } from '@components/App';

// ---------- fake audio ----------

function fakeParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setValueCurveAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function fakeNode() {
  return {
    gain: fakeParam(),
    frequency: fakeParam(),
    detune: fakeParam(),
    Q: fakeParam(),
    delayTime: fakeParam(),
    threshold: fakeParam(),
    knee: fakeParam(),
    ratio: fakeParam(),
    attack: fakeParam(),
    release: fakeParam(),
    reduction: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    getChannelData: () => new Float32Array(16),
    type: 'sine',
    loop: false,
    buffer: null,
  };
}

function makeFakeContext() {
  return {
    state: 'running' as const,
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(fakeNode),
    createOscillator: vi.fn(fakeNode),
    createBuffer: vi.fn(() => fakeNode()),
    createBufferSource: vi.fn(fakeNode),
    createBiquadFilter: vi.fn(fakeNode),
    createDelay: vi.fn(fakeNode),
    createDynamicsCompressor: vi.fn(fakeNode),
  };
}

type FakeCtx = ReturnType<typeof makeFakeContext>;
let ctx: FakeCtx;

let hidden = false;
function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

const CSV = [
  'Date,Description,Amount,Currency',
  '2026-01-14,NETFLIX STREAMING SERVICE,-15.49,USD',
  '2026-02-14,NETFLIX STREAMING SERVICE,-15.49,USD',
  '2026-03-14,NETFLIX STREAMING SERVICE,-15.49,USD',
  '2026-04-14,NETFLIX STREAMING SERVICE,-15.49,USD',
  '2026-05-14,NETFLIX STREAMING SERVICE,-15.49,USD',
].join('\n');

beforeEach(() => {
  ctx = makeFakeContext();
  factoryMock.mockReset();
  factoryMock.mockImplementation(() => ctx);
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: 'Toggle sound effects' });
}

function seedSoundOn() {
  localStorage.setItem(
    CRYPT_STORAGE_KEY,
    JSON.stringify({ decisions: {}, language: 'en', currency: 'USD', soundEnabled: true }),
  );
}

/** Upload a tiny CSV through the real file input and wait for the results view. */
async function uploadCsv(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([CSV], 'test.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole('button', { name: /Burn the Crypt/ });
}

/** Click Burn then confirm. */
function burnAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: /Burn the Crypt/ }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm – burn the crypt/ }));
}

describe('Sound_Toggle on first render and gestures (Req 6.1, 6.3)', () => {
  it('starts off with aria-pressed="false" and never calls the factory before a gesture', () => {
    render(<App />);
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(factoryMock).not.toHaveBeenCalled();
  });

  it('clicking the toggle turns it on and calls enable (factory) inside the click', () => {
    render(<App />);
    expect(factoryMock).not.toHaveBeenCalled();

    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    // The engine creates its context synchronously within the click handler.
    expect(factoryMock).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('clicking again disables: aria-pressed false and audio is torn down', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem(CRYPT_STORAGE_KEY) ?? '{}').soundEnabled).toBe(false);

    // Master ramp-down finishes, then the context is closed.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it('persists the choice: toggling on writes soundEnabled=true', () => {
    render(<App />);
    fireEvent.click(toggle());
    expect(JSON.parse(localStorage.getItem(CRYPT_STORAGE_KEY) ?? '{}').soundEnabled).toBe(true);
  });
});

describe('Persisted soundEnabled=true (Req 6.6, 6.9)', () => {
  it('starts pressed but does not touch the factory until the first pointerdown', () => {
    seedSoundOn();
    render(<App />);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(factoryMock).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(factoryMock).toHaveBeenCalledTimes(1);

    // One-time listener: a second gesture does not create another context.
    fireEvent.pointerDown(document.body);
    expect(factoryMock).toHaveBeenCalledTimes(1);
  });

  it('also arms on the first keydown', () => {
    seedSoundOn();
    render(<App />);
    expect(factoryMock).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'a' });
    expect(factoryMock).toHaveBeenCalledTimes(1);
  });
});

describe('Document visibility (Req 7.9, 7.10)', () => {
  it('suspends the context when hidden and resumes when visible again', () => {
    render(<App />);
    fireEvent.click(toggle());
    ctx.resume.mockClear();
    ctx.suspend.mockClear();

    act(() => setHidden(true));
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(ctx.resume).not.toHaveBeenCalled();

    act(() => setHidden(false));
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('does nothing (and creates no context) when sound is off', () => {
    render(<App />);
    act(() => setHidden(true));
    act(() => setHidden(false));
    expect(factoryMock).not.toHaveBeenCalled();
    expect(ctx.suspend).not.toHaveBeenCalled();
  });
});

describe('Burn interaction with sound', () => {
  it('turning sound off mid-burn lets the burn finish with no further audio calls', async () => {
    const { container } = render(<App />);
    fireEvent.click(toggle());
    await uploadCsv(container);

    vi.useFakeTimers();
    burnAndConfirm();
    // Overlay is up; the crackle started on the live context.
    expect(screen.queryByRole('heading', { name: 'Find Your Vampires' })).toBeNull();

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    const sources = ctx.createBufferSource.mock.calls.length;
    const gains = ctx.createGain.mock.calls.length;
    const oscs = ctx.createOscillator.mock.calls.length;
    const factoryCalls = factoryMock.mock.calls.length;

    // Run out the whole burn budget (full-motion 1400ms safety timer).
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Burn finished: Upload View is shown.
    expect(screen.getByRole('heading', { name: 'Find Your Vampires' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Burn the Crypt/ })).toBeNull();

    // No audio nodes were created after sound was turned off, no new context.
    expect(ctx.createBufferSource.mock.calls.length).toBe(sources);
    expect(ctx.createGain.mock.calls.length).toBe(gains);
    expect(ctx.createOscillator.mock.calls.length).toBe(oscs);
    expect(factoryMock.mock.calls.length).toBe(factoryCalls);
  });

  it('wipe everything removes the stored sound preference', async () => {
    seedSoundOn();
    const { container } = render(<App />);
    expect(JSON.parse(localStorage.getItem(CRYPT_STORAGE_KEY) ?? '{}').soundEnabled).toBe(true);
    await uploadCsv(container);

    burnAndConfirm();

    // After the wipe the persisted value is never `true` again (key removed,
    // or re-written from the empty defaults with soundEnabled=false).
    await waitFor(() => {
      const raw = localStorage.getItem(CRYPT_STORAGE_KEY);
      const stored = raw === null ? null : JSON.parse(raw);
      expect(stored?.soundEnabled ?? false).toBe(false);
    });
  });
});
