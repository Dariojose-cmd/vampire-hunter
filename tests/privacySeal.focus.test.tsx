import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivacySeal } from '@components/PrivacySeal';
import type { SealState } from '@components/usePrivacySeal';

const state: SealState = { measurable: true, externalCount: 0, offlineStatus: 'ready' };

describe('PrivacySeal focus return (Req 10.2)', () => {
  it('returns focus to the seal button when the panel Close button is clicked', async () => {
    const user = userEvent.setup();
    render(<PrivacySeal language="en" state={state} />);
    const seal = screen.getByRole('button', { expanded: false });
    await user.click(seal);
    expect(seal.getAttribute('aria-expanded')).toBe('true');

    const panel = document.getElementById(seal.getAttribute('aria-controls')!)!;
    const close = panel.querySelector('button')!;
    close.focus();
    await user.click(close);

    expect(seal.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(seal);
  });

  it('returns focus to the seal button when Escape closes the panel', async () => {
    const user = userEvent.setup();
    render(<PrivacySeal language="en" state={state} />);
    const seal = screen.getByRole('button', { expanded: false });
    await user.click(seal);
    await user.keyboard('{Escape}');
    expect(seal.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(seal);
  });
});
