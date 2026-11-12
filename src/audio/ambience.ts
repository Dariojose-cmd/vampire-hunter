import type { AudioContextLike } from './soundEngine'
import { SOUND_CONFIG } from './soundConfig'
import { createPadLayer } from './padLayer'
import { createWindLayer } from './windLayer'
import { createBellLayer } from './bellLayer'
import { createDetailLayer } from './detailLayer'
import { between } from './ambienceUtil'

export interface AmbienceGroup {
  track(node: AudioNode, source?: boolean): void
  release(): void
}

export interface AmbienceHost {
  ctx: AudioContextLike
  /** The ambience bus, already connected to master. */
  bus: GainNode
  random: () => number
  /** Tracked setTimeout; cleared on disable. */
  schedule(fn: () => void, ms: number): void
  /** Long-lived node, released on teardown. */
  track(node: AudioNode, source?: boolean): void
  /** In-flight node group (chord, gust, bell, detail), released on teardown too. */
  openGroup(): AmbienceGroup
  isHidden(): boolean
}

/** Creates a layer bus with its share as gain, connected to the ambience bus. */
export function makeLayerBus(host: AmbienceHost, share: number): GainNode {
  const g = host.ctx.createGain()
  host.track(g)
  g.gain.setValueAtTime(share, host.ctx.currentTime)
  g.connect(host.bus)
  return g
}

/** One tracked timer per layer, re-armed after each fire; hidden fires only re-arm. */
function armLayer(host: AmbienceHost, gap: readonly number[], fire: () => void): void {
  const arm = (): void => {
    host.schedule(() => {
      arm()
      if (host.isHidden()) return
      try {
        fire()
      } catch {
        // Audio must never break the UI.
      }
    }, between(host.random, gap[0], gap[1]) * 1000)
  }
  arm()
}

export function startAmbience(host: AmbienceHost): void {
  const cfg = SOUND_CONFIG
  const pad = createPadLayer(host, makeLayerBus(host, cfg.layerShares.pad))
  const wind = createWindLayer(host, makeLayerBus(host, cfg.layerShares.wind))
  const bell = createBellLayer(host, makeLayerBus(host, cfg.layerShares.bell))
  const detail = createDetailLayer(host, makeLayerBus(host, cfg.layerShares.detail))

  pad.start() // first chord immediately; re-arms its own timer
  armLayer(host, cfg.gustGapSec, wind.gust)
  armLayer(host, cfg.bellGapSec, bell.toll)
  armLayer(host, cfg.detailGapSec, detail.play)
}
