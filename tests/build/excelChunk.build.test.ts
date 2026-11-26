import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIST = resolve(__dirname, '../..', 'dist')
const ASSETS = resolve(DIST, 'assets')

const jsChunks = (): string[] =>
  existsSync(ASSETS) ? readdirSync(ASSETS).filter((f) => f.endsWith('.js')) : []

/** URLs from the inlined (minified) __PRECACHE__ object literal in dist/sw.js. */
function precacheUrls(): string[] {
  const sw = readFileSync(resolve(DIST, 'sw.js'), 'utf8')
  const re = /url:\s*(["'`])([^"'`]+)\1\s*,\s*hash:\s*(["'`])[0-9a-f]{64}\3/g
  return [...sw.matchAll(re)].map((m) => m[2])
}

/** Main entry chunk: the module script referenced by dist/index.html. */
function mainEntryFile(): string {
  const html = readFileSync(resolve(DIST, 'index.html'), 'utf8')
  const m = html.match(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.js)["']/i)
  expect(m, 'no <script src> in dist/index.html').not.toBeNull()
  return resolve(DIST, '.' + (m as RegExpMatchArray)[1].replace(/^\.?\/?/, '/'))
}

const excelChunks = (): string[] => jsChunks().filter((f) => /excel|xlsx/i.test(f))

describe('Excel chunk build output', () => {
  it('emits a separate Excel chunk in dist/assets', () => {
    expect(excelChunks().length, 'no excel/xlsx .js chunk in dist/assets').toBeGreaterThan(0)
    expect(
      jsChunks().some((f) => /^excelReader-/i.test(f)),
      'no excelReader-* chunk',
    ).toBe(true)
    expect(
      jsChunks().some((f) => /^xlsx-/i.test(f)),
      'no xlsx-* chunk (SheetJS)',
    ).toBe(true)
  })

  it('main entry chunk has no SheetJS code and only dynamically imports the Excel chunk', () => {
    const entry = mainEntryFile()
    expect(existsSync(entry), `missing entry ${entry}`).toBe(true)
    const code = readFileSync(entry, 'utf8')

    for (const marker of ['SheetJS', 'decode_range', 'Apache License']) {
      expect(code.includes(marker), `entry chunk contains "${marker}"`).toBe(false)
    }

    for (const chunk of excelChunks()) {
      const esc = chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Static: `import ... from "./chunk"` or `import "./chunk"` or `export ... from`.
      const staticImport = new RegExp(
        `(?:\\bfrom\\s*|\\bimport\\s*)["'][^"']*${esc}["']`,
      ).test(code)
      expect(staticImport, `entry statically imports ${chunk}`).toBe(false)
    }

    // Entry must not list the Excel chunks in index.html as modulepreload either.
    const html = readFileSync(resolve(DIST, 'index.html'), 'utf8')
    for (const chunk of excelChunks()) {
      expect(html.includes(chunk), `index.html references ${chunk}`).toBe(false)
    }
  })

  it('every Excel chunk URL is in the __PRECACHE__ entries of dist/sw.js', () => {
    const urls = precacheUrls()
    expect(urls.length, 'no precache entries in dist/sw.js').toBeGreaterThan(0)
    const chunks = excelChunks()
    expect(chunks.length, 'no excel/xlsx chunks to check').toBeGreaterThan(0)
    const missing = chunks.filter((c) => !urls.includes(`/assets/${c}`))
    expect(missing, `not precached: ${missing.join(', ')}`).toEqual([])
  })
})
