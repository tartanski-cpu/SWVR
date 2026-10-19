import * as THREE from 'three';
import { CONFIG } from '../../config';
import { ParticlePool } from '../../render/particlePool';
import { ExhaustModel } from '../exhaust';
import type { EngineSpec } from '../physics/propulsion';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

const SMOKE_MAX = 200;

/**
 * Diesel exhaust smoke from the transom outlet, just above the waterline, blowing aft.
 * What colour, and how much, is the combustion model's (vessel/exhaust.ts, from her engine's
 * state: black soot when she's lugged or the throttle's snapped open, white when cold, blue
 * when worn, a faint haze otherwise, and a cloud on start-up). When a wave covers the
 * outlet the smoke bubbles up at the surface instead.
 *
 * Particles live in WORLD space and leave with the boat's velocity plus the outlet's jet,
 * then drag to still air - under way the plume trails astern, and going astern you back
 * into it so it rolls up around the stern. One Points draw call, hidden (and not updated)
 * when no particle is alive. Particles fade out within ~2 m of the viewer so a cloud
 * doesn't fill the headset view with large overlapping sprites (comfort and fill rate).
 *
 * Speeds and shades: CONFIG.effects.exhaust (owner, Oct 2026: much darker, leaving the
 * outlet more slowly, no more particles than before).
 */
export class ExhaustSmoke {
  readonly root = new THREE.Group();
  private readonly smoke = new ParticlePool(SMOKE_MAX, 1.25, puffTexture());
  private readonly model: ExhaustModel;
  private smokeAccum = 0;
  private lastPhase = 'off';
  private readonly outlet = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  /** @param turbo her engine is turbocharged; spec: her diesel (rated speed, torque curve) */
  constructor(turbo: boolean, spec: EngineSpec) {
    this.root.name = 'exhaustSmoke';
    this.root.add(this.smoke.points);
    this.model = new ExhaustModel(turbo, spec);
  }

  /** Scene light level 0..1: smoke darkens at night. */
  setLight(level: number): void {
    this.smoke.setBrightness(level);
  }

  /**
   * @param exhaust   the outlet (built into her hull) and which way it blows
   * @param root      the vessel's interpolated root (outlet position and direction)
   * @param surfaceAt sea surface height at a world (x, z)
   * @param viewer    world position of the viewer's head
   */
  update(dt: number, s: VesselState, exhaust: NonNullable<VesselDef['exhaust']>, root: THREE.Object3D, surfaceAt: (x: number, z: number) => number, viewer: THREE.Vector3): void {
    const e = s.engine;
    const c = CONFIG.effects.exhaust;
    root.localToWorld(this.outlet.fromArray(exhaust.position));
    root.getWorldQuaternion(this.q);
    this.dir.fromArray(exhaust.direction).normalize().applyQuaternion(this.q);
    const running = e.phase === 'running';
    const surface = surfaceAt(this.outlet.x, this.outlet.z);
    const submerged = this.outlet.y < surface;

    const sm = this.model.step(dt, e);
    let burst = 0;
    if (running && this.lastPhase === 'cranking') burst = 25;
    this.lastPhase = e.phase;
    const rpmFrac = Math.min(1, e.rpm / this.model.ratedRpm);
    const [vx, vy, vz] = s.linearVelocity;

    // How much: with the exhaust flow (revs) and what's in it.
    const flow = 0.3 + 0.7 * rpmFrac;
    this.smokeAccum += (running ? (submerged ? 0.5 : 1) * flow * (c.rate + c.ratePerOpacity * sm.opacity) : 0) * dt + burst;
    while (this.smokeAccum >= 1) {
      this.smokeAccum -= 1;
      const jet = submerged ? 0.3 : c.jet + c.jetPerRpm * rpmFrac;
      const y = submerged ? surface + 0.05 : this.outlet.y;
      this.smoke.emit(
        this.outlet.x,
        y,
        this.outlet.z,
        vx + this.dir.x * jet + jitter(0.4),
        vy + this.dir.y * jet + c.lift * (1 + Math.random()),
        vz + this.dir.z * jet + jitter(0.4),
        2.5 + 2.5 * Math.random(),
        burst > 0 ? 0.9 : sm.soot,
        burst > 0 ? 0.7 : 0.2 + 0.55 * sm.opacity,
        burst > 0 ? 0 : sm.white,
        burst > 0 ? 0 : sm.blue,
      );
    }

    // Smoke: drag to still air, gentle rise, lightens and fades as it disperses.
    this.smoke.step(dt, 1.0, c.rise, 0, (t, soot) => c.greyHaze - (c.greyHaze - c.greyBlack) * soot + c.greyAge * t, viewer);
  }
}

function jitter(a: number): number {
  return (Math.random() - 0.5) * 2 * a;
}

function puffTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}
