import { test, expect, type Page } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './support/previewServer.ts'
import { recordRequests, recordCspViolations } from './support/recorders.ts'
import {
  sealButton, str, pickSample, expectCrypt, stakeFirstVampire, downloadGarlicIcs,
  uploadCsv, toggleSound, switchLanguage, burn, type Lang,
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
