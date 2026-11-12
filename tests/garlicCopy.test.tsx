/**
 * Garlic copy tests (ux-burn-garlic-sound-fixes).
 *
 * Structure: shared helpers at the top, then one describe block per property.
 * Later tasks (4.5, 4.6) append further describe blocks below.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';

import { VampireCard } from '@components/VampireCard';
import { GarlicToast } from '@components/GarlicToast';
import { garlicHintId } from '@components/format';
import { translate, type Language } from '@i18n/index';
import { GARLIC_REMINDER_DAYS } from '@engine/icsGenerator';
import type { Vampire } from '@engine/types';
import enJson from '../src/i18n/en.json';
import esJson from '../src/i18n/es.json';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const LANGUAGES: Language[] = ['en', 'es'];
const RUNS = { numRuns: 100 };

/** Build a minimal but complete Vampire with the given display name. */
export function makeVampire(displayName: string, overrides: Partial<Vampire> = {}): Vampire {
  return {
    id: `vamp_${displayName.length}_0`,
    normalizedName: displayName.toUpperCase(),
    displayName,
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
    ...overrides,
  };
}

/** Display names: non-blank, no template braces, no angle brackets. */
const nameArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && !/[{}<>]/.test(s));

const languageArb = fc.constantFrom(...LANGUAGES);

const REQUIRED_APPS = ['Google Calendar', 'Apple Calendar', 'Outlook'];

/** Phrases that over-promise timing or claim the event was already added. */
const FORBIDDEN_CLAIMS = [
  'the day before',
  'el día anterior',
  'día antes de',
  'added to your calendar',
  'añadido a tu calendario',
  'añadida a tu calendario',
];

function renderCard(vampire: Vampire, language: Language) {
  return render(<VampireCard vampire={vampire} language={language} currency="USD" />);
}

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Feature: ux-burn-garlic-sound-fixes, Property 2: Garlic copy is truthful and complete
// ---------------------------------------------------------------------------

describe('Feature: ux-burn-garlic-sound-fixes, Property 2: Garlic copy is truthful and complete', () => {
  /**
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.5, 5.6, 5.9, 12.8
   */
  it('toast, button title and visible hint name the calendar apps and the day count, and make no false claims', () => {
    fc.assert(
      fc.property(nameArb, languageArb, (name, language) => {
        const vampire = makeVampire(name);
        const days = String(GARLIC_REMINDER_DAYS);

        const toastText = translate(language, 'garlic.downloadSuccess', { name, days });

        const { container, unmount } = renderCard(vampire, language);
        const button = container.querySelector('button[aria-pressed][title]') as HTMLButtonElement | null;
        const hint = container.querySelector(`[id="${garlicHintId(vampire.id)}"]`);
        expect(button).not.toBeNull();
        expect(hint).not.toBeNull();

        const title = button!.getAttribute('title') ?? '';
        const hintText = hint!.textContent ?? '';
        unmount();

        // The toast also renders unchanged through the real component.
        const toast = render(
          <GarlicToast message={toastText} kind="success" closeLabel="x" onDismiss={() => {}} />,
        );
        const renderedToast = screen.getByRole('status').textContent ?? '';
        toast.unmount();
        expect(renderedToast).toContain(toastText);

        // Toast carries the vampire name.
        expect(toastText).toContain(name);

        for (const text of [toastText, title, hintText]) {
          for (const app of REQUIRED_APPS) expect(text).toContain(app);
          expect(text).toContain(days);
          expect(text).not.toMatch(/\{\{|\}\}/);
          const lower = text.toLowerCase();
          for (const claim of FORBIDDEN_CLAIMS) expect(lower).not.toContain(claim);
        }

        // The hint must be an explicit, honest statement of manual action.
        expect(hintText.length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it.each(LANGUAGES)('renders the same copy for a concrete vampire (%s)', (language) => {
    const vampire = makeVampire('Netflix');
    const { container } = renderCard(vampire, language);
    const button = container.querySelector('button[title]') as HTMLButtonElement;
    expect(button.getAttribute('title')).toBe(
      translate(language, 'vampireCard.garlicTitle', { days: String(GARLIC_REMINDER_DAYS) }),
    );
    expect(container.querySelector(`[id="${garlicHintId(vampire.id)}"]`)?.textContent).toBe(
      translate(language, 'vampireCard.garlicHint', { days: String(GARLIC_REMINDER_DAYS) }),
    );
    expect(button.getAttribute('aria-describedby')).toBe(garlicHintId(vampire.id));
  });
});

// ---------------------------------------------------------------------------
// Feature: ux-burn-garlic-sound-fixes, Property 3: Locale key parity for garlic copy
// ---------------------------------------------------------------------------

type JsonTree = { [key: string]: string | JsonTree };

function getPath(tree: JsonTree, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, part) =>
      node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
    tree,
  );
}

function placeholders(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1]))).sort();
}

