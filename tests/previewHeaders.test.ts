import { describe, expect, it } from 'vitest'
import { applyRuleHeaders } from '../build/previewHeaders.ts'

const RULE = 'public, max-age=31536000, immutable'

function fakeRes() {
  const set: Record<string, string> = {}
  const calls: unknown[][] = []
  const res = {
    setHeader(k: string, v: string) {
      set[k] = v
      return res
    },
    writeHead(...args: unknown[]) {
      calls.push(args)
      return res
    },
  }
  return { res, set, calls }
}

function wrap(headers: Record<string, string>) {
  const f = fakeRes()
  applyRuleHeaders(f.res as never, headers)
  return f
}

describe('applyRuleHeaders (Requirements 3.8, 3.9)', () => {
  it('object form: drops differing-case Cache-Control, keeps others', () => {
    const { res, set, calls } = wrap({ 'Cache-Control': RULE })
    res.writeHead(200, { 'cache-control': 'no-cache', 'Content-Type': 'text/css', ETag: 'x' })
    expect(set['Cache-Control']).toBe(RULE)
    expect(calls[0]).toEqual([200, { 'Content-Type': 'text/css', ETag: 'x' }])
  })

  it('flat array form: drops the pair, keeps others', () => {
    const { res, set, calls } = wrap({ 'Cache-Control': RULE })
    res.writeHead(200, ['CACHE-CONTROL', 'no-cache', 'Content-Type', 'text/css'])
    expect(set['Cache-Control']).toBe(RULE)
    expect(calls[0]).toEqual([200, ['Content-Type', 'text/css']])
  })

  it('pair array form: drops the pair, keeps others', () => {
    const { res, set, calls } = wrap({ 'Cache-Control': RULE })
    res.writeHead(200, [['Cache-control', 'no-cache'], ['Content-Type', 'text/css']])
    expect(set['Cache-Control']).toBe(RULE)
    expect(calls[0]).toEqual([200, [['Content-Type', 'text/css']]])
  })

  it('works with a status message and leaves calls without headers alone', () => {
    const { res, set, calls } = wrap({ 'Cache-Control': RULE })
    res.writeHead(200, 'OK', { 'cache-control': 'no-cache', Vary: 'Accept' })
    res.writeHead(404)
    expect(set['Cache-Control']).toBe(RULE)
    expect(calls[0]).toEqual([200, 'OK', { Vary: 'Accept' }])
    expect(calls[1]).toEqual([404])
  })
})
