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
  private readonly stem: THREE.Vector3;

  constructor(def: VesselDef) {
    this.pool = new ParticlePool(this.cfg.maxParticles, 0.42, sprayTexture());
    this.points = this.pool.points;
    this.points.name = 'spray';
    // Waterline half-beam at a station: midway between chine and deck edge (hard chine).
    const st = def.hull.stations;
    const wl = (z: number) => {
      const s = st.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
      return 0.5 * (s.halfBeamChine + s.halfBeamDeck);
    };
    const L = def.hull.params.length;
    const zs = [-0.43 * L, -0.33 * L];
    this.probes = zs.flatMap((z) => [new THREE.Vector3(-wl(z), 0, z), new THREE.Vector3(wl(z), 0, z)]);
    this.lastDepth = this.probes.map(() => 0);
    this.stem = new THREE.Vector3(0, 0, -0.46 * L);
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
      if (speed > c.bowSpeed) {
        this.bowAccum += c.bowRate * (speed - c.bowSpeed) * dt;
        root.localToWorld(this.p.copy(this.stem));
        const h = surfaceHeight(waves, this.p.x, this.p.z);
        const near = Math.abs(h - this.p.y) < 0.8; // stem in the water, not flying
        while (this.bowAccum >= 1) {
          this.bowAccum -= 1;
          if (!near) continue;
          const side = Math.random() < 0.5 ? -1 : 1;
          this.out.set(side, 0, -0.2).applyQuaternion(this.q);
          const sideways = 0.8 + speed * 0.35 + Math.random();
          this.pool.emit(
            this.p.x + this.out.x * 0.3,
            h + 0.05,
            this.p.z + this.out.z * 0.3,
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
    }

    this.pool.setBrightness(0.2 + 0.8 * light);
    this.pool.step(dt, 1.2, 0, -9.81, () => 0.9, viewer);
    return { slam, lap };
  }
}

function jitter(a: number): number {
  return (Math.random() - 0.5) * 2 * a;
}

function sprayTexture(): THREE.Texture {
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
