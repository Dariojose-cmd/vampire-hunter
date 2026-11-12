/**
 * GarlicToast + garlicHintId tests.
 *
 * Validates: Requirements 4.6, 4.7, 4.8, 4.9, 4.10
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

const motionState = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => motionState.reduce };
});

import { GarlicToast, GARLIC_TOAST_DURATION_MS } from '@components/GarlicToast';
import { garlicHintId } from '@components/format';

beforeEach(() => {
  motionState.reduce = false;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GarlicToast', () => {
  it('renders a polite status region with the message', () => {
    render(<GarlicToast message="Reminder set" kind="success" closeLabel="Close" onDismiss={() => {}} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Reminder set');
  });

  it('renders the message for the error kind', () => {
    render(<GarlicToast message="Could not save" kind="error" closeLabel="Close" onDismiss={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('Could not save');
  });

  it('auto-dismisses after 6000 ms, and not before', () => {
    const onDismiss = vi.fn();
    render(<GarlicToast message="m" kind="success" closeLabel="Close" onDismiss={onDismiss} />);
    expect(GARLIC_TOAST_DURATION_MS).toBe(6000);
    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('close button (aria-label = closeLabel) dismisses immediately', () => {
    const onDismiss = vi.fn();
    render(<GarlicToast message="m" kind="success" closeLabel="Dismiss toast" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss toast' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('clears the timer on unmount', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(
      <GarlicToast message="m" kind="success" closeLabel="Close" onDismiss={onDismiss} />,
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(GARLIC_TOAST_DURATION_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('applies no initial opacity/y movement under reduced motion', () => {
    motionState.reduce = true;
    render(<GarlicToast message="m" kind="success" closeLabel="Close" onDismiss={() => {}} />);
    const el = screen.getByRole('status');
    expect(el.style.opacity).toBe('');
    expect(el.style.transform).toBe('');
  });

  it('applies initial movement props when motion is allowed', () => {
    motionState.reduce = false;
    render(<GarlicToast message="m" kind="success" closeLabel="Close" onDismiss={() => {}} />);
    expect(screen.getByRole('status').style.opacity).toBe('0');
  });
});

describe('garlicHintId', () => {
  it('leaves safe ids readable and prefixed', () => {
    expect(garlicHintId('netflix_1-a')).toBe('garlic-hint-netflix_1-a');
  });

  it('sanitizes unsafe characters', () => {
    expect(garlicHintId('a b:c/d.e')).toMatch(/^garlic-hint-[A-Za-z0-9_-]+$/);
  });

  it('is stable for the same input', () => {
    expect(garlicHintId('a b')).toBe(garlicHintId('a b'));
  });

  it('is distinct for ids that sanitize to the same string', () => {
    expect(garlicHintId('a b')).not.toBe(garlicHintId('a_b'));
    expect(garlicHintId('a b')).not.toBe(garlicHintId('a b!'));
    expect(garlicHintId('a b')).not.toBe(garlicHintId('a:b'));
  });
});
