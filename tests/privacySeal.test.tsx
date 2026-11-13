/**
 * PrivacySeal component + usePrivacySeal hook tests.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.7, 9.1, 9.5, 9.6, 9.9, 9.11, 9.13,
 * 9.14, 10.1, 10.2, 10.11, 11.3, 11.4, 11.5, 11.6, 14.5
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivacySeal } from '@components/PrivacySeal';
import { usePrivacySeal, type SealState } from '@components/usePrivacySeal';
import en from '@i18n/en.json';
import es from '@i18n/es.json';
import type { OfflineStatus } from '@engine/offlineStatus';

type Lang = 'en' | 'es';
const dicts = { en: en.seal, es: es.seal };
const fill = (s: string, count?: number) => s.replace('{{count}}', String(count));

const STATUS_KEY = {
  ready: 'offlineReady',
  checking: 'offlinePreparing',
  offline: 'offlineNow',
  unavailable: 'offlineUnavailable',
} as const;

/** Expected strings built from the JSON files, not from sealText. */
function expected(lang: Lang, state: SealState) {
  const d = dicts[lang];
  const key = STATUS_KEY[state.offlineStatus];
  const compactCount = state.measurable
    ? fill(d.compact.connections, state.externalCount)
    : d.compact.connectionsNotMeasurable;
  const fullCount = state.measurable
    ? fill(d.full.connections, state.externalCount)
    : d.full.connectionsNotMeasurable;
  const compact = `${compactCount} · ${d.compact[key]}`;
  const full = `${fullCount}. ${d.full[key]}.`;
  return { compact, full };
}

