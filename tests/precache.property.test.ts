import { createHash } from 'node:crypto'
import fc from 'fast-check'
import { describe, it, expect } from 'vitest'
import {
  CACHE_PREFIX,
  cacheNameFor,
  computeCacheVersion,
  routeRequest,
  staleCaches,
  type PrecacheEntry,
} from '../src/engine/precache'

const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex')

const urlArb = fc.stringMatching(/^\/[a-z0-9._-]{1,12}$/)
const hashArb = fc.stringMatching(/^[0-9a-f]{8,16}$/)

const entriesArb = fc.uniqueArray(fc.record({ url: urlArb, hash: hashArb }), {
  selector: (e) => e.url,
  minLength: 1,
  maxLength: 12,
})

describe('precache Cache_Version properties', () => {
  // Feature: privacy-you-can-verify, Property 9: Cache_Version is content-addressed
  it('is order independent, 16 hex chars, and changes with any content change', () => {
    // **Validates: Requirements 4.1, 4.2**
    fc.assert(
      fc.property(
        entriesArb,
        fc.infiniteStream(fc.nat()),
        fc.nat(),
        (entries, rnd, idx) => {
          const version = computeCacheVersion(entries, sha256Hex)
          expect(version).toMatch(/^[0-9a-f]{16}$/)

          // Any reordering and any identical copy gives the same version.
          const shuffled = [...entries]
          const it = rnd[Symbol.iterator]()
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = it.next().value! % (i + 1)
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }
          expect(computeCacheVersion(shuffled, sha256Hex)).toBe(version)
          expect(computeCacheVersion(entries.map((e) => ({ ...e })), sha256Hex)).toBe(version)

          const i = idx % entries.length
          const mutate = (fn: (e: PrecacheEntry) => PrecacheEntry[]): string =>
            computeCacheVersion(
              entries.flatMap((e, k) => (k === i ? fn(e) : [e])),
              sha256Hex,
            )

          // Changed hash.
          expect(mutate((e) => [{ ...e, hash: e.hash + 'a' }])).not.toBe(version)
          // Changed url.
          expect(mutate((e) => [{ ...e, url: e.url + 'x' }])).not.toBe(version)
          // Removed entry.
          expect(mutate(() => [])).not.toBe(version)
          // Added entry (url guaranteed unused).
          expect(
            computeCacheVersion([...entries, { url: '/added-new-entry', hash: 'ff' }], sha256Hex),
          ).not.toBe(version)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('precache stale cache selection properties', () => {
  // Feature: privacy-you-can-verify, Property 10: Stale cache selection
  it('returns exactly our non-current caches and never foreign or current ones', () => {
    // **Validates: Requirements 4.5**
    const versionArb = fc.stringMatching(/^[0-9a-f]{16}$/)
    const nameArb = fc.oneof(
      versionArb.map(cacheNameFor),
      fc.string({ maxLength: 20 }).map((s) => CACHE_PREFIX + s),
      fc.string({ maxLength: 20 }).filter((s) => !s.startsWith(CACHE_PREFIX)),
    )
    fc.assert(
      fc.property(fc.array(nameArb, { maxLength: 20 }), versionArb, (names, current) => {
        const withCurrent = [...names, cacheNameFor(current)]
        const stale = staleCaches(withCurrent, current)
        const expected = withCurrent.filter(
          (n) => n.startsWith(CACHE_PREFIX) && n !== cacheNameFor(current),
        )
        expect(stale).toEqual(expected)
        expect(stale).not.toContain(cacheNameFor(current))
        expect(stale.every((n) => n.startsWith(CACHE_PREFIX))).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

describe('precache request routing properties', () => {
  // Feature: privacy-you-can-verify, Property 11: Request routing
  it('routes only same-origin GETs to the precache and never user-derived URLs', () => {
    // **Validates: Requirements 1.4, 1.5, 1.9, 1.10, 12.2, 12.6**
    const ownOrigin = 'https://app.example.com'
    const methodArb = fc.constantFrom('GET', 'get', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS')
    const originArb = fc.constantFrom(
      ownOrigin,
      'https://evil.example.org',
      'http://app.example.com',
      'https://app.example.com:8443',
      'https://sub.app.example.com',
    )
    const pathArb = fc.stringMatching(/^\/[a-z0-9._-]{0,12}$/)
    const queryArb = fc.constantFrom('', '?a=1', '?q=secret&x=y', '?')
    const modeArb = fc.constantFrom('navigate', 'cors', 'no-cors', 'same-origin')
    const setArb = fc
      .uniqueArray(pathArb, { minLength: 0, maxLength: 10 })
      .map((a) => new Set(a))

    fc.assert(
      fc.property(
        methodArb,
        originArb,
        pathArb,
        queryArb,
        modeArb,
        setArb,
        fc.boolean(),
        (method, origin, path, query, mode, precached, inSet) => {
          const set = new Set(precached)
          if (inSet) set.add(path)
          const route = routeRequest({
            method,
            url: origin + path + query,
            mode,
            ownOrigin,
            precachedUrls: set,
          })
          const isGet = method.toUpperCase() === 'GET'
          const sameOrigin = origin === ownOrigin

          if (!isGet || !sameOrigin) {
            expect(route).toEqual({ kind: 'pass' })
          } else if (mode === 'navigate') {
            expect(route).toEqual({ kind: 'cache', key: '/index.html' })
          } else if (set.has(path)) {
            expect(route).toEqual({ kind: 'cache', key: path })
          } else {
            expect(route).toEqual({ kind: 'pass' })
          }

          // A non-navigation cache route is always a precached path, never user-derived.
          if (route.kind === 'cache' && mode !== 'navigate') {
            expect(set.has(route.key)).toBe(true)
            expect(route.key).not.toContain('?')
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
