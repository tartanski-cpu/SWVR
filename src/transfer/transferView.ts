/**
 * Drawing the crew transfer's technicians (transfer/transfer.ts): each one in hi-vis orange
 * overalls with reflective bands, a white hard hat and their own face (as the crew's avatars:
 * net/avatarOutfits.ts), wherever the job has them:
 *
 *   quay       standing in a row on the quay at the pickup port, facing the water;
 *   aboard     sitting on their seat on her deck (in the boat's frame, so they move with her);
 *   crossing   stepping from her bow over to the landing's ladder;
 *   climbing   on the ladder, going up it to the platform;
 *   platform   standing on the platform by the ladder's head (until the next job).
 *
 * One mesh each, standing or sitting (only a job's few: two or three draw calls), drawn only
 * while there's a job. Plain geometry, no physics.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { decodeLook, headGeometry, lookFromId, type Look } from '../net/avatarOutfits';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { landFloor } from '../world/landWalkArea';
import { allFarms, landingAxis, landingFace } from '../world/windFarm';
import { climbTime, quayPlace, type Technician } from './transfer';

const HIVIS = 0xff7a10;
const NAVY = 0x23304a;
const BAND = 0xe8ece8;
const BOOT = 0x1a1a1a;
const HAT = 0xf4f4f0;

interface Figure {
  root: THREE.Group;
  standing: THREE.Mesh;
  sitting: THREE.Mesh;
}

/** A technician's body, feet at the origin, facing -z; `sit`: on a seat 0.45 m up, thighs forward. */
function bodyGeometry(look: Look, sit: boolean): THREE.BufferGeometry {
  const hip = sit ? 0.45 : 0.85;
  const legs = sit
    ? [-1, 1].flatMap((s) => [
        part(new THREE.BoxGeometry(0.15, 0.15, 0.45).translate(s * 0.1, hip, -0.2), NAVY), // thighs
        part(new THREE.BoxGeometry(0.15, 0.45, 0.16).translate(s * 0.1, hip / 2, -0.4), NAVY), // shins
        part(new THREE.BoxGeometry(0.16, 0.08, 0.26).translate(s * 0.1, 0.04, -0.44), BOOT),
      ])
    : [-1, 1].flatMap((s) => [part(new THREE.BoxGeometry(0.15, hip - 0.08, 0.17).translate(s * 0.1, (hip + 0.08) / 2, 0), NAVY), part(new THREE.BoxGeometry(0.16, 0.08, 0.26).translate(s * 0.1, 0.04, -0.04), BOOT)]);
  const top = hip + 0.55;
  const head = headGeometry(look, HIVIS).translate(0, top + 0.16, 0);
  return mergeParts([
    ...legs,
    part(new THREE.BoxGeometry(0.44, 0.55, 0.26).translate(0, hip + 0.275, 0), HIVIS), // the overall's jacket
    part(new THREE.BoxGeometry(0.45, 0.05, 0.27).translate(0, hip + 0.18, 0), BAND), // reflective bands
    part(new THREE.BoxGeometry(0.45, 0.05, 0.27).translate(0, hip + 0.38, 0), BAND),
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.1, 0.52, 0.12).translate(s * 0.27, hip + 0.26, sit ? -0.05 : 0), HIVIS)), // arms
    head,
  ]);
}

export class TransferView {
  readonly root = new THREE.Group();
  private readonly mat = flatVertexColorMaterial();
  private readonly figures = new Map<string, Figure>();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();

  constructor() {
    this.root.name = 'transfer';
  }

  private figure(t: Technician): Figure {
    let f = this.figures.get(t.id);
    if (f) return f;
    // Their own face, in a white hard hat (the avatars' own).
    const base = decodeLook(lookFromId(t.id));
    const look: Look = { ...base, outfit: { ...base.outfit, hat: 'hardhat', hatColor: HAT } };
    const root = new THREE.Group();
    root.name = `technician:${t.id}`;
    const standing = new THREE.Mesh(bodyGeometry(look, false), this.mat);
    const sitting = new THREE.Mesh(bodyGeometry(look, true), this.mat);
    root.add(standing, sitting);
    f = { root, standing, sitting };
    this.figures.set(t.id, f);
    return f;
  }

