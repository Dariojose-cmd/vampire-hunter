/**
 * Minimal sound effects, synthesized with the Web Audio API so there are no
 * audio assets to download and no network requests. Sound is OFF by default;
 * callers gate every play on the user's opt-in toggle.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // Browsers suspend the context until a user gesture; resume on demand.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * A short, soft "thud" — a low sine drop with a quick decay, plus a brief
 * noise transient for the "crack". Deliberately subtle. Never throws.
 */
export function playStakeThud(): void {
  const audio = getCtx();
  if (!audio) return;
  try {
    const now = audio.currentTime;

    // Low body: a sine that drops in pitch, like a heavy impact.
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.32);

    // Crack transient: a very short burst of filtered noise.
    const bufferSize = Math.floor(audio.sampleRate * 0.06);
    const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = audio.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = audio.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1200;
    const noiseGain = audio.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    noise.connect(noiseFilter).connect(noiseGain).connect(audio.destination);
    noise.start(now);
    noise.stop(now + 0.08);
  } catch {
    // Audio must never break the UI.
  }
}
