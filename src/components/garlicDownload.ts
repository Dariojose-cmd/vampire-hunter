/**
 * Build and trigger a browser download of a garlic-reminder .ics file for a
 * vampire, entirely client-side (Blob + object URL — no network). Returns
 * `true` on success, `false` if ICS generation failed so the caller can
 * disable the button gracefully.
 */

import { generateIcs } from '@engine/icsGenerator';
import type { Vampire } from '@engine/types';
import { translate, type Language } from '@i18n/index';

export function downloadGarlicIcs(vampire: Vampire, language: Language): boolean {
  const i18nStrings = {
    icsEventSummary: translate(language, 'garlic.icsEventSummary', { name: vampire.displayName }),
    icsEventDescription: translate(language, 'garlic.icsEventDescription', {
      name: vampire.displayName,
    }),
    icsFilename: translate(language, 'garlic.icsFilename', { name: vampire.displayName }),
  };

  const result = generateIcs(vampire, language, i18nStrings);
  if (!result.ok) return false;

  try {
    const blob = new Blob([result.value], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safeName = vampire.displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const a = document.createElement('a');
    a.href = url;
    a.download = `vampire-reminder-${safeName}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}
