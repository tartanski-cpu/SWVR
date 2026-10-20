import * as THREE from 'three';
import { CONFIG } from '../../config';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import { ParticlePool } from '../../render/particlePool';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/**
 * Bow spray, one Points draw call (world-space particles, ballistic with air drag):
 *
 *  - Bow wave ("moustache"): above `bowSpeed` the stem throws a thin, steady sheet of
 *    spray out to each side, more the faster you go.
 *  - Slams: probes on both bows track how deep they are in the water. When a probe
 *    re-enters the water fast (bow dropping into a wave, or a wave hitting the bow) it
 *    throws a burst up and out, scaled by the entry speed.
 *
 *  - Planing (her hull's `planing` Froude range; owner: planing boats throw up a lot of
 *    spray): sheets of spray thrown out and up from both sides where her bottom meets the
 *    water, and a mist kicked up behind her transom, both more the faster she planes.
 *
 * Particles keep the boat's velocity at launch, then drag to still air, so under way they
 * drift aft relative to the boat: in a head sea the spray comes back over the foredeck.
 */
export class Spray {
  readonly points: THREE.Points;
  private readonly pool: ParticlePool;
  private readonly cfg = CONFIG.effects.spray;
  /** Bow probes (vessel axes) and their submergence last frame. */
  private readonly probes: THREE.Vector3[];
  private readonly lastDepth: number[];
  private bowAccum = 0;
  private readonly p = new THREE.Vector3();
  private readonly out = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  /** Her keel line, bow first (each section's z and its bottom's height), and her waterline half-breadth along her. */
  private readonly keel: { z: number; y: number }[];
  private readonly wl: (z: number) => number;
  private readonly chine: (z: number) => number;
  private readonly entry = new THREE.Vector3();
  /** Planing: her transom, her length and planing range. */
  private readonly transom: THREE.Vector3;
  private readonly length: number;
  private readonly planing: VesselDef['planing'];
  private sheetAccum = 0;
  private sternAccum = 0;

  /** Where her keel line first goes under the surface from forward (vessel axes), or null if none of it is (airborne). */
  private bowEntry(root: THREE.Object3D, waves: readonly PreparedWave[]): THREE.Vector3 | null {
    let last = 0;
    for (let i = 0; i < this.keel.length; i++) {
      const k = this.keel[i];
      root.localToWorld(this.p.set(0, k.y, k.z));
      const under = surfaceHeight(waves, this.p.x, this.p.z) - this.p.y;
      if (under > 0) {
        // Between this section and the one ahead, where the keel crosses the surface.
        if (i === 0) return this.entry.set(0, k.y, k.z);
        const a = this.keel[i - 1];
        const t = last / (last + under);
        return this.entry.set(0, a.y + t * (k.y - a.y), a.z + t * (k.z - a.z));
      }
      last = -under;
    }
    return null;
  }

