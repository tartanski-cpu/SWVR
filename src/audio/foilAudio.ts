import { CONFIG } from '../config';
import { mixer } from './mixer';
import { noiseBuffer } from './engineAudio';

/**
 * A foiling boat in flight, heard (owner, 28 Oct 2026: the foiling ferry's "sound and feel:
 * the hull noise stopping when she lifts clear"). Synthesised, no files. Once her hulls are
 * out of the water the rush along them goes quiet (the water sound, scaled by `washScale`),
 * and what's left is the struts and foils cutting the water: a thin hiss (band-passed noise,
 * rising as the speed squared) with a faint singing tone over it that climbs with her speed.
 * Her motors' whine is the electric motor's own sound, as before. CONFIG.foilHelm.
 */

/** How far she's flying, for the sound: 0 on her hulls, 1 clear of the water (her state's `foil.clear`). */
function flight(clear: number): number {
  const c = CONFIG.foilHelm;
  return Math.max(0, Math.min(1, (clear - c.landedClear) / (c.flyingClear - c.landedClear)));
}

/**
 * What she sounds like at this speed and height: the hiss's level, the tone's pitch (Hz), and
 * what share of the hull's water noise is left (1 on her hulls, `wash.floor` clear of the water).
 */
export function foilSoundLevels(knots: number, clear: number): { hiss: number; toneHz: number; washScale: number } {
  const h = CONFIG.foilHelm.hiss;
  const f = flight(clear);
  const v = Math.max(0, knots) / h.refKn;
  return { hiss: h.level * Math.min(2.5, v * v) * f, toneHz: h.toneHz + h.toneHzPerKn * Math.max(0, knots), washScale: 1 - f * (1 - CONFIG.foilHelm.wash.floor) };
}

export class FoilSound {
  private readonly out: GainNode;
  private readonly tone: OscillatorNode;
  private readonly toneGain: GainNode;

  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode) {
    const h = CONFIG.foilHelm.hiss;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    // The hiss: noise through a band-pass.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 3);
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = h.freq;
    band.Q.value = h.q;
    src.connect(band).connect(this.out);
    src.start();
    // The struts singing: a soft tone, a share of the hiss.
    this.tone = ctx.createOscillator();
    this.tone.type = 'triangle';
    this.tone.frequency.value = h.toneHz;
    this.toneGain = ctx.createGain();
    this.toneGain.gain.value = h.toneLevel * 0.3;
    this.tone.connect(this.toneGain).connect(this.out);
    this.tone.start();
  }

  /** @param level overall level (distance, the wheelhouse's muffling) */
  update(knots: number, clear: number, level: number, t = this.ctx.currentTime): void {
    const s = foilSoundLevels(knots, clear);
    this.out.gain.setTargetAtTime(s.hiss * level, t, 0.15);
    this.tone.frequency.setTargetAtTime(s.toneHz, t, 0.3);
  }
}

/** The foils' sound on the shared AudioContext (attached after audio unlocks). */
export class FoilAudio {
  private sound: FoilSound | null = null;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.sound) return;
    this.sound = new FoilSound(ctx, mixer.bus(ctx, 'effects'));
  }

  /**
   * @param clear     how far her hulls are out of the water (0..1); 0 on a boat without foils
   * @param distance  listener distance from the boat (m)
   * @param muffle    0..1: how much the wheelhouse shuts it out
   */
  update(knots: number, clear: number, distance: number, muffle = 0): void {
    this.sound?.update(knots, clear, (1 - muffle) / (1 + distance / 10));
  }
}

/**
 * Lifting clear and touching down, felt (CONFIG.foilHelm.liftOff): `update` with her hulls'
 * clearance each frame returns 'liftOff' as it rises past `up`, 'touchDown' as it falls back
 * under `down` once she'd lifted (the two apart, so a wave doesn't make it chatter).
 */
export class FoilFeel {
  private flying = false;

  update(clear: number): 'liftOff' | 'touchDown' | null {
    const c = CONFIG.foilHelm.liftOff;
    if (!this.flying && clear >= c.up) {
      this.flying = true;
      return 'liftOff';
    }
    if (this.flying && clear <= c.down) {
      this.flying = false;
      return 'touchDown';
    }
    return null;
  }

  /** Forget (another boat, or she's gone): she's on her hulls. */
  reset(): void {
    this.flying = false;
  }
}
