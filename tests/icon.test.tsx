/**
 * Icon component tests — design Correctness Properties 1–3.
 *
 * Property 1: Icons are decorative by default (aria-hidden, no accessible name).
 * Property 2: Titled icons are announced (role="img", accessible name = title).
 * Property 3: Consistent style and theme color (shared viewBox, stroke=currentColor).
 *
 * Validates: Requirements 4.2, 4.3, 6.1, 6.2, 6.4
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Icon } from '@components/Icon';

afterEach(cleanup);

/** Pull the single rendered <svg> out of the container. */
function renderSvg(ui: React.ReactElement): SVGSVGElement {
  const { container } = render(ui);
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  return svg as unknown as SVGSVGElement;
}

describe('Icon — shared style and theme color (Property 3)', () => {
  it('renders an <svg> with the shared viewBox and currentColor stroke, no hardcoded color', () => {
    const svg = renderSvg(<Icon name="blood-drop" />);

    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    // No hardcoded color: fill is "none", and the stroke inherits via currentColor.
    expect(svg.getAttribute('fill')).toBe('none');
  });
});

describe('Icon — decorative by default (Property 1)', () => {
  it('is aria-hidden, has no role="img", and exposes no accessible name when no title is passed', () => {
    const svg = renderSvg(<Icon name="shield" />);

    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBeNull();

    // A decorative icon must not be exposed as an image to assistive tech,
    // and must not render a <title> that would give it an accessible name.
    expect(screen.queryByRole('img')).toBeNull();
    expect(svg.querySelector('title')).toBeNull();
  });
});

describe('Icon — titled icons are announced (Property 2)', () => {
  it('is not aria-hidden, has role="img", and exposes an accessible name equal to the title', () => {
    const title = 'Sound on';
    const svg = renderSvg(<Icon name="sound-on" title={title} />);

    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('role')).toBe('img');

    // The icon is discoverable by role with an accessible name equal to the title.
    const byRole = screen.getByRole('img', { name: title });
    expect(byRole).toBe(svg);

    // And it renders a <title> child carrying that text.
    const titleEl = svg.querySelector('title');
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe(title);
  });
});
