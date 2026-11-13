import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startPreviewServer, type PreviewServer } from './support/previewServer.ts'
import { sealButton } from './support/flow.ts'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const VITE_BIN = resolve(ROOT, 'node_modules/vite/bin/vite.js')
const OUT_B = 'dist-e2e-b'

let server: PreviewServer | undefined

/** Cache names in the page. Script string: this tsconfig has no DOM lib. */
const cacheKeys = (page: Page): Promise<string[]> => page.evaluate<string[]>('caches.keys()')

test.afterAll(async () => {
  await server?.stop()
  rmSync(resolve(ROOT, OUT_B), { recursive: true, force: true })
})

/** Builds the app (plus the service worker) with a marker into dist-e2e-b. */
function buildB(): void {
  const env = { ...process.env, VH_E2E_MARKER: 'v2', VH_OUT_DIR: OUT_B }
  const run = (args: string[]) =>
    execFileSync(process.execPath, [VITE_BIN, ...args], { cwd: ROOT, env, stdio: 'pipe' })
  run(['build', '--outDir', OUT_B, '--emptyOutDir'])
  run(['build', '--config', 'build/vite.sw.config.ts'])
}

test('a new build replaces the old cache and serves new content', async ({ page }) => {
  test.setTimeout(240_000)

  // (1) Build A: load, wait for ready, record cache names.
  server = await startPreviewServer('dist')
  await page.goto('/')
  const seal = sealButton(page)
  await expect(seal).toHaveAttribute('aria-label', /Works offline: ready/, { timeout: 30_000 })
  const cachesA = await cacheKeys(page)
  const nameA = cachesA.find((n: string) => n.startsWith('vh-precache-'))
  expect(nameA).toBeTruthy()

  // (2) Stop server, (3) build B, (4) serve B on the same port.
  await server.stop()
  server = undefined
  buildB()
  server = await startPreviewServer(OUT_B)

  // (5) Reload in the same context; wait for the new worker to take over.
  await page.reload()
  await expect
    .poll(async () => {
      try {
        return (await cacheKeys(page)).includes(nameA!)
      } catch {
        return true // page is mid-reload; check again
      }
    }, { timeout: 60_000 })
    .toBe(false)

  // Allow the one-time reload, then wait for ready again.
  await page.waitForLoadState('load')
  await expect(sealButton(page)).toHaveAttribute('aria-label', /Works offline: ready/, { timeout: 60_000 })

  await expect
    .poll(() => page.evaluate<string>("fetch('/marker.txt').then((r) => r.text())"), { timeout: 30_000 })
    .toBe('v2')

  const cachesB = await cacheKeys(page)
  expect(cachesB).not.toContain(nameA)
  expect(cachesB.some((n: string) => n.startsWith('vh-precache-') && n !== nameA)).toBe(true)
})
