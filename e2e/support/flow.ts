import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Locator, type Page } from '@playwright/test'

export type Lang = 'en' | 'es'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')
const STRINGS: Record<Lang, Record<string, unknown>> = {
  en: JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/en.json'), 'utf8')),
  es: JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/es.json'), 'utf8')),
}

/** Resolves a dotted i18n key from the real catalog. */
export function str(lang: Lang, key: string): string {
  let node: unknown = STRINGS[lang]
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  if (typeof node !== 'string') throw new Error(`Missing i18n string ${lang}:${key}`)
  return node
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Regex for a template: literal text escaped, `{{x}}` matches anything. */
export function tpl(lang: Lang, key: string): RegExp {
  const parts = str(lang, key).split(/\{\{\w+\}\}/).map(escapeRe)
  return new RegExp(`^${parts.join('.+')}$`)
}

/** Absolute path of a CSV in the repo's samples/ folder. */
export function samplePath(file: string): string {
  return resolve(ROOT, 'samples', file)
}

// ---------- Locators ----------

/** The footer Privacy_Seal button (the one outside the sample dialog). */
export const sealButton = (page: Page): Locator => page.locator('footer button[aria-controls]')
export const vampireCards = (page: Page): Locator => page.getByRole('article')

export function stakeButtons(page: Page, lang: Lang): Locator {
  return page.getByRole('button', { name: tpl(lang, 'vampireCard.stakeAriaLabel') })
}
export function garlicButtons(page: Page, lang: Lang): Locator {
  return page.getByRole('button', { name: tpl(lang, 'vampireCard.garlicAriaLabel') })
}

// ---------- Full_Flow steps ----------

/** Opens "Try a sample" and picks the first sample (US Bank). Upload view only. */
export async function pickSample(page: Page, lang: Lang = 'en'): Promise<void> {
  await page.getByRole('button', { name: str(lang, 'upload.trySampleButton') }).click()
  const dialog = page.getByRole('dialog', { name: str(lang, 'upload.samplePicker.title') })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: str(lang, 'upload.samplePicker.us') }).click()
}

/** Asserts the crypt shows at least one VampireCard. */
export async function expectCrypt(page: Page, lang: Lang = 'en'): Promise<void> {
  await expect(page.getByRole('heading', { name: str(lang, 'crypt.title') })).toBeVisible({ timeout: 15_000 })
  await expect(vampireCards(page).first()).toBeVisible()
}

/** Stakes the first vampire through the modal; asserts the card shows its staked state. */
export async function stakeFirstVampire(page: Page, lang: Lang = 'en'): Promise<void> {
  await stakeButtons(page, lang).first().click()
  const dialog = page.getByRole('dialog', { name: tpl(lang, 'stakeModal.ariaLabel') })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: tpl(lang, 'stakeModal.confirmStakeAriaLabel') }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: tpl(lang, 'vampireCard.undoAriaLabel') }).first())
    .toBeVisible({ timeout: 10_000 })
}

/** Clicks the first available garlic button and returns the downloaded .ics text. */
export async function downloadGarlicIcs(page: Page, lang: Lang = 'en'): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    garlicButtons(page, lang).first().click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.ics$/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  expect(text.startsWith('BEGIN:VCALENDAR')).toBe(true)
  return text
}

/** Returns to the upload view and uploads a CSV from samples/ through the file input. */
export async function uploadCsv(page: Page, file = 'latam-bank-mxn.csv', lang: Lang = 'en'): Promise<void> {
  await page.getByRole('button', { name: str(lang, 'crypt.uploadAnother') }).click()
  await page.locator('input[type="file"]').setInputFiles(samplePath(file))
  await expectCrypt(page, lang)
}

/** Toggles sound once and asserts aria-pressed flipped. */
export async function toggleSound(page: Page, lang: Lang = 'en'): Promise<void> {
  const btn = page.getByRole('button', { name: str(lang, 'nav.soundToggleAriaLabel') })
  const before = (await btn.getAttribute('aria-pressed')) ?? 'false'
  await btn.click()
  await expect(btn).not.toHaveAttribute('aria-pressed', before)
}

/** Clicks the language switch (UI currently in `from`) and asserts the UI is now in `to`. */
export async function switchLanguage(page: Page, from: Lang, to: Lang): Promise<void> {
  await page.getByRole('button', { name: str(from, 'nav.languageSwitchAriaLabel') }).click()
  await expect(page.getByRole('button', { name: str(to, 'nav.languageSwitchAriaLabel') })).toBeVisible()
}

/** Burns the crypt (results view) and waits for the upload view to return. */
export async function burn(page: Page, lang: Lang = 'en'): Promise<void> {
  await page.getByRole('button', { name: str(lang, 'burn.buttonAriaLabel') }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: str(lang, 'burn.confirmAriaLabel') }).click()
  await expect(page.getByRole('heading', { name: str(lang, 'upload.title') })).toBeVisible({ timeout: 20_000 })
}

/**
 * The whole Full_Flow in the required order: sample, crypt, stake, garlic .ics,
 * CSV upload, sound, language en->es->en, burn. Works online or offline.
 */
export async function runFullFlow(page: Page): Promise<{ ics: string }> {
  await pickSample(page)
  await expectCrypt(page)
  await stakeFirstVampire(page)
  const ics = await downloadGarlicIcs(page)
  await uploadCsv(page)
  await toggleSound(page)
  await switchLanguage(page, 'en', 'es')
  await switchLanguage(page, 'es', 'en')
  await burn(page)
  return { ics }
}
