/**
 * SOUND_CONFIG constants stay within the limits of Requirements 7, 8, 10, 12 and 15
 * (amendment 4: hard maxima instead of summed-peak gates).
 */
import { describe, expect, it } from 'vitest';
import { SOUND_CONFIG as C } from '../src/audio/soundConfig';

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const EPS = 1e-9;

describe('SOUND_CONFIG limits', () => {
  it('master gain <= 1.0 (Req 10.1)', () => expect(C.masterGain).toBeLessThanOrEqual(1.0));
  it('ambience fade-in >= 500ms (Req 7.7)', () => expect(C.ambienceFadeInMs).toBeGreaterThanOrEqual(500));
  it('crackle gain <= 0.2 (Req 8.5)', () => expect(C.crackleGain).toBeLessThanOrEqual(0.2));
  it('crackle fade-out <= 400ms (Req 8.2)', () => expect(C.crackleFadeOutMs).toBeLessThanOrEqual(400));
  it('chime gain <= 0.18 (Req 9.4)', () => expect(C.chimeGain).toBeLessThanOrEqual(0.18));
  it('chime duration <= 1500ms (Req 9.3)', () => expect(C.chimeMaxMs).toBeLessThanOrEqual(1500));
  it('stake gain <= 0.3 (Req 10.3)', () => expect(C.stakeGain).toBeLessThanOrEqual(0.3));
  it('stop ramp <= 100ms (Req 6.4 / 7.8)', () => expect(C.stopRampMs).toBeLessThanOrEqual(100));
  it('stake shares sum to 1.0 (Req 10)', () => {
    expect(sum(Object.values(C.stakeShares))).toBeCloseTo(1.0, 9);
  });
});

