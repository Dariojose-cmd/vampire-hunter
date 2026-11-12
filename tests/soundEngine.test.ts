import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { SOUND_CONFIG } from '../src/audio/soundConfig'
import { createSoundEngine, type AudioContextLike, type SoundEngine } from '../src/audio/soundEngine'

// ---------------------------------------------------------------------------
// Reusable fake Web Audio implementation.
//
// Every automation event and every node carries a timestamp from the context
// clock. By default the clock is constant 0 (as before). With
// `clock: 'fake-timers'` `currentTime` follows the vitest fake clock, which the
// ambience tests need because Ambience_Events are scheduled with timers.
// ---------------------------------------------------------------------------

export type AutomationEvent =
  | { kind: 'set'; value: number; time: number; at: number }
  | { kind: 'linear'; value: number; time: number; at: number }
  | { kind: 'exponential'; value: number; time: number; at: number }
  // `value` is the curve peak (max), `values` holds every curve point.
  | { kind: 'curve'; value: number; values: number[]; time: number; duration: number; at: number }

export class FakeParam {
  value: number
  initial: number
  events: AutomationEvent[] = []
  cancels: number[] = []
  private clock: () => number
  constructor(initial = 1, clock: () => number = () => 0) {
    this.value = initial
    this.initial = initial
    this.clock = clock
  }
  setValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'set', value, time, at: this.clock() })
    this.value = value
    return this
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'linear', value, time, at: this.clock() })
    return this
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'exponential', value, time, at: this.clock() })
    return this
  }
  setValueCurveAtTime(values: ArrayLike<number>, time: number, duration: number): this {
    const list = Array.from(values)
    this.events.push({ kind: 'curve', value: Math.max(...list), values: list, time, duration, at: this.clock() })
    return this
  }
  cancelScheduledValues(time: number): this {
    this.cancels.push(time)
    return this
  }
}

export class FakeNode {
  kind: string
  createdAt: number
  connections: unknown[] = []
  paramConnections: FakeParam[] = []
  disconnectCalls = 0
  startCalls: Array<number | undefined> = []
  stopCalls: Array<number | undefined> = []
  // Common optional properties set by the engine.
  type?: string
  loop?: boolean
  buffer?: unknown
  gain: FakeParam
  frequency: FakeParam
  detune: FakeParam
  Q: FakeParam
  delayTime: FakeParam
  // DynamicsCompressorNode (amendment 4): recording params; reduction is always 0 in the fake.
  threshold: FakeParam
  knee: FakeParam
  ratio: FakeParam
  attack: FakeParam
  release: FakeParam
  reduction = 0

  constructor(kind: string, clock: () => number = () => 0) {
    this.kind = kind
    this.createdAt = clock()
    this.gain = new FakeParam(1, clock)
    this.frequency = new FakeParam(440, clock)
    this.detune = new FakeParam(0, clock)
    this.Q = new FakeParam(1, clock)
    this.delayTime = new FakeParam(0, clock)
    this.threshold = new FakeParam(-24, clock)
    this.knee = new FakeParam(30, clock)
    this.ratio = new FakeParam(12, clock)
    this.attack = new FakeParam(0.003, clock)
    this.release = new FakeParam(0.25, clock)
  }
  connect(dest: unknown): unknown {
    this.connections.push(dest)
    if (dest instanceof FakeParam) this.paramConnections.push(dest)
    return dest
  }
  disconnect(): void {
    this.disconnectCalls++
  }
  start(when?: number): void {
    this.startCalls.push(when)
  }
  stop(when?: number): void {
    this.stopCalls.push(when)
  }
}

export interface FakeContextOptions {
  clock?: 'constant' | 'fake-timers'
}

export class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  sampleRate = 8000
  destination = new FakeNode('destination')
  nodes: FakeNode[] = []
  buffers: Array<{ channels: number; length: number; rate: number }> = []
  resumeCalls = 0
  suspendCalls = 0
  closeCalls = 0
  private readonly mode: 'constant' | 'fake-timers'
  private readonly t0 = Date.now()

  constructor(opts: FakeContextOptions = {}) {
    this.mode = opts.clock ?? 'constant'
  }

  get currentTime(): number {
    return this.mode === 'fake-timers' ? (Date.now() - this.t0) / 1000 : 0
  }

  private make(kind: string): FakeNode {
    const n = new FakeNode(kind, () => this.currentTime)
    this.nodes.push(n)
    return n
  }
  createGain(): GainNode {
    return this.make('gain') as unknown as GainNode
  }
  createOscillator(): OscillatorNode {
    return this.make('oscillator') as unknown as OscillatorNode
  }
  createBufferSource(): AudioBufferSourceNode {
    return this.make('bufferSource') as unknown as AudioBufferSourceNode
  }
  createBiquadFilter(): BiquadFilterNode {
    return this.make('biquad') as unknown as BiquadFilterNode
  }
  createDynamicsCompressor(): DynamicsCompressorNode {
    return this.make('compressor') as unknown as DynamicsCompressorNode
  }
  createDelay(): DelayNode {
    return this.make('delay') as unknown as DelayNode
  }
  createBuffer(channels: number, length: number, rate: number): AudioBuffer {
    this.buffers.push({ channels, length, rate })
    const data = new Float32Array(length)
    return { getChannelData: () => data, length, sampleRate: rate } as unknown as AudioBuffer
  }
  resume(): Promise<void> {
    this.resumeCalls++
    this.state = 'running'
    return Promise.resolve()
  }
  suspend(): Promise<void> {
    this.suspendCalls++
    this.state = 'suspended'
    return Promise.resolve()
  }
  close(): Promise<void> {
    this.closeCalls++
    this.state = 'closed'
    return Promise.resolve()
  }
}

/**
 * Evaluates the recorded automation timeline of a param at time `t`
 * (set, linear ramp, exponential ramp, value curve), like the Web Audio spec.
 */
export function gainTimeline(param: FakeParam): (t: number) => number {
  const evs = param.events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.time - b.e.time || a.i - b.i)
    .map((x) => x.e)
  return (t: number): number => {
    let idx = -1
    for (let i = 0; i < evs.length; i++) {
      if (evs[i].time <= t) idx = i
      else break
    }
    let prevTime = -Infinity
    let prevValue = param.initial
    if (idx >= 0) {
      const e = evs[idx]
      if (e.kind === 'curve') {
        const end = e.time + e.duration
        if (t < end) {
          const pos = ((t - e.time) / e.duration) * (e.values.length - 1)
          const lo = Math.floor(pos)
          const hi = Math.min(lo + 1, e.values.length - 1)
          return e.values[lo] + (e.values[hi] - e.values[lo]) * (pos - lo)
        }
        prevTime = end
        prevValue = e.values[e.values.length - 1]
      } else {
        prevTime = e.time
        prevValue = e.value
      }
    }
    const next = evs[idx + 1]
    if (next && (next.kind === 'linear' || next.kind === 'exponential') && Number.isFinite(prevTime)) {
      const frac = (t - prevTime) / (next.time - prevTime)
      if (next.kind === 'linear') return prevValue + (next.value - prevValue) * frac
      if (prevValue > 0 && next.value > 0) return prevValue * Math.pow(next.value / prevValue, frac)
    }
    return prevValue
  }
}

export function gainAt(param: FakeParam, t: number): number {
  return gainTimeline(param)(t)
}

/** Seeded deterministic random in [0, 1). */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export interface Harness {
  engine: SoundEngine
  ctxs: FakeAudioContext[]
  /** Call counter (a vi.fn would retain every context it returns, which exhausts memory in 100-run properties). */
  factory: { (): AudioContextLike; mock: { calls: unknown[][] } }
}

/** `random` may be a seed or an injected random function. The fake clock follows vitest fake timers. */
export function makeHarness(random: number | (() => number) = 1): Harness {
  const ctxs: FakeAudioContext[] = []
  const calls: unknown[][] = []
  const factory = Object.assign(
    () => {
      calls.push([])
      const c = new FakeAudioContext({ clock: 'fake-timers' })
      ctxs.push(c)
      return c as unknown as AudioContextLike
    },
    { mock: { calls } },
  )
  const engine = createSoundEngine({
    factory,
    random: typeof random === 'number' ? makeRandom(random) : random,
  })
  return { engine, ctxs, factory }
}

