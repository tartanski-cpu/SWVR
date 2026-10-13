import * as THREE from 'three';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

const SMOKE_MAX = 200;

/**
 * Diesel exhaust smoke from the transom outlet, just above the waterline, blowing aft.
 * Driven by engine state only: a dirty grey-brown haze even at idle, thicker and darker
 * with fuel rack (load), a black puff when the rack rises quickly (turbo lag), black when
 * labouring (full rack, RPM well below rated), and a cloud on start-up. When a wave covers
 * the outlet the smoke bubbles up at the surface instead.
 *
 * Particles live in WORLD space and leave with the boat's velocity plus the outlet's jet,
 * then drag to still air - under way the plume trails astern, and going astern you back
 * into it so it rolls up around the stern. One Points draw call, hidden (and not updated)
 * when no particle is alive. Particles fade out within ~2 m of the viewer so a cloud
 * doesn't fill the headset view with large overlapping sprites (comfort and fill rate).
 * A cold engine smokes white until the block warms through 25-60 °C.
 */
export class ExhaustSmoke {
  readonly root = new THREE.Group();
  private readonly smoke = new ParticlePool(SMOKE_MAX, 1.25, puffTexture());
  private smokeAccum = 0;
  private lastRack = 0;
  private lastPhase = 'off';
  private readonly outlet = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor() {
    this.root.name = 'exhaustSmoke';
    this.root.add(this.smoke.points);
  }

  /**
   * @param root      the vessel's interpolated root (outlet position and direction)
   * @param surfaceAt sea surface height at a world (x, z)
   * @param viewer    world position of the viewer's head
   */
  update(dt: number, s: VesselState, def: VesselDef, root: THREE.Object3D, surfaceAt: (x: number, z: number) => number, viewer: THREE.Vector3): void {
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
    const darkness = Math.min(1, 0.35 + 0.4 * e.rack + 0.5 * puff + 0.4 * labour);
    // Cold engine: unburnt fuel and condensing water vapour give white smoke, fading as the
    // block warms through 25-60 °C (thicker at light load, where combustion is coolest).
    const cold = Math.min(1, Math.max(0, (60 - e.coolantC) / 35)) * (1 - 0.6 * e.rack);
    let burst = 0;
    if (running && this.lastPhase === 'cranking') burst = 25;
    this.lastPhase = e.phase;
    const rpmFrac = Math.min(1, e.rpm / def.engine.ratedRpm);
    const [vx, vy, vz] = s.linearVelocity;

    // ── Smoke ──
    this.smokeAccum += (running ? (submerged ? 0.5 : 1) * (12 + 35 * e.rack + 45 * puff + 25 * cold) : 0) * dt + burst;
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
        burst > 0 ? 0.9 : darkness,
        burst > 0 ? 0.7 : 0.3 + 0.45 * darkness,
        burst > 0 ? 0 : cold,
      );
    }

    // Smoke: drag to still air, gentle rise, lightens and fades as it disperses.
    this.smoke.step(dt, 1.0, 0.45, 0, (t, shade) => 0.62 - 0.5 * shade + 0.2 * t, viewer);
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
  private readonly white: Float32Array;
  private readonly alpha: Float32Array;
  private next = 0;
  private alive = 0;

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
    this.white = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
  }

  /** @param white 0 = dirty diesel smoke .. 1 = white (cold-engine) smoke */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, shade: number, alpha: number, white = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.shade[i] = shade;
    this.alpha[i] = alpha;
    this.white[i] = white;
    this.alive++;
  }

  /**
   * @param drag    per-second exponential drag toward still air
   * @param rise    terminal upward drift (m/s) for buoyant smoke
   * @param gravity vertical acceleration (m/s^2)
   * @param grey    grey level from (age fraction, shade)
   * @param viewer  world position of the viewer (near particles fade out)
   */
  step(
    dt: number,
    drag: number,
    rise: number,
    gravity: number,
    grey: (t: number, shade: number) => number,
    viewer: THREE.Vector3,
  ): void {
    // Nothing alive: skip the loop and the buffer uploads, and the draw call.
    this.points.visible = this.alive > 0;
    if (this.alive === 0) return;
    this.alive = 0;
    const d = Math.exp(-drag * dt);
    for (let i = 0; i < this.max; i++) {
      const a = (this.age[i] += dt);
      const k = i * 3;
      const c = i * 4;
      if (a >= this.life[i]) {
        this.col[c + 3] = 0;
        continue;
      }
      this.alive++;
      this.vel[k] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d + rise * (1 - d) + gravity * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = a / this.life[i];
      // Dirty diesel smoke: grey with a slight brown cast.
      // Blend towards white (cold-engine smoke), which also loses the brown cast.
      const w = this.white[i];
      const g = grey(t, this.shade[i]) * (1 - w) + 0.9 * w;
      this.col[c] = g * (1.04 - 0.04 * w);
      this.col[c + 1] = g;
      this.col[c + 2] = g * (0.9 + 0.1 * w);
      const near = Math.hypot(this.pos[k] - viewer.x, this.pos[k + 1] - viewer.y, this.pos[k + 2] - viewer.z);
      const nearFade = Math.min(1, Math.max(0, (near - 0.6) / 1.4));
      this.col[c + 3] = this.alpha[i] * Math.min(1, a * 8) * (1 - t) ** 1.5 * nearFade;
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
