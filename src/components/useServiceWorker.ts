import { useEffect, useState } from 'react'
import { decideReload } from '../engine/reloadDecision'

export interface ServiceWorkerState {
  swSupported: boolean
  registrationFailed: boolean
  swActive: boolean
}

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/** Registers the service worker (production only) and reports its state. */
export function useServiceWorker(getHasStatement: () => boolean): ServiceWorkerState {
  const [state, setState] = useState<ServiceWorkerState>(() => ({
    swSupported: isSupported(),
    registrationFailed: false,
    swActive: false,
  }))

  useEffect(() => {
    if (!import.meta.env.PROD || !isSupported()) return
    const container = navigator.serviceWorker
    let cancelled = false
    let reloaded = false
    let previous: ServiceWorker | null = container.controller

    const onControllerChange = () => {
      const hadPreviousController = previous !== null
      previous = container.controller
      if (reloaded) return
      const decision = decideReload({
        hadPreviousController,
        hasLoadedStatement: getHasStatement(),
      })
      if (decision === 'reload') {
        reloaded = true
        location.reload()
      }
    }
    container.addEventListener('controllerchange', onControllerChange)

    const register = () => {
      container
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          registration.update().catch(() => {})
        })
        .catch(() => {
          if (!cancelled) setState((s) => ({ ...s, registrationFailed: true }))
        })
    }

    container.ready
      .then(() => {
        if (!cancelled) setState((s) => ({ ...s, swActive: true }))
      })
      .catch(() => {})

    const onLoad = () => register()
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', onLoad, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', onLoad)
      container.removeEventListener('controllerchange', onControllerChange)
    }
    // getHasStatement is read lazily at event time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
