import type { AmbienceHost } from './ambience'
import { SOUND_CONFIG } from './soundConfig'
import { between } from './ambienceUtil'

export function createBellLayer(host: AmbienceHost, bellBus: GainNode): { toll(): void } {
  const cfg = SOUND_CONFIG
  const { ctx, random } = host
  const now = ctx.currentTime

  // Long-lived reverb network: dry + feedback delay. Decays on its own (feedback <= 0.5). Peaks are held by the master Limiter.
  const bellIn = ctx.createGain()
  const delay = ctx.createDelay(1)
  const wet = ctx.createGain()
  const feedback = ctx.createGain()
  host.track(bellIn)
  host.track(delay)
  host.track(wet)
  host.track(feedback)
  bellIn.gain.setValueAtTime(1, now)
  delay.delayTime.setValueAtTime(cfg.bellDelaySec, now)
  wet.gain.setValueAtTime(cfg.bellWet, now)
  feedback.gain.setValueAtTime(cfg.bellFeedback, now)
  bellIn.connect(bellBus)
  bellIn.connect(delay)
  delay.connect(wet)
  wet.connect(bellBus)
  delay.connect(feedback)
  feedback.connect(delay)

  function toll(): void {
    const t = ctx.currentTime
    const base = between(random, cfg.bellBaseHz[0], cfg.bellBaseHz[1])
    const decay0 = between(random, cfg.bellDecaySec[0], cfg.bellDecaySec[1])
    const group = host.openGroup()
    let longest = 0
    cfg.bellRatios.forEach((ratio, i) => {
      const decay = decay0 * cfg.bellDecayScale[i]
      longest = Math.max(longest, decay)
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      group.track(osc, true)
      group.track(g)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(base * ratio, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(cfg.bellShares[i] * cfg.bellDrySum, t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      osc.connect(g)
      g.connect(bellIn)
      osc.start(t)
      osc.stop(t + decay + 0.2)
    })
    host.schedule(() => group.release(), (longest + 0.5) * 1000)
  }

  return { toll }
}