  /**
   * @param boatRoot  the boat's root in the scene (her drawn, smoothed pose), by id
   */
  update(world: WorldState, boatRoot: (id: string) => THREE.Object3D | undefined): void {
    const job = world.transfer?.job;
    const live = new Set(job?.techs.map((t) => t.id) ?? []);
    for (const [id, f] of this.figures) {
      if (live.has(id)) continue;
      f.root.removeFromParent();
      f.standing.geometry.dispose();
      f.sitting.geometry.dispose();
      this.figures.delete(id);
    }
    if (!job) return;
    const turbine = allFarms()[job.farm]?.turbines[job.turbine];
    if (!turbine) return;
    const face = landingFace(turbine);
    const { ax, az } = landingAxis(turbine.landingDeg);
    // The ladder's line: the tubes' middle, a little in from their face; facing the turbine.
    const lad = { x: face.x - ax * 0.4, z: face.z - az * 0.4 };
    const faceTurbine = Math.atan2(ax, az);
    const boat = job.vesselId ? boatRoot(job.vesselId) : undefined;
    const vessel = job.vesselId ? world.vessels[job.vesselId] : undefined;
    job.techs.forEach((t, k) => {
      const f = this.figure(t);
      f.sitting.visible = t.phase === 'aboard';
      f.standing.visible = !f.sitting.visible;
      if (t.phase === 'aboard' && boat && t.seat) {
        // On her seat, facing as it does.
        if (f.root.parent !== boat) boat.add(f.root);
        f.root.position.set(t.seat[0], t.seat[1], t.seat[2]);
        f.root.rotation.set(0, ((t.seatYaw ?? 0) * Math.PI) / 180, 0);
        return;
      }
      if (f.root.parent !== this.root) this.root.add(f.root);
      if (t.phase === 'quay') {
        const q = quayPlace(k);
        f.root.position.set(q.x, landFloor(q.x, q.z) ?? 1.6, q.z);
        f.root.rotation.set(0, (-q.yawDeg * Math.PI) / 180, 0);
      } else if (t.phase === 'crossing') {
        // From her bow (as she lies now) over to the ladder, a step up and over.
        const k01 = Math.min(1, t.t / CONFIG.transfer.cross);
        if (boat && vessel) {
          const plan = hullPlan(VESSEL_DEFS[vessel.defId]);
          boat.localToWorld(this.v.set(0, plan.deckY(plan.stem), plan.stem));
        } else this.v.set(lad.x + ax * 1.5, t.from ?? 2, lad.z + az * 1.5);
        this.w.set(lad.x, t.from ?? 2, lad.z);
        f.root.position.lerpVectors(this.v, this.w, k01);
        f.root.position.y += Math.sin(k01 * Math.PI) * 0.25;
        f.root.rotation.set(0, faceTurbine, 0);
      } else if (t.phase === 'climbing') {
        const k01 = Math.min(1, t.t / climbTime(t));
        f.root.position.set(lad.x, (t.from ?? 2) + (CONFIG.windFarm.platform.y - (t.from ?? 2)) * k01, lad.z);
        f.root.rotation.set(0, faceTurbine, 0);
      } else {
        // On the platform by the ladder's head, spread round it, looking out.
        const r = (CONFIG.windFarm.tower.base + CONFIG.windFarm.platform.radius) / 2;
        const a = Math.atan2(ax, -az) + (k - (job.techs.length - 1) / 2) * 0.45;
        f.root.position.set(turbine.x + Math.sin(a) * r, CONFIG.windFarm.platform.y, turbine.z - Math.cos(a) * r);
        f.root.rotation.set(0, faceTurbine + Math.PI, 0);
      }
    });
  }
}