// Amendment 4: hard maxima only. The fake-context tests and these constants cannot prove the output
// peak ceiling, the RMS, the Limiter makeup gain or the bell-to-pad ratio; those are measured in Chrome (13.3).
describe('SOUND_CONFIG hard maxima (Req 7.6, 7.13, 7.15, 7.18, 10.1, 10.2, 16)', () => {
  it('ambience bus is 0.60 (<= 1.0, >= 0.4) and ducked is 0.24 (below the bus, <= 0.5 x bus)', () => {
    expect(C.ambienceGain).toBe(0.6);
    expect(C.ambienceGain).toBeLessThanOrEqual(1.0);
    expect(C.ambienceGain).toBeGreaterThanOrEqual(0.4);
    expect(C.ambienceDuckedGain).toBe(0.24);
    expect(C.ambienceDuckedGain).toBeLessThan(C.ambienceGain);
    expect(C.ambienceDuckedGain).toBeLessThanOrEqual(0.5 * C.ambienceGain + EPS);
  });
  it('layer shares are pad 0.5, wind 0.12, bell 0.7, detail 0.08, each <= 1.0 (no sum rule)', () => {
    expect(C.layerShares).toEqual({ pad: 0.5, wind: 0.12, bell: 0.7, detail: 0.08 });
    for (const v of Object.values(C.layerShares)) expect(v).toBeLessThanOrEqual(1.0);
  });
  it('pad alone (master x bus x pad share) is within 0.15..0.40', () => {
    const pad = C.masterGain * C.ambienceGain * C.layerShares.pad;
    expect(pad).toBeGreaterThanOrEqual(0.15);
    expect(pad).toBeLessThanOrEqual(0.4);
  });
  it('padCrestFactor is within 1.0..3.0', () => {
    expect(C.padCrestFactor).toBeGreaterThanOrEqual(1.0);
    expect(C.padCrestFactor).toBeLessThanOrEqual(3.0);
  });
  it('pad envelope worst case (concurrent chords x peak) is within the pad share (1.0)', () => {
    expect(C.padMaxConcurrent * C.padChordPeak).toBeLessThanOrEqual(1.0 + EPS);
  });
  it('bellDrySum <= 2.0, bell feedback <= 0.5, bell shares sum to 1.0', () => {
    expect(C.bellDrySum).toBeLessThanOrEqual(2.0);
    expect(C.bellFeedback).toBeLessThanOrEqual(0.5);
    expect(sum(C.bellShares)).toBeCloseTo(1.0, 9);
  });
  it('gust peak stays within 1.0 of its layer', () => {
    expect(Math.max(...C.gustPeak)).toBeLessThanOrEqual(1.0);
  });
  it('padLowpassHz is 2500', () => expect(C.padLowpassHz).toBe(2500));
  it('chordUpper: 2 voices per chord, same chord names, each in 415..880 Hz and >= 100 Hz', () => {
    expect(Object.keys(C.chordUpper).sort()).toEqual(Object.keys(C.chordSet).sort());
    for (const uppers of Object.values(C.chordUpper)) {
      expect(uppers).toHaveLength(2);
      for (const f of uppers) {
        expect(f).toBeGreaterThanOrEqual(C.minAudioHz);
        expect(f).toBeGreaterThanOrEqual(415);
        expect(f).toBeLessThanOrEqual(880);
      }
    }
  });
  it('padUpperWeight is 0.45 (within 0..1)', () => {
    expect(C.padUpperWeight).toBe(0.45);
    expect(C.padUpperWeight).toBeGreaterThan(0);
    expect(C.padUpperWeight).toBeLessThanOrEqual(1);
  });
  it('limiter parameters equal the design and lie in the allowed ranges', () => {
    expect(C.limiter).toEqual({ thresholdDb: -8, kneeDb: 2, ratio: 20, attackSec: 0.003, releaseSec: 0.2 });
    expect(C.limiter.thresholdDb).toBeGreaterThanOrEqual(-12);
    expect(C.limiter.thresholdDb).toBeLessThanOrEqual(-6);
    expect(C.limiter.kneeDb).toBeGreaterThanOrEqual(0);
    expect(C.limiter.kneeDb).toBeLessThanOrEqual(3);
    expect(C.limiter.ratio).toBeGreaterThanOrEqual(12);
    expect(C.limiter.ratio).toBeLessThanOrEqual(20);
    expect(C.limiter.attackSec).toBeGreaterThanOrEqual(0.001);
    expect(C.limiter.attackSec).toBeLessThanOrEqual(0.005);
    expect(C.limiter.releaseSec).toBeGreaterThanOrEqual(0.1);
    expect(C.limiter.releaseSec).toBeLessThanOrEqual(0.25);
  });
  it('limiterOutputGain is within 0.4..1.0', () => {
    expect(C.limiterOutputGain).toBeGreaterThanOrEqual(0.4);
    expect(C.limiterOutputGain).toBeLessThanOrEqual(1.0);
  });
  it('outputPeakTarget is 0.5 and the tolerance is 1.1', () => {
    expect(C.outputPeakTarget).toBe(0.5);
    expect(C.outputPeakTolerance).toBe(1.1);
  });
  it('the summed-peak cap is gone', () => expect(C).not.toHaveProperty('maxSummedPeak'))
});