export type Command =
  | { cmd: 'playStake' }
  | { cmd: 'startCrackle'; reducedMotion: boolean }
  | { cmd: 'stopCrackle' }
  | { cmd: 'playChime' }
  | { cmd: 'setDocumentHidden'; hidden: boolean }
  | { cmd: 'advance'; ms: number }

export const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.constant<Command>({ cmd: 'playStake' }),
  fc.boolean().map<Command>((reducedMotion) => ({ cmd: 'startCrackle', reducedMotion })),
  fc.constant<Command>({ cmd: 'stopCrackle' }),
  fc.constant<Command>({ cmd: 'playChime' }),
  fc.boolean().map<Command>((hidden) => ({ cmd: 'setDocumentHidden', hidden })),
  fc.integer({ min: 0, max: 2000 }).map<Command>((ms) => ({ cmd: 'advance', ms })),
)

/** Like commandArb but with advances up to 90 s, so Ambience_Events fire between commands. */
export const longCommandArb: fc.Arbitrary<Command> = fc.oneof(
  commandArb,
  fc.integer({ min: 0, max: 90000 }).map<Command>((ms) => ({ cmd: 'advance', ms })),
)

export function runCommand(engine: SoundEngine, c: Command): void {
  switch (c.cmd) {
    case 'playStake':
      engine.playStake()
      break
    case 'startCrackle':
      engine.startCrackle({ reducedMotion: c.reducedMotion })
      break
    case 'stopCrackle':
      engine.stopCrackle()
      break
    case 'playChime':
      engine.playChime()
      break
    case 'setDocumentHidden':
      engine.setDocumentHidden(c.hidden)
      break
    case 'advance':
      vi.advanceTimersByTime(c.ms)
      break
  }
}

/** Injected random descriptor (printable by fast-check): constant or seeded. */
export type RandomSpec = { kind: 'const'; value: number } | { kind: 'seed'; seed: number }
export const JUST_BELOW_ONE = 0.999999
export const randomSpecArb: fc.Arbitrary<RandomSpec> = fc.oneof(
  fc.constantFrom<RandomSpec>(
    { kind: 'const', value: 0 },
    { kind: 'const', value: 0.5 },
    { kind: 'const', value: JUST_BELOW_ONE },
  ),
  fc.integer().map<RandomSpec>((seed) => ({ kind: 'seed', seed })),
)
export const toRandom = (spec: RandomSpec): (() => number) =>
  spec.kind === 'const' ? () => spec.value : makeRandom(spec.seed)

// ---------------------------------------------------------------------------
// Graph analysis of the ambience (works on the recorded fake nodes).
// ---------------------------------------------------------------------------

export interface PadChord {
  name: string | undefined
  start: number
  duration: number
  peak: number
  freqs: number[]
  detunes: number[]
  types: Array<string | undefined>
  /** Sum of the voice gains of the chord (equals padCrestFactor). */
  gainSum: number
}
export interface Gust {
  start: number
  peakTime: number
  end: number
  peak: number
}
export interface Toll {
  start: number
  freqs: number[]
  peaks: number[]
}
export interface Detail {
  kind: 'owl' | 'creak'
  start: number
}
export interface Ambience {
  master: FakeNode
  bus: FakeNode
  layerBuses: FakeNode[] // pad, wind, bell, detail (creation order)
  padFilter: FakeNode
  gate: FakeNode
  windBandpass: FakeNode
  windNoise: FakeNode
  delay: FakeNode
  wet: FakeNode
  feedback: FakeNode
  chords: PadChord[]
  gusts: Gust[]
  tolls: Toll[]
  details: Detail[]
  detailPeaks: number[]
}

export function chordName(freqs: number[]): string | undefined {
  const uniq = [...new Set(freqs)].sort((a, b) => a - b)
  for (const [name, body] of Object.entries(SOUND_CONFIG.chordSet)) {
    const notes = [...body, ...SOUND_CONFIG.chordUpper[name as keyof typeof SOUND_CONFIG.chordUpper]]
    const sorted = [...new Set(notes)].sort((a, b) => a - b)
    if (sorted.length === uniq.length && sorted.every((f, i) => f === uniq[i])) return name
  }
  return undefined
}

const peakOf = (n: FakeNode): number => Math.max(0, ...n.gain.events.map((e) => e.value))

export function analyse(ctx: FakeAudioContext): Ambience {
  const incoming = new Map<FakeNode, FakeNode[]>()
  for (const n of ctx.nodes) {
    for (const d of n.connections) {
      if (d instanceof FakeNode) {
        const list = incoming.get(d) ?? []
        list.push(n)
        incoming.set(d, list)
      }
    }
  }
  const into = (n: FakeNode, kind?: string): FakeNode[] =>
    (incoming.get(n) ?? []).filter((x) => kind === undefined || x.kind === kind)

  const [master, bus] = ctx.nodes
  const layerBuses = into(bus, 'gain')
  const [padBus, windBus, bellBus, detailBus] = layerBuses

  const padFilter = into(padBus, 'biquad')[0]
  const chords: PadChord[] = into(padFilter, 'gain').map((cg) => {
    const curve = cg.gain.events.find((e) => e.kind === 'curve')!
    const voiceGains = into(cg, 'gain')
    const voices = voiceGains.flatMap((g) => into(g, 'oscillator'))
    const freqs = voices.map((o) => o.frequency.events[0].value)
    return {
      name: chordName(freqs),
      start: curve.time,
      duration: curve.kind === 'curve' ? curve.duration : 0,
      peak: curve.value,
      freqs,
      detunes: voices.map((o) => o.detune.events[0]?.value ?? 0),
      types: voices.map((o) => o.type),
      gainSum: voiceGains.reduce((sum, g) => sum + g.gain.events[0].value, 0),
    }
  })

  const gate = into(windBus, 'gain')[0]
  const makeup = into(gate, 'gain')[0]
  const windBandpass = into(makeup, 'biquad')[0]
  const windNoise = into(windBandpass, 'bufferSource')[0]
  const gusts: Gust[] = []
  for (let i = 1; i + 2 < gate.gain.events.length; i += 3) {
    const [s, up, down] = [gate.gain.events[i], gate.gain.events[i + 1], gate.gain.events[i + 2]]
    gusts.push({ start: s.time, peakTime: up.time, end: down.time, peak: up.value })
  }

  const delay = ctx.nodes.find((n) => n.kind === 'delay')!
  const bellIn = ctx.nodes.find(
    (n) => n.kind === 'gain' && n.connections.includes(delay) && n.connections.includes(bellBus),
  )!
  const wet = ctx.nodes.find((n) => n.kind === 'gain' && delay.connections.includes(n) && n.connections.includes(bellBus))!
  const feedback = ctx.nodes.find((n) => n.kind === 'gain' && delay.connections.includes(n) && n.connections.includes(delay))!
  const tollMap = new Map<number, Toll>()
  const partialGains = new Set(into(bellIn, 'gain'))
  for (const g of ctx.nodes) {
    if (!partialGains.has(g)) continue
    for (const o of into(g, 'oscillator')) {
      const start = o.startCalls[0] ?? 0
      const toll = tollMap.get(start) ?? { start, freqs: [], peaks: [] }
      toll.freqs.push(o.frequency.events[0].value)
      toll.peaks.push(peakOf(g))
      tollMap.set(start, toll)
    }
  }
  const tolls = [...tollMap.values()].sort((a, b) => a.start - b.start)

  const details: Detail[] = []
  const detailPeaks: number[] = []
  for (const g of into(detailBus, 'gain')) {
    detailPeaks.push(peakOf(g))
    for (const src of into(g)) {
      if (src.kind === 'oscillator' && src.frequency.events[0].value === SOUND_CONFIG.owlNotesHz[0][0]) {
        details.push({ kind: 'owl', start: src.startCalls[0] ?? 0 })
      } else if (src.kind === 'biquad') {
        for (const noise of into(src, 'bufferSource')) details.push({ kind: 'creak', start: noise.startCalls[0] ?? 0 })
      }
    }
  }
  details.sort((a, b) => a.start - b.start)

  return {
    master, bus, layerBuses, padFilter, gate, windBandpass, windNoise, delay, wet, feedback,
    chords, gusts, tolls, details, detailPeaks,
  }
}

