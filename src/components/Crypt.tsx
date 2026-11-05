/**
 * Crypt — the main results screen and the home of the app's memorable moments.
 *
 *  - Summoning: a ~1s "Hunting…" ritual plays on arrival, then the vampires
 *    rise from their graves one by one (staggered, most dangerous first).
 *  - Stake moment: staking opens the StakeModal; confirming crumbles the
 *    tombstone to dust while a bat escapes, the vial drops, and "blood saved"
 *    counts up (optional thud sound).
 *  - Ending: once every vampire has a decision, "The crypt is cleansed" appears
 *    with a dawn glow and the total yearly blood saved.
 *
 * All motion respects prefers-reduced-motion. Decisions are local state here;
 * localStorage persistence arrives in task 20.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import type { DecisionType, DetectionResult, ThreatLevel, Vampire } from '@engine/types';
import { useTranslation, type Language, type TranslationKey } from '@i18n/index';
import { BloodMeter } from './BloodMeter';
import { VampireCard } from './VampireCard';
import { StakeModal } from './StakeModal';
import { Summoning } from './Summoning';
import { Cleansed } from './Cleansed';
import { downloadGarlicIcs } from './garlicDownload';
import { playStakeThud } from './sound';
import styles from './Crypt.module.css';

type SortKey = 'threat' | 'amount' | 'name';
type FilterKey = 'all' | 'staked' | 'spared' | 'garlic';

const THREAT_ORDER: Record<ThreatLevel, number> = {
  Critical: 3, High: 2, Medium: 1, Low: 0,
};

export interface CryptProps {
  language: Language;
  currency: string;
  result: DetectionResult;
  soundEnabled: boolean;
  /** Persisted decisions keyed by vampire id (controlled by the parent). */
  decisions: Record<string, DecisionType>;
  /** Record or clear a decision; the parent persists it to localStorage. */
  onDecision: (vampireId: string, decision: DecisionType) => void;
  onUploadAnother: () => void;
}

