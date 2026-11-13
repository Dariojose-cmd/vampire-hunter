import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const baseline = JSON.parse(
  readFileSync(resolve(__dirname, 'baselines/sampleDigests.json'), 'utf8'),
) as Record<string, string>
const names = Object.keys(baseline)
const dirs = ['public/samples', 'samples']

function load(dir: string, name: string): Buffer {
  const path = resolve(root, dir, name)
  if (!existsSync(path)) throw new Error(`missing: ${dir}/${name}`)
  return readFileSync(path)
}

describe('sample digests match the recorded baseline', () => {
  it('baseline lists the 5 samples', () => {
    expect(names).toHaveLength(5)
  })

  for (const dir of dirs) {
    for (const name of names) {
      it(`${dir}/${name}`, () => {
        const digest = createHash('sha256').update(load(dir, name)).digest('hex')
        expect(digest, `digest mismatch: ${dir}/${name}`).toBe(baseline[name])
      })
    }
  }
})

describe('public/samples is byte-identical to samples', () => {
  for (const name of names) {
    it(name, () => {
      const a = load('public/samples', name)
      const b = load('samples', name)
      expect(a.equals(b), `bytes differ: ${name}`).toBe(true)
    })
  }
})
