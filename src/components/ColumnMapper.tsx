/**
 * ColumnMapper — manual column assignment shown when the engine returns
 * COLUMN_MAPPING_NEEDED (or when the date format is ambiguous).
 *
 * Renders one <select> per required column, pre-populated with the detected
 * CSV headers. The user may choose either a single amount column OR a
 * debit+credit pair. If the date format is ambiguous, an extra date-format
 * <select> appears. On submit, a ColumnLayout is assembled and returned.
 *
 * On mount, focus moves to the first unresolved select.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation, type Language } from '@i18n/index';
import type { ColumnLayout, DateFormat } from '@engine/types';
import styles from './ColumnMapper.module.css';

const UNSET = -1;

interface ColumnOption {
  value: number;
  label: string;
}

/**
 * A single labelled column <select>. Declared at module scope (not inside the
 * parent's render) so React preserves its state and focus across re-renders.
 */
function ColumnSelect({
  id,
  label,
  placeholder,
  value,
  options,
  onChange,
  inputRef,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: number;
  options: ColumnOption[];
  onChange: (v: number) => void;
  inputRef?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <select
        id={id}
        ref={inputRef}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={UNSET}>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export interface ColumnMapperProps {
  language: Language;
  headers: string[];
  /** True when the date format could not be inferred and must be chosen. */
  dateFormatAmbiguous: boolean;
  onCancel: () => void;
  onConfirm: (layout: ColumnLayout, dateFormat: DateFormat | null) => void;
}

export function ColumnMapper({
  language,
  headers,
  dateFormatAmbiguous,
  onCancel,
  onConfirm,
}: ColumnMapperProps) {
  const { t } = useTranslation(language);
  const firstSelectRef = useRef<HTMLSelectElement>(null);

  const [dateCol, setDateCol] = useState<number>(UNSET);
  const [descCol, setDescCol] = useState<number>(UNSET);
  const [amountCol, setAmountCol] = useState<number>(UNSET);
  const [debitCol, setDebitCol] = useState<number>(UNSET);
  const [creditCol, setCreditCol] = useState<number>(UNSET);
  const [dateFormat, setDateFormat] = useState<DateFormat | ''>('');

  useEffect(() => {
    firstSelectRef.current?.focus();
  }, []);

  const options = useMemo<ColumnOption[]>(
    () =>
      headers.map((h, i) => ({
        value: i,
        label: h.trim() === '' ? `Column ${i + 1}` : h.trim(),
      })),
    [headers],
  );

  // A single amount column OR a debit column satisfies the amount requirement.
  const hasAmount = amountCol !== UNSET || debitCol !== UNSET;
  const dateFormatOk = !dateFormatAmbiguous || dateFormat !== '';
  const canConfirm =
    dateCol !== UNSET && descCol !== UNSET && hasAmount && dateFormatOk;

  function handleConfirm() {
    if (!canConfirm) return;
    const layout: ColumnLayout =
      amountCol !== UNSET
        ? { type: 'single', amountCol, dateCol, descCol }
        : {
            type: 'split',
            debitCol,
            creditCol: creditCol === UNSET ? -1 : creditCol,
            dateCol,
            descCol,
          };
    onConfirm(layout, dateFormat === '' ? null : dateFormat);
  }

  const placeholder = t('columnMapper.selectColumn');

  return (
    <section className={styles.screen}>
      <h1 className={`${styles.title} font-display`}>{t('columnMapper.title')}</h1>
      <p className={styles.subtitle}>{t('columnMapper.subtitle')}</p>

      <div className={styles.form}>
        <ColumnSelect
          id="map-date"
          label={t('columnMapper.dateColumn')}
          placeholder={placeholder}
          value={dateCol}
          options={options}
          onChange={setDateCol}
          inputRef={firstSelectRef}
        />
        <ColumnSelect
          id="map-desc"
          label={t('columnMapper.descriptionColumn')}
          placeholder={placeholder}
          value={descCol}
          options={options}
          onChange={setDescCol}
        />
        <ColumnSelect
          id="map-amount"
          label={t('columnMapper.amountColumn')}
          placeholder={placeholder}
          value={amountCol}
          options={options}
          onChange={setAmountCol}
        />

        {/* Split-layout alternative: debit + optional credit. */}
        <ColumnSelect
          id="map-debit"
          label={t('columnMapper.debitColumn')}
          placeholder={placeholder}
          value={debitCol}
          options={options}
          onChange={setDebitCol}
        />
        <ColumnSelect
          id="map-credit"
          label={t('columnMapper.creditColumn')}
          placeholder={placeholder}
          value={creditCol}
          options={options}
          onChange={setCreditCol}
        />

        {dateFormatAmbiguous && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="map-dateformat">
              {t('columnMapper.dateFormat')}
            </label>
            <select
              id="map-dateformat"
              className={styles.select}
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            >
              <option value="">{t('columnMapper.selectFormat')}</option>
              <option value="DD/MM/YYYY">{t('columnMapper.dateFormatDdMmYyyy')}</option>
              <option value="MM/DD/YYYY">{t('columnMapper.dateFormatMmDdYyyy')}</option>
            </select>
          </div>
        )}

        <p className={styles.hint}>{t('columnMapper.requiredHint')}</p>

        <div className={styles.buttons}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {t('columnMapper.cancelButton')}
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {t('columnMapper.confirmButton')}
          </button>
        </div>
      </div>
    </section>
  );
}

export default ColumnMapper;
