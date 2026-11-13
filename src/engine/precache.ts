/** Pure precache logic shared by the build plugin and the service worker. No DOM. */

export interface PrecacheEntry {
  url: string
  hash: string
}

export interface PrecacheManifest {
  version: string
  entries: PrecacheEntry[]
}

export const CACHE_PREFIX = 'vh-precache-'

/** First 16 hex chars of sha256 over entries sorted by URL, one `url\0hash\n` line each. */
export function computeCacheVersion(
  entries: readonly PrecacheEntry[],
  sha256Hex: (s: string) => string,
): string {
  const sorted = [...entries].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  const canonical = sorted.map((e) => `${e.url}\0${e.hash}\n`).join('')
  return sha256Hex(canonical).slice(0, 16)
}

export function cacheNameFor(version: string): string {
  return CACHE_PREFIX + version
}

/** Our caches that are not the current one. Foreign caches are never touched. */
export function staleCaches(cacheNames: readonly string[], currentVersion: string): string[] {
  const current = cacheNameFor(currentVersion)
  return cacheNames.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current)
}

export type Route = { kind: 'pass' } | { kind: 'cache'; key: string }

export function routeRequest(r: {
  method: string
  url: string
  mode: string
  ownOrigin: string
  precachedUrls: ReadonlySet<string>
}): Route {
  if (r.method.toUpperCase() !== 'GET') return { kind: 'pass' }
  let parsed: URL
  try {
    parsed = new URL(r.url, r.ownOrigin)
  } catch {
    return { kind: 'pass' }
  }
  if (parsed.origin !== r.ownOrigin) return { kind: 'pass' }
  if (r.mode === 'navigate') return { kind: 'cache', key: '/index.html' }
  if (r.precachedUrls.has(parsed.pathname)) return { kind: 'cache', key: parsed.pathname }
  return { kind: 'pass' }
}
