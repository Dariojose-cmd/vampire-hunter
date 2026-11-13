import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'
import { computeCacheVersion } from '../src/engine/precache.ts'
import type { PrecacheEntry, PrecacheManifest } from '../src/engine/precache.ts'
import { readPngSize } from '../src/engine/pngSize.ts'
import { checkWebManifest } from '../src/engine/webManifest.ts'

const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex')

/** Every file under dir, recursively, skipping dotfiles/dotdirs and the root sw.js. */
function listFiles(root: string, dir = root): string[] {
  const out: string[] = []
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (dirent.name.startsWith('.')) continue
    const full = join(dir, dirent.name)
    if (dirent.isDirectory()) out.push(...listFiles(root, full))
    else if (dirent.isFile() && !(dir === root && dirent.name === 'sw.js')) out.push(full)
  }
  return out
}

export function buildManifest(distDir: string): PrecacheManifest {
  const entries: PrecacheEntry[] = listFiles(distDir).map((file) => ({
    url: '/' + relative(distDir, file).split(sep).join('/'),
    hash: sha256Hex(readFileSync(file)),
  }))
  entries.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  return { version: computeCacheVersion(entries, sha256Hex), entries }
}

function readBgColor(root: string): string {
  const css = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8')
  const m = /--color-bg:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(css)
  if (!m) throw new Error('precache: --color-bg not found in src/styles/tokens.css')
  return m[1]
}

/** Throws naming the invalid entry when the web manifest or any icon is wrong. */
export function validateDist(distDir: string, root: string): void {
  const manifestPath = join(distDir, 'manifest.webmanifest')
  if (!existsSync(manifestPath)) throw new Error('precache: dist/manifest.webmanifest is missing')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bg = readBgColor(root)
  const problems = checkWebManifest(manifest, { themeColor: bg, bgColor: bg })
  if (problems.length > 0) {
    throw new Error('precache: invalid manifest.webmanifest: ' + problems.join('; '))
  }
  const icons = (manifest as { icons: Array<Record<string, unknown>> }).icons
  for (const icon of icons) {
    const label = JSON.stringify(icon)
    const src = icon.src
    if (typeof src !== 'string') throw new Error(`precache: icon entry has no src: ${label}`)
    const file = join(distDir, src.replace(/^\//, ''))
    if (!existsSync(file)) throw new Error(`precache: icon file missing (${src}): ${label}`)
    const size = readPngSize(new Uint8Array(readFileSync(file)))
    if (!size) throw new Error(`precache: icon is not a valid PNG (${src}): ${label}`)
    const declared = String(icon.sizes ?? '').split(/\s+/).filter(Boolean)
    if (!declared.includes(`${size.width}x${size.height}`)) {
      throw new Error(
        `precache: icon ${src} is ${size.width}x${size.height} but declares "${String(icon.sizes)}": ${label}`,
      )
    }
  }
}

export function precachePlugin(): Plugin {
  let root = process.cwd()
  const distOf = (r: string) => resolve(r, process.env.VH_OUT_DIR || 'dist')
  return {
    name: 'vh-precache',
    config(config) {
      root = config.root ? resolve(config.root) : process.cwd()
      const manifest = buildManifest(distOf(root))
      return { define: { __PRECACHE__: JSON.stringify(manifest) } }
    },
    buildStart() {
      validateDist(distOf(root), root)
    },
  }
}
