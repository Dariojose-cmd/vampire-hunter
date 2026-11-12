import type { AudioContextLike } from './soundEngine'

/** min + random() x (max - min) */
export function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min)
}

export function makeNoiseBuffer(
  ctx: AudioContextLike,
  random: () => number,
  seconds: number,
): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = random() * 2 - 1
  return buffer
}