describe('Feature: ux-burn-garlic-sound-fixes, Property 3: Locale key parity for garlic copy', () => {
  const en = enJson as unknown as JsonTree;
  const es = esJson as unknown as JsonTree;

  const garlicKeys = (tree: JsonTree): string[] =>
    Object.keys(tree.garlic as JsonTree)
      .map((k) => `garlic.${k}`)
      .sort();
  const cardGarlicKeys = (tree: JsonTree): string[] =>
    Object.keys(tree.vampireCard as JsonTree)
      .filter((k) => k.startsWith('garlic'))
      .map((k) => `vampireCard.${k}`)
      .sort();

  const allKeys = [...garlicKeys(en), ...cardGarlicKeys(en)];

  it('has a non-empty key list to sample from', () => {
    expect(allKeys.length).toBeGreaterThan(0);
  });

  /**
   * Validates: Requirements 4.4, 4.5, 5.5, 5.6, 5.7
   */
  it('every garlic key exists in both locales as a non-empty string with identical placeholders', () => {
    fc.assert(
      fc.property(fc.constantFrom(...allKeys), (key) => {
        const enValue = getPath(en, key);
        const esValue = getPath(es, key);
        expect(typeof enValue).toBe('string');
        expect(typeof esValue).toBe('string');
        expect((enValue as string).trim().length).toBeGreaterThan(0);
        expect((esValue as string).trim().length).toBeGreaterThan(0);
        expect(placeholders(esValue as string)).toEqual(placeholders(enValue as string));
      }),
      RUNS,
    );
  });

  it('en.json and es.json have equal key sets for the garlic groups', () => {
    expect(garlicKeys(es)).toEqual(garlicKeys(en));
    expect(cardGarlicKeys(es)).toEqual(cardGarlicKeys(en));
  });
});

// ---------------------------------------------------------------------------
// Feature: ux-burn-garlic-sound-fixes, Property 4: Hint is linked and ids are unique
// ---------------------------------------------------------------------------

describe('Feature: ux-burn-garlic-sound-fixes, Property 4: Hint is linked and ids are unique', () => {
  /** Ids mix safe and unsafe characters, including sanitize-colliding forms. */
  const idArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 12 }),
    fc.constantFrom('a b', 'a.b', 'a_b', 'a-b', 'a:b', 'a"b', "a'b", 'a]b', 'a b.c', 'a.b c'),
  );
  const idsArb = fc.uniqueArray(idArb, { minLength: 1, maxLength: 8 });

  function renderAll(ids: string[], language: Language, decision: 'staked' | null) {
    return render(
      <div>
        {ids.map((id, i) => (
          <VampireCard
            key={id}
            vampire={makeVampire(`Vamp ${i}`, { id })}
            language={language}
            currency="USD"
            decision={decision}
          />
        ))}
      </div>,
    );
  }

  /**
   * Validates: Requirements 5.2, 5.3, 5.4
   */
  it('every Garlic button points to an existing visible hint and all hint ids are distinct', () => {
    fc.assert(
      fc.property(idsArb, languageArb, (ids, language) => {
        const { container, unmount } = renderAll(ids, language, null);

        const buttons = Array.from(
          container.querySelectorAll<HTMLButtonElement>('button[aria-pressed][aria-describedby]'),
        );
        expect(buttons).toHaveLength(ids.length);

        const hints = Array.from(container.querySelectorAll<HTMLElement>('[id^="garlic-hint-"]'));
        expect(hints).toHaveLength(ids.length);
        const hintIds = hints.map((h) => h.id);
        expect(new Set(hintIds).size).toBe(hintIds.length);
        expect(new Set(Array.from(document.querySelectorAll('[id]'), (e) => e.id)).size).toBe(
          document.querySelectorAll('[id]').length,
        );

        const referenced = new Set<string>();
        for (const button of buttons) {
          const describedBy = button.getAttribute('aria-describedby') ?? '';
          expect(describedBy.length).toBeGreaterThan(0);
          expect(describedBy.split(/\s+/)).toHaveLength(1);
          const target = document.getElementById(describedBy);
          expect(target).not.toBeNull();
          expect(target!.hasAttribute('hidden')).toBe(false);
          expect(target!.closest('[hidden], [aria-hidden="true"]')).toBeNull();
          expect((target!.textContent ?? '').trim().length).toBeGreaterThan(0);
          referenced.add(describedBy);
        }
        // Each button references its own hint.
        expect(referenced.size).toBe(ids.length);
        unmount();
      }),
      RUNS,
    );
  });

  it('staked cards render no Garlic button or hint, so no aria-describedby dangles', () => {
    fc.assert(
      fc.property(idsArb, languageArb, (ids, language) => {
        const { container, unmount } = renderAll(ids, language, 'staked');
        expect(container.querySelectorAll('[id^="garlic-hint-"]')).toHaveLength(0);
        for (const el of Array.from(container.querySelectorAll('[aria-describedby]'))) {
          for (const ref of (el.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
            expect(document.getElementById(ref)).not.toBeNull();
          }
        }
        unmount();
      }),
      RUNS,
    );
  });
});
