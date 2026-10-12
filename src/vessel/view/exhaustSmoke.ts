import * as THREE from 'three';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

const MAX = 160;

/**
 * Diesel exhaust smoke from the roof stack, driven by engine state (no new simulation state):
 *   - emission rate and opacity grow with the fuel rack (load),
 *   - a dark puff when the rack rises quickly (opening the throttle; turbo lag),
 *   - black smoke when labouring: rack near full while RPM is well below rated
 *     (heavy prop load: bollard pull, crash stop, towing later),
 *   - a burst as the engine catches on start-up.
 * (White smoke when cold comes with the planned coolant-temperature model.)
 *
 * Particles live in WORLD space and are emitted with the boat's velocity, then drag toward
 * still air - so under way the plume streams aft naturally. One Points draw call, with
 * per-particle colour and alpha.
 */
export class ExhaustSmoke {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 4);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly age = new Float32Array(MAX).fill(1e9);
  private readonly life = new Float32Array(MAX).fill(1);
  private readonly shade = new Float32Array(MAX);
  private readonly strength = new Float32Array(MAX);
  private next = 0;
  private accum = 0;
  private lastRack = 0;
  private lastPhase = 'off';
  private readonly outlet = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 1.3,
        map: puffTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.name = 'exhaustSmoke';
    this.points.frustumCulled = false;
  }

  /**
   * @param root the vessel's interpolated root (for the outlet's world position)
   */
  update(dt: number, s: VesselState, def: VesselDef, root: THREE.Object3D): void {
    const e = s.engine;
    root.localToWorld(this.outlet.fromArray(def.exhaust.position));
    const running = e.phase === 'running';

    // What the engine is doing right now.
    const rackRate = dt > 0 ? Math.max(0, (e.rack - this.lastRack) / dt) : 0;
    this.lastRack = e.rack;
    const puff = Math.min(1, rackRate / 0.4); // throttle opening faster than the turbo keeps up
    const labour = running && e.rack > 0.9 && e.rpm < 0.85 * def.engine.ratedRpm ? 1 : 0;
    const darkness = Math.min(1, 0.15 + 0.45 * e.rack + 0.5 * puff + 0.4 * labour);

    let burst = 0;
    if (running && this.lastPhase === 'cranking') burst = 25; // it catches: a cloud
    this.lastPhase = e.phase;

    // Emission.
    const rate = running ? 5 + 35 * e.rack + 40 * puff : 0;
    this.accum += rate * dt + burst;
    const [vx, vy, vz] = s.linearVelocity;
    while (this.accum >= 1) {
      this.accum -= 1;
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.pos.set([this.outlet.x, this.outlet.y, this.outlet.z], i * 3);
      this.vel.set([vx + (Math.random() - 0.5) * 0.4, vy + 1.6 + 1.5 * e.rack + Math.random() * 0.5, vz + (Math.random() - 0.5) * 0.4], i * 3);
      this.age[i] = 0;
      this.life[i] = 2.5 + 2.5 * Math.random();
      this.shade[i] = burst > 0 ? 0.8 : darkness;
      this.strength[i] = burst > 0 ? 0.6 : 0.12 + 0.45 * darkness;
    }

    // Integrate: drag toward still air, gentle buoyant rise; fade out with age.
    const drag = Math.exp(-1.2 * dt);
    for (let i = 0; i < MAX; i++) {
      const a = (this.age[i] += dt);
      const k = i * 3;
      const c = i * 4;
      if (a >= this.life[i]) {
        this.col[c + 3] = 0;
        continue;
      }
      this.vel[k] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag + 0.5 * (1 - drag);
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = a / this.life[i];
      const grey = 0.85 - 0.75 * this.shade[i] + 0.2 * t; // lightens as it disperses
      this.col[c] = grey;
      this.col[c + 1] = grey;
      this.col[c + 2] = grey;
      this.col[c + 3] = this.strength[i] * Math.min(1, a * 6) * (1 - t) ** 1.5;
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