describe('SOUND_CONFIG audible band (Req 15)', () => {
  it('minAudioHz >= 100', () => expect(C.minAudioHz).toBeGreaterThanOrEqual(100));

  it('every chord frequency is >= minAudioHz', () => {
    for (const notes of Object.values(C.chordSet)) {
      expect(notes).toHaveLength(4);
      for (const f of notes) expect(f).toBeGreaterThanOrEqual(C.minAudioHz);
    }
    for (const uppers of Object.values(C.chordUpper)) for (const f of uppers) expect(f).toBeGreaterThanOrEqual(C.minAudioHz);
  });
  it('progression is Dm, Bb, Gm, A and every name is in the chord set', () => {
    expect([...C.progression]).toEqual(['Dm', 'Bb', 'Gm', 'A']);
    for (const name of C.progression) expect(C.chordSet).toHaveProperty(name);
    expect(C.chordSet).toHaveProperty('tri');
  });
  it('pad detune |cents| <= 10 (Req 7.12)', () => {
    for (const c of C.padDetuneCents) expect(Math.abs(c)).toBeLessThanOrEqual(10);
  });
  it('pad chord length 6..10 s, starts at >= half, lowpass >= minAudioHz', () => {
    expect([...C.padChordSec]).toEqual([6, 10]);
    expect(C.padStartFraction).toBeGreaterThanOrEqual(0.5);
    expect(C.padMaxConcurrent).toBe(2);
    expect(C.padLowpassHz).toBeGreaterThanOrEqual(C.minAudioHz);
  });
  it('gust sweep stays within 350..900 Hz and Q within 8..14', () => {
    for (const f of C.gustSweepHz) {
      expect(f).toBeGreaterThanOrEqual(350);
      expect(f).toBeLessThanOrEqual(900);
    }
    expect([...C.gustQ]).toEqual([8, 14]);
  });
  it('gust floor <= 0.02 so the wind has no steady bed', () => {
    expect(C.windFloorGain).toBeLessThanOrEqual(0.02);
  });
  it('longest gust (rise + fall) is shorter than the minimum gust gap', () => {
    expect(C.gustRiseSec[1] + C.gustFallSec[1]).toBeLessThan(C.gustGapSec[0]);
  });
  it('bell: base 220..330 Hz, ratios 1, 2.0, 2.76, 5.4, 8.9, every partial >= minAudioHz', () => {
    expect([...C.bellBaseHz]).toEqual([220, 330]);
    expect([...C.bellRatios]).toEqual([1, 2.0, 2.76, 5.4, 8.9]);
    expect(C.bellBaseHz[0] * C.bellRatios[0]).toBeGreaterThanOrEqual(C.minAudioHz);
    expect(C.bellRatios).toHaveLength(C.bellShares.length);
    expect(C.bellRatios).toHaveLength(C.bellDecayScale.length);
  });
  it('bell delay 0.12..0.2 s, feedback <= 0.5', () => {
    expect(C.bellDelaySec).toBeGreaterThanOrEqual(0.12);
    expect(C.bellDelaySec).toBeLessThanOrEqual(0.2);
    expect(C.bellFeedback).toBeLessThanOrEqual(0.5);
  });
  it('bell decay is 4..6 s', () => expect([...C.bellDecaySec]).toEqual([4, 6]));
  it('event gaps: gust 8-20 s, bell 25-45 s, detail 40-90 s', () => {
    expect([...C.gustGapSec]).toEqual([8, 20]);
    expect([...C.bellGapSec]).toEqual([25, 45]);
    expect([...C.detailGapSec]).toEqual([40, 90]);
  });
  it('owl notes and creak glide are >= minAudioHz', () => {
    for (const note of C.owlNotesHz) for (const f of note) expect(f).toBeGreaterThanOrEqual(C.minAudioHz);
    for (const f of C.creakGlideHz) expect(f).toBeGreaterThanOrEqual(C.minAudioHz);
  });
  it('crackle band is 1500..4000 Hz', () => {
    expect(C.crackleBandMinHz).toBe(1500);
    expect(C.crackleBandMaxHz).toBe(4000);
  });
  it('stake pitch stays >= minAudioHz', () => {
    expect(C.stakeEndHz).toBeGreaterThanOrEqual(C.minAudioHz);
    expect(C.stakeStartHz).toBeGreaterThanOrEqual(C.minAudioHz);
  });
  it('the retired drone / wind LFO constants are gone (Req 15.4)', () => {
    for (const key of ['droneFrequencies', 'droneDetuneCents', 'windLfoHz', 'windCenterHz', 'windSweepHz', 'ambienceDroneShares']) {
      expect(C).not.toHaveProperty(key);
    }
  });
});