  constructor(def: VesselDef) {
    this.pool = new ParticlePool(this.cfg.maxParticles, 0.6, sprayTexture());
    this.points = this.pool.points;
    this.points.name = 'spray';
    // Her half-breadth at the design waterline along her, and where her stem meets it
    // (owner, Oct 2026: with a raked stem the bow spray came off thin air ahead of her: it
    // was put at a fixed 46 % of her length forward of amidships). From her sections.
    const st = [...def.hull.stations].sort((a, b) => a.z - b.z);
    const halves = st.map((s) => waterlineHalf(s.polygon));
    const wl = (z: number) => {
      const i = st.findIndex((s) => s.z >= z);
      if (i <= 0) return halves[i < 0 ? halves.length - 1 : 0];
      const t = (z - st[i - 1].z) / (st[i].z - st[i - 1].z);
      return halves[i - 1] + t * (halves[i] - halves[i - 1]);
    };
    const L = def.hull.params.length;
    const stemZ = stemAtWaterline(st);
    // The slam probes on both bows just aft of the stem (where the old fixed ones stood from it).
    const zs = [stemZ + 0.03 * L, stemZ + 0.13 * L];
    this.probes = zs.flatMap((z) => [new THREE.Vector3(-wl(z), 0, z), new THREE.Vector3(wl(z), 0, z)]);
    this.lastDepth = this.probes.map(() => 0);
    this.keel = st.map((s) => ({ z: s.z, y: Math.min(...s.polygon.map(([, y]) => y)) }));
    this.wl = wl;
    this.chine = (z) => st.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a)).halfBeamChine;
    this.transom = new THREE.Vector3(0, 0, 0.48 * L);
    this.length = L;
    this.planing = def.planing;
  }

  /**
   * @param light 0..1 scene light level (spray darkens at night)
   * @returns slam strength this frame, 0..1 (big bow entries: spray, splash sound, haptics)
   *          and lap strength (smaller entries, even at rest: lapping sounds)
   */
  update(dt: number, s: VesselState, root: THREE.Object3D, waves: readonly PreparedWave[], viewer: THREE.Vector3, light: number): { slam: number; lap: number } {
    const c = this.cfg;
    const [vx, vy, vz] = s.linearVelocity;
    const speed = Math.hypot(vx, vz);
    root.getWorldQuaternion(this.q);
    let slam = 0;
    let lap = 0;

    if (dt > 0) {
      // ── Slams ──
      this.probes.forEach((local, i) => {
        root.localToWorld(this.p.copy(local));
        const h = surfaceHeight(waves, this.p.x, this.p.z);
        const depth = h - this.p.y;
        const rate = (depth - this.lastDepth[i]) / dt;
        // Any entry into the water faster than ~0.3 m/s is an audible lap against the hull.
        if (this.lastDepth[i] < 0.02 && depth >= 0.02 && rate > 0.3) lap = Math.max(lap, Math.min(1, (rate - 0.3) / 1.2));
        if (this.lastDepth[i] < 0.05 && depth >= 0.05 && rate > c.slamSpeed) {
          const strength = Math.min(1, (rate - c.slamSpeed) / 3);
          slam = Math.max(slam, strength);
          const n = Math.min(45, Math.round(c.slamParticles * (rate - c.slamSpeed) + speed * 1.5));
          this.out.set(Math.sign(local.x), 0, 0).applyQuaternion(this.q);
          for (let k = 0; k < n; k++) {
            const sideways = 1.2 + rate * 0.7 + Math.random() * 2;
            const up = 1.5 + rate * 1.3 + Math.random() * 2.5;
            this.pool.emit(
              this.p.x,
              h,
              this.p.z,
              vx + this.out.x * sideways + jitter(0.8),
              vy * 0.3 + up,
              vz + this.out.z * sideways + jitter(0.8),
              0.9 + Math.random() * 0.8,
              0,
              0.55 + 0.35 * strength,
              1,
            );
          }
        }
        this.lastDepth[i] = depth;
      });

      // ── Bow wave ──
      // From where her bow meets the water as she rides now (trimmed by the head or the stern,
      // pitching in a sea): the first point of her keel line, from forward, that is under the
      // surface. The sheet comes off both sides there, at her waterline breadth.
      if (speed > c.bowSpeed) {
        this.bowAccum += c.bowRate * (speed - c.bowSpeed) * dt;
        const at = this.bowEntry(root, waves);
        while (this.bowAccum >= 1) {
          this.bowAccum -= 1;
          // (Her forefoot flying clear, the water meeting her aft of amidships: planing, the
          // sheets below take over.)
          if (!at || at.z > 0) continue;
          const side = Math.random() < 0.5 ? -1 : 1;
          root.localToWorld(this.p.set(side * this.wl(at.z), 0, at.z));
          const h = surfaceHeight(waves, this.p.x, this.p.z);
          this.out.set(side, 0, -0.2).applyQuaternion(this.q);
          const sideways = 0.8 + speed * 0.35 + Math.random();
          this.pool.emit(
            this.p.x + this.out.x * 0.1,
            h + 0.05,
            this.p.z + this.out.z * 0.1,
            vx + this.out.x * sideways,
            1.0 + speed * 0.3 + Math.random() * 0.9,
            vz + this.out.z * sideways,
            0.5 + Math.random() * 0.4,
            0,
            0.35,
            1,
          );
        }
      }
      // ── Planing: spray sheets off both sides, mist behind the transom ──
      const pl = this.planing;
      const fn = speed / Math.sqrt(9.81 * this.length);
      const planing = pl ? Math.min(1, Math.max(0, (fn - pl.fnStart) / (pl.fnFull - pl.fnStart))) : 0;
      if (planing > 0) {
        const pc = c.planing;
        this.sheetAccum += pc.sheetRate * planing * speed * dt;
        // (Planing, she rides up: her waterline stands a metre or so over the water. The
        // spray comes off where her bottom meets it: where her keel goes under, out at her
        // chines. Lifted right clear, she throws none.)
        const at = this.sheetAccum >= 1 ? this.bowEntry(root, waves) : null;
        while (this.sheetAccum >= 1) {
          this.sheetAccum -= 1;
          if (!at) continue;
          const i = Math.random() < 0.5 ? 0 : 1;
          root.localToWorld(this.p.set((i ? 1 : -1) * this.chine(at.z), 0, at.z));
          const h = surfaceHeight(waves, this.p.x, this.p.z);
          this.out.set(i ? 1 : -1, 0, 0.25).applyQuaternion(this.q);
          const sideways = 1.5 + speed * 0.3 + Math.random() * 1.2;
          const up = 2.5 + speed * 0.2 + Math.random() * 1.5;
          // Struck off still water: it keeps only a third of her speed, so it streams away
          // astern of her in a fan, a sheet each side.
          const keep = 0.3 + Math.random() * 0.15;
          this.pool.emit(
            this.p.x + this.out.x * 0.15,
            h + 0.05,
            this.p.z + this.out.z * 0.15,
            vx * keep + this.out.x * sideways + jitter(0.4),
            up,
            vz * keep + this.out.z * sideways + jitter(0.4),
            airTime(up),
            0,
            0.7 + 0.2 * planing,
            1,
          );
        }
        this.sternAccum += pc.sternRate * planing * speed * dt;
        while (this.sternAccum >= 1) {
          this.sternAccum -= 1;
          root.localToWorld(this.p.copy(this.transom));
          const h = surfaceHeight(waves, this.p.x, this.p.z);
          this.out.set(1, 0, 0).applyQuaternion(this.q);
          const across = jitter(1.2);
          // Kicked up and left behind: half her speed, so it falls away astern.
          const up = 2 + Math.random() * 2;
          this.pool.emit(
            this.p.x + this.out.x * across,
            h + 0.1,
            this.p.z + this.out.z * across,
            vx * 0.5 + jitter(0.6),
            up,
            vz * 0.5 + jitter(0.6),
            airTime(up),
            0,
            0.22,
            1,
          );
        }
      }
    }

    this.pool.setBrightness(0.2 + 0.8 * light);
    this.pool.step(dt, 1.2, 0, -9.81, () => 0.9, viewer);
    return { slam, lap };
  }
}