/** Gaps between consecutive start times, first gap measured from t = 0 (enable). */
export const gapsOf = (starts: number[]): number[] => starts.map((t, i) => t - (i === 0 ? 0 : starts[i - 1]))

const oscillatorsOf = (ctx: FakeAudioContext): FakeNode[] => ctx.nodes.filter((n) => n.kind === 'oscillator')

/** True when `from` reaches `target` by following audio-node connections (a node reaches itself). */
export function reaches(from: FakeNode, target: FakeNode): boolean {
  const seen = new Set<FakeNode>()
  const stack: FakeNode[] = [from]
  while (stack.length > 0) {
    const n = stack.pop()!
    if (n === target) return true
    if (seen.has(n)) continue
    seen.add(n)
    for (const d of n.connections) if (d instanceof FakeNode) stack.push(d)
  }
  return false
}

/** Nodes that connect directly to the destination. */
export const connectedToDestination = (ctx: FakeAudioContext): FakeNode[] =>
  ctx.nodes.filter((n) => n.connections.includes(ctx.destination))

/** The Limiter is located by kind, never by index. */
export const limitersOf = (ctx: FakeAudioContext): FakeNode[] => ctx.nodes.filter((n) => n.kind === 'compressor')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('soundEngine: sound off creates nothing', () => {
  // Feature: ux-burn-garlic-sound-fixes, Property 5
  // **Validates: Requirements 6.2, 6.3, 8.7, 9.6**
  it('Feature: ux-burn-garlic-sound-fixes, Property 5: never-enabled engine never calls the factory', () => {
    fc.assert(
      fc.property(fc.array(commandArb, { maxLength: 40 }), fc.integer(), (commands, seed) => {
        const { engine, ctxs, factory } = makeHarness(seed)
        for (const c of commands) runCommand(engine, c)
        vi.advanceTimersByTime(5000)
        expect(factory.mock.calls.length).toBe(0)
        expect(ctxs).toHaveLength(0)
        expect(engine.isEnabled()).toBe(false)
        expect(vi.getTimerCount()).toBe(0)
      }),
      { numRuns: 100 },
    )
  })

  // Feature: ux-burn-garlic-sound-fixes, Property 5
  // **Validates: Requirements 6.2, 6.3, 8.7, 9.6**
  it('Feature: ux-burn-garlic-sound-fixes, Property 5: after disable() no new nodes are created', () => {
    fc.assert(
      fc.property(
        fc.array(commandArb, { maxLength: 20 }),
        fc.array(commandArb, { maxLength: 40 }),
        fc.integer(),
        (before, after, seed) => {
          const { engine, ctxs, factory } = makeHarness(seed)
          engine.enable()
          for (const c of before) runCommand(engine, c)
          engine.disable()
          expect(engine.isEnabled()).toBe(false)

          const factoryCalls = factory.mock.calls.length
          const ctx = ctxs[0]
          const nodeCount = ctx.nodes.length
          const bufferCount = ctx.buffers.length

          for (const c of after) runCommand(engine, c)
          vi.advanceTimersByTime(5000)

          expect(factory.mock.calls.length).toBe(factoryCalls)
          expect(ctx.nodes.length).toBe(nodeCount)
          expect(ctx.buffers.length).toBe(bufferCount)
          expect(vi.getTimerCount()).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('soundEngine: disable releases everything', () => {
  // Feature: ux-burn-garlic-sound-fixes, Property 6 (amended 2)
  // **Validates: Requirements 6.4, 6.5, 7.8, 7.19, 12.3**
  it('Feature: ux-burn-garlic-sound-fixes, Property 6: disable ramps master and output to 0 within 80 ms, stops and disconnects all nodes (incl. event nodes and the bell delay), clears every timer, creates nothing afterwards', () => {
    fc.assert(
      fc.property(
        fc.array(longCommandArb, { maxLength: 25 }),
        fc.integer({ min: 0, max: 150000 }),
        fc.integer(),
        (commands, warmMs, seed) => {
          const { engine, ctxs } = makeHarness(seed)
          engine.enable()
          for (const c of commands) runCommand(engine, c)
          // Let Ambience_Events (chords, gusts, bells, details) be in flight.
          engine.setDocumentHidden(false)
          vi.advanceTimersByTime(warmMs)
          const ctx = ctxs[0]

          // A pad chord is always sounding, so something is alive right before disable().
          expect(ctx.nodes.some((n) => n.disconnectCalls === 0)).toBe(true)
          expect(vi.getTimerCount()).toBeGreaterThan(0)

          const disableTime = ctx.currentTime
          engine.disable()
          vi.advanceTimersByTime(5000)

          const master = ctx.nodes[0]
          // Chain master -> Limiter -> Output_Gain -> destination (nothing is assumed about indices 2 and 3).
          const [limiter] = limitersOf(ctx)
          const output = limiter.connections[0] as FakeNode
          expect(master.connections).toContain(limiter)
          expect(limiter.connections).toEqual([output])
          expect(output.connections).toEqual([ctx.destination])
          expect(connectedToDestination(ctx)).toEqual([output])
          const limit = disableTime + SOUND_CONFIG.stopRampMs / 1000
          const zeroRamp = master.gain.events.find(
            (e) => e.kind === 'linear' && e.value === 0 && e.time <= limit + 1e-9,
          )
          expect(zeroRamp).toBeDefined()
          // The Output_Gain is the true last stage and ramps to 0 as well.
          expect(
            output.gain.events.some((e) => e.kind === 'linear' && e.value === 0 && e.time <= limit + 1e-9),
          ).toBe(true)
          // Limiter and Output_Gain are released.
          expect(limiter.disconnectCalls).toBeGreaterThan(0)
          expect(output.disconnectCalls).toBeGreaterThan(0)

          for (const n of ctx.nodes) {
            if (n.kind === 'oscillator' || n.kind === 'bufferSource') {
              if (n.startCalls.length > 0) expect(n.stopCalls.length).toBeGreaterThan(0)
            }
            expect(n.disconnectCalls).toBeGreaterThan(0)
          }
          // The bell delay network is part of that.
          for (const n of ctx.nodes.filter((x) => x.kind === 'delay')) expect(n.disconnectCalls).toBeGreaterThan(0)

          expect(vi.getTimerCount()).toBe(0)
          expect(ctx.closeCalls).toBe(1)
          expect(engine.isEnabled()).toBe(false)

          // No new node and no new timer in the following 2 minutes.
          const count = ctx.nodes.length
          vi.advanceTimersByTime(120000)
          expect(ctx.nodes.length).toBe(count)
          expect(vi.getTimerCount()).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('soundEngine: ambience is a singleton', () => {
  // Feature: ux-burn-garlic-sound-fixes, Property 7 (amended 2)
  // **Validates: Requirements 7.1, 7.2, 7.3, 7.3a, 7.4, 7.19, 12.4**
  it('Feature: ux-burn-garlic-sound-fixes, Property 7: repeated enable() yields exactly one ambience set and adds neither nodes nor timers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.array(fc.oneof(longCommandArb, fc.constant<'enable'>('enable')), { minLength: 0, maxLength: 30 }),
        fc.integer({ min: 0, max: 200000 }),
        fc.integer(),
        (extraEnables, steps, tailMs, seed) => {
          const { engine, ctxs, factory } = makeHarness(seed)
          engine.enable()
          const ctx = ctxs[0]

          // Right after the first enable(): one Pad scheduler, one gust, one bell and one detail
          // scheduler (4 timers) plus the release timer of the first, already sounding, chord.
          expect(vi.getTimerCount()).toBe(5)
          const nodesAfterFirst = ctx.nodes.length
          for (let i = 0; i < extraEnables; i++) engine.enable()
          expect(ctx.nodes.length).toBe(nodesAfterFirst)
          expect(vi.getTimerCount()).toBe(5)

          for (const step of steps) {
            if (step === 'enable') engine.enable()
            else runCommand(engine, step)
          }
          engine.setDocumentHidden(false)
          vi.advanceTimersByTime(tailMs)

          expect(factory.mock.calls.length).toBe(1)
          expect(ctxs).toHaveLength(1)

          // Exactly one looping buffer source: the wind noise.
          const started = ctx.nodes.filter((n) => n.startCalls.length > 0)
          const loops = started.filter((n) => n.kind === 'bufferSource' && n.loop === true)
          expect(loops).toHaveLength(1)
          expect(loops[0].startCalls).toHaveLength(1)

          // No LFO and no oscillator below 100 Hz (so nothing at or below 1 Hz).
          for (const o of oscillatorsOf(ctx)) {
            for (const e of o.frequency.events) expect(e.value).toBeGreaterThanOrEqual(SOUND_CONFIG.minAudioHz)
          }

          // One bell delay network.
          expect(ctx.nodes.filter((n) => n.kind === 'delay')).toHaveLength(1)

          // One scheduler per layer: consecutive starts never closer than the layer minimum gap.
          const a = analyse(ctx)
          const EPS = 1e-6
          // (the first chord starts immediately at enable(), so its gap is skipped)
          for (const g of gapsOf(a.chords.map((c) => c.start)).slice(1)) {
            expect(g).toBeGreaterThanOrEqual(SOUND_CONFIG.padChordSec[0] * SOUND_CONFIG.padStartFraction - EPS)
          }
          const checkGaps = (starts: number[], min: number) => {
            for (const g of gapsOf(starts)) expect(g).toBeGreaterThanOrEqual(min - EPS)
          }
          checkGaps(a.gusts.map((g) => g.start), SOUND_CONFIG.gustGapSec[0])
          checkGaps(a.tolls.map((t) => t.start), SOUND_CONFIG.bellGapSec[0])
          checkGaps(a.details.map((d) => d.start), SOUND_CONFIG.detailGapSec[0])
          // Exactly one Limiter and one Output_Gain per session; only the Output_Gain feeds the destination.
          expect(limitersOf(ctx)).toHaveLength(1)
          expect(connectedToDestination(ctx)).toHaveLength(1)
          expect(connectedToDestination(ctx)[0]).toBe(limitersOf(ctx)[0].connections[0])
          // Each toll is one set of 5 partials.
          for (const t of a.tolls) expect(t.freqs).toHaveLength(SOUND_CONFIG.bellRatios.length)

          engine.disable()
          vi.advanceTimersByTime(1000)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('soundEngine: volume limits hold', () => {
  const EPS = 1e-9

  const maxGain = (nodes: FakeNode[]): number =>
    nodes.reduce((sum, n) => sum + Math.max(0, ...n.gain.events.map((e) => e.value)), 0)

  // Feature: ux-burn-garlic-sound-fixes, Property 8 (amended 4: hard maxima + Limiter)
  // **Validates: Requirements 7.6, 7.13, 7.15, 7.18, 8.5, 8.6, 9.3, 9.4, 10.1, 10.2, 10.3, 10.5, 12.5, 12.11, 16.1**
  //
  // The fake context has no signal processing. These checks assert configured maxima only. They
  // cannot prove the output peak ceiling, the RMS, the Limiter makeup gain or the bell-to-pad
  // ratio; those are measured in Chrome (task 13.3).
  it('Feature: ux-burn-garlic-sound-fixes, Property 8: every configured gain stays at or below its hard maximum', () => {
    fc.assert(
      fc.property(fc.array(commandArb, { maxLength: 40 }), fc.integer(), (commands, seed) => {
        const ctx = new FakeAudioContext({ clock: 'fake-timers' })
        const engine = createSoundEngine({
          factory: () => ctx as unknown as AudioContextLike,
          random: makeRandom(seed),
        })
        engine.enable()

        // Creation order: master [0], ambience bus [1] (limiter and output follow).
        const master = ctx.nodes[0]
        const ambience = ctx.nodes[1]
        const output = limitersOf(ctx)[0].connections[0] as FakeNode

        // Req 10.1 / 7.6 / 16.1: hard maxima.
        expect(master.gain.events[0]).toMatchObject({ kind: 'set' })
        expect(master.gain.events[0].value).toBeLessThanOrEqual(1.0 + EPS)
        const ambPeakCfg = Math.max(...ambience.gain.events.map((e) => e.value))
        expect(ambPeakCfg).toBe(SOUND_CONFIG.ambienceGain)
        expect(ambPeakCfg).toBeLessThanOrEqual(1.0 + EPS)
        expect(ambPeakCfg).toBeGreaterThanOrEqual(0.4 - EPS)
        expect(output.gain.events[0].value).toBeLessThanOrEqual(1.0 + EPS)
        expect(output.gain.events[0].value).toBeGreaterThanOrEqual(0.4 - EPS)

        // Layer buses carry the Layer_Shares: each <= 1.0, no sum rule (Req 7.13).
        const buses = ctx.nodes.filter((n) => n.kind === 'gain' && n.connections.includes(ambience))
        expect(buses).toHaveLength(4)
        const shares = buses.map((b) => b.gain.events[0].value)
        expect(shares).toEqual([0.5, 0.12, 0.7, 0.08])
        for (const sh of shares) expect(sh).toBeLessThanOrEqual(1.0 + EPS)
        // Pad alone (master x bus x pad share) is within 0.15..0.40.
        const padAlone = master.gain.events[0].value * ambPeakCfg * shares[0]
        expect(padAlone).toBeGreaterThanOrEqual(0.15 - EPS)
        expect(padAlone).toBeLessThanOrEqual(0.4 + EPS)

        const now = () => ctx.currentTime
        for (const c of commands) {
          const before = ctx.nodes.length
          const t = now()

          if (c.cmd === 'advance') {
            vi.advanceTimersByTime(c.ms)
            continue
          }
          runCommand(engine, c)
          const created = ctx.nodes.slice(before)
          let voiceStarted = false

          if (c.cmd === 'playStake' && created.length > 0) {
            const gains = created.filter((n) => n.kind === 'gain' && n.connections.includes(master))
            const peak = maxGain(gains)
            expect(peak).toBeLessThanOrEqual(0.3 + EPS) // Req 10.3
            expect(peak).toBeCloseTo(SOUND_CONFIG.stakeGain, 9) // unscaled
            voiceStarted = true
          } else if (c.cmd === 'playChime' && created.length > 0) {
            const gains = created.filter((n) => n.kind === 'gain')
            expect(maxGain(gains)).toBeLessThanOrEqual(0.18 + EPS) // Req 9.4
            for (const o of created.filter((n) => n.kind === 'oscillator')) {
              expect(o.stopCalls.length).toBeGreaterThan(0)
              for (const s of o.stopCalls) expect(s!).toBeLessThanOrEqual(t + 1.5 + EPS) // Req 9.3
            }
            voiceStarted = true
          } else if (c.cmd === 'startCrackle' && created.length > 0) {
            const bus = created.find((n) => n.kind === 'gain')!
            const peak = Math.max(...bus.gain.events.map((e) => e.value))
            expect(peak).toBeLessThanOrEqual(0.2 + EPS) // Req 8.5
            if (c.reducedMotion) expect(peak).toBeLessThanOrEqual(0.1 + EPS) // Req 8.6
            voiceStarted = true
          }
          if (voiceStarted) {
            // While a voice plays the bus is ducked: below the bus and at most half of it (Req 10.2).
            const last = ambience.gain.events[ambience.gain.events.length - 1]
            expect(last.value).toBeLessThan(ambPeakCfg)
            expect(last.value).toBeLessThanOrEqual(0.5 * ambPeakCfg + EPS)
            expect(last.value).toBeLessThanOrEqual(SOUND_CONFIG.ambienceDuckedGain + EPS)
          }
        }

        // Let several chords, gusts and (usually) a bell and a detail play, then check per-layer peaks.
        engine.setDocumentHidden(false)
        vi.advanceTimersByTime(150000)
        const a = analyse(ctx)

        // Pad: chord envelope peak <= 0.5 and at most two chords at once -> <= 1.0 of the pad share.
        for (const chord of a.chords) expect(chord.peak).toBeLessThanOrEqual(SOUND_CONFIG.padChordPeak + EPS)
        // The voice gains of one chord add up to padCrestFactor (hard max 3.0).
        for (const cg of ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e.kind === 'curve'))) {
          const voiceGains = ctx.nodes.filter(
            (n) => n.kind === 'gain' && n.connections.includes(cg) && n.gain.events.every((e) => e.kind === 'set'),
          )
          const total = voiceGains.reduce((sum, g) => sum + g.gain.events[0].value, 0)
          expect(total).toBeCloseTo(SOUND_CONFIG.padCrestFactor, 6)
          expect(total).toBeLessThanOrEqual(3.0 + EPS)
          expect(total).toBeGreaterThanOrEqual(1.0 - EPS)
        }
        // Wind gate peak <= 1.0.
        expect(Math.max(...a.gate.gain.events.map((e) => e.value))).toBeLessThanOrEqual(1.0 + EPS)
        // Bell: partial peaks sum to at most bellDrySum (<= 2.0); feedback <= 0.5 so the tail decays.
        expect(a.feedback.gain.events[0].value).toBeLessThanOrEqual(0.5 + EPS)
        for (const toll of a.tolls) {
          const dry = toll.peaks.reduce((x, y) => x + y, 0)
          expect(dry).toBeLessThanOrEqual(SOUND_CONFIG.bellDrySum + EPS)
          expect(dry).toBeLessThanOrEqual(2.0 + EPS)
        }
        // Detail: each envelope peak <= 1.0.
        for (const p of a.detailPeaks) expect(p).toBeLessThanOrEqual(1.0 + EPS)

        engine.disable()
        vi.advanceTimersByTime(1000)
      }),
      { numRuns: 100 },
    )
  })
})

describe('soundEngine: audible band', () => {
  // Feature: ux-burn-garlic-sound-fixes, Property 13 (amended 2)
  // **Validates: Requirements 7.11, 7.12, 7.14, 7.15, 7.16, 8.8, 10.6, 12.12, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6**
  it('Feature: ux-burn-garlic-sound-fixes, Property 13: Audible band: nothing below 100 Hz, no LFO, wind Q/centre, Chord_Set, bell partials, delay and feedback', () => {
    fc.assert(
      fc.property(
        fc.array(longCommandArb, { maxLength: 15 }),
        randomSpecArb,
        (commands, spec) => {
          const { engine, ctxs } = makeHarness(toRandom(spec))
          engine.enable()
          // Make sure stake, crackle (both modes) and chime are all exercised.
          engine.playStake()
          engine.playChime()
          engine.startCrackle({ reducedMotion: false })
          vi.advanceTimersByTime(300)
          engine.stopCrackle()
          vi.advanceTimersByTime(500)
          engine.startCrackle({ reducedMotion: true })
          vi.advanceTimersByTime(300)
          for (const c of commands) runCommand(engine, c)
          // Long visible tail: chords, gusts, bells and details all happen.
          engine.stopCrackle()
          engine.setDocumentHidden(false)
          vi.advanceTimersByTime(120000)

          const ctx = ctxs[0]
          const a = analyse(ctx)
          const oscs = oscillatorsOf(ctx)
          const filters = ctx.nodes.filter((n) => n.kind === 'biquad')
          const min = SOUND_CONFIG.minAudioHz

          // Every oscillator: all frequency values (set + ramp targets) >= 100; so no LFO, nothing at <= 1 Hz.
          expect(oscs.length).toBeGreaterThanOrEqual(3)
          for (const o of oscs) {
            expect(o.frequency.events.length).toBeGreaterThan(0)
            for (const e of o.frequency.events) expect(e.value).toBeGreaterThanOrEqual(min)
            // Oscillators never drive a param (no modulation wiring at all).
            expect(o.paramConnections).toHaveLength(0)
          }
          // Every filter frequency value / ramp target >= 100.
          for (const f of filters) {
            for (const e of f.frequency.events) expect(e.value).toBeGreaterThanOrEqual(min)
          }

          // Wind band-pass: Q 8..14, every centre value 350..900, the only looping source feeds it.
          expect(a.windNoise.loop).toBe(true)
          expect(a.windBandpass.Q.events.length).toBeGreaterThan(0)
          for (const e of a.windBandpass.Q.events) {
            expect(e.value).toBeGreaterThanOrEqual(8)
            expect(e.value).toBeLessThanOrEqual(14)
          }
          for (const e of a.windBandpass.frequency.events) {
            expect(e.value).toBeGreaterThanOrEqual(350)
            expect(e.value).toBeLessThanOrEqual(900)
          }
          expect(a.gusts.length).toBeGreaterThan(0)

          // Pad: every voice belongs to a chord of the Chord_Set (body notes plus chordUpper), all >= 100 Hz.
          expect(a.chords.length).toBeGreaterThan(0)
          for (const chord of a.chords) {
            expect(chord.name).toBeDefined()
            const allowed = [
              ...SOUND_CONFIG.chordSet[chord.name as keyof typeof SOUND_CONFIG.chordSet],
              ...SOUND_CONFIG.chordUpper[chord.name as keyof typeof SOUND_CONFIG.chordUpper],
            ]
            for (const f of chord.freqs) expect(allowed).toContain(f)
            for (const f of chord.freqs) expect(f).toBeGreaterThanOrEqual(min)
          }

          // Bell: partial i = base x ratio_i with base 220..330 Hz.
          for (const toll of a.tolls) {
            const base = toll.freqs[0]
            expect(base).toBeGreaterThanOrEqual(SOUND_CONFIG.bellBaseHz[0])
            expect(base).toBeLessThanOrEqual(SOUND_CONFIG.bellBaseHz[1])
            SOUND_CONFIG.bellRatios.forEach((ratio, i) => expect(toll.freqs[i]).toBeCloseTo(base * ratio, 6))
          }
          // Bell delay 0.12..0.2 s, feedback <= 0.5.
          for (const e of a.delay.delayTime.events) {
            expect(e.value).toBeGreaterThanOrEqual(0.12)
            expect(e.value).toBeLessThanOrEqual(0.2)
          }
          expect(a.delay.delayTime.events.length).toBeGreaterThan(0)
          for (const e of a.feedback.gain.events) expect(e.value).toBeLessThanOrEqual(0.5)

          engine.disable()
          vi.advanceTimersByTime(1000)
        },
      ),
      { numRuns: 100 },
    )
  }, 120000)
})

describe('soundEngine: pad changes chord over time and is musical', () => {
  // Feature: ux-burn-garlic-sound-fixes, Property 14
  // **Validates: Requirements 7.12, 7.14, 7.18, 12.14, 15.5**
  function checkPad(spec: RandomSpec) {
    const { engine, ctxs } = makeHarness(toRandom(spec))
    engine.enable()
    vi.advanceTimersByTime(120000)
    const ctx = ctxs[0]
    const { chords } = analyse(ctx)
    const cfg = SOUND_CONFIG
    const EPS = 1e-6

    expect(chords.length).toBeGreaterThanOrEqual(20)
    // The Pad lowpass cutoff equals padLowpassHz.
    expect(ctx.nodes.find((n) => n.kind === 'biquad' && n.type === 'lowpass' && n.frequency.events[0].value === cfg.padLowpassHz)).toBeDefined()
    // Every voice is in the Chord_Set and >= 100 Hz; each group matches exactly one chord.
    for (const c of chords) {
      expect(c.name).toBeDefined()
      expect(c.freqs).toHaveLength(10) // 4 sine + 4 triangle body voices + 2 sine upper voices
      const uppers = cfg.chordUpper[c.name as keyof typeof cfg.chordUpper]
      expect(c.freqs.filter((f) => (uppers as readonly number[]).includes(f))).toHaveLength(2)
      for (const f of c.freqs) expect(f).toBeGreaterThanOrEqual(cfg.minAudioHz)
      // Voice mix: 4 sine + 4 triangle body voices and 2 sine upper voices (415..880 Hz, detune <= 10 cents).
      expect(c.types.filter((t) => t === 'sine')).toHaveLength(6)
      expect(c.types.filter((t) => t === 'triangle')).toHaveLength(4)
      c.freqs.forEach((f, i) => {
        if ((uppers as readonly number[]).includes(f)) {
          expect(c.types[i]).toBe('sine')
          expect(f).toBeGreaterThanOrEqual(415)
          expect(f).toBeLessThanOrEqual(880)
        }
      })
      // The voice gains of one chord add up to padCrestFactor.
      expect(c.gainSum).toBeCloseTo(cfg.padCrestFactor, 6)
      // Detune |cents| <= 10 (configured 3..8).
      for (const d of c.detunes) {
        expect(Math.abs(d)).toBeLessThanOrEqual(10)
        expect(Math.abs(d)).toBeGreaterThanOrEqual(cfg.padDetuneCents[0] - EPS)
        expect(Math.abs(d)).toBeLessThanOrEqual(cfg.padDetuneCents[1] + EPS)
      }
      // Envelope 6..10 s, peak <= 0.5.
      expect(c.duration).toBeGreaterThanOrEqual(cfg.padChordSec[0] - EPS)
      expect(c.duration).toBeLessThanOrEqual(cfg.padChordSec[1] + EPS)
      expect(c.peak).toBeLessThanOrEqual(cfg.padChordPeak + EPS)
    }
    // At least 3 distinct chords.
    expect(new Set(chords.map((c) => c.name)).size).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < chords.length; i++) {
      // Consecutive chords differ, a tritone never follows a tritone.
      expect(chords[i].name).not.toBe(chords[i - 1].name)
      // Real crossfade: the next chord starts before the previous one ends.
      expect(chords[i].start).toBeLessThan(chords[i - 1].start + chords[i - 1].duration)
      expect(chords[i].start).toBeGreaterThan(chords[i - 1].start)
    }
    // Never more than 2 chords at an instant (2 ms tolerance for whole-millisecond timers).
    for (const c of chords) {
      const n = chords.filter((o) => o.start <= c.start + EPS && c.start < o.start + o.duration - 0.002).length
      expect(n).toBeLessThanOrEqual(cfg.padMaxConcurrent)
    }
    engine.disable()
    vi.advanceTimersByTime(1000)
    return chords
  }

  it('Feature: ux-burn-garlic-sound-fixes, Property 14: holds for constant and seeded random sources', () => {
    fc.assert(fc.property(randomSpecArb, (spec) => void checkPad(spec)), { numRuns: 100 })
  })

  it('Feature: ux-burn-garlic-sound-fixes, Property 14: random 0.999999 never picks the tritone and plays Dm, Bb, Gm, A in order', () => {
    const chords = checkPad({ kind: 'const', value: JUST_BELOW_ONE })
    const names = chords.map((c) => c.name)
    expect(new Set(names)).toEqual(new Set(['Dm', 'Bb', 'Gm', 'A']))
    names.forEach((n, i) => expect(n).toBe(SOUND_CONFIG.progression[i % 4]))
  })

  it('Feature: ux-burn-garlic-sound-fixes, Property 14: random 0 picks the tritone as colour but never twice in a row', () => {
    const chords = checkPad({ kind: 'const', value: 0 })
    expect(chords.some((c) => c.name === 'tri')).toBe(true)
  })
})

describe('soundEngine: events are scheduled within their intervals', () => {
  const cfg = SOUND_CONFIG
  const SIM_SEC = 600
  const EPS = 1e-6

  function simulate(spec: RandomSpec) {
    const { engine, ctxs } = makeHarness(toRandom(spec))
    engine.enable()
    vi.advanceTimersByTime(SIM_SEC * 1000)
    const a = analyse(ctxs[0])
    engine.disable()
    vi.advanceTimersByTime(1000)
    return a
  }

  // Feature: ux-burn-garlic-sound-fixes, Property 15
  // **Validates: Requirements 7.11, 7.15, 7.16, 7.17, 12.14**
  // 600 s of fake time per run with 100 runs stays cheap here (timers only), so all 100 runs are kept.
  it('Feature: ux-burn-garlic-sound-fixes, Property 15: gaps and counts per layer stay within their intervals', () => {
    fc.assert(
      fc.property(randomSpecArb, (spec) => {
        const a = simulate(spec)
        const check = (starts: number[], [min, max]: readonly number[]) => {
          for (const g of gapsOf(starts)) {
            expect(g).toBeGreaterThanOrEqual(min - EPS)
            expect(g).toBeLessThan(max + EPS)
          }
          expect(starts.length).toBeGreaterThanOrEqual(Math.floor(SIM_SEC / max))
          expect(starts.length).toBeLessThanOrEqual(Math.floor(SIM_SEC / min))
          return gapsOf(starts)
        }
        const gustGaps = check(a.gusts.map((g) => g.start), cfg.gustGapSec)
        const bellGaps = check(a.tolls.map((t) => t.start), cfg.bellGapSec)
        const detailGaps = check(a.details.map((d) => d.start), cfg.detailGapSec)
        // Counts in 600 s: gusts 30..75, bells 13..24, details 6..15.
        expect(a.gusts.length).toBeGreaterThanOrEqual(30)
        expect(a.gusts.length).toBeLessThanOrEqual(75)
        expect(a.tolls.length).toBeGreaterThanOrEqual(13)
        expect(a.tolls.length).toBeLessThanOrEqual(24)
        expect(a.details.length).toBeGreaterThanOrEqual(6)
        expect(a.details.length).toBeLessThanOrEqual(15)
        // A gust never overlaps the next one.
        for (let i = 1; i < a.gusts.length; i++) expect(a.gusts[i - 1].end).toBeLessThan(a.gusts[i].start)

        if (spec.kind === 'const' && spec.value === 0) {
          // Exactly the minimum gaps, and below 0.5 always picks the owl.
          for (const g of gustGaps) expect(g).toBeCloseTo(cfg.gustGapSec[0], 6)
          for (const g of bellGaps) expect(g).toBeCloseTo(cfg.bellGapSec[0], 6)
          for (const g of detailGaps) expect(g).toBeCloseTo(cfg.detailGapSec[0], 6)
        }
        if (spec.kind === 'const' && spec.value === JUST_BELOW_ONE) {
          // Just under the maximum (whole-millisecond timers round the delay down).
          for (const g of gustGaps) expect(g).toBeGreaterThan(cfg.gustGapSec[1] - 0.01)
          for (const g of bellGaps) expect(g).toBeGreaterThan(cfg.bellGapSec[1] - 0.01)
          for (const g of detailGaps) expect(g).toBeGreaterThan(cfg.detailGapSec[1] - 0.01)
        }
        if (spec.kind === 'const' && spec.value < 0.5) {
          for (const d of a.details) expect(d.kind).toBe('owl')
        }
        if (spec.kind === 'const' && spec.value >= 0.5) {
          for (const d of a.details) expect(d.kind).toBe('creak')
        }
      }),
      { numRuns: 100 },
    )
  })

  it('Feature: ux-burn-garlic-sound-fixes, Property 15: seeded runs produce both owl hoots and wood creaks', () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed <= 6; seed++) {
      for (const d of simulate({ kind: 'seed', seed }).details) kinds.add(d.kind)
    }
    expect(kinds).toEqual(new Set(['owl', 'creak']))
  })
})

describe('soundEngine: wind has no steady bed', () => {
  // Feature: ux-burn-garlic-sound-fixes, Property 16
  // **Validates: Requirements 7.11, 7.17, 12.14**
  it('Feature: ux-burn-garlic-sound-fixes, Property 16: gate gain is <= 0.02 outside gusts and > 0.1 during each gust', () => {
    fc.assert(
      fc.property(randomSpecArb, (spec) => {
        const { engine, ctxs } = makeHarness(toRandom(spec))
        engine.enable()
        const SIM = 300
        vi.advanceTimersByTime(SIM * 1000)
        const ctx = ctxs[0]
        const a = analyse(ctx)
        const value = gainTimeline(a.gate.gain)
        expect(a.gusts.length).toBeGreaterThan(0)

        // The wind noise is the only looping source and always runs through the gate.
        const loops = ctx.nodes.filter((n) => n.kind === 'bufferSource' && n.loop === true)
        expect(loops).toHaveLength(1)
        expect(loops[0]).toBe(a.windNoise)
        const seen = new Set<FakeNode>()
        const stack: FakeNode[] = [a.windNoise]
        while (stack.length > 0) {
          const n = stack.pop()!
          if (seen.has(n)) continue
          seen.add(n)
          for (const d of n.connections) if (d instanceof FakeNode) stack.push(d)
        }
        expect(seen.has(a.gate)).toBe(true)
        expect(a.windNoise.connections).toHaveLength(1)

        const STEP = 0.05
        const insideGust = (t: number) => a.gusts.some((g) => t >= g.start - STEP && t <= g.end + 0.5)
        for (let t = 0; t <= SIM; t += STEP) {
          if (!insideGust(t)) expect(value(t)).toBeLessThanOrEqual(0.02)
        }
        for (const g of a.gusts) {
          let max = 0
          for (let t = g.start; t <= g.end; t += STEP) max = Math.max(max, value(t))
          expect(max).toBeGreaterThan(0.1)
        }
        // Before the first gust the gate is at the floor.
        expect(value(0)).toBeLessThanOrEqual(0.02)
        expect(value(a.gusts[0].start - 0.01)).toBeLessThanOrEqual(0.02)

        engine.disable()
        vi.advanceTimersByTime(1000)
      }),
      { numRuns: 100 },
    )
  })
})

describe('soundEngine: crackle lifecycle is balanced', () => {
  type CrackleStep =
    | { op: 'start'; reducedMotion: boolean }
    | { op: 'stop' }
    | { op: 'advance'; ms: number }

  const stepArb: fc.Arbitrary<CrackleStep> = fc.oneof(
    fc.boolean().map<CrackleStep>((reducedMotion) => ({ op: 'start', reducedMotion })),
    fc.constant<CrackleStep>({ op: 'stop' }),
    fc.integer({ min: 0, max: 1000 }).map<CrackleStep>((ms) => ({ op: 'advance', ms })),
  )

  // Feature: ux-burn-garlic-sound-fixes, Property 10 (baseline no longer depends on the total node count)
  // **Validates: Requirements 8.1, 8.2, 12.6**
  it('Feature: ux-burn-garlic-sound-fixes, Property 10: start is idempotent while active; stop + fade leaves no crackle timers and releases all crackle nodes', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), fc.integer(), (steps, seed) => {
        const { engine, ctxs } = makeHarness(seed)
        engine.enable()
        const ctx = ctxs[0]
        const master = ctx.nodes[0]
        const ambienceBus = ctx.nodes[1]
        const buses: FakeNode[] = []
        let active = false

        for (const step of steps) {
          if (step.op === 'advance') {
            vi.advanceTimersByTime(step.ms)
          } else if (step.op === 'stop') {
            engine.stopCrackle()
            active = false
          } else {
            const before = ctx.nodes.length
            engine.startCrackle({ reducedMotion: step.reducedMotion })
            if (active) {
              // Req 8.1: no second crackle instance while active (no timer fires inside this call).
              expect(ctx.nodes.length).toBe(before)
            } else {
              const created = ctx.nodes.slice(before)
              const crackleBuses = created.filter((n) => n.kind === 'gain' && n.connections.includes(master))
              expect(crackleBuses).toHaveLength(1)
              expect(crackleBuses[0]).not.toBe(ambienceBus)
              buses.push(crackleBuses[0])
              active = true
            }
          }
        }

        engine.stopCrackle()
        vi.advanceTimersByTime(SOUND_CONFIG.crackleFadeOutMs + 200)

        // Only the crackle's own nodes are checked: everything that feeds a crackle bus, and the buses.
        const crackleNodes = ctx.nodes.filter((n) => buses.some((b) => n === b || reaches(n, b)))
        for (const bus of buses) expect(bus.disconnectCalls).toBeGreaterThan(0)
        for (const n of crackleNodes) {
          expect(n.disconnectCalls).toBeGreaterThan(0)
          if (n.startCalls.length > 0) expect(n.stopCalls.length).toBeGreaterThan(0)
        }
        // No new crackle burst after stop + fade.
        const burstCount = () => ctx.nodes.filter((n) => n.kind === 'bufferSource' && buses.some((b) => reaches(n, b))).length
        const settled = burstCount()
        vi.advanceTimersByTime(2000)
        expect(burstCount()).toBe(settled)

        // Ambience timers exist while enabled; after disable() none remain.
        engine.disable()
        vi.advanceTimersByTime(1000)
        expect(vi.getTimerCount()).toBe(0)
      }),
      { numRuns: 100 },
    )
  })

  it('Feature: ux-burn-garlic-sound-fixes, Property 10: startCrackle makes noise bursts over time and none after stop + fade', () => {
    const { engine, ctxs } = makeHarness(7)
    engine.enable()
    const ctx = ctxs[0]
    const master = ctx.nodes[0]
    const bursts = () =>
      ctx.nodes.filter(
        (n) =>
          n.kind === 'bufferSource' &&
          n.startCalls.length > 0 &&
          ctx.nodes.some((b) => b.kind === 'gain' && b.connections.includes(master) && b !== ctx.nodes[1] && reaches(n, b)),
      ).length

    expect(bursts()).toBe(0)
    engine.startCrackle({ reducedMotion: false })
    vi.advanceTimersByTime(300)
    const afterFirst = bursts()
    expect(afterFirst).toBeGreaterThan(0)
    vi.advanceTimersByTime(300)
    expect(bursts()).toBeGreaterThan(afterFirst)

    engine.stopCrackle()
    vi.advanceTimersByTime(SOUND_CONFIG.crackleFadeOutMs + 100)
    const settled = bursts()
    vi.advanceTimersByTime(2000)
    expect(bursts()).toBe(settled)
    engine.disable()
    vi.advanceTimersByTime(1000)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('soundEngine: unsupported Web Audio is harmless', () => {
  type Step = Command | { cmd: 'enable' } | { cmd: 'disable' }
  type FactoryMode = 'null' | 'throws' | 'ctxThrows'

  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    commandArb,
    fc.constant<Step>({ cmd: 'enable' }),
    fc.constant<Step>({ cmd: 'disable' }),
  )

  /** A context whose create* methods all throw. */
  function makeThrowingContext(): AudioContextLike {
    const ctx = new FakeAudioContext()
    const boom = (): never => {
      throw new Error('create* unsupported')
    }
    ctx.createGain = boom
    ctx.createOscillator = boom
    ctx.createBufferSource = boom
    ctx.createBiquadFilter = boom
    ctx.createBuffer = boom
    ctx.createDelay = boom
    ctx.createDynamicsCompressor = boom
    return ctx as unknown as AudioContextLike
  }

  function makeFactory(mode: FactoryMode) {
    return vi.fn((): AudioContextLike | null => {
      if (mode === 'null') return null
      if (mode === 'throws') throw new Error('AudioContext blocked')
      return makeThrowingContext()
    })
  }

  // Feature: ux-burn-garlic-sound-fixes, Property 11
  // **Validates: Requirements 6.8**
  it('Feature: ux-burn-garlic-sound-fixes, Property 11: no method throws and isEnabled() stays false when Web Audio is unavailable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<FactoryMode>('null', 'throws', 'ctxThrows'),
        fc.array(stepArb, { maxLength: 40 }),
        fc.integer(),
        (mode, steps, seed) => {
          const factory = makeFactory(mode)
          const engine = createSoundEngine({ factory, random: makeRandom(seed) })

          expect(() => {
            for (const step of steps) {
              if (step.cmd === 'enable') engine.enable()
              else if (step.cmd === 'disable') engine.disable()
              else runCommand(engine, step)
              // No audio nodes exist, so the engine must never claim to be enabled.
              expect(engine.isEnabled()).toBe(false)
            }
            vi.advanceTimersByTime(5000)
          }).not.toThrow()

          expect(engine.isEnabled()).toBe(false)
          expect(vi.getTimerCount()).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  // Feature: ux-burn-garlic-sound-fixes, Property 11 (amended 4)
  // **Validates: Requirements 6.8, 16.7**
  it('Feature: ux-burn-garlic-sound-fixes, Property 11: a context that cannot create the Limiter leaves the engine silent with nothing connected to the destination', () => {
    for (const mode of ['missing', 'throws'] as const) {
      const ctx = new FakeAudioContext({ clock: 'fake-timers' })
      if (mode === 'missing') {
        ;(ctx as unknown as { createDynamicsCompressor?: unknown }).createDynamicsCompressor = undefined
      } else {
        ctx.createDynamicsCompressor = () => {
          throw new Error('no compressor')
        }
      }
      const engine = createSoundEngine({ factory: () => ctx as unknown as AudioContextLike, random: makeRandom(1) })
      expect(() => {
        engine.enable()
        engine.playStake()
        engine.playChime()
        engine.startCrackle({ reducedMotion: false })
        vi.advanceTimersByTime(60000)
      }).not.toThrow()
      expect(engine.isEnabled()).toBe(false)
      expect(connectedToDestination(ctx)).toHaveLength(0)
      expect(ctx.nodes.some((n) => n.kind === 'oscillator' || n.kind === 'bufferSource')).toBe(false)
      expect(ctx.closeCalls).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  // Feature: ux-burn-garlic-sound-fixes, Property 11
  // **Validates: Requirements 6.8**
  it('Feature: ux-burn-garlic-sound-fixes, Property 11: defaultAudioContextFactory returns null when window.AudioContext is undefined', async () => {
    vi.stubGlobal('window', { AudioContext: undefined, webkitAudioContext: undefined })
    try {
      const { defaultAudioContextFactory } = await import('../src/audio/audioContextFactory')
      expect(defaultAudioContextFactory()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('soundEngine: master Limiter', () => {
  // Feature: ux-burn-garlic-sound-fixes, Property 17
  // **Validates: Requirements 7.8, 10.1, 12.15, 16.1, 16.2, 16.3, 16.4, 16.6, 16.7, 16.8**
  //
  // The fake context has no signal processing: it can show the node, its configured parameters and the
  // wiring, but not the output peak ceiling, the RMS, the makeup gain or the bell-to-pad ratio (Req 16.8).
  // Those are measured in Chrome in task 13.3.
  it('Feature: ux-burn-garlic-sound-fixes, Property 17: Limiter is the last stage before the destination, configured, and released on disable', () => {
    fc.assert(
      fc.property(fc.array(longCommandArb, { maxLength: 20 }), fc.integer({ min: 0, max: 60000 }), fc.integer(), (commands, warmMs, seed) => {
        const { engine, ctxs } = makeHarness(seed)
        engine.enable()
        const ctx = ctxs[0]
        const lim = SOUND_CONFIG.limiter

        // Creation order: master, bus, Limiter, Output_Gain.
        expect(ctx.nodes.slice(0, 4).map((n) => n.kind)).toEqual(['gain', 'gain', 'compressor', 'gain'])
        const [master, bus, limiter, output] = ctx.nodes
        expect(limitersOf(ctx)).toEqual([limiter])

        // Parameters equal SOUND_CONFIG and lie in the allowed ranges.
        const first = (p: FakeParam): number => p.events[0].value
        expect(first(limiter.threshold)).toBe(lim.thresholdDb)
        expect(first(limiter.knee)).toBe(lim.kneeDb)
        expect(first(limiter.ratio)).toBe(lim.ratio)
        expect(first(limiter.attack)).toBe(lim.attackSec)
        expect(first(limiter.release)).toBe(lim.releaseSec)
        expect(first(limiter.threshold)).toBeGreaterThanOrEqual(-12)
        expect(first(limiter.threshold)).toBeLessThanOrEqual(-6)
        expect(first(limiter.knee)).toBeLessThanOrEqual(3)
        expect(first(limiter.ratio)).toBeGreaterThanOrEqual(12)
        expect(first(limiter.ratio)).toBeLessThanOrEqual(20)
        expect(first(limiter.attack)).toBeGreaterThanOrEqual(0.001)
        expect(first(limiter.attack)).toBeLessThanOrEqual(0.005)
        expect(first(limiter.release)).toBeGreaterThanOrEqual(0.1)
        expect(first(limiter.release)).toBeLessThanOrEqual(0.25)
        expect(first(output.gain)).toBe(SOUND_CONFIG.limiterOutputGain)
        expect(first(output.gain)).toBeLessThanOrEqual(1.0)

        // Wiring: bus -> master -> Limiter -> Output_Gain -> destination, and nothing else on the last hop.
        expect(bus.connections).toEqual([master])
        expect(master.connections).toEqual([limiter])
        expect(limiter.connections).toEqual([output])
        expect(output.connections).toEqual([ctx.destination])

        for (const c of commands) runCommand(engine, c)
        engine.playStake()
        engine.playChime()
        engine.startCrackle({ reducedMotion: false })
        vi.advanceTimersByTime(warmMs + 500)

        // Still exactly one Limiter; only the Output_Gain connects to the destination; every
        // sound source reaches the destination only through master, Limiter and Output_Gain.
        expect(limitersOf(ctx)).toHaveLength(1)
        expect(connectedToDestination(ctx)).toEqual([output])
        const sources = ctx.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource')
        expect(sources.length).toBeGreaterThan(0)
        for (const src of sources) {
          if (src.disconnectCalls > 0) continue // already released one-shots
          expect(reaches(src, master)).toBe(true)
          expect(reaches(master, limiter)).toBe(true)
          expect(reaches(limiter, output)).toBe(true)
          expect(reaches(output, ctx.destination)).toBe(true)
        }
        for (const n of ctx.nodes) {
          if (n === output) continue
          expect(n.connections).not.toContain(ctx.destination)
        }

        // Disable: master and output ramp to 0 within 80 ms, then everything is released.
        const t0 = ctx.currentTime
        engine.disable()
        const limit = t0 + SOUND_CONFIG.stopRampMs / 1000 + 1e-9
        for (const g of [master, output]) {
          expect(g.gain.events.some((e) => e.kind === 'linear' && e.value === 0 && e.time <= limit)).toBe(true)
        }
        vi.advanceTimersByTime(5000)
        expect(limiter.disconnectCalls).toBeGreaterThan(0)
        expect(output.disconnectCalls).toBeGreaterThan(0)
        expect(vi.getTimerCount()).toBe(0)
        expect(ctx.closeCalls).toBe(1)
      }),
      { numRuns: 50 },
    )
  })

  it('Feature: ux-burn-garlic-sound-fixes, Property 17: re-enable after disable builds a fresh Limiter chain', () => {
    const { engine, ctxs } = makeHarness(3)
    engine.enable()
    vi.advanceTimersByTime(2000)
    engine.disable()
    vi.advanceTimersByTime(1000)
    engine.enable()
    expect(ctxs).toHaveLength(2)
    const [first, second] = ctxs
    const oldLimiter = limitersOf(first)[0]
    const newLimiters = limitersOf(second)
    expect(newLimiters).toHaveLength(1)
    expect(newLimiters[0]).not.toBe(oldLimiter)
    expect(second.nodes.slice(0, 4).map((n) => n.kind)).toEqual(['gain', 'gain', 'compressor', 'gain'])
    expect(newLimiters[0].threshold.events[0].value).toBe(SOUND_CONFIG.limiter.thresholdDb)
    expect(connectedToDestination(second)).toEqual([second.nodes[3]])
    engine.disable()
    vi.advanceTimersByTime(1000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
