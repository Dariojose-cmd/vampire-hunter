import { test, expect } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './support/previewServer.ts'
import { sealButton } from './support/flow.ts'

let server: PreviewServer | undefined

test.beforeAll(async () => {
  server = await startPreviewServer('dist')
})

test.afterAll(async () => {
  await server?.stop()
})

// First visit: the service worker installs and the seal reports "ready" without any reload.
test('first visit reaches "Works offline: ready" with exactly one navigation', async ({ page }) => {
  test.setTimeout(60_000)

  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1
  })

  await page.goto('/')

  const seal = sealButton(page)
  await expect(seal).toHaveAttribute('aria-label', /Works offline: ready/, { timeout: 30_000 })

  const visible = (await seal.innerText()).trim()
  expect(visible.toLowerCase()).toContain('offline ready')

  const accessibleName = (await seal.getAttribute('aria-label')) ?? ''
  expect(accessibleName.startsWith(`${visible}. `)).toBe(true)

  expect(navigations).toBe(1)
})