/**
 * How long a drop thrown up at `up` m/s is in the air (s; up and back down, a little drag):
 * its life, so it's gone as it lands rather than falling on under the water.
 */
function airTime(up: number): number {
  return Math.min(1.4, (1.9 * up) / 9.81);
}

function jitter(a: number): number {
  return (Math.random() - 0.5) * 2 * a;
}

export function sprayTexture(): THREE.Texture {
  const s = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}

/** A section's half-breadth where it crosses the design waterline (y = 0): its widest crossing; 0 if it doesn't reach the water. */
export function waterlineHalf(poly: readonly (readonly [number, number])[]): number {
  let half = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
      const x = y0 === y1 ? Math.max(Math.abs(x0), Math.abs(x1)) : Math.abs(x0 + ((x1 - x0) * (0 - y0)) / (y1 - y0));
      half = Math.max(half, x);
    }
  }
  return half;
}

/** Where her stem meets the design waterline (z, m): the first section from forward whose bottom is under it, between it and the one ahead. Sections sorted bow first. */
export function stemAtWaterline(st: readonly { z: number; polygon: readonly (readonly [number, number])[] }[]): number {
  const bottom = (s: (typeof st)[number]) => Math.min(...s.polygon.map(([, y]) => y));
  const i = st.findIndex((s) => bottom(s) < 0);
  if (i <= 0) return st[Math.max(0, i)].z;
  const a = bottom(st[i - 1]);
  const b = bottom(st[i]);
  return st[i - 1].z + ((st[i].z - st[i - 1].z) * a) / (a - b);
}
