import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startPreviewServer, type PreviewServer } from './support/previewServer.ts'
import { headersForPath, parseHeaderRules } from '../build/headerRules.ts'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const rules = parseHeaderRules(readFileSync(resolve(ROOT, 'customHttp.yml'), 'utf8'))

let server: PreviewServer | undefined

test.beforeAll(async () => {
  server = await startPreviewServer('dist')
})

test.afterAll(async () => {
  await server?.stop()
})

function expectHeaders(actual: Record<string, string>, path: string) {
  const expected = headersForPath(rules, path)
  expect(Object.keys(expected).length, `expected headers for ${path}`).toBeGreaterThan(0)
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key.toLowerCase()], `${path} header ${key}`).toBe(value)
  }
}

test('main document CSP equals customHttp.yml and the baseline byte for byte', async ({ request }) => {
  const res = await request.get('/')
  expect(res.status()).toBe(200)
  const csp = res.headers()['content-security-policy']
  const fromYaml = headersForPath(rules, '/')['Content-Security-Policy']
  expect(csp).toBe(fromYaml)
  const baseline = readFileSync(resolve(ROOT, 'tests/baselines/csp.txt'), 'utf8').replace(/\r?\n$/, '')
  expect(csp).toBe(baseline)
})

test('static paths carry the headers declared in customHttp.yml', async ({ request }) => {
  const indexHtml = await (await request.get('/index.html')).text()
  const m = /<script[^>]*\bsrc="([^"]*\/assets\/[^"]+)"/.exec(indexHtml)
  expect(m, 'hashed script in index.html').not.toBeNull()
  const assetPath = new URL(m![1], 'http://localhost:4173/').pathname

  for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', assetPath]) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
    expectHeaders(res.headers(), path)
  }
})

test('sw.js is served as JavaScript, not HTML', async ({ request }) => {
  const res = await request.get('/sw.js')
  const type = res.headers()['content-type'] ?? ''
  expect(type).toMatch(/javascript/i)
  expect(type).not.toMatch(/html/i)
})
