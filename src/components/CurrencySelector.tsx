/**
 * CurrencySelector — a labelled <select> of ISO 4217 currencies.
 *
 * On change it calls `onChange` with the new code; the parent persists it and
 * re-formats every displayed amount. The label and aria-label are localized.
 */

import { useTranslation, type Language } from '@i18n/index';
import styles from './App.module.css';

/** Supported display currencies (mirror of exchangeRates.json keys). */
const CURRENCIES = [
  'USD', 'MXN', 'COP', 'ARS', 'CLP', 'EUR', 'BRL', 'GBP', 'CAD', 'PEN',
] as const;

export interface CurrencySelectorProps {
  language: Language;
  currency: string;
  onChange: (currency: string) => void;
}

export function CurrencySelector({ language, currency, onChange }: CurrencySelectorProps) {
  const { t } = useTranslation(language);
  return (
    <div className={styles.control}>
      <label htmlFor="currency">{t('currencySelector.label')}</label>
      <select
        id="currency"
        className={styles.select}
        value={currency}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('currencySelector.ariaLabel')}
      >
        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

export default CurrencySelector;
