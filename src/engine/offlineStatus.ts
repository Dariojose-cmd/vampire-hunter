export type OfflineStatus = 'checking' | 'ready' | 'offline' | 'unavailable'

export interface OfflineStatusInput {
  /** navigator.onLine */
  online: boolean
  swSupported: boolean
  registrationFailed: boolean
  swActive: boolean
}

/**
 * Precedence: offline, then unavailable, then ready, else checking.
 * Offline wins over every other state.
 */
export function deriveOfflineStatus(i: OfflineStatusInput): OfflineStatus {
  if (!i.online) return 'offline'
  if (!i.swSupported || i.registrationFailed) return 'unavailable'
  if (i.swActive) return 'ready'
  return 'checking'
}
