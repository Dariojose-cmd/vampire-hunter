// Build-time tooling (not app engine): throws on a malformed customHttp.yml so the build fails loudly.
/**
 * Reader for the `customHeaders` section of customHttp.yml.
 * Pure TypeScript, line-based, no YAML dependency.
 */

export interface HeaderRule {
  pattern: string
  headers: { key: string; value: string }[]
}

function unquote(raw: string): string {
  const s = raw.trim()
  if (s.length >= 2) {
    const q = s[0]
    if ((q === '"' || q === "'") && s[s.length - 1] === q) return s.slice(1, -1)
  }
  return s
}

/**
 * Parse the rules. Throws an Error that names the 1-based line number when a
 * `key` has no `value` or a header appears before any `pattern`.
 */
export function parseHeaderRules(yamlText: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  let current: HeaderRule | null = null
  let pendingKey: { key: string; line: number } | null = null

  const lines = yamlText.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const item = trimmed.replace(/^-\s+/, '')
    const m = /^(pattern|key|value)\s*:(.*)$/.exec(item)
    if (!m) continue
    const [, name, rest] = m

    if (name === 'pattern') {
      if (pendingKey) {
        throw new Error(`Line ${pendingKey.line}: header "${pendingKey.key}" has no value`)
      }
      current = { pattern: unquote(rest), headers: [] }
      rules.push(current)
    } else if (name === 'key') {
      if (pendingKey) {
        throw new Error(`Line ${pendingKey.line}: header "${pendingKey.key}" has no value`)
      }
      if (!current) {
        throw new Error(`Line ${lineNo}: header "key" appears before any "pattern"`)
      }
      pendingKey = { key: unquote(rest), line: lineNo }
    } else {
      if (!current) {
        throw new Error(`Line ${lineNo}: header "value" appears before any "pattern"`)
      }
      if (!pendingKey) {
        throw new Error(`Line ${lineNo}: "value" without a preceding "key"`)
      }
      current.headers.push({ key: pendingKey.key, value: unquote(rest) })
      pendingKey = null
    }
  }

  if (pendingKey) {
    throw new Error(`Line ${pendingKey.line}: header "${pendingKey.key}" has no value`)
  }
  return rules
}

/** Glob match: `**` any chars, `*` any chars except `/`. Query and hash are ignored. */
export function matchesPattern(pattern: string, path: string): boolean {
  const clean = path.split('#')[0].split('?')[0]
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*'
        i++
      } else {
        source += '[^/]*'
      }
    } else {
      source += c.replace(/[.+?^${}()|[\]\\/-]/g, '\\$&')
    }
  }
  return new RegExp(`^${source}$`, 's').test(clean)
}

/**
 * Merge headers of every matching rule in file order. A later rule overrides
 * only the names it sets (case-insensitive); the later spelling is kept.
 */
export function headersForPath(rules: HeaderRule[], path: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rule of rules) {
    if (!matchesPattern(rule.pattern, path)) continue
    for (const { key, value } of rule.headers) {
      const lower = key.toLowerCase()
      for (const existing of Object.keys(result)) {
        if (existing.toLowerCase() === lower) delete result[existing]
      }
      result[key] = value
    }
  }
  return result
}
