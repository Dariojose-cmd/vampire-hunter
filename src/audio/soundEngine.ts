import { SOUND_CONFIG } from './soundConfig'
import { startAmbience as buildAmbience } from './ambience'

/** Minimal structural subset of AudioContext, easy to fake in tests. */
export interface AudioContextLike {
  readonly state: 'suspended' | 'running' | 'closed' | 'interrupted'
  readonly currentTime: number
  readonly sampleRate: number
  readonly destination: AudioNode
  resume(): Promise<void>
  suspend(): Promise<void>
  close(): Promise<void>
  createGain(): GainNode
  createOscillator(): OscillatorNode
  createBuffer(ch: number, len: number, rate: number): AudioBuffer
  createBufferSource(): AudioBufferSourceNode
  createBiquadFilter(): BiquadFilterNode
  createDelay(maxDelayTime?: number): DelayNode
  createDynamicsCompressor(): DynamicsCompressorNode
}

/** Returns a context, or null when Web Audio is unsupported. May throw; the engine catches. */
export type AudioContextFactory = () => AudioContextLike | null

export interface SoundEngineDeps {
  factory: AudioContextFactory
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
  random?: () => number
}

export interface SoundEngine {
  /** Call inside the user gesture. Creates/resumes context, starts ambience once. */
  enable(): void
  /** Ramps master and output to 0 within stopRampMs, stops and disconnects every node, clears timers. */
  disable(): void
  isEnabled(): boolean
  playStake(): void
  startCrackle(opts: { reducedMotion: boolean }): void
  stopCrackle(): void
  playChime(): void
  /** Called on document visibilitychange. */
  setDocumentHidden(hidden: boolean): void
}

type Timer = ReturnType<typeof setTimeout>

interface Tracked {
  node: AudioNode
  source: boolean // has stop()
}

interface Session {
  ctx: AudioContextLike
  master: GainNode
  ambience: GainNode | null
  limiter: DynamicsCompressorNode
  output: GainNode
  nodes: Set<Tracked>
  /** Node groups of in-flight one-shots/bursts, released on teardown. */
  groups: Set<Set<Tracked>>
  timers: Set<Timer>
  /** Ids of currently audible one-shot / crackle voices; drives ambience ducking. */
  voices: Set<number>
  crackle: CrackleState | null
}

interface CrackleState {
  voiceId: number
  gain: GainNode
  stopping: boolean
  burstTimer: Timer | null
  nodes: Set<Tracked>
}

const SEC = 1000

