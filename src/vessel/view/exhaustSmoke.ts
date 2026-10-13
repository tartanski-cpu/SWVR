import * as THREE from 'three';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

const SMOKE_MAX = 160;
const WATER_MAX = 120;

/**
 * Wet exhaust out of the transom: engine cooling water and smoke leave through the same
 * outlet just above the waterline, blowing aft. Driven by engine state only:
 *
 *   smoke  - steamy grey-white (it's been through the water-cooled riser); thicker and
 *            darker with fuel rack (load); a dark puff when the rack rises quickly (turbo
 *            lag); dark when labouring (full rack, RPM well below rated); a burst on start-up.
 *   water  - spurts of heavy droplets that arc out and fall back; flow follows RPM because
 *            the raw-water pump is engine driven.
 *   submerged outlet (a wave or the stern squatting): no water jet, and the smoke bubbles
 *            up at the surface instead.
 *
 * Particles live in WORLD space and leave with the boat's velocity plus the outlet's jet,
 * then drag to still air - under way the plume trails astern, and going astern you back
 * into it so it rolls up around the stern. Two Points draw calls (smoke, water).
 * (White smoke when cold comes with the planned coolant-temperature model.)
 */
export class ExhaustSmoke {
  readonly root = new THREE.Group();
  private readonly smoke = new ParticlePool(SMOKE_MAX, 1.1, puffTexture());
  private readonly water = new ParticlePool(WATER_MAX, 0.2, puffTexture());
  private smokeAccum = 0;
  private waterAccum = 0;
  private lastRack = 0;
  private lastPhase = 'off';
  private readonly outlet = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor() {
    this.root.name = 'wetExhaust';
    this.root.add(this.smoke.points, this.water.points);
  }

  /**
   * @param root      the vessel's interpolated root (outlet position and direction)
   * @param surfaceAt sea surface height at a world (x, z)
   */
  update(dt: number, s: VesselState, def: VesselDef, root: THREE.Object3D, surfaceAt: (x: number, z: number) => number): void {
    const e = s.engine;
    root.localToWorld(this.outlet.fromArray(def.exhaust.position));
    root.getWorldQuaternion(this.q);
    this.dir.fromArray(def.exhaust.direction).normalize().applyQuaternion(this.q);
    const running = e.phase === 'running';
    const surface = surfaceAt(this.outlet.x, this.outlet.z);
    const submerged = this.outlet.y < surface;

    // What the engine is doing right now.
    const rackRate = dt > 0 ? Math.max(0, (e.rack - this.lastRack) / dt) : 0;
    this.lastRack = e.rack;
    const puff = Math.min(1, rackRate / 0.4);
    const labour = running && e.rack > 0.9 && e.rpm < 0.85 * def.engine.ratedRpm ? 1 : 0;
    const darkness = Math.min(1, 0.1 + 0.4 * e.rack + 0.5 * puff + 0.35 * labour);
    let burst = 0;
    if (running && this.lastPhase === 'cranking') burst = 25;
    this.lastPhase = e.phase;
    const rpmFrac = Math.min(1, e.rpm / def.engine.ratedRpm);
    const [vx, vy, vz] = s.linearVelocity;

    // ── Smoke ──
    this.smokeAccum += (running ? (submerged ? 0.5 : 1) * (5 + 30 * e.rack + 40 * puff) : 0) * dt + burst;
    while (this.smokeAccum >= 1) {
      this.smokeAccum -= 1;
      const jet = submerged ? 0.3 : 2 + 3 * rpmFrac;
      const y = submerged ? surface + 0.05 : this.outlet.y;
      this.smoke.emit(
        this.outlet.x,
        y,
        this.outlet.z,
        vx + this.dir.x * jet + jitter(0.4),
        vy + this.dir.y * jet + 0.4 + Math.random() * 0.4,
        vz + this.dir.z * jet + jitter(0.4),
        2.5 + 2.5 * Math.random(),
        burst > 0 ? 0.7 : darkness,
        burst > 0 ? 0.55 : 0.12 + 0.4 * darkness,
      );
    }

    // ── Cooling water (pulsing spurts) ──
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.012);
    this.waterAccum += running && !submerged ? (25 + 70 * rpmFrac) * pulse * dt : 0;
    while (this.waterAccum >= 1) {
      this.waterAccum -= 1;
      const jet = 1.6 + 2.2 * rpmFrac + Math.random() * 0.6;
      this.water.emit(
        this.outlet.x + jitter(0.04),
        this.outlet.y + jitter(0.04),
        this.outlet.z,
        vx + this.dir.x * jet + jitter(0.25),
        vy + this.dir.y * jet + jitter(0.25),
        vz + this.dir.z * jet + jitter(0.25),
        0.5 + 0.4 * Math.random(),
        -1, // water colour
        0.75,
      );
    }

    // Smoke: drag to still air, gentle rise, lightens and fades as it disperses.
    this.smoke.step(dt, 1.0, 0.45, 0, (t, shade) => 0.92 - 0.6 * shade + 0.15 * t);
    // Water: ballistic with a little air drag; dies when it hits the sea.
    this.water.step(dt, 0.15, 0, -9.81, () => 0.9, surfaceAt);
  }
}

function jitter(a: number): number {
  return (Math.random() - 0.5) * 2 * a;
}

/** A ring buffer of simple particles drawn as one Points object with per-particle RGBA. */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly shade: Float32Array;
  private readonly alpha: Float32Array;
  private next = 0;

  constructor(
    private readonly max: number,
    size: number,
    map: THREE.Texture,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9);
    this.life = new Float32Array(max).fill(1);
    this.shade = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, shade: number, alpha: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.shade[i] = shade;
    this.alpha[i] = alpha;
  }

  /**
   * @param drag    per-second exponential drag toward still air
   * @param rise    terminal upward drift (m/s) for buoyant smoke
   * @param gravity vertical acceleration (m/s^2)
   * @param grey    grey level from (age fraction, shade)
   * @param surfaceAt if given, particles die when they fall below the sea surface
   */
  step(
    dt: number,
    drag: number,
    rise: number,
    gravity: number,
    grey: (t: number, shade: number) => number,
    surfaceAt?: (x: number, z: number) => number,
  ): void {
    const d = Math.exp(-drag * dt);
    for (let i = 0; i < this.max; i++) {
      const a = (this.age[i] += dt);
      const k = i * 3;
      const c = i * 4;
      if (a >= this.life[i]) {
        this.col[c + 3] = 0;
        continue;
      }
      this.vel[k] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d + rise * (1 - d) + gravity * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (surfaceAt && this.pos[k + 1] < surfaceAt(this.pos[k], this.pos[k + 2])) {
        this.age[i] = this.life[i];
        this.col[c + 3] = 0;
        continue;
      }
      const t = a / this.life[i];
      if (this.shade[i] < 0) {
        // Water: white-blue spray.
        this.col[c] = 0.82;
        this.col[c + 1] = 0.9;
        this.col[c + 2] = 0.95;
      } else {
        const g = grey(t, this.shade[i]);
        this.col[c] = g;
        this.col[c + 1] = g;
        this.col[c + 2] = g;
      }
      this.col[c + 3] = this.alpha[i] * Math.min(1, a * 8) * (1 - t) ** 1.5;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
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
