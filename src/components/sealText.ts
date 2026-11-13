/**
 * Pure text builder for the privacy seal. No React.
 *
 * Requirements: 8.4, 9.1-9.5, 9.8, 9.9, 11.3, 11.4
 */

import type { OfflineStatus } from '../engine/offlineStatus';
import type { TranslationKey, Vars } from '../i18n';

export interface SealTextInput {
  t: (key: TranslationKey, vars?: Vars) => string;
  count: number;
  measurable: boolean;
  status: OfflineStatus;
}

export interface SealText {
  /** Exact visible text of the seal button. */
  compact: string;
  /** Full sentences; content of the live region and panel status lines. */
  fullSentences: string;
  /** aria-label of the button; always starts with `compact` (WCAG 2.5.3). */
  accessibleName: string;
}

const STATUS_KEYS = {
  ready: { compact: 'seal.compact.offlineReady', full: 'seal.full.offlineReady' },
  checking: { compact: 'seal.compact.offlinePreparing', full: 'seal.full.offlinePreparing' },
  offline: { compact: 'seal.compact.offlineNow', full: 'seal.full.offlineNow' },
  unavailable: {
    compact: 'seal.compact.offlineUnavailable',
    full: 'seal.full.offlineUnavailable',
  },
} as const satisfies Record<OfflineStatus, { compact: TranslationKey; full: TranslationKey }>;

export function buildSealText({ t, count, measurable, status }: SealTextInput): SealText {
  const keys = STATUS_KEYS[status];

  const compactCount = measurable
    ? t('seal.compact.connections', { count })
    : t('seal.compact.connectionsNotMeasurable');
  const fullCount = measurable
    ? t('seal.full.connections', { count })
    : t('seal.full.connectionsNotMeasurable');

  const compact = `${compactCount} · ${t(keys.compact)}`;
  const fullSentences = `${fullCount}. ${t(keys.full)}.`;
  const accessibleName = `${compact}. ${fullSentences}`;

  if (!accessibleName.startsWith(compact)) {
    throw new Error('sealText: accessible name must start with the visible label (WCAG 2.5.3)');
  }

  return { compact, fullSentences, accessibleName };
}
