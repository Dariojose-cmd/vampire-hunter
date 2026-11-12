import type { AmbienceHost } from './ambience'
import { SOUND_CONFIG } from './soundConfig'
import { makeNoiseBuffer } from './ambienceUtil'

export function createDetailLayer(host: AmbienceHost, detailBus: GainNode): { play(): void } {
  const cfg = SOUND_CONFIG
  const { ctx, random } = host

  function owl(): void {
    const t = ctx.currentTime
    const group = host.openGroup()
    cfg.owlNotesHz.forEach(([from, to], i) => {
      const start = t + i * 0.7
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      group.track(osc, true)
      group.track(g)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(from, start)
      osc.frequency.exponentialRampToValueAtTime(to, start + 0.5)
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(1, start + 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)
      osc.connect(g)
      g.connect(detailBus)
      osc.start(start)
      osc.stop(start + 0.7)
    })
    host.schedule(() => group.release(), 2000)
  }

  function creak(): void {
    const t = ctx.currentTime
    const group = host.openGroup()
    const src = ctx.createBufferSource()
    const bp = ctx.createBiquadFilter()
    const g = ctx.createGain()
    group.track(src, true)
    group.track(bp)
    group.track(g)
    src.buffer = makeNoiseBuffer(ctx, random, 0.5)
    bp.type = 'bandpass'
    bp.Q.setValueAtTime(cfg.creakQ, t)
    bp.frequency.setValueAtTime(cfg.creakGlideHz[0], t)
    bp.frequency.linearRampToValueAtTime(cfg.creakGlideHz[1], t + 0.5)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(1, t + 0.3) // slow attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5) // fast decay
    src.connect(bp)
    bp.connect(g)
    g.connect(detailBus)
    src.start(t)
    src.stop(t + 0.5)
    host.schedule(() => group.release(), 1000)
  }

  return { play: () => (random() < 0.5 ? owl() : creak()) }
}
