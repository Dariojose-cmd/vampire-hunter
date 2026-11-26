/**
 * i18n, README and dependency content checks for Excel support.
 * Validates: Requirements 4.2, 4.5, 4.6, 8.1, 8.2, 8.13, 8.14, 8.15, 8.16
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const json = (p: string) => JSON.parse(read(p)) as Record<string, unknown>

const en = json('src/i18n/en.json')
const es = json('src/i18n/es.json')

function get(obj: Record<string, unknown>, path: string): string {
  let cur: unknown = obj
  for (const k of path.split('.')) {
    cur = (cur as Record<string, unknown> | undefined)?.[k]
  }
  return cur as string
}

function leafPaths(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      leafPaths(v, prefix ? `${prefix}.${k}` : k, out)
    }
  } else {
    out.push(prefix)
  }
  return out
}

const locales = { en, es }
const TARBALL = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'

describe('i18n Excel messages', () => {
  for (const [name, loc] of Object.entries(locales)) {
    describe(name, () => {
      it('errors.pdfNotSupported exists and names Excel', () => {
        expect(get(loc, 'errors.pdfNotSupported')).toMatch(/Excel/)
      })
      it('errors.fileNotCsv names .csv, .xls and .xlsx', () => {
        const s = get(loc, 'errors.fileNotCsv')
        expect(s).toContain('.csv')
        expect(s).toContain('.xls')
        expect(s).toContain('.xlsx')
      })
      it('errors.parseFailed mentions Excel', () => {
        expect(get(loc, 'errors.parseFailed')).toMatch(/Excel/)
      })
      it('upload.supportedFormats mentions Excel', () => {
        expect(get(loc, 'upload.supportedFormats')).toMatch(/Excel/)
      })
    })
  }

  it('en.json and es.json expose the same key set', () => {
    expect(leafPaths(es).sort()).toEqual(leafPaths(en).sort())
  })
})

describe('README', () => {
  const readme = read('README.md')
  it('states CSV, .xlsx and .xls are supported and PDF is not', () => {
    expect(readme).toMatch(/CSV, `\.xlsx` and `\.xls` files are supported/)
    expect(readme).toMatch(/PDF files are not/)
  })
})

describe('xlsx dependency pinning', () => {
  it('package.json pins the SheetJS tarball URL', () => {
    const pkg = json('package.json') as { dependencies: Record<string, string> }
    expect(pkg.dependencies.xlsx).toBe(TARBALL)
  })

  it('package-lock.json resolves xlsx to the tarball with no 0.18.x entry', () => {
    const lockText = read('package-lock.json')
    const lock = JSON.parse(lockText) as {
      packages: Record<string, { version?: string; resolved?: string }>
    }
    const entry = lock.packages['node_modules/xlsx']
    expect(entry.resolved).toBe(TARBALL)
    expect(entry.version).toBe('0.20.3')
    const xlsxEntries = Object.entries(lock.packages).filter(([k]) => /(^|\/)xlsx$/.test(k))
    for (const [, v] of xlsxEntries) {
      expect(v.version).not.toMatch(/^0\.18\./)
    }
    expect(lockText).not.toMatch(/xlsx-0\.18\./)
  })
})
