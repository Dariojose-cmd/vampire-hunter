import type { AmbienceHost } from './ambience'
import { SOUND_CONFIG } from './soundConfig'
import { between } from './ambienceUtil'

const CURVE_POINTS = 64
const SINE_WEIGHT = 0.6
const TRI_WEIGHT = 0.4

type ChordName = keyof typeof SOUND_CONFIG.chordSet

function raisedCosine(peak: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_POINTS)
  for (let i = 0; i < CURVE_POINTS; i++) {
    curve[i] = peak * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (CURVE_POINTS - 1)))
  }
  return curve
}

export function createPadLayer(host: AmbienceHost, padBus: GainNode): { start(): void } {
  const cfg = SOUND_CONFIG
  const { ctx, random } = host
  const filter = ctx.createBiquadFilter()
  host.track(filter)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(cfg.padLowpassHz, ctx.currentTime)
  filter.Q.setValueAtTime(0.5, ctx.currentTime)
  filter.connect(padBus)

  let slot = 0
  let prevTritone = false
  let prevEnd = 0 // end time of the chord before the latest one

  function buildChord(name: ChordName, now: number, lengthSec: number): void {
    const group = host.openGroup()
    const chordGain = ctx.createGain()
    group.track(chordGain)
    chordGain.gain.value = 0
    chordGain.gain.setValueCurveAtTime(raisedCosine(cfg.padChordPeak), now, lengthSec)
    chordGain.connect(filter)
    const notes = cfg.chordSet[name]
    const uppers = cfg.chordUpper[name]
    // Each body note has sine + triangle weights summing to 1, so the voice gains
    // of one chord add up to padCrestFactor.
    const totalWeight = notes.length + cfg.padUpperWeight * uppers.length
    const addVoice = (freq: number, type: OscillatorType, detune: number, weight: number): void => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      group.track(osc, true)
      group.track(g)
      osc.type = type
      osc.frequency.setValueAtTime(freq, now)
      osc.detune.setValueAtTime(detune, now)
      g.gain.setValueAtTime((cfg.padCrestFactor * weight) / totalWeight, now)
      osc.connect(g)
      g.connect(chordGain)
      osc.start(now)
      osc.stop(now + lengthSec + 0.1)
    }
    for (const freq of notes) {
      const cents = between(random, cfg.padDetuneCents[0], cfg.padDetuneCents[1])
      addVoice(freq, 'sine', cents, SINE_WEIGHT)
      addVoice(freq, 'triangle', -cents, TRI_WEIGHT)
    }
    for (const freq of uppers) {
      const cents = between(random, cfg.padDetuneCents[0], cfg.padDetuneCents[1])
      addVoice(freq, 'sine', -cents, cfg.padUpperWeight)
    }
    host.schedule(() => group.release(), (lengthSec + 0.5) * 1000)
  }

  function step(): void {
    let delaySec = cfg.padChordSec[0] * cfg.padStartFraction
    if (!host.isHidden()) {
      try {
        const useTri = !prevTritone && random() < cfg.tritoneChance
        const name: ChordName = useTri ? 'tri' : cfg.progression[slot % cfg.progression.length]
        slot++
        prevTritone = useTri
        const now = ctx.currentTime
        const lengthSec = between(random, cfg.padChordSec[0], cfg.padChordSec[1])
        buildChord(name, now, lengthSec)
        delaySec = Math.max(cfg.padStartFraction * lengthSec, prevEnd - now)
        prevEnd = now + lengthSec
      } catch {
        // keep the scheduler alive
      }
    }
    host.schedule(step, delaySec * 1000)
  }

  return { start: step }
}
