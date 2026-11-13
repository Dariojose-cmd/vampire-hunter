/**
 * Connection counter: pure functions over URL strings.
 * Counts requests to origins other than the app's own. No DOM, no React.
 *
 * Note: `ws:` / `wss:` URLs passed here are classified like any other URL
 * (their origin never equals an http(s) origin, so they are external).
 * Resource Timing does not report WebSocket connections; the CSP is what
 * restricts them.
 */

export type UrlClass = 'same-origin' | 'external' | 'inline' | 'unparseable'

export interface CounterState {
  /** Every raw URL already applied. */
  readonly seen: ReadonlySet<string>
  readonly external: number
  readonly unparseable: number
}

export const emptyCounter: CounterState = {
  seen: new Set<string>(),
  external: 0,
  unparseable: 0,
}

export function classifyUrl(url: string, ownOrigin: string): UrlClass {
  let parsed: URL
  try {
    parsed = new URL(url, ownOrigin)
  } catch {
    return 'unparseable'
  }
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return 'inline'
  return parsed.origin === ownOrigin ? 'same-origin' : 'external'
}

export function applyEntries(
  state: CounterState,
  urls: readonly string[],
  ownOrigin: string,
): CounterState {
  let seen: Set<string> | null = null
  let external = state.external
  let unparseable = state.unparseable

  for (const url of urls) {
    if (typeof url !== 'string') continue
    if (state.seen.has(url) || (seen !== null && seen.has(url))) continue
    if (seen === null) seen = new Set(state.seen)
    seen.add(url)
    const cls = classifyUrl(url, ownOrigin)
    if (cls === 'external') external += 1
    else if (cls === 'unparseable') unparseable += 1
  }

  if (seen === null) return state
  return { seen, external, unparseable }
}

export function countConnections(
  urls: readonly string[],
  ownOrigin: string,
): { external: number; unparseable: number } {
  const { external, unparseable } = applyEntries(emptyCounter, urls, ownOrigin)
  return { external, unparseable }
}
