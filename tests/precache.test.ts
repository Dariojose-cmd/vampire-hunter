import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CACHE_PREFIX,
  cacheNameFor,
  computeCacheVersion,
  routeRequest,
  staleCaches,
} from '../src/engine/precache'

const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex')

describe('computeCacheVersion', () => {
  it('matches sha256 of the canonical string, first 16 hex chars (Req 4.1)', () => {
    const entries = [
      { url: '/b.js', hash: 'bbb' },
      { url: '/a.css', hash: 'aaa' },
    ]
    // Sorted by URL, each line `url\0hash\n`.
    const canonical = '/a.css\0aaa\n/b.js\0bbb\n'
    const expected = createHash('sha256').update(canonical).digest('hex').slice(0, 16)
    expect(computeCacheVersion(entries, sha256Hex)).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('cacheNameFor / staleCaches', () => {
  it('prefixes the version', () => {
    expect(cacheNameFor('abc123')).toBe(`${CACHE_PREFIX}abc123`)
  })

  it('returns only our non-current caches', () => {
    const names = ['vh-precache-old', 'vh-precache-new', 'other-cache', 'workbox-1']
    expect(staleCaches(names, 'new')).toEqual(['vh-precache-old'])
  })
})

describe('routeRequest', () => {
  const ownOrigin = 'https://app.example.com'
  const precachedUrls = new Set(['/index.html', '/assets/app.js'])
  const base = { method: 'GET', mode: 'no-cors', ownOrigin, precachedUrls }

  it('passes non-GET requests', () => {
    expect(routeRequest({ ...base, method: 'POST', url: `${ownOrigin}/assets/app.js` })).toEqual({
      kind: 'pass',
    })
  })

  it('passes cross-origin requests', () => {
    expect(routeRequest({ ...base, url: 'https://evil.example.net/assets/app.js' })).toEqual({
      kind: 'pass',
    })
  })

  it('maps navigations to /index.html', () => {
    expect(routeRequest({ ...base, mode: 'navigate', url: `${ownOrigin}/some/deep/route?x=1` })).toEqual({
      kind: 'cache',
      key: '/index.html',
    })
  })

  it('serves precached assets from cache, ignoring the query string', () => {
    expect(routeRequest({ ...base, url: `${ownOrigin}/assets/app.js?v=99` })).toEqual({
      kind: 'cache',
      key: '/assets/app.js',
    })
  })

  it('passes unlisted paths', () => {
    expect(routeRequest({ ...base, url: `${ownOrigin}/api/other.json` })).toEqual({ kind: 'pass' })
  })
})
