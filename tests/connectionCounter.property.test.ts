import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import {
  applyEntries,
  classifyUrl,
  countConnections,
  emptyCounter,
  type UrlClass,
} from '../src/engine/connectionCounter'

/**
 * Property tests for the connection counter.
 * Generators are category-based: the expected class comes from the category
 * that built the URL, never from the code under test (Requirement 14.3).
 */

export const OWN_ORIGIN = 'https://app.example'

export const NUM_RUNS = 100

export type Category =
  | 'same-origin'
  | 'relative'
  | 'cross-host'
  | 'cross-subdomain'
  | 'cross-port'
  | 'cross-scheme'
  | 'ws-other'
  | 'data'
  | 'blob'
  | 'unparseable'

export interface Generated {
  readonly url: string
  readonly category: Category
  readonly expectedClass: UrlClass
  /** True when countConnections must count this single URL as external. */
  readonly expectedExternal: boolean
}

const alnum = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')

export const segmentArb = fc
  .array(fc.constantFrom(...alnum), { minLength: 1, maxLength: 10 })
  .map((cs) => cs.join(''))

export const pathArb = fc
  .array(segmentArb, { minLength: 0, maxLength: 4 })
  .map((segs) => segs.join('/'))

/** Random host that is never app.example or a subdomain of it. */
export const otherHostArb = fc
  .tuple(segmentArb, fc.constantFrom('com', 'net', 'org', 'io', 'test', 'dev'))
  .map(([label, tld]) => `${label}-x.${tld}`)

const make = (
  category: Category,
  url: string,
  expectedClass: UrlClass,
  expectedExternal: boolean,
): Generated => ({ url, category, expectedClass, expectedExternal })

export const sameOriginArb: fc.Arbitrary<Generated> = pathArb.map((p) =>
  make('same-origin', `${OWN_ORIGIN}/${p}`, 'same-origin', false),
)

export const relativeArb: fc.Arbitrary<Generated> = fc
  .tuple(fc.constantFrom('/', './', ''), pathArb, segmentArb)
  .map(([prefix, p, name]) =>
    make('relative', `${prefix}${p === '' ? name : `${p}/${name}`}`, 'same-origin', false),
  )

export const crossHostArb: fc.Arbitrary<Generated> = fc
  .tuple(fc.constantFrom('http', 'https'), otherHostArb, pathArb)
  .map(([scheme, host, p]) => make('cross-host', `${scheme}://${host}/${p}`, 'external', true))

export const crossSubdomainArb: fc.Arbitrary<Generated> = pathArb.map((p) =>
  make('cross-subdomain', `https://x.app.example/${p}`, 'external', true),
)

export const crossPortArb: fc.Arbitrary<Generated> = pathArb.map((p) =>
  make('cross-port', `https://app.example:8443/${p}`, 'external', true),
)

export const crossSchemeArb: fc.Arbitrary<Generated> = pathArb.map((p) =>
  make('cross-scheme', `http://app.example/${p}`, 'external', true),
)

export const wsOtherArb: fc.Arbitrary<Generated> = fc
  .tuple(fc.constantFrom('ws', 'wss'), otherHostArb, pathArb)
  .map(([scheme, host, p]) => make('ws-other', `${scheme}://${host}/${p}`, 'external', true))

export const dataArb: fc.Arbitrary<Generated> = segmentArb.map((t) =>
  make('data', `data:text/plain,${t}`, 'inline', false),
)

export const blobArb: fc.Arbitrary<Generated> = fc.uuid().map((id) =>
  make('blob', `blob:${OWN_ORIGIN}/${id}`, 'inline', false),
)

export const unparseableArb: fc.Arbitrary<Generated> = fc
  .constantFrom('http://', 'https://[::1', 'http://exa mple.com')
  .map((u) => make('unparseable', u, 'unparseable', false))

export const anyCategoryArb: fc.Arbitrary<Generated> = fc.oneof(
  sameOriginArb,
  relativeArb,
  crossHostArb,
  crossSubdomainArb,
  crossPortArb,
  crossSchemeArb,
  wsOtherArb,
  dataArb,
  blobArb,
  unparseableArb,
)

