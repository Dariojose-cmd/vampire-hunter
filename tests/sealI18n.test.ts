/**
 * i18n tests for the Privacy Seal.
 * Validates: Requirements 10.7-10.10, 10.12, 11.1, 14.6, 14.7
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Json = { [key: string]: string | Json }

const FILES = { en: 'src/i18n/en.json', es: 'src/i18n/es.json' } as const
type Lang = keyof typeof FILES

const load = (lang: Lang): Json =>
  JSON.parse(readFileSync(resolve(process.cwd(), FILES[lang]), 'utf8')) as Json

const catalogs: Record<Lang, Json> = { en: load('en'), es: load('es') }

function flatten(node: Json, prefix = '', out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[path] = v
    else flatten(v, path, out)
  }
  return out
}

const flat: Record<Lang, Record<string, string>> = {
  en: flatten(catalogs.en),
  es: flatten(catalogs.es),
}

const sealKeys = (lang: Lang) =>
  Object.keys(flat[lang]).filter(
    (k) => k.startsWith('seal.') || k === 'errors.assetUnavailableOffline',
  )

const wordCount = (s: string) =>
  s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length

const EXPECTED = {
  en: {
    full: {
      connections: 'Connections to other servers: {{count}}',
      offlineReady: 'Works offline: ready',
      offlinePreparing: 'Works offline: preparing',
      offlineNow: "You're offline — still working",
      offlineUnavailable: 'Works offline: not available',
    },
    compact: {
      connections: '{{count}} external connections',
      offlineReady: 'offline ready',
      offlinePreparing: 'offline preparing',
      offlineNow: 'offline · still working',
    },
  },
  es: {
    full: {
      connections: 'Conexiones a otros servidores: {{count}}',
      offlineReady: 'Funciona sin conexión: listo',
      offlinePreparing: 'Funciona sin conexión: preparando',
      offlineNow: 'Sin conexión — sigue funcionando',
      offlineUnavailable: 'Funciona sin conexión: no disponible',
    },
    compact: {
      connections: '{{count}} conexiones externas',
      offlineReady: 'listo sin conexión',
      offlinePreparing: 'preparando sin conexión',
      offlineNow: 'sin conexión · sigue funcionando',
    },
  },
} as const

const STATUS_KEYS = ['offlineReady', 'offlinePreparing', 'offlineNow', 'offlineUnavailable']
const EXPLANATION_KEYS = ['panelCsp', 'panelMeasured', 'panelBlocked', 'panelHowTo']

describe('seal i18n: key parity', () => {
  it('seal.* and errors.assetUnavailableOffline exist in both files', () => {
    const missing: string[] = []
    for (const [from, to] of [['en', 'es'], ['es', 'en']] as const) {
      for (const key of sealKeys(from)) {
        if (!(key in flat[to])) missing.push(`${key} missing in ${FILES[to]}`)
      }
    }
    expect(missing, missing.join('\n')).toEqual([])
    expect(sealKeys('en').length).toBeGreaterThan(0)
    expect('errors.assetUnavailableOffline' in flat.en).toBe(true)
  })
})

describe.each(['en', 'es'] as const)('seal i18n (%s)', (lang) => {
  const exp = EXPECTED[lang]

  it('full strings match Requirement 9 texts', () => {
    for (const [key, text] of Object.entries(exp.full)) {
      expect(flat[lang][`seal.full.${key}`], `seal.full.${key}`).toBe(text)
    }
  })

  it('compact strings match Requirement 9 texts', () => {
    for (const [key, text] of Object.entries(exp.compact)) {
      expect(flat[lang][`seal.compact.${key}`], `seal.compact.${key}`).toBe(text)
    }
  })

  it('panel word count (status lines + explanation) is at most 80', () => {
    const f = (k: string) => flat[lang][`seal.full.${k}`]
    const connections = ['connections', 'connectionsNotMeasurable'].map((k) => wordCount(f(k)))
    const offline = STATUS_KEYS.map((k) => wordCount(f(k)))
    const statusWords = Math.max(...connections) + Math.max(...offline)
    const explanationWords = EXPLANATION_KEYS.reduce(
      (n, k) => n + wordCount(flat[lang][`seal.${k}`]),
      0,
    )
    const total = statusWords + explanationWords
    expect(
      total,
      `${lang} panel is ${total} words (status ${statusWords} + explanation ${explanationWords}); limit is 80`,
    ).toBeLessThanOrEqual(80)
  })

  it('has no absolute claims, third-party names or WebSocket words', () => {
    const banned: RegExp[] =
      lang === 'en'
        ? [/100\s*%\s*safe/i, /unhackable/i, /impossible to leak/i, /guarantee/i]
        : [/100\s*%\s*seguro/i, /imposible de hackear/i, /imposible de filtrar/i, /garantiz/i, /garant[ií]a/i]
    const common = [/amplify/i, /\baws\b/i, /extension|extensi[oó]n/i, /web\s*socket/i]
    const hits: string[] = []
    for (const key of sealKeys(lang)) {
      for (const re of [...banned, ...common]) {
        if (re.test(flat[lang][key])) hits.push(`${key} (${FILES[lang]}) matches ${re}`)
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('panel text has no vampire/bite/stake words', () => {
    const re =
      lang === 'en' ? /vampire|\bbites?\b|\bstakes?\b/i : /vampiro|mordida|estaca/i
    const hits = Object.keys(flat[lang])
      .filter((k) => k.startsWith('seal.'))
      .filter((k) => re.test(flat[lang][k]))
      .map((k) => `${k} (${FILES[lang]})`)
    expect(hits, hits.join('\n')).toEqual([])
  })
})
