/**
 * Crypt — the main results screen. Renders the Blood Meter, a filter bar
 * (All / Staked / Spared / Garlic), a sort control (threat desc by default,
 * annual cost, name), the responsive vampire grid, and an optional "possible
 * vampires" section with a distinct, lower-confidence treatment.
 *
 * Decisions are held in local state for now; full localStorage persistence
 * arrives in task 20. The Blood Meter's draining total excludes staked
 * vampires, and their annual loss is reported as "saved".
 */

import { useMemo, useState } from 'react';
import type { DecisionType, DetectionResult, ThreatLevel, Vampire } from '@engine/types';
import { useTranslation, type Language, type TranslationKey } from '@i18n/index';
import { BloodMeter } from './BloodMeter';
import { VampireCard } from './VampireCard';
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
  onUploadAnother: () => void;
}

export function Crypt({ language, currency, result, onUploadAnother }: CryptProps) {
  const { t } = useTranslation(language);

  const [sortKey, setSortKey] = useState<SortKey>('threat');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showPossible, setShowPossible] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, DecisionType>>({});

  function decide(v: Vampire, decision: Exclude<DecisionType, null>) {
    setDecisions((prev) => ({
      ...prev,
      // Toggle: clicking the same decision again clears it.
      [v.id]: prev[v.id] === decision ? null : decision,
    }));
  }

  // Display names that appear more than once → show the amount subtitle so the
  // two Apple subscriptions (iCloud vs Apple Music) are distinguishable.
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
      // threat desc, tie-break by annual cost
      const t1 = THREAT_ORDER[b.threatLevel] - THREAT_ORDER[a.threatLevel];
      return t1 !== 0 ? t1 : b.annualBloodLossCents - a.annualBloodLossCents;
    });
    return copy;
  }, [result.vampires, sortKey]);

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted;
    return sorted.filter((v) => decisions[v.id] === filter);
  }, [sorted, filter, decisions]);

  // Blood meter totals: staked = saved, everything else = still draining.
  const { drainingCents, savedCents } = useMemo(() => {
    let draining = 0;
    let saved = 0;
    for (const v of result.vampires) {
      if (decisions[v.id] === 'staked') saved += v.annualBloodLossCents;
      else draining += v.annualBloodLossCents;
    }
    return { drainingCents: draining, savedCents: saved };
  }, [result.vampires, decisions]);

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
      <header className={styles.header}>
        <h1 className={`${styles.title} font-display`}>{t('crypt.title')}</h1>
        <p className={styles.subtitle}>{t('crypt.subtitle')}</p>
        <p><span className={styles.count}>{t(countKey, { count })}</span></p>
      </header>

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
        <div className={styles.grid}>
          {filtered.map((v, i) => (
            <div key={v.id} className={decisions[v.id] && decisions[v.id] !== 'garlic' ? styles.decided : undefined}>
              <VampireCard
                vampire={v}
                language={language}
                currency={currency}
                index={i}
                showAmountSubtitle={duplicateNames.has(v.displayName)}
                onStake={(vm) => decide(vm, 'staked')}
                onSpare={(vm) => decide(vm, 'spared')}
                onGarlic={(vm) => decide(vm, 'garlic')}
              />
            </div>
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
                showAmountSubtitle={false}
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
    </section>
  );
}

export default Crypt;
