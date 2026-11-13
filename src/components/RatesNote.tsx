/**
 * RatesNote — small footer line saying the exchange rates are approximate and dated.
 * Lives in the footer (not under the currency picker) so the header stays clean.
 */

import { useTranslation, type Language } from '@i18n/index';
import { formatRatesDate } from './format';
import exchangeRates from '../data/exchangeRates.json';
import styles from './App.module.css';

export function RatesNote({ language }: { language: Language }) {
  const { t } = useTranslation(language);
  return (
    <small className={styles.ratesNote}>
      {t('currencySelector.ratesNote', { date: formatRatesDate(exchangeRates.asOf, language) })}
    </small>
  );
}

export default RatesNote;
