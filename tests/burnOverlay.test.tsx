/**
 * BurnOverlay + burn orchestration tests (spec ux-burn-garlic-sound-fixes, task 6.3).
 *
 * Validates: Requirements 1.1, 1.7, 2.1, 2.2, 2.4, 2.5, 3.1, 3.3, 8.1, 8.2, 12.6, 12.9, 12.10
 *
 * (a) Overlay is aria-hidden and fixed full-viewport (asserted on the CSS source,
 *     since CSS modules may be stubbed under Vitest).
 * (b) Reduced motion renders only the scrim — no flame layer, no embers.
 * (c) Real App: after confirming the burn, scrollTo({top:0}) runs and focus lands
 *     on the Upload View heading.
 * (d) Sound: startCrackle on burn start, stopCrackle on completion.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const engineSpies = vi.hoisted(() => ({
  startCrackle: vi.fn(),
  stopCrackle: vi.fn(),
}));

// Replace only the engine factory; everything else in '@audio/index' stays real.
vi.mock('@audio/index', async () => {
  const actual = await vi.importActual<typeof import('@audio/index')>('@audio/index');
  return {
    ...actual,
    createSoundEngine: () => ({
      enable: vi.fn(),
      disable: vi.fn(),
      isEnabled: () => false,
      playStake: vi.fn(),
      startCrackle: engineSpies.startCrackle,
      setDocumentHidden: vi.fn(),
      stopCrackle: engineSpies.stopCrackle,
      playChime: vi.fn(),
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock('framer-motion');
  engineSpies.startCrackle.mockClear();
  engineSpies.stopCrackle.mockClear();
  localStorage.clear();
});

describe('BurnOverlay — structure and CSS contract', () => {
  it('root is aria-hidden (Req 2.4)', async () => {
    const { BurnOverlay } = await import('@components/BurnOverlay');
    const { container } = render(<BurnOverlay onComplete={() => {}} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });

  it('.overlay is fixed, full-viewport, non-interactive, at --z-overlay (Req 1.1, 1.7, 2.1)', () => {
    const css = readFileSync(
      resolve(import.meta.dirname, '../src/components/BurnOverlay.module.css'),
      'utf8',
    );
    const match = css.match(/\.overlay\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/position:\s*fixed\s*;/);
    expect(body).toMatch(/inset:\s*0\s*;/);
    expect(body).toMatch(/pointer-events:\s*none\s*;/);
    expect(body).toMatch(/z-index:\s*var\(--z-overlay\)\s*;/);
  });

  it('full motion renders a flame layer with an inline SVG and embers (Req 2.1, 2.2, 2.5)', async () => {
    const { BurnOverlay } = await import('@components/BurnOverlay');
    const { container } = render(<BurnOverlay onComplete={() => {}} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.querySelector('svg')).not.toBeNull();
    // scrim + flame layer + ember field are all direct children of the root
    expect(root.children.length).toBeGreaterThanOrEqual(3);
    expect(root.querySelectorAll('span').length).toBeGreaterThan(0);
  });
});

describe('BurnOverlay — reduced motion (Req 3.1, 3.3)', () => {
  it('renders only the scrim: no flame layer, no embers', async () => {
    vi.resetModules();
    vi.doMock('framer-motion', async () => {
      const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
      return { ...actual, useReducedMotion: () => true };
    });
    const { BurnOverlay } = await import('@components/BurnOverlay');
    const { container } = render(<BurnOverlay onComplete={() => {}} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.children.length).toBe(1);
    expect(root.querySelector('svg')).toBeNull();
    expect(root.querySelector('span')).toBeNull();
  });
});

describe('Burn flow in the real App (Req 8.1, 8.2, 12.6, 12.9, 12.10)', () => {
  it('starts crackle on confirm; on completion stops it, scrolls to top and focuses the upload heading', async () => {
    vi.resetModules();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    // Serve the bundled sample file from disk (same-origin static asset in prod).
    const csv = readFileSync(
      resolve(import.meta.dirname, '../public/samples/us-bank-usd.csv'),
      'utf8',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => csv }) as unknown as Response),
    );

    const { App } = await import('@components/App');
    const user = userEvent.setup();
    render(<App />);

    // Load a sample -> results view.
    await user.click(screen.getByRole('button', { name: /try a sample/i }));
    await user.click(await screen.findByRole('button', { name: /US Bank/i }));
    const burnBtn = await screen.findByRole('button', { name: /burn the crypt/i });

    // Not burning yet.
    expect(engineSpies.startCrackle).not.toHaveBeenCalled();
    scrollTo.mockClear();

    await user.click(burnBtn);
    await user.click(await screen.findByRole('button', { name: /confirm/i }));

    // Burn started: crackle fired, overlay mounted.
    await waitFor(() => expect(engineSpies.startCrackle).toHaveBeenCalledTimes(1));
    expect(engineSpies.startCrackle).toHaveBeenCalledWith({ reducedMotion: expect.any(Boolean) });
    expect(engineSpies.stopCrackle).not.toHaveBeenCalled();

    // Completion (safety timer ~1.4s): upload view, crackle stopped, scrolled, focused.
    await waitFor(() => expect(document.getElementById('upload-heading')).not.toBeNull(), {
      timeout: 4000,
    });
    await waitFor(() => expect(engineSpies.stopCrackle).toHaveBeenCalledTimes(1));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(document.activeElement).toBe(document.getElementById('upload-heading'));
    expect(screen.queryByRole('button', { name: /burn the crypt/i })).toBeNull();
  });
});
