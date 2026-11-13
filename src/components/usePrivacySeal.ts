import { useEffect, useState } from 'react'
import { applyEntries, emptyCounter, type CounterState } from '../engine/connectionCounter'
import { deriveOfflineStatus, type OfflineStatus } from '../engine/offlineStatus'
import { useServiceWorker } from './useServiceWorker'

export interface SealState {
  /** false when Resource Timing is missing or the observer failed */
  measurable: boolean
  /** 0 to 999,999 (clamped for display) */
  externalCount: number
  offlineStatus: OfflineStatus
}

const MAX_COUNT = 999_999

interface Measure {
  counter: CounterState
  measurable: boolean
}

function readInitial(): Measure {
  try {
    const entries = performance.getEntriesByType('resource')
    return {
      counter: applyEntries(
        emptyCounter,
        entries.map((e) => e.name),
        location.origin,
      ),
      measurable: typeof PerformanceObserver !== 'undefined',
    }
  } catch {
    return { counter: emptyCounter, measurable: false }
  }
}

export function usePrivacySeal(getHasStatement: () => boolean = () => false): SealState {
  const [measure, setMeasure] = useState<Measure>(readInitial)
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const sw = useServiceWorker(getHasStatement)

  useEffect(() => {
    let observer: PerformanceObserver | null = null
    const fail = () => {
      observer?.disconnect()
      setMeasure((m) => ({ ...m, measurable: false }))
    }
    try {
      observer = new PerformanceObserver((list) => {
        try {
          const urls = list.getEntries().map((e) => e.name)
          setMeasure((m) => {
            const counter = applyEntries(m.counter, urls, location.origin)
            return counter === m.counter ? m : { ...m, counter }
          })
        } catch {
          fail()
        }
      })
      observer.observe({ type: 'resource', buffered: true })
    } catch {
      fail()
    }
    return () => observer?.disconnect()
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return {
    measurable: measure.measurable,
    externalCount: Math.min(measure.counter.external, MAX_COUNT),
    offlineStatus: deriveOfflineStatus({ online, ...sw }),
  }
}
