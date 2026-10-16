import * as THREE from 'three';
import { CONFIG } from '../config';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { LaserBeam } from '../player/laserBeam';

/** Things the laser beam passes through: glass, rain on it, the comfort vignette, beams. */
const SEE_THROUGH = new Set(['laser', 'windowGlass', 'rainGlass', 'comfortOverlay']);
const IDENTITY = new THREE.Matrix4();

/** What the laser pointer needs from the app. */
export interface LaserHost {
  /** The groups the beam can hit (boats, islands and quays, cargo, traffic). */
  targets(): THREE.Object3D[];
  /** The boats' roots: a hit on one is kept in her frame, so the dot rides along. */
  vesselRoots(): Iterable<THREE.Object3D>;
  /** Groups the beam never stops on (our own carried gear, the wrist menu). */
  ignore(): THREE.Object3D[];
  /** The sea as drawn this frame. */
  waves(): PreparedWave[];
}

/**
 * Our laser pointer (split out of App): a beam from the hand, or on desktop from a "hand"
 * below and to the right of the eyes, to whatever it meets - a boat, the islands and quays,
 * cargo, or the sea. What it hits is looked up a few times a second (the beam
 * itself follows the hand every frame); the hit point is kept in the frame of what it hit,
 * so on a boat it rides along. Crew-mates see it in our pose (`pose`).
 */
export class LaserPointer {
  readonly beam = new LaserBeam();
  private hit: THREE.Vector3 | null = null;
  private frame: THREE.Object3D | null = null;
  private t = 0;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly caster = new THREE.Raycaster();

  constructor(private readonly h: LaserHost) {}

  /** Not pressed: hide it, and look up at once when pressed again. */
  off(): void {
    this.beam.hide();
    this.hit = null;
    this.t = 0;
  }

  /**
   * Pressed: aim along `ray` (world). `origin`: where the beam starts if not the ray's
   * origin (desktop: so it's seen from the side as a line, not end-on as a dot).
   */
  update(dt: number, ray: THREE.Ray, origin?: THREE.Vector3): void {
    // Looked up a few times a second, also while it hits nothing: a whole-scene raycast
    // every frame, aimed at the sky, stalls a desktop machine.
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1 / CONFIG.laser.hitRate;
      this.find(ray);
    }
    this.from.copy(origin ?? ray.origin);
    const hit = !!this.hit;
    if (hit) {
      this.to.copy(this.hit!).applyMatrix4(this.frame?.matrixWorld ?? IDENTITY);
      // Aim follows the hand every frame; the hit distance comes from the last lookup.
      ray.at(this.to.distanceTo(ray.origin), this.to);
    } else ray.at(CONFIG.laser.reach * 0.2, this.to);
    this.beam.set(this.from, this.to, hit);
  }

  private find(ray: THREE.Ray): void {
    const reach = CONFIG.laser.reach;
    this.caster.set(ray.origin, ray.direction);
    this.caster.far = reach;
    const ignore = this.h.ignore();
    const skip = (o: THREE.Object3D | null): boolean => {
      for (; o; o = o.parent) if (!o.visible || ignore.includes(o) || SEE_THROUGH.has(o.name) || o.name.startsWith('avatar:')) return true;
      return false;
    };
    const hit = this.caster.intersectObjects(this.h.targets(), true).find((x) => (x.object as THREE.Mesh).isMesh && !skip(x.object));
    // The sea: from where the ray crosses the mean level, step to the surface a few times
    // (each step moves along the ray by the height above the wave there).
    let sea: THREE.Vector3 | null = null;
    if (ray.direction.y < -1e-3) {
      const waves = this.h.waves();
      let t = (0 - ray.origin.y) / ray.direction.y;
      const p = new THREE.Vector3();
      for (let i = 0; i < 4 && t > 0; i++) {
        ray.at(t, p);
        const dy = p.y - surfaceHeight(waves, p.x, p.z);
        t += dy / -ray.direction.y;
      }
      if (t > 0 && t < reach) sea = ray.at(t, new THREE.Vector3());
    }
    this.hit = null;
    this.frame = null;
    if (hit && (!sea || hit.distance <= sea.distanceTo(ray.origin))) {
      const point = hit.point.clone();
      for (const root of this.h.vesselRoots()) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o !== root) o = o.parent;
        if (o === root) {
          this.frame = root;
          root.worldToLocal(point);
        }
      }
      this.hit = point;
    } else if (sea) this.hit = sea;
  }

  /** Our beam for the pose, in the frame `inv` takes world points into; null when off. */
  pose(inv: THREE.Matrix4): [number, number, number, number, number, number, boolean] | null {
    if (!this.beam.root.visible) return null;
    const r = (x: number) => Math.round(x * 100) / 100;
    const a = this.from.clone().applyMatrix4(inv);
    const b = this.to.clone().applyMatrix4(inv);
    return [r(a.x), r(a.y), r(a.z), r(b.x), r(b.y), r(b.z), !!this.hit];
  }
}
