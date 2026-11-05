/**
 * LanguageSwitch — a two-state toggle between English and Spanish.
 *
 * On change it calls `onChange` with the new language; the parent persists it
 * (localStorage) and re-renders all i18n strings without a page reload. The
 * button label shows the language the user would switch TO.
 */

import { useTranslation, type Language } from '@i18n/index';
import styles from './App.module.css';

export interface LanguageSwitchProps {
  language: Language;
  onChange: (language: Language) => void;
}

export function LanguageSwitch({ language, onChange }: LanguageSwitchProps) {
  const { t } = useTranslation(language);
  return (
    <button
      type="button"
      className={styles.langBtn}
      onClick={() => onChange(language === 'en' ? 'es' : 'en')}
      aria-label={t('nav.languageSwitchAriaLabel')}
    >
      {t('nav.languageSwitch')}
    </button>
  );
}

export default LanguageSwitch;
