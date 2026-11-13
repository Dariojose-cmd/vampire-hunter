import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { decideReload } from '../src/engine/reloadDecision'

describe('decideReload properties', () => {
  // Feature: privacy-you-can-verify, Property 12: Reload decision
  // **Validates: Requirements 4.8, 4.9, 4.14, 4.15**
  it('reloads iff a previous controller existed and no statement is loaded', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (hadPreviousController, hasLoadedStatement) => {
        const result = decideReload({ hadPreviousController, hasLoadedStatement })
        const expected = hadPreviousController && !hasLoadedStatement ? 'reload' : 'no-reload'
        expect(result).toBe(expected)
        if (!hadPreviousController) expect(result).toBe('no-reload')
      }),
      { numRuns: 100 },
    )
  })
})

describe('decideReload cases', () => {
  // Requirement 14.11
  it('first visit with no Previous_Controller and no statement gives no-reload', () => {
    expect(decideReload({ hadPreviousController: false, hasLoadedStatement: false })).toBe('no-reload')
  })

  it('first visit with no Previous_Controller and a statement gives no-reload', () => {
    expect(decideReload({ hadPreviousController: false, hasLoadedStatement: true })).toBe('no-reload')
  })

  it('previous controller and no statement gives reload', () => {
    expect(decideReload({ hadPreviousController: true, hasLoadedStatement: false })).toBe('reload')
  })

  it('previous controller and a statement gives no-reload', () => {
    expect(decideReload({ hadPreviousController: true, hasLoadedStatement: true })).toBe('no-reload')
  })
})
