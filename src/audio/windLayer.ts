import type { AmbienceHost } from './ambience'
import { SOUND_CONFIG } from './soundConfig'
import { between, makeNoiseBuffer } from './ambienceUtil'

export function createWindLayer(host: AmbienceHost, windBus: GainNode): { gust(): void } {
  const cfg = SOUND_CONFIG
  const { ctx, random } = host
  const now = ctx.currentTime
  const noise = ctx.createBufferSource()
  const bp = ctx.createBiquadFilter()
  const makeup = ctx.createGain()
  const gate = ctx.createGain()
  host.track(noise, true)
  host.track(bp)
  host.track(makeup)
  host.track(gate)
  noise.buffer = makeNoiseBuffer(ctx, random, 2)
  noise.loop = true
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(cfg.gustSweepHz[0], now)
  bp.Q.setValueAtTime(cfg.gustQ[0], now)
  makeup.gain.setValueAtTime(cfg.gustMakeup, now)
  gate.gain.setValueAtTime(cfg.windFloorGain, now)
  noise.connect(bp)
  bp.connect(makeup)
  makeup.connect(gate)
  gate.connect(windBus)
  noise.start(now)

  function gust(): void {
    const t = ctx.currentTime
    const rise = between(random, cfg.gustRiseSec[0], cfg.gustRiseSec[1])
    const fall = between(random, cfg.gustFallSec[0], cfg.gustFallSec[1])
    const peak = between(random, cfg.gustPeak[0], cfg.gustPeak[1])
    const [startHz, peakHz, endHz] = cfg.gustSweepHz
    const group = host.openGroup() // no nodes; keeps the gust in flight until it ends
    bp.Q.setValueAtTime(between(random, cfg.gustQ[0], cfg.gustQ[1]), t)
    bp.frequency.setValueAtTime(startHz, t)
    bp.frequency.linearRampToValueAtTime(peakHz, t + rise)
    bp.frequency.exponentialRampToValueAtTime(endHz, t + rise + fall)
    gate.gain.setValueAtTime(cfg.windFloorGain, t)
    gate.gain.exponentialRampToValueAtTime(peak, t + rise)
    gate.gain.exponentialRampToValueAtTime(cfg.windFloorGain, t + rise + fall)
    host.schedule(() => group.release(), (rise + fall + 0.2) * 1000)
  }

  return { gust }
}