describe('connectionCounter properties', () => {
  // Feature: privacy-you-can-verify, Property 1: Classification matches the generator's category
  // **Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 14.3**
  it("Property 1: Classification matches the generator's category", () => {
    fc.assert(
      fc.property(anyCategoryArb, (g) => {
        if (classifyUrl(g.url, OWN_ORIGIN) !== g.expectedClass) return false
        const { external, unparseable } = countConnections([g.url], OWN_ORIGIN)
        return (
          external === (g.expectedExternal ? 1 : 0) &&
          unparseable === (g.expectedClass === 'unparseable' ? 1 : 0)
        )
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: privacy-you-can-verify, Property 2: Robustness and bounds
  // **Validates: Requirements 7.2, 7.10, 7.12, 7.13**
  it('Property 2: Robustness and bounds', () => {
    const entryArb = fc.oneof(
      fc.string(),
      anyCategoryArb.map((g) => g.url),
    )
    const originArb = fc.oneof(
      fc.constant(OWN_ORIGIN),
      otherHostArb.map((h) => `https://${h}`),
    )
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 200 }), originArb, (urls, origin) => {
        const { external, unparseable } = countConnections(urls, origin)
        const distinct = new Set(urls).size
        const state = applyEntries(emptyCounter, urls, origin)
        return (
          Number.isInteger(external) &&
          Number.isInteger(unparseable) &&
          external >= 0 &&
          unparseable >= 0 &&
          external <= urls.length &&
          unparseable <= distinct &&
          external + unparseable <= distinct &&
          state.external === external
        )
      }),
      { numRuns: NUM_RUNS },
    )
    const empty = countConnections([], OWN_ORIGIN)
    if (empty.external !== 0 || empty.unparseable !== 0) throw new Error('empty list must be 0,0')
  })

  // Feature: privacy-you-can-verify, Property 3: Additivity over disjoint lists
  // **Validates: Requirements 7.14**
  it('Property 3: Additivity over disjoint lists', () => {
    const listArb = fc.array(
      anyCategoryArb.map((g) => g.url),
      { maxLength: 50 },
    )
    fc.assert(
      fc.property(listArb, listArb, (a, rawB) => {
        const inA = new Set(a)
        const b = rawB.filter((u) => !inA.has(u))
        const ra = countConnections(a, OWN_ORIGIN)
        const rb = countConnections(b, OWN_ORIGIN)
        const rab = countConnections([...a, ...b], OWN_ORIGIN)
        return (
          rab.external === ra.external + rb.external &&
          rab.unparseable === ra.unparseable + rb.unparseable
        )
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: privacy-you-can-verify, Property 4: Order independence
  // **Validates: Requirements 7.15**
  it('Property 4: Order independence', () => {
    const listArb = fc.array(
      anyCategoryArb.map((g) => g.url),
      { maxLength: 50 },
    )
    fc.assert(
      fc.property(
        listArb.chain((urls) =>
          fc.tuple(fc.constant(urls), fc.shuffledSubarray(urls, { minLength: urls.length, maxLength: urls.length })),
        ),
        ([urls, permuted]) => {
          const r1 = countConnections(urls, OWN_ORIGIN)
          const r2 = countConnections(permuted, OWN_ORIGIN)
          return r1.external === r2.external && r1.unparseable === r2.unparseable
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: privacy-you-can-verify, Property 5: Internal-only lists never count
  // **Validates: Requirements 7.16**
  it('Property 5: Internal-only lists never count', () => {
    const internalArb = fc.oneof(sameOriginArb, relativeArb, dataArb, blobArb)
    fc.assert(
      fc.property(fc.array(internalArb, { maxLength: 50 }), (gs) => {
        const { external, unparseable } = countConnections(
          gs.map((g) => g.url),
          OWN_ORIGIN,
        )
        return external === 0 && unparseable === 0
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: privacy-you-can-verify, Property 6: External lower bound
  // **Validates: Requirements 7.17**
  it('Property 6: External lower bound', () => {
    const externalArb = fc.oneof(
      crossHostArb,
      crossSubdomainArb,
      crossPortArb,
      crossSchemeArb,
      wsOtherArb,
    )
    fc.assert(
      fc.property(
        fc.array(externalArb, { maxLength: 30 }),
        fc.array(anyCategoryArb, { maxLength: 30 }),
        fc.nat(),
        (ext, others, seed) => {
          const distinctExternal = new Set(ext.map((g) => g.url))
          const n = distinctExternal.size
          // Interleave the two groups deterministically from the seed.
          const mixed = [...ext, ...others].map((g) => g.url)
          const k = mixed.length === 0 ? 0 : seed % mixed.length
          const list = [...mixed.slice(k), ...mixed.slice(0, k)]
          return countConnections(list, OWN_ORIGIN).external >= n
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: privacy-you-can-verify, Property 7: Already-counted entries change nothing
  // **Validates: Requirements 7.11**
  it('Property 7: Already-counted entries change nothing', () => {
    const listArb = fc.array(
      anyCategoryArb.map((g) => g.url),
      { maxLength: 50 },
    )
    fc.assert(
      fc.property(
        listArb.chain((urls) =>
          fc.tuple(
            fc.constant(urls),
            fc.array(urls.length === 0 ? fc.constant('') : fc.constantFrom(...urls), {
              maxLength: 60,
            }),
          ),
        ),
        ([urls, repeats]) => {
          const base = applyEntries(emptyCounter, urls, OWN_ORIGIN)
          const again = applyEntries(base, repeats.filter((u) => urls.includes(u)), OWN_ORIGIN)
          const dup = applyEntries(base, [...urls, ...urls], OWN_ORIGIN)
          // Duplicates inside a single list count once.
          const single = countConnections([...urls, ...urls], OWN_ORIGIN)
          const once = countConnections(urls, OWN_ORIGIN)
          return (
            again.external === base.external &&
            again.unparseable === base.unparseable &&
            dup.external === base.external &&
            dup.unparseable === base.unparseable &&
            single.external === once.external &&
            single.unparseable === once.unparseable
          )
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: privacy-you-can-verify, Property 8: Incremental application is idempotent
  // **Validates: Requirements 7.18**
  it('Property 8: Incremental application is idempotent', () => {
    const listArb = fc.array(
      anyCategoryArb.map((g) => g.url),
      { maxLength: 50 },
    )
    fc.assert(
      fc.property(listArb, listArb, (seed, list) => {
        const start = applyEntries(emptyCounter, seed, OWN_ORIGIN)
        const once = applyEntries(start, list, OWN_ORIGIN)
        const twice = applyEntries(once, list, OWN_ORIGIN)
        return once.external === twice.external && once.unparseable === twice.unparseable
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
