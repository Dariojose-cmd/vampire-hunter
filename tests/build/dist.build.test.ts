import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildManifest } from '../../build/precachePlugin.ts'

const ROOT = resolve(__dirname, '../..')
const DIST = resolve(ROOT, 'dist')
const PUBLIC_SAMPLES = resolve(ROOT, 'public/samples')

const SAMPLES = [
  'amex-positive-charges.csv',
  'latam-bank-cop.csv',
  'latam-bank-mxn.csv',
  'messy-statement.csv',
  'us-bank-usd.csv',
]
const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']

const REQUIRED = [
  'sw.js',
  'index.html',
  'manifest.webmanifest',
  ...ICONS.map((n) => `icons/${n}`),
  ...SAMPLES.map((n) => `samples/${n}`),
]

const sha256Hex = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

/** Pulls { url, hash } pairs out of the inlined (minified) __PRECACHE__ object literal. */
function embeddedEntries(sw: string): Array<{ url: string; hash: string }> {
  const re = /url:\s*(["'`])([^"'`]+)\1\s*,\s*hash:\s*(["'`])([0-9a-f]{64})\3/g
  const out: Array<{ url: string; hash: string }> = []
  for (const m of sw.matchAll(re)) out.push({ url: m[2], hash: m[4] })
  return out
}

describe('dist build output', () => {
  it('contains every required file', () => {
    const missing = REQUIRED.filter((f) => !existsSync(resolve(DIST, f))).map((f) => `dist/${f}`)
    expect(missing, `missing: ${missing.join(', ')}`).toEqual([])
  })

  it('embedded manifest hashes in sw.js match the files on disk', () => {
    const sw = readFileSync(resolve(DIST, 'sw.js'), 'utf8')
    const entries = embeddedEntries(sw)
    expect(entries.length, 'no precache entries found in dist/sw.js').toBeGreaterThan(0)

    const bad: string[] = []
    for (const { url, hash } of entries) {
      const file = resolve(DIST, '.' + url)
      if (!existsSync(file)) {
        bad.push(`${url}: file missing in dist`)
        continue
      }
      const actual = sha256Hex(new Uint8Array(readFileSync(file)))
      if (actual !== hash) bad.push(`${url}: embedded ${hash} != disk ${actual}`)
    }
    expect(bad, bad.join('\n')).toEqual([])

    // Same set of URLs as a fresh scan of dist/ (nothing unlisted, nothing extra).
    const fresh = buildManifest(DIST)
    expect(entries.map((e) => e.url).sort()).toEqual(fresh.entries.map((e) => e.url).sort())
    expect(sw).toContain(fresh.version)
  })

  it('sw.js has no eval( or new Function', () => {
    const sw = readFileSync(resolve(DIST, 'sw.js'), 'utf8')
    expect(/\beval\s*\(/.test(sw), 'dist/sw.js contains eval(').toBe(false)
    expect(/new\s+Function\b/.test(sw), 'dist/sw.js contains new Function').toBe(false)
  })

  it('index.html has no inline script', () => {
    const html = readFileSync(resolve(DIST, 'index.html'), 'utf8')
    const inline: string[] = []
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(m[1])) inline.push(m[0].slice(0, 80))
    }
    expect(inline, `inline scripts: ${inline.join(' | ')}`).toEqual([])
    expect(/\son[a-z]+\s*=/i.test(html), 'inline event handler attribute').toBe(false)
    expect(/href\s*=\s*["']\s*javascript:/i.test(html), 'javascript: URL').toBe(false)
  })

  it.each(SAMPLES)('dist/samples/%s is byte-identical to public/samples/%s', (name) => {
    const built = resolve(DIST, 'samples', name)
    const source = resolve(PUBLIC_SAMPLES, name)
    expect(existsSync(built), `missing: dist/samples/${name}`).toBe(true)
    expect(existsSync(source), `missing: public/samples/${name}`).toBe(true)
    const a = readFileSync(built)
    const b = readFileSync(source)
    expect(a.equals(b), `dist/samples/${name} differs from public/samples/${name}`).toBe(true)
  })
})