const statuses: OfflineStatus[] = ['ready', 'checking', 'offline', 'unavailable'];
const cases: Array<{ name: string; state: SealState }> = [
  ...statuses.map((s) => ({
    name: s,
    state: { measurable: true, externalCount: 3, offlineStatus: s } as SealState,
  })),
  {
    name: 'not measurable',
    state: { measurable: false, externalCount: 0, offlineStatus: 'ready' },
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(['en', 'es'] as const)('PrivacySeal text and ARIA (%s)', (lang) => {
  it.each(cases)('$name: label, aria-label, expanded, single control', async ({ state }) => {
    const user = userEvent.setup();
    const { compact, full } = expected(lang, state);
    render(<PrivacySeal language={lang} state={state} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    const button = buttons[0];

    expect(button.textContent).toBe(compact);
    const label = button.getAttribute('aria-label')!;
    expect(label.startsWith(`${compact}. `)).toBe(true);
    expect(label.slice(compact.length + 2)).toBe(full);

    expect(button.getAttribute('aria-expanded')).toBe('false');
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('live region is silent first, then carries only full sentences once per change', () => {
    const a: SealState = { measurable: true, externalCount: 0, offlineStatus: 'checking' };
    const b: SealState = { measurable: true, externalCount: 0, offlineStatus: 'ready' };
    const c: SealState = { measurable: true, externalCount: 2, offlineStatus: 'ready' };
    const { rerender } = render(<PrivacySeal language={lang} state={a} />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');

    // Same state again: still silent.
    rerender(<PrivacySeal language={lang} state={{ ...a }} />);
    expect(region.textContent).toBe('');

    rerender(<PrivacySeal language={lang} state={b} />);
    expect(region.textContent).toBe(expected(lang, b).full);
    expect(region.textContent).not.toContain(expected(lang, b).compact);

    rerender(<PrivacySeal language={lang} state={{ ...b }} />);
    expect(region.textContent).toBe(expected(lang, b).full);

    rerender(<PrivacySeal language={lang} state={c} />);
    expect(region.textContent).toBe(expected(lang, c).full);
  });
});

describe('PrivacySeal interaction', () => {
  const state: SealState = { measurable: true, externalCount: 4, offlineStatus: 'ready' };

  it('does not move focus when opened', async () => {
    const user = userEvent.setup();
    render(<PrivacySeal language="en" state={state} />);
    const button = screen.getByRole('button');
    await user.click(button);
    expect(document.activeElement).toBe(button);
  });

  it('Escape and Close return focus to the button', async () => {
    const user = userEvent.setup();
    render(<PrivacySeal language="en" state={state} />);
    const button = screen.getByRole('button', { name: /external connections/ });

    await user.click(button);
    await user.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);

    await user.click(button);
    await user.click(screen.getByRole('button', { name: en.seal.panelClose }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('language switch keeps the panel open and the count', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PrivacySeal language="en" state={state} />);
    const button = screen.getByRole('button', { name: /external connections/ });
    await user.click(button);

    rerender(<PrivacySeal language="es" state={state} />);
    const after = screen.getByRole('button', { name: /conexiones externas/ });
    expect(after.getAttribute('aria-expanded')).toBe('true');
    expect(after.textContent).toBe(expected('es', state).compact);
    expect(after.textContent).toContain('4');
  });
});

// ---------------------------------------------------------------------------
// usePrivacySeal via a small harness
// ---------------------------------------------------------------------------

function Harness() {
  const state = usePrivacySeal();
  return <PrivacySeal language="en" state={state} />;
}

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

interface ObserverStub {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  fire: (names: string[]) => void;
}

function stubObserver(): ObserverStub {
  const stub: ObserverStub = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    fire: () => {},
  };
  class FakeObserver {
    constructor(cb: (list: { getEntries: () => Array<{ name: string }> }) => void) {
      stub.fire = (names) => cb({ getEntries: () => names.map((name) => ({ name })) });
    }
    observe = stub.observe;
    disconnect = stub.disconnect;
  }
  vi.stubGlobal('PerformanceObserver', FakeObserver);
  return stub;
}

function stubEntries(names: string[]) {
  (performance as unknown as { getEntriesByType: unknown }).getEntriesByType = () =>
    names.map((name) => ({ name }));
}

describe('usePrivacySeal', () => {
  afterEach(() => {
    setOnLine(true);
    stubEntries([]);
  });

  it('offline without service workers shows offline, then "not available" after online event', () => {
    stubObserver();
    stubEntries([]);
    expect('serviceWorker' in navigator).toBe(false);
    setOnLine(false);
    render(<Harness />);
    expect(screen.getByRole('button').textContent).toContain(en.seal.compact.offlineNow);

    setOnLine(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('button').textContent).toContain(en.seal.compact.offlineUnavailable);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('button').textContent).toContain(en.seal.compact.offlineNow);
  });

  it('counts existing entries on mount, observes buffered resources, and counts new cross-origin entries', () => {
    const obs = stubObserver();
    stubEntries([
      `${location.origin}/assets/app.js`,
      'https://cdn.example.com/a.js',
    ]);
    render(<Harness />);
    expect(screen.getByRole('button').textContent).toContain(fill(en.seal.compact.connections, 1));
    expect(obs.observe).toHaveBeenCalledWith({ type: 'resource', buffered: true });

    act(() => obs.fire(['https://tracker.example.org/p.gif']));
    expect(screen.getByRole('button').textContent).toContain(fill(en.seal.compact.connections, 2));
  });

  it('is not measurable when PerformanceObserver is missing', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    stubEntries([]);
    render(<Harness />);
    const text = screen.getByRole('button').textContent!;
    expect(text).toContain(en.seal.compact.connectionsNotMeasurable);
    expect(text).not.toMatch(/\d/);
  });

  it('is not measurable when getEntriesByType is missing', () => {
    stubObserver();
    (performance as unknown as { getEntriesByType: unknown }).getEntriesByType = undefined;
    render(<Harness />);
    const text = screen.getByRole('button').textContent!;
    expect(text).toContain(en.seal.compact.connectionsNotMeasurable);
    expect(text).not.toMatch(/\d/);
  });

  it('is not measurable when the observer throws', () => {
    stubEntries([]);
    class Throwing {
      constructor() {
        throw new Error('boom');
      }
    }
    vi.stubGlobal('PerformanceObserver', Throwing);
    render(<Harness />);
    const text = screen.getByRole('button').textContent!;
    expect(text).toContain(en.seal.compact.connectionsNotMeasurable);
    expect(text).not.toMatch(/\d/);
  });
});
