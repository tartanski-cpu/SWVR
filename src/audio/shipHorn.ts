import { mixer } from './mixer';

/**
 * A ship's horn far out on the water: one prolonged blast (~4.5 s; a big ship's is deep,
 * a yacht's high and thin), placed in 3D through an HRTF panner so you can tell where it
 * came from in fog. Distance does the rest (inverse roll-off), and a low-pass takes the
 * edge off far away. The App keeps the AudioContext's listener at the camera.
 */
export class ShipHorn {
  private ctx: AudioContext | null = null;

  attach(ctx: AudioContext | null): void {
    if (ctx) this.ctx = ctx;
  }

  blow(pos: { x: number; y: number; z: number }, pitch: number, distance: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 150;
    panner.rolloffFactor = 0.8;
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(400, 2400 - distance * 0.6);
    lp.connect(panner).connect(mixer.bus(ctx, 'effects'));
    // Sound travels: the blast arrives a few seconds after it's blown, far off.
    const t = ctx.currentTime + distance / 343;
    const len = 4.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.15);
    g.gain.setValueAtTime(0.5, t + len - 0.3);
    g.gain.linearRampToValueAtTime(0, t + len);
    g.connect(lp);
    for (const [mult, type, level] of [
      [1, 'sawtooth', 0.5],
      [1.5, 'sawtooth', 0.25],
      [2.01, 'square', 0.12],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = pitch * mult;
      const og = ctx.createGain();
      og.gain.value = level;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }
}
