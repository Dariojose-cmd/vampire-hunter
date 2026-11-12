import type { AudioContextFactory } from './soundEngine'

/** Creates a real AudioContext, or null when Web Audio is unsupported. */
export const defaultAudioContextFactory: AudioContextFactory = () => {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Ctor ? new Ctor() : null
}