export function Crypt({
  language,
  currency,
  result,
  soundEnabled,
  decisions,
  onDecision,
  onUploadAnother,
}: CryptProps) {
  const { t } = useTranslation(language);
  const reduce = useReducedMotion();

  const [sortKey, setSortKey] = useState<SortKey>('threat');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showPossible, setShowPossible] = useState(false);
  const [garlicFailed, setGarlicFailed] = useState<Record<string, boolean>>({});

  // Summoning ritual: show for ~1s on mount, then reveal the crypt.
  const [summoning, setSummoning] = useState(true);
  useEffect(() => {
    const ms = reduce ? 400 : 1000;
    const id = setTimeout(() => setSummoning(false), ms);
    return () => clearTimeout(id);
  }, [reduce]);

  // Stake flow: which vampire's modal is open, and which is mid-crumble.
  const [modalVampire, setModalVampire] = useState<Vampire | null>(null);
  const [stakeTrigger, setStakeTrigger] = useState<HTMLElement | null>(null);
  const [stakingId, setStakingId] = useState<string | null>(null);

  function openStakeModal(v: Vampire, trigger: HTMLElement) {
    setStakeTrigger(trigger);
    setModalVampire(v);
  }

  function confirmStake(v: Vampire) {
    // Play the crumble, then record the decision once it finishes.
    if (soundEnabled) playStakeThud();
    setStakingId(v.id);
    const settle = () => {
      onDecision(v.id, 'staked');
      setStakingId(null);
    };
    if (reduce) setTimeout(settle, 320);
    else setTimeout(settle, 1000);
  }

  function toggleSpare(v: Vampire) {
    onDecision(v.id, decisions[v.id] === 'spared' ? null : 'spared');
  }

  function unstake(v: Vampire) {
    onDecision(v.id, null);
  }

  function setGarlic(v: Vampire) {
    const ok = downloadGarlicIcs(v, language);
    if (!ok) {
      setGarlicFailed((prev) => ({ ...prev, [v.id]: true }));
      return;
    }
    onDecision(v.id, decisions[v.id] === 'garlic' ? null : 'garlic');
  }

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of result.vampires) {
      counts.set(v.displayName, (counts.get(v.displayName) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));
  }, [result.vampires]);

  const sorted = useMemo(() => {
    const copy = [...result.vampires];
    copy.sort((a, b) => {
      if (sortKey === 'amount') return b.annualBloodLossCents - a.annualBloodLossCents;
      if (sortKey === 'name') return a.displayName.localeCompare(b.displayName);
      const t1 = THREAT_ORDER[b.threatLevel] - THREAT_ORDER[a.threatLevel];
      return t1 !== 0 ? t1 : b.annualBloodLossCents - a.annualBloodLossCents;
    });
    return copy;
  }, [result.vampires, sortKey]);

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted;
    return sorted.filter((v) => decisions[v.id] === filter);
  }, [sorted, filter, decisions]);

  const { drainingCents, savedCents } = useMemo(() => {
    let draining = 0;
    let saved = 0;
    for (const v of result.vampires) {
      if (decisions[v.id] === 'staked') saved += v.annualBloodLossCents;
      else draining += v.annualBloodLossCents;
    }
    return { drainingCents: draining, savedCents: saved };
  }, [result.vampires, decisions]);

  // Ending: every vampire has some decision (staked / spared / garlic).
  const allDecided = useMemo(
    () => result.vampires.length > 0 && result.vampires.every((v) => !!decisions[v.id]),
    [result.vampires, decisions],
  );

  const count = result.vampires.length;
  const countKey: TranslationKey = count === 1 ? 'crypt.vampireCount' : 'crypt.vampireCount_plural';

  const FILTERS: { key: FilterKey; labelKey: TranslationKey }[] = [
    { key: 'all', labelKey: 'crypt.filterAll' },
    { key: 'staked', labelKey: 'crypt.filterStaked' },
    { key: 'spared', labelKey: 'crypt.filterSpared' },
    { key: 'garlic', labelKey: 'crypt.filterGarlic' },
  ];

  return (
    <section className={styles.crypt}>
      <AnimatePresence>
        {summoning && <Summoning language={language} />}
      </AnimatePresence>

      <header className={styles.header}>
        <h1 className={`${styles.title} font-display`}>{t('crypt.title')}</h1>
        <p className={styles.subtitle}>{t('crypt.subtitle')}</p>
        <p><span className={styles.count}>{t(countKey, { count })}</span></p>
      </header>

      {allDecided && (
        <Cleansed language={language} currency={currency} savedCents={savedCents} />
      )}

      {count > 0 && (
        <BloodMeter
          language={language}
          currency={currency}
          drainingCents={drainingCents}
          savedCents={savedCents}
        />
      )}

      <div className={styles.controls}>
        <div className={styles.filters} role="group" aria-label={t('crypt.filterAll')}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.filterBtn} ${filter === f.key ? styles.filterActive : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        <div className={styles.sortGroup}>
          <label htmlFor="crypt-sort">{t('crypt.sortLabel')}</label>
          <select
            id="crypt-sort"
            className={styles.sortSelect}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="threat">{t('crypt.sortThreat')}</option>
            <option value="amount">{t('crypt.sortAmount')}</option>
            <option value="name">{t('crypt.sortName')}</option>
          </select>
        </div>
      </div>

      {count === 0 ? (
        <p className={styles.empty}>{t('crypt.noVampires')}</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>{t('crypt.emptyFilter')}</p>
      ) : (
        // Hide the grid until the summoning finishes so the rise reads cleanly.
        <div className={styles.grid}>
          {filtered.map((v, i) => (
            <VampireCard
              key={v.id}
              vampire={v}
              language={language}
              currency={currency}
              index={i}
              revealed={!summoning}
              decision={decisions[v.id] ?? null}
              isStaking={stakingId === v.id}
              garlicDisabled={!!garlicFailed[v.id]}
              showAmountSubtitle={duplicateNames.has(v.displayName)}
              onStakeClick={openStakeModal}
              onSpare={toggleSpare}
              onGarlic={setGarlic}
              onUnstake={unstake}
            />
          ))}
        </div>
      )}

      {result.possibleVampires.length > 0 && (
        <div className={styles.footer}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showPossible}
              onChange={(e) => setShowPossible(e.target.checked)}
            />
            {t('crypt.possibleVampiresToggle')} ({result.possibleVampires.length})
          </label>
        </div>
      )}

      {showPossible && result.possibleVampires.length > 0 && (
        <div className={styles.possibleSection}>
          <div className={styles.possibleHeader}>
            <h2 className={styles.possibleTitle}>{t('crypt.possibleVampiresLabel')}</h2>
            <p className={styles.possibleHint}>{t('crypt.possibleVampiresHint')}</p>
          </div>
          <div className={styles.possibleGrid}>
            {result.possibleVampires.map((v, i) => (
              <VampireCard
                key={v.id}
                vampire={v}
                language={language}
                currency={currency}
                index={i}
                revealed
                decision={decisions[v.id] ?? null}
                isStaking={stakingId === v.id}
                garlicDisabled={!!garlicFailed[v.id]}
                showAmountSubtitle={false}
                onStakeClick={openStakeModal}
                onSpare={toggleSpare}
                onGarlic={setGarlic}
                onUnstake={unstake}
              />
            ))}
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.uploadAnother} onClick={onUploadAnother}>
          {t('crypt.uploadAnother')}
        </button>
      </div>

      <AnimatePresence>
        {modalVampire && (
          <StakeModal
            vampire={modalVampire}
            language={language}
            returnFocusTo={stakeTrigger}
            onConfirm={() => confirmStake(modalVampire)}
            onClose={() => setModalVampire(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

export default Crypt;
