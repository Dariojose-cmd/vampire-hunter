/**
 * Static network scan + Burn wipe check.
 * Validates: Requirements 12.1, 12.3, 12.4, 12.5
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import { burnCrypt, CRYPT_STORAGE_KEY, saveCryptStorage } from '../src/engine/cryptStorage'

const ROOT = join(import.meta.dirname, '..')
const PATTERNS = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket'] as const

/** Allowed source hits: posix relative path -> patterns allowed in that file. */
const SRC_ALLOWLIST: Record<string, readonly string[]> = {
  // Same-origin read of a bundled sample CSV; no user data is sent.
  'src/components/SamplePicker.tsx': ['fetch('],
  // Doc comment only: explains that Resource Timing does not report WebSockets.
  'src/engine/connectionCounter.ts': ['WebSocket'],
}

/** Allowed built-in occurrences in the minified bundle (max per pattern). */
const DIST_MAX_COUNTS: Record<string, number> = {
  'fetch(': 2, // our same-origin sample fetch + one library built-in
  XMLHttpRequest: 1, // library built-in reference, never called by app code
  sendBeacon: 0,
  WebSocket: 0,
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const isSource = (f: string) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.(test|spec)\.[jt]sx?$/.test(f)

describe('static network scan: src/**', () => {
  it('has no network API use outside the allowlist', () => {
    const offenders: string[] = []
    for (const file of walk(join(ROOT, 'src')).filter(isSource)) {
      const rel = relative(ROOT, file).split(sep).join('/')
      const allowed = SRC_ALLOWLIST[rel] ?? []
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const pat of PATTERNS) {
            if (line.includes(pat) && !allowed.includes(pat)) {
              offenders.push(`${rel}:${i + 1} uses ${pat}`)
            }
          }
        })
    }
    expect(offenders, `Unexpected network API hits:\n${offenders.join('\n')}`).toEqual([])
  })

  it('allowlisted fetch in SamplePicker is same-origin (BASE_URL + samples/)', () => {
    const text = readFileSync(join(ROOT, 'src/components/SamplePicker.tsx'), 'utf8')
    const lines = text.split('\n')
    const hits = lines.filter((l) => l.includes('fetch('))
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('import.meta.env.BASE_URL}samples/')
  })
})

describe('static network scan: dist/assets/*.js', () => {
  const assets = join(ROOT, 'dist', 'assets')
  const files = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')) : []

  it.skipIf(files.length === 0)('has no more built-in hits than the allowlist', () => {
    const counts: Record<string, number> = {}
    const where: Record<string, string[]> = {}
    for (const f of files) {
      const text = readFileSync(join(assets, f), 'utf8')
      for (const pat of PATTERNS) {
        const n = text.split(pat).length - 1
        if (n > 0) {
          counts[pat] = (counts[pat] ?? 0) + n
          ;(where[pat] ??= []).push(`dist/assets/${f} (${n})`)
        }
      }
    }
    for (const pat of PATTERNS) {
      expect(
        counts[pat] ?? 0,
        `${pat} found in: ${(where[pat] ?? []).join(', ')}; allowed ${DIST_MAX_COUNTS[pat]}`,
      ).toBeLessThanOrEqual(DIST_MAX_COUNTS[pat])
    }
  })
})

describe('Burn wipe', () => {
  beforeEach(() => localStorage.clear())

  it('leaves no vampire-hunter:* key in localStorage', () => {
    saveCryptStorage({
      decisions: { netflix: { status: 'spared', decidedAt: '2024-01-01T00:00:00.000Z' } },
      language: 'en',
      currency: 'USD',
      soundEnabled: true,
    } as never)
    expect(localStorage.getItem(CRYPT_STORAGE_KEY)).not.toBeNull()

    burnCrypt()

    const keys = Object.keys(localStorage).filter((k) => k.startsWith('vampire-hunter:'))
    expect(keys).toEqual([])
  })
})
