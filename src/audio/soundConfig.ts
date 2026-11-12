export const SOUND_CONFIG = {
  masterGain: 0.9, // Req 10.1 (<= 1.0)
  ambienceGain: 0.6, // Req 7.6 (hard max 1.0), amended 4
  ambienceDuckedGain: 0.24, // Req 10.2 (<= 0.5 x ambienceGain), used while crackle, chime or stake play
  ambienceFadeInMs: 800, // Req 7.7 (>= 500)
  crackleGain: 0.2, // Req 8.5 (<= 0.2)
  crackleReducedFactor: 0.5, // Req 8.6
  crackleFadeOutMs: 300, // Req 8.2 (<= 400)
  chimeGain: 0.18, // Req 9.4 (<= 0.18)
  chimeMaxMs: 1500, // Req 9.3
  stakeGain: 0.3, // Req 10.3 (<= 0.3)
  stopRampMs: 80, // Req 6.4 / 7.8 (<= 100)
  // Amendment 4: master Limiter (DynamicsCompressor) + Output_Gain replace the summed-peak cap.
  outputPeakTarget: 0.5, // measured contract at the Output_Gain output (Req 16.5)
  outputPeakTolerance: 1.1, // isolated transient samples up to 0.55
  limiter: { thresholdDb: -8, kneeDb: 2, ratio: 20, attackSec: 0.003, releaseSec: 0.2 },
  limiterOutputGain: 0.6, // hard max 1.0; offsets the compressor's automatic makeup gain
  // Amended: audible on small speakers. Hz unless noted.
  layerShares: { pad: 0.5, wind: 0.12, bell: 0.7, detail: 0.08 }, // each <= 1.0, no sum rule
  chordSet: {
    // Hz, every value >= 100 (inversions / upper voicings)
    Dm: [146.83, 174.61, 220.0, 293.66], // D3 F3 A3 D4
    Bb: [116.54, 146.83, 174.61, 233.08], // Bb2 D3 F3 Bb3
    Gm: [196.0, 233.08, 293.66, 392.0], // G3 Bb3 D4 G4
    A: [110.0, 164.81, 220.0, 277.18], // A2 E3 A3 C#4
    tri: [146.83, 174.61, 207.65, 261.63], // D F Ab C, tritone colour
  },
  progression: ['Dm', 'Bb', 'Gm', 'A'],
  tritoneChance: 0.12, // never in two consecutive slots
  padDetuneCents: [3, 8], // |cents| <= 10; sine +c, triangle -c
  padChordSec: [6, 10], // envelope length of one chord
  padStartFraction: 0.5, // next chord starts at >= 0.5 x current length
  padMaxConcurrent: 2,
  padChordPeak: 0.5, // 2 x 0.5 = 1.0 of the pad share
  chordUpper: {
    // Hz, soft sine upper voices per chord (amendment 4)
    Dm: [587.33, 880.0],
    Bb: [466.16, 698.46],
    Gm: [587.33, 783.99],
    A: [659.25, 880.0],
    tri: [415.3, 523.25],
  },
  padUpperWeight: 0.45, // relative to 1.0 for one body note
  padCrestFactor: 2.8, // coherent sum of one chord's voice gains (hard max 3.0)
  padLowpassHz: 2500,
  gustGapSec: [8, 20],
  gustRiseSec: [2, 3.5],
  gustFallSec: [2.5, 4], // total <= 7.5 s < 8 s
  gustSweepHz: [350, 900, 400], // start, peak, end of the centre sweep
  gustQ: [8, 14],
  gustPeak: [0.6, 1.0], // gate gain peak, times the wind share
  gustMakeup: 20, // scaled with the wind share 0.15 -> 0.12 (task 12.2)
  windFloorGain: 0.0001, // gate gain between gusts (<= 0.02 required)
  bellGapSec: [25, 45],
  bellBaseHz: [220, 330],
  bellRatios: [1, 2.0, 2.76, 5.4, 8.9],
  bellShares: [0.4, 0.25, 0.18, 0.1, 0.07], // sum 1.0, scaled by bellDrySum
  bellDecaySec: [4, 6], // base partial; partial i decays bellDecayScale[i] x
  bellDecayScale: [1, 0.8, 0.6, 0.45, 0.3],
  bellDelaySec: 0.16, // within 0.12..0.2
  bellFeedback: 0.4, // <= 0.5
  bellWet: 0.15,
  bellDrySum: 1.8, // hard max 2.0 (amendment 4; feedback stays <= 0.5)
  detailGapSec: [40, 90],
  owlNotesHz: [
    [420, 350],
    [380, 310],
  ],
  creakGlideHz: [160, 260],
  creakQ: 5,
  crackleBandMinHz: 1500, // Req 8.8
  crackleBandMaxHz: 4000,
  crackleQ: 0.8,
  stakeStartHz: 300, // Req 10.6
  stakeEndHz: 120,
  stakeBodyHz: 700,
  stakeShares: { low: 0.5, body: 0.3, crack: 0.2 }, // sum 1.0
  stakeCrackHz: 2000,
  minAudioHz: 100, // Req 15.1/15.2, asserted by tests
} as const
