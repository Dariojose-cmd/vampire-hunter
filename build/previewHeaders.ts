import { readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { headersForPath, parseHeaderRules } from './headerRules.ts'

type HeaderBag = Record<string, unknown>

/** Drop keys from an object-style headers argument that match `names` (case-insensitive). */
function stripObject(headers: HeaderBag, names: Set<string>): HeaderBag {
  const out: HeaderBag = {}
  for (const k of Object.keys(headers)) {
    if (!names.has(k.toLowerCase())) out[k] = headers[k]
  }
  return out
}

/** Drop names from an array-style headers argument (flat `[k, v, ...]` or `[[k, v], ...]`). */
function stripArray(headers: unknown[], names: Set<string>): unknown[] {
  if (headers.length > 0 && Array.isArray(headers[0])) {
    return headers.filter((h) => !names.has(String((h as unknown[])[0]).toLowerCase()))
  }
  const out: unknown[] = []
  for (let i = 0; i < headers.length; i += 2) {
    if (!names.has(String(headers[i]).toLowerCase())) out.push(headers[i], headers[i + 1])
  }
  return out
}

/**
 * Wrap `res.writeHead` so `headers` always win. Same-named keys (case-insensitive)
 * are removed from any explicit headers argument (sirv writes its own
 * Cache-Control: no-cache there) and the rule values are set on the response
 * just before the head is flushed.
 */
export function applyRuleHeaders(
  res: Pick<ServerResponse, 'writeHead' | 'setHeader'>,
  headers: Record<string, string>,
): void {
  const names = new Set(Object.keys(headers).map((k) => k.toLowerCase()))
  const original = res.writeHead.bind(res) as (...args: unknown[]) => unknown
  res.writeHead = ((...args: unknown[]) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
    const last = args.length - 1
    if (last >= 1) {
      const arg = args[last]
      if (Array.isArray(arg)) args[last] = stripArray(arg, names)
      else if (arg && typeof arg === 'object') args[last] = stripObject(arg as HeaderBag, names)
    }
    return original(...args)
  }) as ServerResponse['writeHead']
}

/** `vite preview` plugin: serve the per-path headers from customHttp.yml. */
export function previewHeaders(file = 'customHttp.yml'): Plugin {
  return {
    name: 'preview-headers',
    configurePreviewServer(server) {
      const rules = parseHeaderRules(readFileSync(resolve(server.config.root, file), 'utf8'))
      server.middlewares.use((req, res, next) => {
        applyRuleHeaders(res, headersForPath(rules, req.url ?? '/'))
        next()
      })
    },
  }
}
