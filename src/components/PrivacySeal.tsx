/**
 * PrivacySeal — one button showing measured connections and offline status,
 * plus a non-modal "How do we know?" panel.
 *
 * The live region carries only the full sentences (never the compact label),
 * stays silent on first render, and renders only when `announce` is true so
 * a second instance (e.g. in the sample picker) does not announce twice.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation, type Language } from '@i18n/index';
import { Icon, type IconName } from './Icon';
import { SealPanel } from './SealPanel';
import { buildSealText } from './sealText';
import type { SealState } from './usePrivacySeal';
import type { OfflineStatus } from '../engine/offlineStatus';
import styles from './PrivacySeal.module.css';

export interface PrivacySealProps {
  language: Language;
  state: SealState;
  /** Render the live region. Default true. */
  announce?: boolean;
}

/** Shape (not color alone) changes per state. */
const ICONS: Record<OfflineStatus, IconName> = {
  ready: 'shield',
  checking: 'web',
  offline: 'lock',
  unavailable: 'warning',
};

export function PrivacySeal({ language, state, announce = true }: PrivacySealProps) {
  const { t } = useTranslation(language);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const { compact, fullSentences, accessibleName } = buildSealText({
    t,
    count: state.externalCount,
    measurable: state.measurable,
    status: state.offlineStatus,
  });

  // Silent on first render: the region starts empty and only receives text
  // when fullSentences changes afterwards.
  const [seen, setSeen] = useState(fullSentences);
  const [announced, setAnnounced] = useState('');
  if (seen !== fullSentences) {
    setSeen(fullSentences);
    setAnnounced(fullSentences);
  }

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className={styles.seal}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.button} ${state.offlineStatus === 'offline' ? styles.offline : ''}`}
        aria-label={accessibleName}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={ICONS[state.offlineStatus]} size={20} className={styles.icon} />
        <span className={styles.label}>{compact}</span>
      </button>
      {announce && (
        <div role="status" aria-live="polite" className={styles.visuallyHidden}>
          {announced}
        </div>
      )}
      <SealPanel
        id={panelId}
        language={language}
        open={open}
        fullSentences={fullSentences}
        onClose={close}
        returnFocusRef={buttonRef}
      />
    </div>
  );
}

export default PrivacySeal;
