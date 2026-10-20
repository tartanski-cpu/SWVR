import * as THREE from 'three';
import { CONFIG } from '../../config';
import { ParticlePool } from '../../render/particlePool';
import { sprayTexture } from './spray';
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
 *
 * A dry stack (a tug's): the same smoke from the top of the pipe, blowing up. Her cooling
 * water then has its own hole in her side (`exhaust.water`): it spits out in spurts while
 * the engine runs, as the pump delivers it (CONFIG.effects.exhaust.water). Its own small
 * pool of drops, one more draw call, only on a boat with one and only while drops fly.
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
  /** The cooling water's drops, the time to its next spurt, and what's left of the one under way (s). */
  private water: ParticlePool | null = null;
  private nextSpurt = 1;
  private spurtLeft = 0;
  private dropAccum = 0;
  /** Which outlet the next puff (a twin's stacks share it) or the next spurt's drops come from. */
  private turn = 0;
  private spurtFrom = 0;
  private readonly at = new THREE.Vector3();

  /** @param turbo her engine is turbocharged; spec: her diesel (rated speed, torque curve) */
  constructor(turbo: boolean, spec: EngineSpec) {
    this.root.name = 'exhaustSmoke';
    this.root.add(this.smoke.points);
    this.model = new ExhaustModel(turbo, spec);
  }

  /** Scene light level 0..1: smoke darkens at night. */
  setLight(level: number): void {
    this.smoke.setBrightness(level);
    this.water?.setBrightness(level);
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
    if (exhaust.water) this.spit(dt, s, exhaust.water, root, viewer);
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
      // A twin's stacks: each puff from the next one's top.
      const more = exhaust.more;
      if (more?.length) {
        this.turn = (this.turn + 1) % (more.length + 1);
        root.localToWorld(this.at.fromArray(this.turn ? more[this.turn - 1] : exhaust.position));
      } else this.at.copy(this.outlet);
      const y = submerged ? surface + 0.05 : this.at.y;
      this.smoke.emit(
        this.at.x,
        y,
        this.at.z,
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

  /** Her cooling water out of its hole in her side, in spurts while the engine runs. */
  private spit(dt: number, s: VesselState, holes: NonNullable<NonNullable<VesselDef['exhaust']>['water']>, root: THREE.Object3D, viewer: THREE.Vector3): void {
    const c = CONFIG.effects.exhaust.water;
    if (!this.water) {
      this.water = new ParticlePool(90, c.size, sprayTexture());
      this.water.points.name = 'coolingWater';
      this.root.add(this.water.points);
    }
    const e = s.engine;
    if (e.phase === 'running') {
      // The next spurt, sooner with more revs (the raw-water pump turns with the engine).
      this.nextSpurt -= dt;
      if (this.nextSpurt <= 0) {
        const rpm = Math.min(1, e.rpm / this.model.ratedRpm);
        this.nextSpurt = (c.everyS[0] + Math.random() * (c.everyS[1] - c.everyS[0])) * (1 - c.perRpm * rpm);
        this.spurtLeft = c.spurtS;
        // (A twin's pumps take turns, near enough.)
        this.spurtFrom = (this.spurtFrom + 1) % holes.length;
      }
    }
    if (this.spurtLeft > 0) {
      this.spurtLeft -= dt;
      this.dropAccum += (c.drops / c.spurtS) * dt;
      const w = holes[this.spurtFrom % holes.length];
      root.localToWorld(this.outlet.fromArray(w.position));
      root.getWorldQuaternion(this.q);
      this.dir.fromArray(w.direction).normalize().applyQuaternion(this.q);
      const [vx, vy, vz] = s.linearVelocity;
      while (this.dropAccum >= 1) {
        this.dropAccum -= 1;
        const v = c.speed + jitter(c.spread);
        this.water.emit(this.outlet.x, this.outlet.y, this.outlet.z, vx + this.dir.x * v + jitter(0.25), vy + this.dir.y * v + jitter(0.25), vz + this.dir.z * v + jitter(0.25), 0.5 + 0.3 * Math.random(), 0, 0.75, 1);
      }
    }
    // Water falls as water does.
    this.water.step(dt, 0.6, 0, -9.81, () => 0.95, viewer);
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
