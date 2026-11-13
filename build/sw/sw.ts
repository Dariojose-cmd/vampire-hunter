/// <reference lib="webworker" />
import { cacheNameFor, routeRequest, staleCaches } from '../../src/engine/precache.ts'
import type { PrecacheManifest } from '../../src/engine/precache.ts'

declare const __PRECACHE__: PrecacheManifest
declare const self: ServiceWorkerGlobalScope

const manifest = __PRECACHE__
const cacheName = cacheNameFor(manifest.version)
const precachedUrls: ReadonlySet<string> = new Set(manifest.entries.map((e) => e.url))

async function install(): Promise<void> {
  await caches.delete(cacheName)
  const cache = await caches.open(cacheName)
  try {
    for (const entry of manifest.entries) {
      const res = await fetch(entry.url, { cache: 'reload' })
      if (!res.ok) throw new Error('precache failed')
      await cache.put(entry.url, res)
    }
  } catch (err) {
    await caches.delete(cacheName)
    throw err
  }
  await self.skipWaiting()
}

async function activate(): Promise<void> {
  const names = await caches.keys()
  await Promise.all(staleCaches(names, manifest.version).map((n) => caches.delete(n)))
  await self.clients.claim()
}

async function fromCache(request: Request, key: string): Promise<Response> {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(key, { ignoreSearch: true })
  return hit ?? fetch(request)
}

self.addEventListener('install', (event) => {
  event.waitUntil(install())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(activate())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const route = routeRequest({
    method: request.method,
    url: request.url,
    mode: request.mode,
    ownOrigin: self.location.origin,
    precachedUrls,
  })
  if (route.kind === 'pass') return
  event.respondWith(fromCache(request, route.key))
})
