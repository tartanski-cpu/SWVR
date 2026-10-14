import { mixer } from './mixer';
/**
 * A lifejacket whistle, placed in 3D: three trilling blasts (a pea whistle: ~3 kHz with a
 * fast warble from the pea), through an HRTF panner at the survivor's position, so you can
 * hear which way to steer. The App keeps the AudioContext's listener at the camera.
 */
export class WhistleAudio {
  private ctx: AudioContext | null = null;

  attach(ctx: AudioContext | null): void {
    if (ctx) this.ctx = ctx;
  }

  /** Keep the listener at the head (call each frame while there's anything spatial). */
  setListener(pos: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      const t = this.ctx!.currentTime;
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t);
      l.upY.setValueAtTime(up.y, t);
      l.upZ.setValueAtTime(up.z, t);
    } else {
      // Older API (some browsers).
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
      (l as unknown as { setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void }).setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  blow(pos: { x: number; y: number; z: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 12;
    panner.rolloffFactor = 1.2;
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y + 0.4;
    panner.positionZ.value = pos.z;
    panner.connect(mixer.bus(ctx, 'effects'));
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.7;
      const len = 0.45;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 3050 + Math.random() * 100;
      // The pea's warble.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 26 + Math.random() * 6;
      const depth = ctx.createGain();
      depth.gain.value = 260;
      lfo.connect(depth).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.03);
      g.gain.setValueAtTime(0.35, t + len - 0.05);
      g.gain.linearRampToValueAtTime(0, t + len);
      o.connect(g).connect(panner);
      o.start(t);
      lfo.start(t);
      o.stop(t + len + 0.02);
      lfo.stop(t + len + 0.02);
    }
  }
}
