import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './support/previewServer.ts'
import { recordRequests, recordCspViolations } from './support/recorders.ts'
import {
  sealButton, str, pickSample, expectCrypt, stakeFirstVampire, downloadGarlicIcs,
  uploadCsv, samplePath, toggleSound, switchLanguage, burn, type Lang,
} from './support/flow.ts'

let server: PreviewServer | undefined

test.beforeAll(async () => {
  server = await startPreviewServer('dist')
})

test.afterAll(async () => {
  await server?.stop()
})

const EXPECTED: Record<Lang, { label: string; connections: string; offline: string }> = {
  en: {
    label: '0 external connections · offline · still working',
    connections: 'Connections to other servers: 0',
    offline: "You're offline — still working",
  },
  es: {
    label: '0 conexiones externas · sin conexión · sigue funcionando',
    connections: 'Conexiones a otros servidores: 0',
    offline: 'Sin conexión — sigue funcionando',
  },
}

/** Reads the visible label from the DOM and checks the accessible name against it. */
async function assertSeal(page: Page, lang: Lang): Promise<string> {
  const seal = sealButton(page)
  // Wait for the offline state to settle (status flips after the online event/poll).
  await expect(seal).toHaveAttribute('aria-label', new RegExp(EXPECTED[lang].offline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const visible = (await seal.innerText()).trim()
  const name = (await seal.getAttribute('aria-label')) ?? ''
  expect(name.startsWith(`${visible}. `)).toBe(true)
  expect(name).toContain(EXPECTED[lang].connections)
  expect(name).toContain(EXPECTED[lang].offline)
  return visible
}

test('Full_Flow works offline with 0 external connections', async ({ page, context }) => {
  test.setTimeout(180_000)
  const origin = server!.origin
  const recorder = recordRequests(context, origin)
  const csp = recordCspViolations(page)

  // Online first visit: wait for the service worker precache.
  await page.goto('/')
  const seal = sealButton(page)
  await expect(seal).toHaveAttribute('aria-label', /Works offline: ready/, { timeout: 30_000 })

  // Offline reload: main screen in 10 s, no failed requests.
  await context.setOffline(true)
  recorder.failed.length = 0
  await page.reload()
  await expect(page.getByRole('button', { name: str('en', 'upload.trySampleButton') }))
    .toBeVisible({ timeout: 10_000 })
  expect(recorder.failed.filter((u) => new URL(u).origin === origin)).toEqual([])

  // Full_Flow in order, with seal checks interleaved.
  const visibleEn = await assertSeal(page, 'en')
  expect(visibleEn).toBe(EXPECTED.en.label)

  await pickSample(page)
  await expectCrypt(page)
  await assertSeal(page, 'en')

  await stakeFirstVampire(page)
  const ics = await downloadGarlicIcs(page)
  expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)

  await uploadCsv(page)
  await toggleSound(page)
  expect(await assertSeal(page, 'en')).toBe(EXPECTED.en.label)

  // Open the panel and check its text.
  await seal.click()
  const panel = page.locator(`[id="${(await seal.getAttribute('aria-controls')) ?? ''}"]`)
  await expect(panel).toContainText(EXPECTED.en.connections)
  await expect(panel).toContainText(EXPECTED.en.offline)
  await seal.click()

  await switchLanguage(page, 'en', 'es')
  const visibleEs = await assertSeal(page, 'es')
  expect(visibleEs).toBe(EXPECTED.es.label)

  await switchLanguage(page, 'es', 'en')
  expect(await assertSeal(page, 'en')).toBe(EXPECTED.en.label)

  await burn(page)
  await assertSeal(page, 'en')

  expect(recorder.foreign()).toEqual([])
  expect(csp.violations).toEqual([])
})

/**
 * Measures page-initiated requests only (`request.serviceWorker()` is null).
 * The service worker may precache the Excel chunks on install; those fetches
 * come from the worker and are excluded here. The requirement is that a
 * CSV-only session never makes the page load the Excel reader or xlsx chunks.
 */
test('CSV-only session never requests the Excel chunk', async ({ page, context }) => {
  test.setTimeout(60_000)
  const assetsDir = resolve(fileURLToPath(import.meta.url), '../../dist/assets')
  const excelChunks = readdirSync(assetsDir).filter((f) => /^(excelReader|xlsx)-.+\.js$/.test(f))
  expect(excelChunks.length).toBeGreaterThan(0)

  const pageRequests: string[] = []
  context.on('request', (r) => {
    if (r.serviceWorker() === null) pageRequests.push(r.url())
  })

  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles(samplePath('us-bank-usd.csv'))
  await expectCrypt(page)
  // Let any lazy chunk load that would be triggered settle.
  await page.waitForLoadState('networkidle')

  expect(pageRequests.some((u) => u.includes('/assets/'))).toBe(true) // listener is live
  const hits = pageRequests.filter((u) => excelChunks.some((c) => u.includes(c)))
  expect(hits).toEqual([])
})

const EXCEL_DIR = resolve(fileURLToPath(import.meta.url), '../../tests/fixtures/excel')
const XLSX_FILE = resolve(EXCEL_DIR, 'layout-a-serial-dates.xlsx')
const XLS_FILE = resolve(EXCEL_DIR, 'layout-a-serial-dates.xls')

test('Excel upload works offline after the first visit', async ({ page, context }) => {
  test.setTimeout(120_000)
  const origin = server!.origin
  const recorder = recordRequests(context, origin)
  const csp = recordCspViolations(page)

  // Online first visit only; no upload yet, so the Excel chunk has not been requested by the page.
  await page.goto('/')
  await expect(sealButton(page)).toHaveAttribute('aria-label', /Works offline: ready/, { timeout: 30_000 })

  await context.setOffline(true)
  recorder.failed.length = 0

  // The Excel chunk is first requested now and must come from the SW precache.
  await page.locator('input[type="file"]').setInputFiles(XLSX_FILE)
  await expectCrypt(page)

  await page.getByRole('button', { name: str('en', 'crypt.uploadAnother') }).click()
  await page.locator('input[type="file"]').setInputFiles(XLS_FILE)
  await expectCrypt(page)

  expect(recorder.failed.filter((u) => new URL(u).origin === origin)).toEqual([])
  expect(recorder.foreign()).toEqual([])
  expect(csp.violations).toEqual([])
})

// Keep this test last: it stops the shared preview server.
test('Excel upload works with the server stopped after the first visit', async ({ page, context }) => {
  test.setTimeout(120_000)
  const recorder = recordRequests(context, server!.origin)
  const csp = recordCspViolations(page)

  await page.goto('/')
  await expect(sealButton(page)).toHaveAttribute('aria-label', /Works offline: ready/, { timeout: 30_000 })

  await server!.stop()
  recorder.failed.length = 0

  await page.locator('input[type="file"]').setInputFiles(XLSX_FILE)
  await expectCrypt(page)

  expect(recorder.failed.filter((u) => new URL(u).origin === server!.origin)).toEqual([])
  expect(csp.violations).toEqual([])
})
