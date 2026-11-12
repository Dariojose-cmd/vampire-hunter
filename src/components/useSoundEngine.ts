import { useEffect, useState } from 'react'
import { createSoundEngine, defaultAudioContextFactory } from '@audio/index'
import type { AudioContextFactory, SoundEngine } from '@audio/index'

/**
 * React glue for the sound engine.
 * - Creates the engine once; no AudioContext exists until a user gesture.
 * - Pauses/resumes audio on document visibility changes.
 * - Releases everything on unmount.
 * - For a persisted "on" choice, arms a one-time first-gesture listener that
 *   calls enable() (browsers require a gesture to start audio).
 */
export function useSoundEngine(
  enabled: boolean,
  factory: AudioContextFactory = defaultAudioContextFactory,
): SoundEngine {
  const [engine] = useState<SoundEngine>(() => createSoundEngine({ factory }))

  useEffect(() => {
    const onVisibility = () => engine.setDocumentHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      engine.disable()
    }
  }, [engine])

  useEffect(() => {
    if (!enabled || engine.isEnabled()) return undefined
    const onGesture = () => {
      remove()
      engine.enable()
    }
    const remove = () => {
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
    document.addEventListener('pointerdown', onGesture)
    document.addEventListener('keydown', onGesture)
    return remove
  }, [enabled, engine])

  return engine
}
