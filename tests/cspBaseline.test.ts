import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')

function cspFromYaml(): string {
  const lines = readFileSync(resolve(root, 'customHttp.yml'), 'utf8').split(/\r?\n/)
  const i = lines.findIndex((l) => /key:\s*Content-Security-Policy\s*$/.test(l))
  if (i < 0) throw new Error('Content-Security-Policy key not found in customHttp.yml')
  const m = /^\s*value:\s*"(.*)"\s*$/.exec(lines[i + 1] ?? '')
  if (!m) throw new Error('CSP value line not found after key')
  return m[1]
}

const baseline = readFileSync(resolve(__dirname, 'baselines/csp.txt'), 'utf8')

describe('CSP baseline', () => {
  it('customHttp.yml CSP equals tests/baselines/csp.txt', () => {
    expect(cspFromYaml()).toBe(baseline)
  })

  const required = [
    "connect-src 'self'",
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ]
  for (const d of required) {
    it(`contains ${d}`, () => {
      expect(cspFromYaml().split('; ')).toContain(d)
    })
  }
})
