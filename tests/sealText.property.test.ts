import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildSealText } from '../src/components/sealText';
import { translate } from '../src/i18n';
import type { Language, TranslationKey, Vars } from '../src/i18n';
import type { OfflineStatus } from '../src/engine/offlineStatus';

const STATUS_KEYS: Record<OfflineStatus, { compact: TranslationKey; full: TranslationKey }> = {
  ready: { compact: 'seal.compact.offlineReady', full: 'seal.full.offlineReady' },
  checking: { compact: 'seal.compact.offlinePreparing', full: 'seal.full.offlinePreparing' },
  offline: { compact: 'seal.compact.offlineNow', full: 'seal.full.offlineNow' },
  unavailable: { compact: 'seal.compact.offlineUnavailable', full: 'seal.full.offlineUnavailable' },
};

describe('sealText properties', () => {
  // Feature: privacy-you-can-verify, Property 14: Seal text carries the count and the status
  // **Validates: Requirements 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.8, 9.9, 11.3, 11.4**
  it('Property 14: Seal text carries the count and the status', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999_999 }),
        fc.constantFrom<OfflineStatus>('ready', 'checking', 'offline', 'unavailable'),
        fc.boolean(),
        fc.constantFrom<Language>('en', 'es'),
        (count, status, measurable, lang) => {
          const t = (key: TranslationKey, vars?: Vars) => translate(lang, key, vars);
          const { compact, fullSentences, accessibleName } = buildSealText({
            t,
            count,
            measurable,
            status,
          });

          expect(accessibleName.startsWith(compact)).toBe(true);
          expect(accessibleName.slice(compact.length)).toBe('. ' + fullSentences);

          // Status strings of that language
          expect(compact).toContain(t(STATUS_KEYS[status].compact));
          expect(fullSentences).toContain(t(STATUS_KEYS[status].full));

          // Live region content is fullSentences and never the compact label
          const liveRegion = fullSentences;
          expect(liveRegion).toBe(fullSentences);
          expect(liveRegion).not.toContain(compact);

          if (measurable) {
            expect(compact).toContain(t('seal.compact.connections', { count }));
            expect(fullSentences).toContain(t('seal.full.connections', { count }));
            expect(compact).toContain(String(count));
            expect(fullSentences).toContain(String(count));
          } else {
            expect(compact).toContain(t('seal.compact.connectionsNotMeasurable'));
            expect(fullSentences).toContain(t('seal.full.connectionsNotMeasurable'));
            expect(compact).not.toMatch(/\d/);
            expect(fullSentences).not.toMatch(/\d/);
            expect(accessibleName).not.toMatch(/\d/);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
