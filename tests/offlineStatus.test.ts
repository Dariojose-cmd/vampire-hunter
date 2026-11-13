import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { deriveOfflineStatus } from '../src/engine/offlineStatus'

const inputArb = fc.record({
  online: fc.boolean(),
  swSupported: fc.boolean(),
  registrationFailed: fc.boolean(),
  swActive: fc.boolean(),
})

describe('offlineStatus', () => {
  // Feature: privacy-you-can-verify, Property 13: Offline status derivation
  it('Property 13: Offline status derivation', () => {
    // **Validates: Requirements 9.3, 9.4, 9.5, 9.7, 9.8, 9.13, 14.4**
    fc.assert(
      fc.property(inputArb, (i) => {
        const s = deriveOfflineStatus(i)
        if (!i.online) {
          expect(s).toBe('offline')
          return
        }
        expect(s).not.toBe('offline')
        if (!i.swSupported || i.registrationFailed) {
          expect(s).toBe('unavailable')
        } else if (i.swActive) {
          expect(s).toBe('ready')
        } else {
          expect(s).toBe('checking')
        }
      }),
      { numRuns: 100 },
    )
  })
})

describe('offlineStatus reconnecting', () => {
  // Feature: privacy-you-can-verify, Property 20: Reconnecting restores the underlying status
  it('Property 20: Reconnecting restores the underlying status', () => {
    // **Validates: Requirements 9.13, 9.14**
    const swArb = fc.record({
      swSupported: fc.boolean(),
      registrationFailed: fc.boolean(),
      swActive: fc.boolean(),
    })
    fc.assert(
      fc.property(swArb, (sw) => {
        const neverOffline = deriveOfflineStatus({ online: true, ...sw })
        // Go offline, then reconnect: no memory of the offline period.
        const whileOffline = deriveOfflineStatus({ online: false, ...sw })
        const reconnected = deriveOfflineStatus({ online: true, ...sw })
        expect(whileOffline).toBe('offline')
        expect(reconnected).toBe(neverOffline)
        expect(['checking', 'ready', 'unavailable']).toContain(reconnected)
      }),
      { numRuns: 100 },
    )
  })
})

describe('offlineStatus exact values', () => {
  // Requirements 14.4, 9.13
  it('offline gives "offline" for unsupported, failed, active and checking inputs', () => {
    expect(deriveOfflineStatus({ online: false, swSupported: false, registrationFailed: false, swActive: false })).toBe('offline')
    expect(deriveOfflineStatus({ online: false, swSupported: true, registrationFailed: true, swActive: false })).toBe('offline')
    expect(deriveOfflineStatus({ online: false, swSupported: true, registrationFailed: false, swActive: true })).toBe('offline')
    expect(deriveOfflineStatus({ online: false, swSupported: true, registrationFailed: false, swActive: false })).toBe('offline')
  })

  it('online with unsupported or failed gives "unavailable"', () => {
    expect(deriveOfflineStatus({ online: true, swSupported: false, registrationFailed: false, swActive: false })).toBe('unavailable')
    expect(deriveOfflineStatus({ online: true, swSupported: true, registrationFailed: true, swActive: false })).toBe('unavailable')
  })

  it('online with active worker gives "ready"', () => {
    expect(deriveOfflineStatus({ online: true, swSupported: true, registrationFailed: false, swActive: true })).toBe('ready')
  })

  it('online without active worker gives "checking"', () => {
    expect(deriveOfflineStatus({ online: true, swSupported: true, registrationFailed: false, swActive: false })).toBe('checking')
  })
})
