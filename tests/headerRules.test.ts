import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import { headersForPath, matchesPattern, parseHeaderRules, type HeaderRule } from '../build/headerRules.ts'

// Feature: privacy-you-can-verify, Property 16: Header merge by path
describe('headersForPath (Property 16: Header merge by path)', () => {
  const segment = fc.constantFrom('a', 'b', 'assets', 'img', 'index.html')
  const pathArb = fc
    .array(segment, { minLength: 1, maxLength: 3 })
    .map((s) => '/' + s.join('/'))
  const patternArb = fc.oneof(
    fc.constant('**'),
    pathArb,
    fc.constantFrom('/a', 'b', 'assets', 'img').map((d) => `/${d}/*`),
  )
  const nameArb = fc.constantFrom('X-A', 'x-a', 'X-B', 'x-b', 'Cache-Control', 'cache-control', 'X-C')
  const headerArb = fc.record({
    key: nameArb,
    value: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim() === s && s !== ''),
  })
  const ruleArb = fc.record({
    pattern: patternArb,
    headers: fc.array(headerArb, { maxLength: 4 }),
  })

  // Oracle: literal patterns by equality, `/dir/*` by prefix + no further slash, `**` always.
  function matches(pattern: string, path: string): boolean {
    if (pattern === '**') return true
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1)
      return path.startsWith(prefix) && !path.slice(prefix.length).includes('/')
    }
    return pattern === path
  }

  function oracle(rules: HeaderRule[], path: string): Map<string, string> {
    const m = new Map<string, string>()
    for (const r of rules) {
      if (!matches(r.pattern, path)) continue
      for (const h of r.headers) m.set(h.key.toLowerCase(), h.value)
    }
    return m
  }

  const lowerMap = (rec: Record<string, string>) =>
    new Map(Object.entries(rec).map(([k, v]) => [k.toLowerCase(), v]))

  it('merges matching rules in order, case-insensitively, with no leaks from non-matching rules', () => {
    fc.assert(
      fc.property(fc.array(ruleArb, { maxLength: 6 }), pathArb, (rules, path) => {
        const result = headersForPath(rules, path)
        // No duplicate names differing only by case
        expect(Object.keys(result).length).toBe(new Set(Object.keys(result).map((k) => k.toLowerCase())).size)
        expect(lowerMap(result)).toEqual(oracle(rules, path))
      }),
      { numRuns: 100 },
    )
  })

  it('a catch-all rule gives every path at least its headers; alone it gives exactly them', () => {
    fc.assert(
      fc.property(fc.array(headerArb, { minLength: 1, maxLength: 4 }), pathArb, (headers, path) => {
        const catchAll: HeaderRule = { pattern: '**', headers }
        const alone = lowerMap(headersForPath([catchAll], path))
        expect(alone).toEqual(oracle([catchAll], path))

        const extra: HeaderRule = { pattern: path, headers: [{ key: 'X-Extra', value: 'e' }] }
        const merged = lowerMap(headersForPath([catchAll, extra], path))
        for (const [k, v] of oracle([catchAll], path)) {
          expect(merged.has(k)).toBe(true)
          if (k !== 'x-extra') expect(merged.get(k)).toBe(v)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// Feature: privacy-you-can-verify, Property 17: Glob matching
describe('matchesPattern (Property 17: Glob matching)', () => {
  // Segments without wildcard, slash, query or hash characters; include regex-special characters.
  const segment = fc
    .string({ unit: fc.constantFrom(...'abcXYZ019._-+()[]{}$^|\\,~'.split('')), minLength: 1, maxLength: 6 })
  const pathArb = fc
    .array(segment, { minLength: 1, maxLength: 4 })
    .map((s) => '/' + s.join('/'))

  it('`**` matches any path', () => {
    fc.assert(
      fc.property(pathArb, (path) => {
        expect(matchesPattern('**', path)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('a literal pattern matches only itself (regex-special characters are escaped)', () => {
    fc.assert(
      fc.property(pathArb, pathArb, (a, b) => {
        expect(matchesPattern(a, a)).toBe(true)
        expect(matchesPattern(a, b)).toBe(a === b)
      }),
      { numRuns: 100 },
    )
  })

  it('`dir/*` matches one segment but not nested paths', () => {
    fc.assert(
      fc.property(pathArb, segment, segment, (dir, one, two) => {
        const pattern = `${dir}/*`
        expect(matchesPattern(pattern, `${dir}/${one}`)).toBe(true)
        expect(matchesPattern(pattern, `${dir}/${one}/${two}`)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('query string and hash are ignored', () => {
    const suffix = fc.constantFrom('?a=1', '#top', '?x=y#z', '?q=/a/b', '#/a/b')
    fc.assert(
      fc.property(pathArb, segment, suffix, (path, other, suf) => {
        expect(matchesPattern(path, path + suf)).toBe(true)
        expect(matchesPattern('**', path + suf)).toBe(true)
        expect(matchesPattern(`${path}/*`, `${path}/${other}${suf}`)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

describe('real customHttp.yml per-path headers', () => {
  const rules = parseHeaderRules(readFileSync(resolve(__dirname, '../customHttp.yml'), 'utf8'))
  const csp =
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  const security = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }

  it.each(['/', '/index.html', '/sw.js', '/manifest.webmanifest'])(
    '%s gets security headers plus Cache-Control: no-cache',
    (path) => {
      expect(headersForPath(rules, path)).toEqual({ ...security, 'Cache-Control': 'no-cache' })
    },
  )

  it('/assets/index-abc123.js keeps catch-all security headers and CSP, with immutable caching', () => {
    const h = headersForPath(rules, '/assets/index-abc123.js')
    expect(h).toEqual({ ...security, 'Cache-Control': 'public, max-age=31536000, immutable' })
    expect(h['Content-Security-Policy']).toBe(csp)
  })

  it('a later rule does not drop earlier headers it does not set (synthetic)', () => {
    const synthetic: HeaderRule[] = [
      { pattern: '**', headers: [{ key: 'X-A', value: '1' }, { key: 'X-B', value: '2' }] },
      { pattern: '/p', headers: [{ key: 'X-C', value: '3' }] },
      { pattern: '/p', headers: [{ key: 'x-b', value: '4' }] },
    ]
    expect(headersForPath(synthetic, '/p')).toEqual({ 'X-A': '1', 'x-b': '4', 'X-C': '3' })
  })
})