export function createSoundEngine(deps: SoundEngineDeps): SoundEngine {
  const setT = deps.setTimeout ?? ((fn: () => void, ms?: number) => setTimeout(fn, ms))
  const clearT = deps.clearTimeout ?? ((t: Timer) => clearTimeout(t))
  const random = deps.random ?? Math.random

  let session: Session | null = null
  let voiceCounter = 0
  let documentHidden = false
  // Teardown timers for sessions already disabled; kept separate so a quick
  // re-enable does not cancel the previous context's cleanup.
  const teardownTimers = new Set<Timer>()

  // ---------- helpers ----------

  function schedule(s: Session, fn: () => void, ms: number): Timer {
    const t = setT(() => {
      s.timers.delete(t)
      try {
        fn()
      } catch {
        // Audio must never break the UI.
      }
    }, ms)
    s.timers.add(t)
    return t
  }

  function track(set: Set<Tracked>, node: AudioNode, source = false): void {
    set.add({ node, source })
  }

  function release(set: Set<Tracked>): void {
    for (const t of set) {
      try {
        if (t.source) (t.node as unknown as { stop(when?: number): void }).stop()
      } catch {
        // already stopped
      }
      try {
        t.node.disconnect()
      } catch {
        // already disconnected
      }
    }
    set.clear()
  }

  /** Ambience ducks whenever any other voice is active. */
  function updateDucking(s: Session): void {
    const amb = s.ambience
    if (!amb) return
    const target = s.voices.size > 0 ? SOUND_CONFIG.ambienceDuckedGain : SOUND_CONFIG.ambienceGain
    const now = s.ctx.currentTime
    amb.gain.setValueAtTime(amb.gain.value, now)
    amb.gain.linearRampToValueAtTime(target, now + 0.05)
  }

  function beginVoice(s: Session): number {
    const id = ++voiceCounter
    s.voices.add(id)
    updateDucking(s)
    return id
  }

  function endVoice(s: Session, id: number): void {
    s.voices.delete(id)
    updateDucking(s)
  }

  function makeNoiseBuffer(s: Session, seconds: number): AudioBuffer {
    const len = Math.max(1, Math.floor(s.ctx.sampleRate * seconds))
    const buffer = s.ctx.createBuffer(1, len, s.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = random() * 2 - 1
    return buffer
  }

  function startAmbience(s: Session, amb: GainNode): void {
    const { ctx } = s

    buildAmbience({
      ctx,
      bus: amb,
      random,
      schedule: (fn, ms) => {
        schedule(s, fn, ms)
      },
      track: (node, source = false) => track(s.nodes, node, source),
      openGroup: () => {
        const group = new Set<Tracked>()
        s.groups.add(group)
        return {
          track: (node, source = false) => track(group, node, source),
          release: () => {
            release(group)
            s.groups.delete(group)
          },
        }
      },
      isHidden: () => documentHidden,
    })
  }

  function endCrackleNow(s: Session): void {
    const c = s.crackle
    if (!c) return
    if (c.burstTimer !== null) {
      clearT(c.burstTimer)
      s.timers.delete(c.burstTimer)
    }
    release(c.nodes)
    try {
      c.gain.disconnect()
    } catch {
      // ignore
    }
    s.crackle = null
    endVoice(s, c.voiceId)
  }

  function scheduleBurst(s: Session, c: CrackleState): void {
    const delay = 20 + random() * 100 // 20 to 120 ms apart
    c.burstTimer = schedule(
      s,
      () => {
        c.burstTimer = null
        if (s.crackle !== c || c.stopping) return
        playBurst(s, c)
        scheduleBurst(s, c)
      },
      delay,
    )
  }

  function playBurst(s: Session, c: CrackleState): void {
    const { ctx } = s
    const now = ctx.currentTime
    const durSec = 0.01 + random() * 0.03
    const src = ctx.createBufferSource()
    const hp = ctx.createBiquadFilter()
    const g = ctx.createGain()
    const burst = new Set<Tracked>()
    track(burst, src, true)
    track(burst, hp)
    track(burst, g)
    s.groups.add(burst)
    src.buffer = makeNoiseBuffer(s, durSec)
    hp.type = 'bandpass'
    hp.frequency.setValueAtTime(
      SOUND_CONFIG.crackleBandMinHz +
        random() * (SOUND_CONFIG.crackleBandMaxHz - SOUND_CONFIG.crackleBandMinHz),
      now,
    )
    hp.Q.setValueAtTime(SOUND_CONFIG.crackleQ, now)
    const level = 0.4 + random() * 0.6
    g.gain.setValueAtTime(level, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + durSec)
    src.connect(hp)
    hp.connect(g)
    g.connect(c.gain)
    src.start(now)
    src.stop(now + durSec)
    schedule(
      s,
      () => {
        release(burst)
        s.groups.delete(burst)
      },
      durSec * SEC + 20,
    )
  }

  function teardown(old: Session): void {
    for (const t of old.timers) clearT(t)
    old.timers.clear()
    old.voices.clear()
    if (old.crackle) {
      release(old.crackle.nodes)
      old.crackle = null
    }
    for (const g of old.groups) release(g)
    old.groups.clear()
    release(old.nodes)
    try {
      old.master.disconnect()
    } catch {
      // ignore
    }
    try {
      void old.ctx.close().catch(() => undefined)
    } catch {
      // ignore
    }
  }

  // ---------- public API ----------

  function enable(): void {
    try {
      if (session) {
        if (session.ctx.state === 'suspended') void session.ctx.resume().catch(() => undefined)
        return
      }
      const ctx = deps.factory()
      if (!ctx) return
      // Resume synchronously inside the user gesture.
      void ctx.resume().catch(() => undefined)
      // Creation order is fixed: master [0], bus [1], limiter [2], output [3].
      // Chain: bus -> master -> limiter -> output -> destination. If any step
      // fails, close the context and stay silent: never play without the limiter.
      let master: GainNode
      let bus: GainNode
      let limiter: DynamicsCompressorNode
      let output: GainNode
      try {
        const now = ctx.currentTime
        master = ctx.createGain()
        bus = ctx.createGain()
        limiter = ctx.createDynamicsCompressor()
        output = ctx.createGain()
        master.gain.setValueAtTime(SOUND_CONFIG.masterGain, now)
        bus.gain.setValueAtTime(0, now)
        bus.gain.linearRampToValueAtTime(
          SOUND_CONFIG.ambienceGain,
          now + SOUND_CONFIG.ambienceFadeInMs / SEC,
        )
        const lim = SOUND_CONFIG.limiter
        limiter.threshold.setValueAtTime(lim.thresholdDb, now)
        limiter.knee.setValueAtTime(lim.kneeDb, now)
        limiter.ratio.setValueAtTime(lim.ratio, now)
        limiter.attack.setValueAtTime(lim.attackSec, now)
        limiter.release.setValueAtTime(lim.releaseSec, now)
        output.gain.setValueAtTime(SOUND_CONFIG.limiterOutputGain, now)
        bus.connect(master)
        master.connect(limiter)
        limiter.connect(output)
        output.connect(ctx.destination)
      } catch {
        try {
          void ctx.close().catch(() => undefined)
        } catch {
          // ignore
        }
        return
      }
      const s: Session = {
        ctx,
        master,
        ambience: bus,
        limiter,
        output,
        nodes: new Set(),
        groups: new Set(),
        timers: new Set(),
        voices: new Set(),
        crackle: null,
      }
      track(s.nodes, master)
      track(s.nodes, bus)
      track(s.nodes, limiter)
      track(s.nodes, output)
      session = s
      try {
        startAmbience(s, bus)
      } catch {
        // Silent ambience is acceptable.
      }
    } catch {
      // Unsupported or blocked: stay silent, UI keeps working.
    }
  }

  function disable(): void {
    try {
      const old = session
      session = null
      if (!old) return
      // Stop scheduling new work right away.
      for (const t of old.timers) clearT(t)
      old.timers.clear()
      const now = old.ctx.currentTime
      const ramp = SOUND_CONFIG.stopRampMs
      try {
        old.master.gain.setValueAtTime(old.master.gain.value, now)
        old.master.gain.linearRampToValueAtTime(0, now + ramp / SEC)
        old.output.gain.setValueAtTime(old.output.gain.value, now)
        old.output.gain.linearRampToValueAtTime(0, now + ramp / SEC)
      } catch {
        // ignore
      }
      const t = setT(() => {
        teardownTimers.delete(t)
        try {
          teardown(old)
        } catch {
          // ignore
        }
      }, ramp)
      teardownTimers.add(t)
    } catch {
      // ignore
    }
  }

  function playStake(): void {
    const s = session
    if (!s) return
    try {
      const { ctx } = s
      const peak = SOUND_CONFIG.stakeGain
      const now = ctx.currentTime
      const id = beginVoice(s)
      const nodes = new Set<Tracked>()
      s.groups.add(nodes)

      const sh = SOUND_CONFIG.stakeShares

      // Low: a sine that drops in pitch, kept above 100 Hz for small speakers.
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      track(nodes, osc, true)
      track(nodes, gain)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(SOUND_CONFIG.stakeStartHz, now)
      osc.frequency.exponentialRampToValueAtTime(SOUND_CONFIG.stakeEndHz, now + 0.18)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(peak * sh.low, now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
      osc.connect(gain)
      gain.connect(s.master)
      osc.start(now)
      osc.stop(now + 0.32)

      // Mid body: short triangle knock.
      const body = ctx.createOscillator()
      const bodyGain = ctx.createGain()
      track(nodes, body, true)
      track(nodes, bodyGain)
      body.type = 'triangle'
      body.frequency.setValueAtTime(SOUND_CONFIG.stakeBodyHz, now)
      bodyGain.gain.setValueAtTime(0.0001, now)
      bodyGain.gain.exponentialRampToValueAtTime(peak * sh.body, now + 0.005)
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
      body.connect(bodyGain)
      bodyGain.connect(s.master)
      body.start(now)
      body.stop(now + 0.14)

      // Crack transient: very short band-passed noise burst.
      const len = Math.max(1, Math.floor(ctx.sampleRate * 0.06))
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (random() * 2 - 1) * (1 - i / len)
      const noise = ctx.createBufferSource()
      const bp = ctx.createBiquadFilter()
      const ng = ctx.createGain()
      track(nodes, noise, true)
      track(nodes, bp)
      track(nodes, ng)
      noise.buffer = buffer
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(SOUND_CONFIG.stakeCrackHz, now)
      bp.Q.setValueAtTime(SOUND_CONFIG.crackleQ, now)
      // Shares sum to 1.0, so the voice stays within its peak.
      ng.gain.setValueAtTime(peak * sh.crack, now)
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
      noise.connect(bp)
      bp.connect(ng)
      ng.connect(s.master)
      noise.start(now)
      noise.stop(now + 0.08)

      schedule(
        s,
        () => {
          release(nodes)
          s.groups.delete(nodes)
          endVoice(s, id)
        },
        340,
      )
    } catch {
      // ignore
    }
  }

  function startCrackle(opts: { reducedMotion: boolean }): void {
    const s = session
    if (!s) return
    try {
      if (s.crackle && !s.crackle.stopping) return
      if (s.crackle) endCrackleNow(s)
      const desired =
        SOUND_CONFIG.crackleGain * (opts.reducedMotion ? SOUND_CONFIG.crackleReducedFactor : 1)
      const peak = desired
      const gain = s.ctx.createGain()
      const nodes = new Set<Tracked>()
      track(nodes, gain)
      gain.gain.setValueAtTime(peak, s.ctx.currentTime)
      gain.connect(s.master)
      const c: CrackleState = {
        voiceId: beginVoice(s),
        gain,
        stopping: false,
        burstTimer: null,
        nodes,
      }
      s.crackle = c
      scheduleBurst(s, c)
    } catch {
      // ignore
    }
  }

  function stopCrackle(): void {
    const s = session
    if (!s) return
    try {
      const c = s.crackle
      if (!c || c.stopping) return
      c.stopping = true
      if (c.burstTimer !== null) {
        clearT(c.burstTimer)
        s.timers.delete(c.burstTimer)
        c.burstTimer = null
      }
      const now = s.ctx.currentTime
      c.gain.gain.setValueAtTime(c.gain.gain.value, now)
      c.gain.gain.linearRampToValueAtTime(0, now + SOUND_CONFIG.crackleFadeOutMs / SEC)
      schedule(
        s,
        () => {
          if (s.crackle === c) endCrackleNow(s)
        },
        SOUND_CONFIG.crackleFadeOutMs,
      )
    } catch {
      // ignore
    }
  }

  function playChime(): void {
    const s = session
    if (!s) return
    try {
      const { ctx } = s
      const peak = SOUND_CONFIG.chimeGain
      const now = ctx.currentTime
      const id = beginVoice(s)
      const nodes = new Set<Tracked>()
      s.groups.add(nodes)
      const dur = SOUND_CONFIG.chimeMaxMs / SEC
      const partials: Array<[number, number]> = [
        [880, 0.6],
        [1320, 0.4],
      ]
      for (const [freq, share] of partials) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        track(nodes, osc, true)
        track(nodes, g)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now)
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(peak * share, now + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        osc.connect(g)
        g.connect(s.master)
        osc.start(now)
        osc.stop(now + dur)
      }
      schedule(
        s,
        () => {
          release(nodes)
          s.groups.delete(nodes)
          endVoice(s, id)
        },
        SOUND_CONFIG.chimeMaxMs,
      )
    } catch {
      // ignore
    }
  }

  function setDocumentHidden(hidden: boolean): void {
    documentHidden = hidden
    const s = session
    if (!s) return
    try {
      if (hidden) void s.ctx.suspend().catch(() => undefined)
      else void s.ctx.resume().catch(() => undefined)
    } catch {
      // ignore
    }
  }

  return {
    enable,
    disable,
    isEnabled: () => session !== null,
    playStake,
    startCrackle,
    stopCrackle,
    playChime,
    setDocumentHidden,
  }
}
